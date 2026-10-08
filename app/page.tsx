"use client";

import { products, featuredStores } from "./components/data";
import Nav from "./components/nav";
import SearchBar from "./components/SearchBar";
import CategoryList from "./components/CategoryList";
import SectionHeader from "./components/SectionHeader";
import ProductCarousel from "./components/ProductCarousel";
import FeaturedBanner from "./components/FeaturedBanner";
import SectionDivider from "./components/SectionDivider";
import FeaturedStoreCard from "./components/FeaturedStoreCard";
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

        {/* Section 2: Featured */}
        <FeaturedBanner />

        <SectionDivider />

        {/* Section 3: Recommendations */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="You Might Need" href="/recommendations" />
          <ProductCarousel products={products} />
        </section>

        <SectionDivider />

        {/* Section 4: New Stocks */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="New in Stock" href="/new" />
          <ProductCarousel products={products} />
        </section>

        <SectionDivider />

        {/* Section 5: Featured Store */}
        <section className="flex flex-col gap-3 bg-card py-5">
          <SectionHeader title="Featured Store" href="/stores" />
          {/* Carousel layout */}
          <div className="flex gap-4 sm:gap-5 overflow-x-scroll pb-2 no-scrollbar px-4 sm:px-6">
            {featuredStores.map((store, index) => (
              <div key={index} className="shrink-0">
                <FeaturedStoreCard store={store} />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Mobile bottom nav */}
      <Nav />
    </>
  );
}