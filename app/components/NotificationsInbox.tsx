"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import type { AppNotification } from "@/lib/api/notifications";
import {
  useMarkRead,
  useNotificationPrefs,
  useNotifications,
  useSetNotificationPrefs,
} from "@/lib/api/hooks/useNotifications";
import { whenText } from "@/lib/orderText";
import { cn } from "@/lib/utils/cn";

// Guide 10: everything that happened to the account, newest first, plus the one email choice there
// is (T7: order and payment updates; everything else is in the app only)
export default function NotificationsInbox({ tone = "buyer" }: { tone?: "buyer" | "seller" }) {
  const router = useRouter();
  const list = useNotifications();
  const markRead = useMarkRead();
  const prefs = useNotificationPrefs();
  const setPrefs = useSetNotificationPrefs();
  const accent = tone === "seller" ? "text-seller-main" : "text-main";
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center gap-3 rounded-2xl border border-border-default bg-card p-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Email me order and payment updates</p>
          <p className="text-xs text-foreground-muted">Everything else stays in the app.</p>
        </div>
        {prefs.isError ? (
          <button type="button" onClick={() => prefs.refetch()} className={cn("text-xs font-semibold", accent)}>
            Try again
          </button>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={!!prefs.data?.orderEmails}
            aria-label="Email me order and payment updates"
            disabled={!prefs.data || setPrefs.isPending}
            onClick={() => prefs.data && setPrefs.mutate({ orderEmails: !prefs.data.orderEmails })}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
              prefs.data?.orderEmails ? (tone === "seller" ? "bg-seller-main" : "bg-main") : "bg-neutral-300",
            )}
          >
            <span
              className={cn(
                "inline-block size-5 rounded-full bg-card shadow-md transition-transform",
                prefs.data?.orderEmails ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        )}
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">
          {unread ? `${unread} unread` : "All caught up"}
        </p>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate(undefined)}
            disabled={markRead.isPending}
            className={cn("flex items-center gap-1 text-xs font-semibold", accent)}
          >
            <CheckCheck size={14} />
            Mark all as read
          </button>
        )}
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading notifications">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border-default p-6 text-center text-sm">
          <p>We couldn&apos;t load your notifications.</p>
          <button type="button" onClick={() => list.refetch()} className={cn("font-semibold", accent)}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell size={28} className="text-foreground-muted" />
          <p className="font-medium text-foreground">No notifications yet</p>
          <p className="text-sm text-foreground-muted">Updates about your orders and account appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full gap-3 rounded-2xl border p-4 text-left transition",
                  n.readAt ? "border-border-default bg-card" : "border-transparent bg-main-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : tone === "seller" ? "bg-seller-main" : "bg-main")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{n.title}</span>
                  <span className="mt-0.5 block break-words text-sm text-foreground-muted">{n.body}</span>
                  <span className="mt-1 block text-xs text-foreground-muted">{whenText(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <button
          type="button"
          onClick={() => list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className={cn("self-center text-sm font-semibold", accent)}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
