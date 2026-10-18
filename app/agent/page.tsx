// Placeholder, linked from nowhere: pickup stations are kept for later (decision DL9) and orders
// go by dispatch or seller pickup. Only a PICKUP_AGENT account lands here after signing in.
export default function AgentHomePage() {
  return (
    <main className="px-6 pt-12 pb-28">
      <h1 className="text-2xl font-bold text-foreground mb-2">Pickup station</h1>
      <p className="text-sm text-foreground-muted">
        Pickup stations aren&apos;t open yet. Orders are delivered by CampusMart riders or collected from the seller.
      </p>
    </main>
  );
}
