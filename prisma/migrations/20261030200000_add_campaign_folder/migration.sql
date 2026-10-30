-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "folder" TEXT;

-- CreateIndex
CREATE INDEX "Automation_workspaceId_folder_idx" ON "Automation"("workspaceId", "folder");
