import { NextRequest, NextResponse } from "next/server";
import { runDatabaseBackup } from "@/lib/ops/backup";

export const maxDuration = 300;

/** Nightly pg_dump of the whole database, emailed to the owner. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await runDatabaseBackup();
  return NextResponse.json({ success: data.sent, data }, { status: data.sent ? 200 : 500 });
}
