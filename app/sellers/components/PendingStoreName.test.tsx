import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

const profile = vi.hoisted(() => ({ value: { storeName: null as string | null } }));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/hooks/useSellerProfile", () => ({
  useSellerProfile: () => ({ data: profile.value }),
  useUpdateSellerProfile: () => ({ mutate }),
}));

import { PENDING_STORE_NAME_KEY } from "@/app/onboarding/components/SignUpForm";
import PendingStoreName from "./PendingStoreName";

describe("PendingStoreName", () => {
  beforeEach(() => {
    mutate.mockReset();
    localStorage.clear();
  });
  afterEach(cleanup);

  it("saves the store name typed at sign-up once, then forgets it", async () => {
    localStorage.setItem(PENDING_STORE_NAME_KEY, "TrendHUB NG");
    profile.value = { storeName: null };
    mutate.mockImplementation((_body, options: { onSuccess: () => void }) => options.onSuccess());
    render(<PendingStoreName />);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ storeName: "TrendHUB NG" }, expect.anything()));
    expect(localStorage.getItem(PENDING_STORE_NAME_KEY)).toBeNull();
  });

  it("never overwrites a store that already has a name", async () => {
    localStorage.setItem(PENDING_STORE_NAME_KEY, "Old idea");
    profile.value = { storeName: "Ada Wears" };
    render(<PendingStoreName />);
    await waitFor(() => expect(localStorage.getItem(PENDING_STORE_NAME_KEY)).toBeNull());
    expect(mutate).not.toHaveBeenCalled();
  });
});
