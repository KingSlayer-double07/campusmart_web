"use client";

import { useState, useMemo } from "react";
import { Search, CheckCircle2 } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import { useToast, ToastContainer } from "../../../components/Toast";
import { useSettingsStore } from "../../../store/useSettingsStore";
import { suggestedLanguages as suggested, allLanguagesList as allLanguages } from "../../../lib/data";

/* ─────────────────────────────────────────────
   Language row
───────────────────────────────────────────── */
function LangRow({
  label,
  native,
  selected,
  onSelect,
}: {
  label: string;
  native: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-center justify-between w-full py-3.5 text-left transition-colors"
    >
      <div>
        <p
          className={`text-[15px] leading-snug ${
            selected ? "font-bold text-foreground" : "font-medium text-foreground"
          }`}
        >
          {label}
        </p>
        <p className="text-xs text-foreground-muted mt-0.5">{native}</p>
      </div>

      {/* Radio circle / filled check */}
      {selected ? (
        <CheckCircle2 size={22} className="text-main shrink-0" fill="#ff681f" color="white" />
      ) : (
        <div className="size-5 rounded-full border-2 border-border-default shrink-0" />
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function LanguageSelectPage() {
  const { language: selected, setLanguage } = useSettingsStore();
  const [query, setQuery] = useState("");
  const toast = useToast();

  const handleSelect = (code: string, label: string, shortLabel: string) => {
    if (code === selected) return;
    setLanguage(code, label);
    toast.success(`${shortLabel} Selected!`, `${label} selected as primary language`);
  };

  /* filter both pools by search query */
  const filteredSuggested = useMemo(
    () =>
      suggested.filter(
        (l) =>
          l.label.toLowerCase().includes(query.toLowerCase()) ||
          l.native.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  const filteredAll = useMemo(
    () =>
      allLanguages.filter(
        (l) =>
          l.label.toLowerCase().includes(query.toLowerCase()) ||
          l.native.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  return (
    <>
      {/* In-app toast container */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={3000} />

      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Select Language" showBack={true} />

        {/* Search bar */}
        <div className="mt-6 mb-6 flex items-center gap-2 bg-surface-muted rounded-full px-4 py-3">
          <Search size={16} className="text-foreground-muted shrink-0" />
          <input
            id="language-search"
            type="text"
            placeholder="Search language"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent flex-1 text-sm text-foreground placeholder-neutral-400 outline-none"
          />
        </div>

        <div className="flex flex-col gap-6">

          {/* ── SUGGESTED ── */}
          {filteredSuggested.length > 0 && (
            <section>
              <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase mb-1">
                Suggested
              </p>
              <div className="divide-y divide-neutral-100">
                {filteredSuggested.map((lang) => (
                  <LangRow
                    key={lang.code}
                    label={lang.label}
                    native={lang.native}
                    selected={selected === lang.code}
                    onSelect={() => handleSelect(lang.code, lang.label, lang.label.split(" ")[0])}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── ALL LANGUAGES ── */}
          {filteredAll.length > 0 && (
            <section>
              <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase mb-1">
                All Languages
              </p>
              <div className="divide-y divide-neutral-100">
                {filteredAll.map((lang) => (
                  <LangRow
                    key={lang.code}
                    label={lang.label}
                    native={lang.native}
                    selected={selected === lang.code}
                    onSelect={() => handleSelect(lang.code, lang.label, lang.label)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {filteredSuggested.length === 0 && filteredAll.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-foreground-muted">
              <Search size={32} />
              <p className="text-sm">No languages found for &ldquo;{query}&rdquo;</p>
            </div>
          )}

        </div>
      </main>

      <Nav />
    </>
  );
}
