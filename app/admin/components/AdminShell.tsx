"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useLogout } from "@/lib/api/hooks/useLogout";
import { cn } from "@/lib/utils/cn";
import { ADMIN_NAV, isActiveNav } from "./adminNav";

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2">
      <span className="text-lg font-bold tracking-tight text-foreground">CampusMart</span>
      <span className="rounded-full bg-main-subtle px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-main">
        Admin
      </span>
    </Link>
  );
}

// Desktop: a left sidebar and content up to max-w-6xl (guide 9.2.1).
// Phones and tablets: a top bar and the app's floating pill nav at the bottom.
// There are more links than fit a laptop's height or a phone's width, so the sidebar's list scrolls
// down and the pill scrolls sideways, each starting on the current page's link (2026-10-19).
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const email = useAuthStore((s) => s.user?.email);
  const sidebarRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  // Centre the current page's link in each list. Only the list scrolls, never the page.
  useEffect(() => {
    for (const list of [sidebarRef.current, pillRef.current]) {
      const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!list || !current) continue;
      list.scrollTop = current.offsetTop - (list.clientHeight - current.offsetHeight) / 2;
      list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    }
  }, [pathname]);

  const signOut = async () => {
    await logout();
    router.push("/onboarding/role-select");
  };

  return (
    <div className="min-h-dvh font-dmSans tracking-tight text-foreground">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-border-default bg-card px-4 py-6">
        <div className="shrink-0 px-2">
          <Brand />
        </div>
        <nav ref={sidebarRef} aria-label="Admin" className="relative mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActiveNav(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-main text-white" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 shrink-0 border-t border-border-default px-2 pt-4">
          {email && <p className="truncate text-xs text-foreground-muted">Signed in as {email}</p>}
          <button
            type="button"
            onClick={signOut}
            className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground-muted hover:text-foreground"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-default bg-card/90 px-4 backdrop-blur">
        <Brand />
        <button
          type="button"
          onClick={signOut}
          aria-label="Sign out"
          className="flex size-9 items-center justify-center rounded-full border border-border-default bg-card text-foreground-muted"
        >
          <LogOut size={16} />
        </button>
      </header>

      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
      </div>

      <nav
        aria-label="Admin"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm"
      >
        <div
          ref={pillRef}
          className="relative flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border-default bg-card/80 px-2 py-2 shadow-sm backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActiveNav(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border-default p-2 transition-all",
                  active ? "bg-main px-4 text-white" : "bg-card text-foreground hover:bg-surface-muted",
                )}
              >
                <Icon size={18} />
                {active && <span className="font-medium">{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
