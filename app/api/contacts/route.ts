import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getContacts, parsePeriodDays } from "@/lib/analytics/advanced";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const params = request.nextUrl.searchParams;
  const contacts = await getContacts({
    workspaceId,
    days: parsePeriodDays(params.get("days")),
    query: params.get("q"),
  });
  return NextResponse.json({ success: true, data: { contacts } });
}
