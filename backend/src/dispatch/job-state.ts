import type { Prisma } from '../generated/prisma/client';
import {
  DeliveryJobStatus,
  DeliveryMethod,
  FulfillmentStatus,
} from '../generated/prisma/enums';

type Tx = Prisma.TransactionClient;

// Decisions DF7, DF8, DF8a: one job per paid order with any store going by dispatch, open to the
// campus's riders straight away. Called inside the payment transaction.
export async function openDeliveryJob(
  tx: Tx,
  order: { id: string; institutionId: string },
): Promise<boolean> {
  const dispatch = await tx.sellerOrder.count({
    where: { orderId: order.id, deliveryMethod: DeliveryMethod.DISPATCH },
  });
  if (dispatch === 0) return false;
  await tx.deliveryJob.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, institutionId: order.institutionId },
    update: {},
  });
  return true;
}

// Closes the job once none of its stores is still on the way: DONE if any was delivered,
// CANCELLED if all were cancelled. Called after each handover, cancellation and refund.
export async function settleJob(tx: Tx, orderId: string): Promise<void> {
  const job = await tx.deliveryJob.findUnique({
    where: { orderId },
    select: { id: true, status: true },
  });
  if (
    !job ||
    job.status === DeliveryJobStatus.DONE ||
    job.status === DeliveryJobStatus.CANCELLED
  ) {
    return;
  }
  const stores = await tx.sellerOrder.findMany({
    where: { orderId, deliveryMethod: DeliveryMethod.DISPATCH },
    select: { fulfillmentStatus: true },
  });
  const finished: FulfillmentStatus[] = [
    FulfillmentStatus.DELIVERED,
    FulfillmentStatus.CANCELLED,
    FulfillmentStatus.DISPUTED,
  ];
  if (!stores.every((s) => finished.includes(s.fulfillmentStatus))) return;
  const delivered = stores.some(
    (s) => s.fulfillmentStatus !== FulfillmentStatus.CANCELLED,
  );
  await tx.deliveryJob.update({
    where: { id: job.id },
    data: {
      status: delivered ? DeliveryJobStatus.DONE : DeliveryJobStatus.CANCELLED,
    },
  });
}
