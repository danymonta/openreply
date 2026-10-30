import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

// A folder is just the name its campaigns share, so renaming or removing one
// is a bulk update of those campaigns. `to: null` empties the folder.
const renameFolderSchema = z.object({
  from: z.string().trim().min(1).max(60),
  to: z
    .string()
    .trim()
    .max(60)
    .transform((value) => value || null)
    .nullable(),
});

export async function PATCH(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can manage folders" },
      { status: 403 }
    );
  }

  const parsed = renameFolderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await prisma.automation.updateMany({
    where: { workspaceId: context.workspaceId, folder: parsed.data.from },
    data: { folder: parsed.data.to },
  });

  return NextResponse.json({ success: true, data: { updated: result.count } });
}
