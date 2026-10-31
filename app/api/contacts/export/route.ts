import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getContacts, parsePeriodDays } from "@/lib/analytics/advanced";
import { toCsv } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

/** The Contacts list as a CSV file, with the same period and search filters. */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const params = request.nextUrl.searchParams;
  const days = parsePeriodDays(params.get("days"));
  const contacts = await getContacts({ workspaceId, days, query: params.get("q") });

  const csv = toCsv([
    [
      "username",
      "instagram_id",
      "profile_url",
      "triggers",
      "dms_sent",
      "link_clicks",
      "campaigns",
      "sources",
      "first_seen",
      "last_activity",
      "new_in_period",
    ],
    ...contacts.map((c) => [
      c.username ?? "",
      c.id,
      c.username ? `https://instagram.com/${c.username}` : "",
      c.interactions,
      c.sent,
      c.clicks,
      c.campaigns.join(" | "),
      c.sources.join(" | "),
      new Date(c.firstAt).toISOString(),
      new Date(c.lastAt).toISOString(),
      c.isNew ? "yes" : "no",
    ]),
  ]);

  const date = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens accented names as UTF-8.
  return new NextResponse(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${days}d-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
