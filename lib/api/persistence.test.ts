import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { shouldPersistQuery } from "./persistence";

describe("shouldPersistQuery", () => {
  it("persists only successful queries marked meta.persist", async () => {
    const client = new QueryClient();
    await client.prefetchQuery({ queryKey: ["listings"], queryFn: () => [1], meta: { persist: true } });
    await client.prefetchQuery({ queryKey: ["me"], queryFn: () => ({ id: "u1" }) });
    await client.prefetchQuery({ queryKey: ["sessions"], queryFn: () => [], meta: { persist: false } });

    const persisted = client
      .getQueryCache()
      .getAll()
      .filter(shouldPersistQuery)
      .map((q) => q.queryKey[0]);
    expect(persisted).toEqual(["listings"]);
  });
});
