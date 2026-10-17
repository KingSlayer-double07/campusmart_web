-- Decision DF7: every paid order with a store going by rider has one delivery job. Orders paid
-- before jobs existed get theirs now, open to the campus's riders. Data only; no schema change.
INSERT INTO "DeliveryJob" ("id", "orderId", "institutionId", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", o."institutionId", 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Order" o
WHERE o."paidAt" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "SellerOrder" so
    WHERE so."orderId" = o."id"
      AND so."deliveryMethod" = 'DISPATCH'
      AND so."fulfillmentStatus" = 'AWAITING_RIDER'
  )
  AND NOT EXISTS (SELECT 1 FROM "DeliveryJob" j WHERE j."orderId" = o."id");
