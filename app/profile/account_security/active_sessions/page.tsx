"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import { useToast, ToastContainer } from "../../../components/Toast";
import type { Session } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useRevokeOtherSessions, useRevokeSession, useSessions } from "@/lib/api/hooks/useSessions";
import { describeUserAgent, type DeviceKind } from "@/lib/utils/userAgent";

const ICONS: Record<DeviceKind, typeof Smartphone> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

function lastActive(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "Active now";
  if (minutes < 60) return `Last active: ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last active: ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `Last active: ${days} day${days === 1 ? "" : "s"} ago`;
}

function SessionRow({ session, onRevoke, revoking }: { session: Session; onRevoke?: () => void; revoking?: boolean }) {
  const { label, kind } = describeUserAgent(session.userAgent);
  const Icon = ICONS[kind];
  return (
    <div className="flex items-start gap-4">
      <div className="size-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
        <Icon size={22} className="text-main" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-foreground truncate">{label}</p>
          {session.current ? (
            <span className="shrink-0 bg-green-100 text-green-600 text-[11px] font-semibold px-2.5 py-1 rounded-full">
              This device
            </span>
          ) : (
            <button
              type="button"
              onClick={onRevoke}
              disabled={revoking}
              className="shrink-0 bg-red-50 text-red-500 text-[13px] font-semibold px-4 py-1.5 rounded-full disabled:opacity-50"
            >
              {revoking ? "Revoking…" : "Revoke"}
            </button>
          )}
        </div>
        {session.ipAddress && <p className="text-sm text-foreground-muted mt-1">{session.ipAddress}</p>}
        <p
          className={`text-[13px] mt-1.5 ${session.current ? "font-semibold text-green-500" : "text-foreground-muted"}`}
        >
          {session.current ? "Active now" : lastActive(session.lastUsedAt)}
        </p>
      </div>
    </div>
  );
}

export default function ActiveSessionsPage() {
  const toast = useToast();
  const { data: sessions, isPending, isError, refetch } = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const current = sessions?.find((s) => s.current);
  const others = sessions?.filter((s) => !s.current) ?? [];

  const handleRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      toast.success("Session revoked", "That device has been signed out");
    } catch (err) {
      toast.error("Couldn't revoke", err instanceof ApiError ? err.message : "Please try again");
    }
  };

  const handleRevokeOthers = async () => {
    try {
      await revokeOthers.mutateAsync();
      toast.success("Signed out", "Every other device has been signed out");
    } catch (err) {
      toast.error("Couldn't sign out other devices", err instanceof ApiError ? err.message : "Please try again");
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={3500} />

      <main className="pb-36 pt-8 px-6">
        <PageHeader title="Active Sessions" showBack={true} />

        {isPending && (
          <div className="mt-8 flex flex-col gap-6" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-start gap-4 animate-pulse">
                <div className="size-12 rounded-full bg-surface-muted" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-4 w-1/2 rounded bg-surface-muted" />
                  <div className="h-3 w-1/3 rounded bg-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-foreground-muted">We couldn&apos;t load your sessions.</p>
            <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          </div>
        )}

        {current && (
          <section className="mt-8 flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">Current Session</p>
            <SessionRow session={current} />
          </section>
        )}

        {sessions && (
          <section className="mt-8 flex flex-col gap-6">
            <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">Other Sessions</p>
            {others.length === 0 ? (
              <p className="text-sm text-foreground-muted">You&apos;re not signed in anywhere else.</p>
            ) : (
              others.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onRevoke={() => handleRevoke(session.id)}
                  revoking={revoke.isPending && revoke.variables === session.id}
                />
              ))
            )}
          </section>
        )}

        <div className="mt-8 flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4">
          <div className="size-5 rounded-full border-2 border-main flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-main text-[10px] font-bold">!</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground mb-0.5">Don&apos;t recognize a session?</p>
            <p className="text-sm text-foreground-muted">Revoke it immediately and change your password.</p>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-6 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent z-50">
        <div className="w-full max-w-md px-6">
          <button
            type="button"
            onClick={handleRevokeOthers}
            disabled={others.length === 0 || revokeOthers.isPending}
            className="w-full bg-card text-red-500 border border-red-500 rounded-full py-4 font-semibold text-[15px] transition-all disabled:opacity-40"
          >
            {revokeOthers.isPending ? "Signing out…" : "Sign Out All Other Devices"}
          </button>
        </div>
      </div>

      <Nav />
    </>
  );
}
