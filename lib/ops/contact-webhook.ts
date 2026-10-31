import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { interactionSource } from "@/lib/analytics/advanced";

/**
 * Pushes every new contact (first time a person triggers any campaign) to
 * CONTACT_WEBHOOK_URL, so a CRM can pick up leads without polling the export.
 *
 * Runs from cron rather than inside the DM worker: the worker writes DmLog in
 * a dozen code paths, and a slow or failing CRM must never delay a DM. A
 * Redis cursor marks the last delivered first-seen time; it only moves after
 * the receiver answers 2xx, so a failed delivery is retried on the next run.
 *
 * The body is signed: X-OpenReply-Signature: sha256=<hex HMAC of the raw body
 * with CONTACT_WEBHOOK_SECRET>.
 */

const CURSOR_KEY = "contact-webhook:cursor";
const MAX_PER_RUN = 200;

export interface NewContact {
  instagramId: string;
  username: string | null;
  profileUrl: string | null;
  firstSeenAt: string;
  campaign: string;
  source: "comment" | "dm" | "button";
  text: string;
}

export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export async function findNewContacts(since: Date): Promise<NewContact[]> {
  const recent = await prisma.dmLog.findMany({
    where: { createdAt: { gt: since } },
    select: { commenterId: true },
    distinct: ["commenterId"],
    take: 5000,
  });
  if (recent.length === 0) return [];

  // First-seen across all time: a returning person is not a new contact.
  const firstSeen = await prisma.dmLog.groupBy({
    by: ["commenterId"],
    where: { commenterId: { in: recent.map((r) => r.commenterId) } },
    _min: { createdAt: true },
  });
  const fresh = firstSeen
    .filter((row) => row._min.createdAt && row._min.createdAt > since)
    .sort((a, b) => a._min.createdAt!.getTime() - b._min.createdAt!.getTime())
    .slice(0, MAX_PER_RUN);

  const contacts: NewContact[] = [];
  for (const row of fresh) {
    const first = await prisma.dmLog.findFirst({
      where: { commenterId: row.commenterId },
      orderBy: { createdAt: "asc" },
      select: {
        commenterName: true,
        commentText: true,
        commentId: true,
        createdAt: true,
        automation: { select: { name: true } },
      },
    });
    if (!first) continue;
    const username = first.commenterName || null;
    contacts.push({
      instagramId: row.commenterId,
      username,
      profileUrl: username ? `https://instagram.com/${username}` : null,
      firstSeenAt: first.createdAt.toISOString(),
      campaign: first.automation.name,
      source: interactionSource(first),
      text: first.commentText,
    });
  }
  return contacts;
}

export async function deliverNewContacts(now = new Date()) {
  const url = process.env.CONTACT_WEBHOOK_URL;
  const secret = process.env.CONTACT_WEBHOOK_SECRET;
  if (!url || !secret) return { skipped: "CONTACT_WEBHOOK_URL or CONTACT_WEBHOOK_SECRET not set" };

  const redis = getRedisConnection();
  const stored = await redis.get(CURSOR_KEY);
  if (!stored) {
    // First run: start from now instead of replaying the whole history.
    await redis.set(CURSOR_KEY, now.toISOString());
    return { delivered: 0, initialized: true };
  }

  const contacts = await findNewContacts(new Date(stored));
  if (contacts.length === 0) return { delivered: 0 };

  const body = JSON.stringify({ event: "contacts.created", sentAt: now.toISOString(), contacts });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OpenReply-Signature": signBody(body, secret),
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Contact webhook answered ${response.status}`);
  }

  await redis.set(CURSOR_KEY, contacts[contacts.length - 1].firstSeenAt);
  return { delivered: contacts.length };
}
