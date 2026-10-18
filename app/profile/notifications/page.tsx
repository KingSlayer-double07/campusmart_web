"use client";

import Nav from "../../components/nav";
import NotificationsInbox from "../../components/NotificationsInbox";
import PageHeader from "../../components/PageHeader";

// Guide 10: real notifications and the email preference, replacing the earlier sample screen
export default function NotificationsPage() {
  return (
    <>
      <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
        <PageHeader title="Notifications" />
        <NotificationsInbox />
      </main>
      <Nav />
    </>
  );
}
