import type { Order, OrderSummary } from "@/lib/api/checkout";

// One line saying where an order goes: the campus place or address the rider brings it to, else
// pickup from the seller. Orders from before delivery (decision F2) name their pickup station.
export function deliveryLine(order: Pick<Order | OrderSummary, "destination" | "pickupStation">): string {
  if (order.destination?.campusPlace) return `Delivery to ${order.destination.campusPlace.name}`;
  if (order.destination?.address) return `Delivery to ${order.destination.address}`;
  if (order.pickupStation) return order.pickupStation.name;
  return "Pickup from the seller";
}
