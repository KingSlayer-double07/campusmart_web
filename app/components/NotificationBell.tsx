"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/lib/api/hooks/useNotifications";
import { cn } from "@/lib/utils/cn";

// Guide 10: the unread count, polled every 60 seconds and on focus
export default function NotificationBell({ href, className }: { href: string; className?: string }) {
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  return (
    <Link
      href={href}
      aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
      className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-full", className)}
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
