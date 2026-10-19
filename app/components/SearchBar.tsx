"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

const SEARCH_PAGE = "/categories";

// Guide 3.2.5: the search writes `q` into the URL, debounced by 300 ms. On the categories page
// the results follow as you type; elsewhere, searching opens the categories page.
// Reading the URL needs a Suspense boundary, so every page using the bar gets one here.
export default function SearchBar() {
  return (
    <Suspense fallback={<div className="h-12 w-full rounded-full border border-border-default" />}>
      <SearchBarInner />
    </Suspense>
  );
}

function SearchBarInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onSearchPage = pathname === SEARCH_PAGE;
  const urlQuery = onSearchPage ? params.get("q") ?? "" : "";
  const [text, setText] = useState(urlQuery);

  // Follow the URL (e.g. "Clear filters"), without trimming what's still being typed
  useEffect(() => {
    setText((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    if (!onSearchPage || text.trim() === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text.trim()) next.set("q", text.trim());
      else next.delete("q");
      const query = next.toString();
      router.replace(query ? `${SEARCH_PAGE}?${query}` : SEARCH_PAGE, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, urlQuery, onSearchPage, router, params]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchPage) return;
    const q = text.trim();
    router.push(q ? `${SEARCH_PAGE}?q=${encodeURIComponent(q)}` : SEARCH_PAGE);
  };

  return (
    <form
      role="search"
      onSubmit={submit}
      className="border border-border-default shadow-lg/5 flex w-full h-12 rounded-full justify-between items-center pl-4 pr-2 bg-card"
    >
      <input
        type="search"
        enterKeyHint="search"
        aria-label="Search on Campusmart"
        placeholder="Search on Campusmart"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-xs tracking-tight font-medium w-full focus:outline-none bg-transparent"
      />
      {text && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setText("")}
          className="px-2 flex items-center justify-center text-foreground-muted"
        >
          <X size={16} />
        </button>
      )}
      <button type="submit" aria-label="Search" className="bg-main flex justify-center items-center py-1.5 px-3 shrink-0 rounded-full">
        <Search color="white" size={17} strokeWidth={3} />
      </button>
    </form>
  );
}
