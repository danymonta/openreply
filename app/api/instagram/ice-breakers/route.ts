import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import { createInstagramContext } from "@/lib/instagram/provider";
import { getIceBreakers, setIceBreakers } from "@/lib/meta/client";
import { ICE_BREAKER_PREFIX, iceBreakerKeyword } from "@/lib/meta/webhook";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

// Each ice breaker names the DM keyword it stands for: a tap is handled as if
// the person had typed that keyword, so the DM-trigger campaign answers it.
const iceBreakersSchema = z.object({
  instagramAccountId: z.string().optional(),
  iceBreakers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(80),
        keyword: z.string().trim().min(1).max(100),
      })
    )
    .max(4),
});

async function loadAccount(instagramAccountId: string | null | undefined) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { error: "Unauthorized", status: 401 } as const;
  if (!canManageWorkspace(context.role)) {
    return { error: "Only owners and admins can change ice breakers", status: 403 } as const;
  }
  const account = await getWorkspaceInstagramAccount(context.workspaceId, instagramAccountId ?? null);
  if (!account) return { error: "Instagram account not connected", status: 400 } as const;
  const token = await createInstagramContext(account);
  if (token.provider !== "META") {
    return { error: "Ice breakers need an Instagram Login connection", status: 400 } as const;
  }
  return { accessToken: token.accessToken } as const;
}

export async function GET(request: NextRequest) {
  const loaded = await loadAccount(request.nextUrl.searchParams.get("instagramAccountId"));
  if ("error" in loaded) {
    return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status });
  }
  try {
    const iceBreakers = await getIceBreakers(loaded.accessToken);
    return NextResponse.json({
      success: true,
      data: {
        iceBreakers: iceBreakers.map((b) => ({
          question: b.question,
          keyword: iceBreakerKeyword(b.payload),
          payload: b.payload,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const parsed = iceBreakersSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const loaded = await loadAccount(parsed.data.instagramAccountId);
  if ("error" in loaded) {
    return NextResponse.json({ success: false, error: loaded.error }, { status: loaded.status });
  }
  try {
    await setIceBreakers(
      loaded.accessToken,
      parsed.data.iceBreakers.map((b) => ({
        question: b.question,
        payload: `${ICE_BREAKER_PREFIX}${b.keyword}`,
      }))
    );
    return NextResponse.json({ success: true, data: { count: parsed.data.iceBreakers.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
