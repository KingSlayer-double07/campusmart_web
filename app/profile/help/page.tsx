"use client";

import { HelpCircle, FileText, AlertCircle } from "lucide-react";
import Nav from "../../components/nav";
import PageHeader from "../../components/PageHeader";
import PageHero from "../../components/PageHero";
import ActionListItem from "../../components/ActionListItem";
import { quickHelp } from "../../lib/data";

export default function HelpPage() {
  return (
    <>
      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Help & Support" showBack={true} />

        <PageHero icon={HelpCircle} title="How can we help you today?" />

        <div className="flex flex-col gap-7">

          {/* ── QUICK HELP ── */}
          <section className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
              Quick Help
            </p>

            {quickHelp.map((item, i) => (
              <div key={item.label} className="flex flex-col">
                <ActionListItem
                  variant="plain"
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  href={item.href}
                />
                {i < quickHelp.length - 1 && (
                  <div className="h-px bg-surface-muted mt-2 mb-2" />
                )}
              </div>
            ))}
          </section>

          {/* ── MORE ── */}
          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
              More
            </p>

            <ActionListItem
              icon={FileText}
              label="Terms & Privacy"
              href="/profile/help/terms"
              className="mt-2"
              rightElement={<></>}
            />

            <ActionListItem
              icon={AlertCircle}
              label="Report a Problem"
              href="/profile/help/report"
              rightElement={<></>}
            />
          </section>

        </div>
      </main>

      <Nav />
    </>
  );
}
