import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  verified: false,
  canPublish: false,
  verification: undefined as { status: string } | undefined,
  profile: undefined as { deliveryDetailsComplete: boolean } | undefined,
}));
vi.mock("@/lib/api/hooks/useSellerVerification", () => ({
  useCanPublish: () => state.canPublish,
  useIsVerified: () => state.verified,
  useMyVerification: () => ({ data: state.verification }),
}));
vi.mock("@/lib/api/hooks/useSellerProfile", () => ({ useSellerProfile: () => ({ data: state.profile }) }));

import VerificationNotice from "./VerificationNotice";

describe("VerificationNotice", () => {
  afterEach(cleanup);

  it("first asks for verification, then for the delivery details, then nothing", () => {
    Object.assign(state, { verified: false, canPublish: false, verification: { status: "UNVERIFIED" }, profile: { deliveryDetailsComplete: false } });
    render(<VerificationNotice />);
    expect(screen.getByText("Get verified to publish")).toBeTruthy();
    cleanup();

    Object.assign(state, { verified: true, verification: { status: "VERIFIED" } });
    render(<VerificationNotice />);
    expect(screen.getByText("Add your delivery details to publish")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add delivery details" }).getAttribute("href")).toBe("/sellers/profile#delivery");
    cleanup();

    Object.assign(state, { canPublish: true, profile: { deliveryDetailsComplete: true } });
    const { container } = render(<VerificationNotice />);
    expect(container.textContent).toBe("");
  });
});
