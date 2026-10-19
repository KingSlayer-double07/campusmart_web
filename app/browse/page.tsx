import { redirect } from "next/navigation";

// Guide 8.3: /browse?sort=&category=&q= is the listing grid. The categories screen already is that
// grid, driven by the same URL params (guide 3.2.5), so /browse hands over to it.
export default async function BrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/categories?${query}` : "/categories");
}
