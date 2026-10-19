"use client";

import { MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import Nav from "../../components/nav";
import PageHeader from "../../components/PageHeader";
import PageHero from "../../components/PageHero";
import ActionListItem from "../../components/ActionListItem";
import { useAuthStore } from "../../store/useAuthStore";
import { useSessions } from "@/lib/api/hooks/useSessions";
import { loginItems, verificationItems } from "../../lib/data";

// Password, email confirmation, devices, and deleting the account (T6). The earlier sample 2FA switch
// is gone: only admins have a second step (M7), and phone verification stays hidden (T3).
export default function AccountSecurityPage() {
  const user = useAuthStore((s) => s.user);
  const sessions = useSessions();
  const verified = !!user?.emailVerifiedAt;
  const devices = sessions.data?.length;

  return (
    <>
      <main className="px-6 pb-28 pt-8">
        <PageHeader title="Account Security" showBack />
        <PageHero icon={ShieldCheck} title="Keep your Account Safe and Secure" />

        <div className="flex flex-col gap-7">
          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Login &amp; Password</p>
            {loginItems.map((item) => (
              <ActionListItem key={item.label} icon={item.icon} label={item.label} description={item.description} href={item.href} />
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Verification</p>
            {verificationItems.map((item) => (
              <ActionListItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                href={item.href}
                description={
                  <p className={`text-xs font-medium ${verified ? "text-green-500" : "text-red-500"}`}>
                    {verified ? "Confirmed" : "Not confirmed yet"}
                  </p>
                }
              />
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Sessions</p>
            <ActionListItem
              icon={MonitorSmartphone}
              label="Active Sessions"
              description={devices === undefined ? "Devices signed in to your account" : `${devices} device${devices === 1 ? "" : "s"} signed in`}
              href="/profile/account_security/active_sessions"
            />
          </section>

          {(user?.role === "BUYER" || user?.role === "SELLER") && (
            <section className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground-muted">Danger Zone</p>
              <ActionListItem
                icon={Trash2}
                label="Delete account"
                description="Remove your personal details for good"
                href="/profile/account_security/delete"
                iconBg="bg-red-50"
                iconColor="text-red-500"
              />
            </section>
          )}
        </div>
      </main>
      <Nav />
    </>
  );
}
