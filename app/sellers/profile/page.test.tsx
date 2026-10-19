import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/hooks/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("@/lib/api/hooks/useSellerProfile", () => ({
  useSellerProfile: () => ({
    data: { storeName: "Chidi Gadgets", logoUrl: null, bio: null, isOnline: true, rating: null, reviewCount: 0 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSellerProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useSellerVerification", () => ({ useIsVerified: () => true }));
vi.mock("../components/DeliveryCard", () => ({ default: () => null }));
vi.mock("../components/VerificationCard", () => ({ default: () => null }));

import SellerProfilePage from "./page";

describe("The seller's Profile page", () => {
  afterEach(cleanup);

  it("leads to the shop, since sellers can also buy (D8)", () => {
    render(<SellerProfilePage />);
    const shop = screen.getByRole("link", { name: /Shop on CampusMart/ });
    expect(shop.getAttribute("href")).toBe("/");
    expect(shop.textContent).toContain("Buy from other stores at your school");
  });
});
