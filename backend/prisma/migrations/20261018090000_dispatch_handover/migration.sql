-- CreateEnum
CREATE TYPE "DeliveryJobStatus" AS ENUM ('OPEN', 'ASSIGNED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FulfillmentStatus" ADD VALUE 'RIDER_ASSIGNED';
ALTER TYPE "FulfillmentStatus" ADD VALUE 'WITH_RIDER';
ALTER TYPE "FulfillmentStatus" ADD VALUE 'DELIVERED';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DISPATCH';

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "details" TEXT,
ADD COLUMN     "fault" "Fault";

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "arrivalFrom" TIMESTAMP(3),
ADD COLUMN     "arrivalTo" TIMESTAMP(3),
ADD COLUMN     "handoverLockedAt" TIMESTAMP(3),
ADD COLUMN     "notReadyAt" TIMESTAMP(3),
ADD COLUMN     "notReadyNote" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "riderAlertAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "DeliveryJobStatus" NOT NULL DEFAULT 'OPEN',
    "riderId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "assignedById" TEXT,
    "unacceptedAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerOrderId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reporterRole" "UserRole" NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ProblemStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryJob_orderId_key" ON "DeliveryJob"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryJob_institutionId_status_createdAt_idx" ON "DeliveryJob"("institutionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryJob_riderId_status_idx" ON "DeliveryJob"("riderId", "status");

-- CreateIndex
CREATE INDEX "ProblemReport_status_createdAt_idx" ON "ProblemReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_userId_idx" ON "Invite"("userId");

-- CreateIndex
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

