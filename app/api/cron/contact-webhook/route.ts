import { NextRequest, NextResponse } from "next/server";
import { deliverNewContacts } from "@/lib/ops/contact-webhook";

/** Sends new contacts to CONTACT_WEBHOOK_URL (no-op when it is not set). */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const data = await deliverNewContacts();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
