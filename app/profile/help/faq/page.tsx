"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Minus } from "lucide-react";
import { useRouter } from "next/navigation";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import { faqs, faqCategories } from "../../../lib/data";

type Category = typeof faqCategories[number];

/* ─────────────────────────────────────────────
   Accordion item
───────────────────────────────────────────── */
function AccordionItem({
  q,
  a,
  isOpen,
  onToggle,
}: {
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border-default overflow-hidden bg-card">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-4 text-left gap-3"
      >
        <p className="text-sm font-medium text-foreground flex-1 leading-snug">{q}</p>
        <div
          className={`size-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            isOpen ? "bg-orange-100" : "bg-surface-muted"
          }`}
        >
          {isOpen ? (
            <Minus size={14} className="text-main" />
          ) : (
            <Plus size={14} className="text-foreground-muted" />
          )}
        </div>
      </button>

      {/* Answer — smooth height transition via max-height trick */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p className="px-4 pb-4 text-sm text-foreground-muted leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function FAQPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [openIndex, setOpenIndex] = useState<number | null>(0); // first open by default

  const filtered = useMemo(() => {
    return faqs.filter((faq) => {
      const matchCat = activeCategory === "All" || faq.category === activeCategory;
      const matchQuery =
        !query ||
        faq.q.toLowerCase().includes(query.toLowerCase()) ||
        faq.a.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [query, activeCategory]);

  return (
    <>
      <main className="pb-36 pt-8 px-5">
        <PageHeader title="FAQs" showBack={true} />

        {/* Search */}
        <div className="mt-5 mb-4 flex items-center gap-2 bg-surface-muted rounded-full px-4 py-3">
          <Search size={16} className="text-foreground-muted shrink-0" />
          <input
            id="faq-search"
            type="text"
            placeholder="Search FAQs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent flex-1 text-sm text-foreground placeholder-neutral-400 outline-none"
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none no-scrollbar">
          {faqCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activeCategory === cat
                  ? "bg-main text-white border-main"
                  : "bg-card text-main border-main"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Accordion list */}
        <div className="flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-foreground-muted">
              <Search size={32} />
              <p className="text-sm">No FAQs found for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            filtered.map((faq, i) => (
              <AccordionItem
                key={i}
                q={faq.q}
                a={faq.a}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))
          )}
        </div>
      </main>

      {/* Sticky bottom — "Still need help?" */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-6 pt-3 bg-gradient-to-t from-white via-white/90 to-transparent z-50">
        <div className="w-full max-w-md px-5">
          <button
            onClick={() => router.push("/profile/help/email_support")}
            className="w-full rounded-full border-2 border-main py-3.5 font-semibold text-[15px] text-main hover:bg-orange-50 transition-all"
          >
            Still need help? Contact Support
          </button>
        </div>
      </div>

      <Nav />
    </>
  );
}
