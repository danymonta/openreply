import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";
import { sendOpsEmail } from "@/lib/ops/mailer";

/**
 * Health check that emails the owner when automations stop working.
 *
 * Errors already land in the dashboard, but nobody watches it at night: a
 * stopped worker or a revoked token would otherwise go unnoticed for days.
 * Each problem is emailed once, re-sent at most every REMIND_HOURS while it
 * lasts, and followed by an "all clear" email when it goes away.
 */

export type ProblemKind =
  | "worker_down"
  | "token_refresh_failed"
  | "token_expiring"
  | "instagram_auth"
  | "dm_failures"
  | "webhook_failures";

export interface Problem {
  kind: ProblemKind;
  message: string;
}

export interface HealthSnapshot {
  workerHealthy: boolean;
  workerLastSeenMinutes: number | null;
  tokenRefreshErrors: string[];
  expiringAccounts: { username: string; expiresAt: Date }[];
  recentFailedDms: { errorMessage: string | null }[];
  recentFailedWebhooks: number;
}

const WINDOW_MINUTES = 60;
const REMIND_HOURS = 12;
const TOKEN_WARNING_DAYS = 3;
const ALERT_KEY_PREFIX = "alerts:email:";

// Meta refuses a second private reply to the same comment, or one older than
// 7 days. The comment reconciler retries old comments ManyChat already
// answered, so these failures are expected and say nothing about health.
const HARMLESS_DM_ERROR = /invalid for a private reply|already been replied/i;
// Code 190 / "access token" means Instagram revoked or invalidated the token:
// every automation is down until the account is reconnected.
const AUTH_DM_ERROR = /\b190\b|access token|OAuthException|session has been invalidated/i;

function failedDmThreshold() {
  const value = Number(process.env.ALERT_FAILED_DM_THRESHOLD);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export function evaluateHealth(snapshot: HealthSnapshot): Problem[] {
  const problems: Problem[] = [];

  if (!snapshot.workerHealthy) {
    problems.push({
      kind: "worker_down",
      message:
        snapshot.workerLastSeenMinutes === null
          ? "Il worker che invia i DM non risponde: nessun DM parte finché non torna su."
          : `Il worker che invia i DM non dà segni di vita da ${snapshot.workerLastSeenMinutes} minuti: nessun DM parte finché non torna su.`,
    });
  }

  if (snapshot.tokenRefreshErrors.length > 0) {
    problems.push({
      kind: "token_refresh_failed",
      message: `Il rinnovo automatico del token Instagram è fallito:\n${snapshot.tokenRefreshErrors.join("\n")}\nRicollega l'account da Settings prima che scada.`,
    });
  }

  if (snapshot.expiringAccounts.length > 0) {
    const list = snapshot.expiringAccounts
      .map((a) => `@${a.username} (scade il ${a.expiresAt.toISOString().slice(0, 10)})`)
      .join(", ");
    problems.push({
      kind: "token_expiring",
      message: `Il token Instagram sta per scadere: ${list}. Ricollega l'account da Settings.`,
    });
  }

  const relevant = snapshot.recentFailedDms.filter(
    (dm) => !HARMLESS_DM_ERROR.test(dm.errorMessage ?? "")
  );
  const authFailure = relevant.find((dm) => AUTH_DM_ERROR.test(dm.errorMessage ?? ""));
  if (authFailure) {
    problems.push({
      kind: "instagram_auth",
      message: `Instagram ha rifiutato l'accesso all'account: ${authFailure.errorMessage}\nRicollega l'account da Settings: finché non lo fai nessuna automazione funziona.`,
    });
  } else if (relevant.length >= failedDmThreshold()) {
    const samples = [...new Set(relevant.map((dm) => dm.errorMessage ?? "errore sconosciuto"))]
      .slice(0, 3)
      .join("\n- ");
    problems.push({
      kind: "dm_failures",
      message: `${relevant.length} DM falliti nell'ultima ora. Errori:\n- ${samples}`,
    });
  }

  if (snapshot.recentFailedWebhooks >= failedDmThreshold()) {
    problems.push({
      kind: "webhook_failures",
      message: `${snapshot.recentFailedWebhooks} eventi di Instagram non elaborati nell'ultima ora: commenti e DM potrebbero restare senza risposta.`,
    });
  }

  return problems;
}

export async function collectHealthSnapshot(now = new Date()): Promise<HealthSnapshot> {
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const [worker, tokenEvents, expiring, failedDms, failedWebhooks] = await Promise.all([
    getWorkerHealth(),
    prisma.operationalEvent.findMany({
      where: {
        source: "TOKEN_REFRESH",
        level: "ERROR",
        resolvedAt: null,
        createdAt: { gte: new Date(now.getTime() - 26 * 3600_000) },
      },
      select: { message: true },
      take: 5,
    }),
    prisma.instagramAccount.findMany({
      where: {
        provider: "META",
        accessToken: { not: "" },
        tokenExpiresAt: {
          not: null,
          lte: new Date(now.getTime() + TOKEN_WARNING_DAYS * 86400_000),
        },
      },
      select: { username: true, tokenExpiresAt: true },
    }),
    prisma.dmLog.findMany({
      where: { status: "FAILED", createdAt: { gte: since } },
      select: { errorMessage: true },
      take: 200,
    }),
    prisma.webhookEvent.count({
      where: { status: "FAILED", createdAt: { gte: since } },
    }),
  ]);

  return {
    workerHealthy: worker.healthy,
    workerLastSeenMinutes:
      worker.ageMs === null ? null : Math.round(worker.ageMs / 60_000),
    tokenRefreshErrors: tokenEvents.map((e) => e.message),
    expiringAccounts: expiring.map((a) => ({
      username: a.username,
      expiresAt: a.tokenExpiresAt as Date,
    })),
    recentFailedDms: failedDms,
    recentFailedWebhooks: failedWebhooks,
  };
}

const ALL_KINDS: ProblemKind[] = [
  "worker_down",
  "token_refresh_failed",
  "token_expiring",
  "instagram_auth",
  "dm_failures",
  "webhook_failures",
];

/** Runs the checks and emails what changed since the last run. */
export async function runHealthAlerts() {
  const problems = evaluateHealth(await collectHealthSnapshot());
  const redis = getRedisConnection();
  const appUrl = process.env.NEXTAUTH_URL ?? "";

  const toSend: Problem[] = [];
  for (const problem of problems) {
    // NX + TTL: the first sighting sends, then at most one reminder per window.
    const fresh = await redis.set(
      `${ALERT_KEY_PREFIX}${problem.kind}`,
      new Date().toISOString(),
      "EX",
      REMIND_HOURS * 3600,
      "NX"
    );
    if (fresh) toSend.push(problem);
  }

  const activeKinds = new Set(problems.map((p) => p.kind));
  const resolved: ProblemKind[] = [];
  for (const kind of ALL_KINDS) {
    if (activeKinds.has(kind)) continue;
    if (await redis.del(`${ALERT_KEY_PREFIX}${kind}`)) resolved.push(kind);
  }

  if (toSend.length > 0) {
    await sendOpsEmail({
      subject:
        toSend.length === 1 ? "Problema con le automazioni" : `${toSend.length} problemi con le automazioni`,
      text: `${toSend.map((p) => p.message).join("\n\n")}\n\nDettagli: ${appUrl}/diagnostics\n`,
    });
  }
  if (resolved.length > 0) {
    await sendOpsEmail({
      subject: "Tutto di nuovo a posto",
      text: `I problemi segnalati prima si sono risolti (${resolved.join(", ")}). Le automazioni stanno funzionando.\n`,
    });
  }

  return { problems: problems.map((p) => p.kind), emailed: toSend.length, resolved };
}
