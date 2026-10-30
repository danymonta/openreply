import { prisma } from "@/lib/db/client";
import { calculateCtr } from "@/lib/tracking/analytics";
import { hashRecipientId } from "@/lib/tracking/server";

/**
 * Workspace analytics beyond the per-campaign counters: totals and a daily
 * series over a period, per campaign and per folder, and per person (the
 * Instagram user who commented, replied to a Story, DMed or tapped a button).
 *
 * Link clicks are tied to a person through the recipient token the worker puts
 * on every DM link (hashRecipientId), so "who clicked" needs no extra storage.
 */

export type InteractionSource = "comment" | "dm" | "button";

/** How a log row was triggered, read from the ids the worker gives it. */
export function interactionSource(log: {
  commentId: string;
  commentText: string;
}): InteractionSource {
  if (log.commentId.startsWith("dm:")) return "dm";
  if (log.commentId.startsWith("reveal:") || log.commentText === "(button tap)")
    return "button";
  return "comment";
}

export const ANALYTICS_PERIODS = [7, 30, 90, 365] as const;

export function parsePeriodDays(value: string | null): number {
  const days = Number(value);
  return (ANALYTICS_PERIODS as readonly number[]).includes(days) ? days : 30;
}

function periodStart(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type LogRow = {
  automationId: string;
  commenterId: string;
  commenterName: string | null;
  commentId: string;
  commentText: string;
  status: string;
  createdAt: Date;
};

type ClickRow = {
  automationId: string;
  recipientHash: string | null;
  ipHash: string | null;
  createdAt: Date;
};

function clickerKey(click: ClickRow): string | null {
  return click.recipientHash ?? click.ipHash;
}

interface Counters {
  interactions: number;
  sent: number;
  failed: number;
  skipped: number;
  clicks: number;
  users: Set<string>;
  clickers: Set<string>;
}

function emptyCounters(): Counters {
  return {
    interactions: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    clicks: 0,
    users: new Set(),
    clickers: new Set(),
  };
}

function addLog(counters: Counters, log: LogRow) {
  counters.interactions += 1;
  counters.users.add(log.commenterId);
  if (log.status === "SENT") counters.sent += 1;
  else if (log.status === "FAILED") counters.failed += 1;
  else if (log.status.startsWith("SKIPPED")) counters.skipped += 1;
}

function addClick(counters: Counters, click: ClickRow) {
  counters.clicks += 1;
  const key = clickerKey(click);
  if (key) counters.clickers.add(key);
}

function summarize(counters: Counters) {
  return {
    interactions: counters.interactions,
    uniqueUsers: counters.users.size,
    sent: counters.sent,
    failed: counters.failed,
    skipped: counters.skipped,
    clicks: counters.clicks,
    uniqueClickers: counters.clickers.size,
    // Share of people who received a DM and opened a link, per person.
    ctr: calculateCtr(counters.clickers.size, counters.users.size),
  };
}

async function loadPeriod({
  workspaceId,
  days,
  folder,
}: {
  workspaceId: string;
  days: number;
  folder?: string | null;
}) {
  const since = periodStart(days);
  const automations = await prisma.automation.findMany({
    where: { workspaceId, ...(folder ? { folder } : {}) },
    select: { id: true, name: true, folder: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const automationIds = automations.map((a) => a.id);

  const [logs, clicks] = await Promise.all([
    prisma.dmLog.findMany({
      where: {
        workspaceId,
        automationId: { in: automationIds },
        createdAt: { gte: since },
      },
      select: {
        automationId: true,
        commenterId: true,
        commenterName: true,
        commentId: true,
        commentText: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.linkClick.findMany({
      where: {
        workspaceId,
        automationId: { in: automationIds },
        createdAt: { gte: since },
      },
      select: {
        automationId: true,
        recipientHash: true,
        ipHash: true,
        createdAt: true,
      },
    }),
  ]);

  return { since, automations, logs, clicks };
}

export async function getAdvancedAnalytics({
  workspaceId,
  days,
  folder,
}: {
  workspaceId: string;
  days: number;
  folder?: string | null;
}) {
  const { since, automations, logs, clicks } = await loadPeriod({
    workspaceId,
    days,
    folder,
  });

  const total = emptyCounters();
  const perCampaign = new Map(automations.map((a) => [a.id, emptyCounters()]));
  const sources: Record<InteractionSource, number> = { comment: 0, dm: 0, button: 0 };
  const daily = new Map<string, { interactions: number; sent: number; clicks: number }>();
  for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
    daily.set(dayKey(d), { interactions: 0, sent: 0, clicks: 0 });
  }

  for (const log of logs) {
    addLog(total, log);
    addLog(perCampaign.get(log.automationId)!, log);
    sources[interactionSource(log)] += 1;
    const day = daily.get(dayKey(log.createdAt));
    if (day) {
      day.interactions += 1;
      if (log.status === "SENT") day.sent += 1;
    }
  }
  for (const click of clicks) {
    addClick(total, click);
    addClick(perCampaign.get(click.automationId)!, click);
    const day = daily.get(dayKey(click.createdAt));
    if (day) day.clicks += 1;
  }

  const campaigns = automations
    .map((a) => ({
      id: a.id,
      name: a.name,
      folder: a.folder,
      isActive: a.isActive,
      ...summarize(perCampaign.get(a.id)!),
    }))
    .sort((a, b) => b.interactions - a.interactions);

  const perFolder = new Map<string, Counters>();
  for (const a of automations) {
    const key = a.folder ?? "";
    const counters = perFolder.get(key) ?? emptyCounters();
    const source = perCampaign.get(a.id)!;
    counters.interactions += source.interactions;
    counters.sent += source.sent;
    counters.failed += source.failed;
    counters.skipped += source.skipped;
    counters.clicks += source.clicks;
    source.users.forEach((u) => counters.users.add(u));
    source.clickers.forEach((c) => counters.clickers.add(c));
    perFolder.set(key, counters);
  }

  const contacts = buildContacts(logs, clicks, automations);

  return {
    days,
    since: since.toISOString(),
    totals: summarize(total),
    sources,
    daily: [...daily.entries()].map(([date, values]) => ({ date, ...values })),
    campaigns,
    folders: [...perFolder.entries()]
      .map(([name, counters]) => ({ name: name || null, ...summarize(counters) }))
      .sort((a, b) => b.interactions - a.interactions),
    topContacts: contacts.slice(0, 10),
  };
}

/**
 * One row per person, most active first. `isNew` marks people whose first
 * interaction in the loaded rows is inside the period — callers that load the
 * whole history get "new in period" from it.
 */
function buildContacts(
  logs: LogRow[],
  clicks: ClickRow[],
  automations: { id: string; name: string }[]
) {
  const names = new Map(automations.map((a) => [a.id, a.name]));
  const byUser = new Map<
    string,
    {
      id: string;
      username: string | null;
      interactions: number;
      sent: number;
      clicks: number;
      campaigns: Set<string>;
      sources: Set<InteractionSource>;
      firstAt: Date;
      lastAt: Date;
    }
  >();

  for (const log of logs) {
    const row = byUser.get(log.commenterId) ?? {
      id: log.commenterId,
      username: null,
      interactions: 0,
      sent: 0,
      clicks: 0,
      campaigns: new Set<string>(),
      sources: new Set<InteractionSource>(),
      firstAt: log.createdAt,
      lastAt: log.createdAt,
    };
    row.interactions += 1;
    if (log.status === "SENT") row.sent += 1;
    row.campaigns.add(names.get(log.automationId) ?? "");
    row.sources.add(interactionSource(log));
    if (log.commenterName) row.username = log.commenterName;
    if (log.createdAt < row.firstAt) row.firstAt = log.createdAt;
    if (log.createdAt > row.lastAt) row.lastAt = log.createdAt;
    byUser.set(log.commenterId, row);
  }

  const userByHash = new Map(
    [...byUser.keys()].map((id) => [hashRecipientId(id), id])
  );
  for (const click of clicks) {
    const userId = click.recipientHash ? userByHash.get(click.recipientHash) : undefined;
    if (userId) byUser.get(userId)!.clicks += 1;
  }

  return [...byUser.values()]
    .map((row) => ({
      id: row.id,
      username: row.username,
      interactions: row.interactions,
      sent: row.sent,
      clicks: row.clicks,
      campaigns: [...row.campaigns].filter(Boolean),
      sources: [...row.sources],
      firstAt: row.firstAt.toISOString(),
      lastAt: row.lastAt.toISOString(),
      isNew: true,
    }))
    .sort((a, b) => b.interactions - a.interactions || b.lastAt.localeCompare(a.lastAt));
}

export async function getContacts({
  workspaceId,
  days,
  query,
}: {
  workspaceId: string;
  days: number;
  query?: string | null;
}) {
  const { logs, clicks, automations } = await loadPeriod({ workspaceId, days });
  const firstSeen = await prisma.dmLog.groupBy({
    by: ["commenterId"],
    where: { workspaceId, commenterId: { in: [...new Set(logs.map((l) => l.commenterId))] } },
    _min: { createdAt: true },
  });
  const since = periodStart(days);
  const firstSeenAt = new Map(firstSeen.map((row) => [row.commenterId, row._min.createdAt]));

  const needle = query?.trim().toLowerCase();
  return buildContacts(logs, clicks, automations)
    .map((c) => ({
      ...c,
      isNew: (firstSeenAt.get(c.id) ?? new Date(0)) >= since,
    }))
    .filter(
      (c) =>
        !needle ||
        (c.username ?? "").toLowerCase().includes(needle) ||
        c.campaigns.some((name) => name.toLowerCase().includes(needle))
    );
}

/** Everything one person did, all time: their triggers and their link clicks. */
export async function getContactDetail({
  workspaceId,
  contactId,
}: {
  workspaceId: string;
  contactId: string;
}) {
  const [logs, clicks] = await Promise.all([
    prisma.dmLog.findMany({
      where: { workspaceId, commenterId: contactId },
      select: {
        commenterName: true,
        commentText: true,
        commentId: true,
        matchedKeyword: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        automation: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.linkClick.findMany({
      where: { workspaceId, recipientHash: hashRecipientId(contactId) },
      select: {
        createdAt: true,
        automation: { select: { name: true } },
        trackedLink: { select: { label: true, destinationUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return {
    id: contactId,
    username: logs.find((l) => l.commenterName)?.commenterName ?? null,
    events: [
      ...logs.map((log) => ({
        type: interactionSource(log),
        at: log.createdAt.toISOString(),
        campaign: log.automation.name,
        text: log.commentText,
        keyword: log.matchedKeyword,
        status: log.status,
        error: log.errorMessage,
      })),
      ...clicks.map((click) => ({
        type: "click" as const,
        at: click.createdAt.toISOString(),
        campaign: click.automation.name,
        text: click.trackedLink.label ?? click.trackedLink.destinationUrl,
        keyword: null,
        status: null,
        error: null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
