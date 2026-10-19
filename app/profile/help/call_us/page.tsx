"use client";

import { MessageCircle, Phone } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import PageHero from "../../../components/PageHero";
import { useSupportContacts } from "@/lib/api/hooks/useSupport";

const digits = (n: string) => n.replace(/[^\d+]/g, "");

// Decision T4: the numbers come from SUPPORT_PHONE and SUPPORT_WHATSAPP; one not set says so
export default function CallUsPage() {
  const contacts = useSupportContacts();
  const lines = [
    {
      label: "Call us",
      icon: Phone,
      value: contacts.data?.phone ?? null,
      href: (n: string) => `tel:${digits(n)}`,
    },
    {
      label: "WhatsApp",
      icon: MessageCircle,
      value: contacts.data?.whatsapp ?? null,
      href: (n: string) => `https://wa.me/${digits(n).replace(/^\+/, "")}`,
    },
  ];

  return (
    <>
      <main className="px-6 pb-28 pt-8">
        <PageHeader title="Call Us" showBack />
        <PageHero icon={Phone} title="Get in Touch" subtitle="Talk to the CampusMart team" />
        {contacts.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading contacts">
            <div className="h-14 animate-pulse rounded-2xl bg-surface-muted" />
            <div className="h-14 animate-pulse rounded-2xl bg-surface-muted" />
          </div>
        ) : contacts.isError ? (
          <p className="text-sm text-foreground-muted">
            We couldn&apos;t load our numbers.{" "}
            <button type="button" onClick={() => contacts.refetch()} className="font-semibold text-main">
              Try again
            </button>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map(({ label, icon: Icon, value, href }) => (
              <li key={label}>
                {value ? (
                  <a href={href(value)} className="flex items-center gap-4 rounded-2xl border border-border-default p-4">
                    <span className="flex size-10 items-center justify-center rounded-full bg-orange-100">
                      <Icon size={18} className="text-main" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-sm font-medium text-main">{value}</span>
                    </span>
                  </a>
                ) : (
                  <div className="flex items-center gap-4 rounded-2xl border border-border-default p-4 opacity-70">
                    <span className="flex size-10 items-center justify-center rounded-full bg-surface-muted">
                      <Icon size={18} className="text-foreground-muted" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-sm text-foreground-muted">Coming soon</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
      <Nav />
    </>
  );
}
