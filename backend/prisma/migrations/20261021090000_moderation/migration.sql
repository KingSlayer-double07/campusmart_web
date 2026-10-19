-- AlterEnum
ALTER TYPE "EmailCodePurpose" ADD VALUE 'ADMIN_SIGN_IN';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "heldWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "prohibitedConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "wentLiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportReport" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedById" TEXT,
ADD COLUMN     "suspendedReason" TEXT;

-- CreateIndex
CREATE INDEX "SupportReport_status_createdAt_idx" ON "SupportReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportReport_listingId_status_idx" ON "SupportReport"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupportReport_userId_listingId_key" ON "SupportReport"("userId", "listingId");


-- Listings buyers could already see count as having gone live (decision M4f)
UPDATE "Listing" SET "wentLiveAt" = "createdAt" WHERE "status" IN ('ACTIVE', 'SOLDOUT', 'ARCHIVED');
