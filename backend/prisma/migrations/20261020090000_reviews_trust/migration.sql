-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" TEXT;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "reviewReminderAt" TIMESTAMP(3);

