-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "lowStockAlertedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ListingView" (
    "listingId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "ListingView_pkey" PRIMARY KEY ("listingId","viewerId","date")
);

-- CreateIndex
CREATE INDEX "ListingView_date_idx" ON "ListingView"("date");

-- AddForeignKey
ALTER TABLE "ListingView" ADD CONSTRAINT "ListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

