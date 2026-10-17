-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('DISPATCH', 'SELLER_PICKUP');

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_pickupStationId_fkey";

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "deliveryFeeKobo" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerPhone" TEXT,
ADD COLUMN     "campusPlaceId" TEXT,
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryFeeKobo" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "pickupStationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "deliveryMethod" "DeliveryMethod";

-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "allowsPickup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupArea" TEXT;

-- CreateTable
CREATE TABLE "CampusPlace" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampusPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampusPlace_institutionId_isActive_idx" ON "CampusPlace"("institutionId", "isActive");

-- AddForeignKey
ALTER TABLE "CampusPlace" ADD CONSTRAINT "CampusPlace_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupStationId_fkey" FOREIGN KEY ("pickupStationId") REFERENCES "PickupStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_campusPlaceId_fkey" FOREIGN KEY ("campusPlaceId") REFERENCES "CampusPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

