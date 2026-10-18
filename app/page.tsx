"use client";

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

export default function Home() {
  useRequireAuth(); // redirects to splash if not signed in
  return (
    <>
      <main className="pb-28 pt-8">
        {/* Section 1: Search & Filter */}
        <section className="flex flex-col gap-5 bg-card pt-0 pb-2 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
            <NotificationBell href="/profile/notifications" className="border border-border-default bg-card text-foreground" />
          </div>
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

        <SectionDivider />

        {/* Section 5: Featured stores (guide 8.2, R3) */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="Featured Store" href="/stores" />
          <FeaturedStoresRow />
        </section>
      </main>

      {/* Mobile bottom nav */}
      <Nav />
    </>
  );
}
