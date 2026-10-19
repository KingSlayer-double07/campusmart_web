"use client";

import { useState } from "react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import LegalDocumentBody from "../../../components/LegalDocumentBody";
import { legalDateLabel, PRIVACY, TERMS } from "@/lib/constants/legal";

type Tab = "terms" | "privacy";

export default function TermsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("terms");

  return (
    <>
      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Terms & Privacy" showBack={true} />

        {/* Tab switcher */}
        <div className="flex bg-surface-muted rounded-2xl p-1 mt-5 mb-6" role="tablist">
          {(["terms", "privacy"] as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-card text-main shadow-sm"
                  : "text-foreground-muted"
              }`}
            >
              {tab === "terms" ? TERMS.title : PRIVACY.title}
            </button>
          ))}
        </div>

        <p className="text-xs text-foreground-muted mb-5">
          Effective date: <strong className="text-foreground">{legalDateLabel()}</strong>
        </p>

        <LegalDocumentBody doc={activeTab === "terms" ? TERMS : PRIVACY} />
      </main>

      <Nav />
    </>
  );
}
