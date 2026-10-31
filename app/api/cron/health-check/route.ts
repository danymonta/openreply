import { NextRequest, NextResponse } from "next/server";
import { runHealthAlerts } from "@/lib/ops/alerts";

/** Emails the owner when the worker, the token or DM delivery breaks. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await runHealthAlerts();
  return NextResponse.json({ success: true, data });
}
