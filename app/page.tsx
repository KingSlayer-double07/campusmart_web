"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "./components/nav";
import SearchBar from "./components/SearchBar";
import NotificationBell from "./components/NotificationBell";
import CategoryList from "./components/CategoryList";
import SectionHeader from "./components/SectionHeader";
import ListingsCarousel from "./components/ListingsCarousel";
import FeaturedBanner from "./components/FeaturedBanner";
import SectionDivider from "./components/SectionDivider";
import { useRequireAuth } from "./hooks/useRequireAuth";
import FeaturedStoresRow from "./components/FeaturedStoresRow";
import GuestBrowsingBar from "./components/GuestBrowsingBar";
import { useAuthStore } from "./store/useAuthStore";

export default function Home() {
  // Signed in, or a guest browsing the school they picked; anyone else goes to the splash
  useRequireAuth("/splash", { guests: true });
  const signedIn = useAuthStore((s) => !!s.user);
  // The stores live on the phone, so the parts that differ for a guest wait for the browser
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <main className="pb-28 pt-8">
        {/* Section 1: Search & Filter */}
        <section className="flex flex-col gap-5 bg-card pt-0 pb-2 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
            {!mounted ? null : signedIn ? (
              <NotificationBell href="/profile/notifications" className="border border-border-default bg-card text-foreground" />
            ) : (
              <Link
                href="/onboarding/buyers/welcome"
                className="shrink-0 rounded-full bg-main px-4 py-2 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            )}
          </div>
          {mounted && !signedIn && <GuestBrowsingBar />}
          <CategoryList />
        </section>

        <SectionDivider />

        {/* Section 2: Featured (marketing content, static for now) */}
        <FeaturedBanner />

        <SectionDivider />

        {/* Section 3: Recommendations: most viewed this week */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="You Might Need" href="/browse?sort=popular" />
          <ListingsCarousel filters={{ sort: "popular" }} emptyText="No listings at your school yet. Check back soon." />
        </section>

        <SectionDivider />

        {/* Section 4: New Stocks */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="New in Stock" href="/browse?sort=newest" />
          <ListingsCarousel filters={{ sort: "newest" }} emptyText="No listings at your school yet. Check back soon." />
        </section>

        {/* Section 5: Featured stores (guide 8.2, R3). Store pages need an account (decision 2026-10-19). */}
        {mounted && signedIn && (
          <>
            <SectionDivider />
            <section className="flex flex-col gap-3 bg-card py-5">
              <SectionHeader title="Featured Store" href="/stores" />
              <FeaturedStoresRow />
            </section>
          </>
        )}
      </main>

      {/* Mobile bottom nav */}
      <Nav />
    </>
  );
}
