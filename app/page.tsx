"use client";

import Nav from "./components/nav";
import SearchBar from "./components/SearchBar";
import CategoryList from "./components/CategoryList";
import SectionHeader from "./components/SectionHeader";
import ListingsCarousel from "./components/ListingsCarousel";
import FeaturedBanner from "./components/FeaturedBanner";
import SectionDivider from "./components/SectionDivider";
import { useRequireAuth } from "./hooks/useRequireAuth";

export default function Home() {
  useRequireAuth(); // redirects to splash if not signed in
  return (
    <>
      <main className="pb-28 pt-8">
        {/* Section 1: Search & Filter */}
        <section className="flex flex-col gap-5 bg-card pt-0 pb-2 px-4 sm:px-6">
          <SearchBar />
          <CategoryList />
        </section>

        <SectionDivider />

        {/* Section 2: Featured (marketing content, static for now) */}
        <FeaturedBanner />

        <SectionDivider />

        {/* Section 3: Recommendations: most viewed this week */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="You Might Need" href="/recommendations" />
          <ListingsCarousel filters={{ sort: "popular" }} emptyText="No listings at your school yet. Check back soon." />
        </section>

        <SectionDivider />

        {/* Section 4: New Stocks */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="New in Stock" href="/new" />
          <ListingsCarousel filters={{ sort: "newest" }} emptyText="No listings at your school yet. Check back soon." />
        </section>

        {/* The Featured Store row returns in Phase 8, fed by GET /stores?featured=true */}
      </main>

      {/* Mobile bottom nav */}
      <Nav />
    </>
  );
}
