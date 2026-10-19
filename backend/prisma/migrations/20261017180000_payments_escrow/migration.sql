-- CreateEnum
CREATE TYPE "Fault" AS ENUM ('BUYER', 'SELLER', 'NONE');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FulfillmentStatus" ADD VALUE 'AWAITING_RIDER';
ALTER TYPE "FulfillmentStatus" ADD VALUE 'AWAITING_PICKUP';

-- DropIndex
DROP INDEX "Payment_orderId_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "feesKobo" INTEGER;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "transferCode" TEXT;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "fault" "Fault",
ADD COLUMN     "pickupDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "payoutAccountChangedAt" TIMESTAMP(3),
ADD COLUMN     "payoutBankCode" TEXT;

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "sellerOrderId" TEXT,
    "amountKobo" INTEGER NOT NULL,
    "itemsKobo" INTEGER NOT NULL,
    "deliveryFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "paystackFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "fault" "Fault" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "paystackRefundId" TEXT,
    "failureReason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_sellerOrderId_key" ON "Refund"("sellerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paystackRefundId_key" ON "Refund"("paystackRefundId");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

