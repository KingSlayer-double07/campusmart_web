"use client";

import NotificationsInbox from "@/app/components/NotificationsInbox";
import PageHeader from "@/app/components/PageHeader";

// Guide 10: new orders, payouts, stock and reviews, replacing the earlier sample screen
export default function SellerNotificationsPage() {
  return (
    <main className="flex w-full max-w-md flex-col gap-6 px-4 pb-32 pt-10">
      <PageHeader title="Notifications" />
      <NotificationsInbox tone="seller" />
    </main>
  );
}
