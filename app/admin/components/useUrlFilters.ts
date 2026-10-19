"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filters live in the URL (guide 9.2.3), so a filtered list can be shared, bookmarked or reloaded.
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const keyList = keys.join(",");
  const values = useMemo(
    () => Object.fromEntries(keyList.split(",").map((k) => [k, params.get(k) ?? ""])) as Record<K, string>,
    [params, keyList],
  );

  const setFilters = useCallback(
    (updates: Partial<Record<K, string | null>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates) as [string, string | null | undefined][]) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [values, setFilters] as const;
}
