import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getAdvancedAnalytics, parsePeriodDays } from "@/lib/analytics/advanced";

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
  const data = await getAdvancedAnalytics({
    workspaceId,
    days: parsePeriodDays(params.get("days")),
    folder: params.get("folder") || null,
  });
  return NextResponse.json({ success: true, data });
}
