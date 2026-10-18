import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }), usePathname: () => nav.pathname }));

import { useAuthStore } from "@/app/store/useAuthStore";
import SchoolGate from "./SchoolGate";

const buyer = { id: "u1", role: "BUYER", emailVerifiedAt: "2026-10-18T00:00:00Z", institutionId: null };

describe("SchoolGate (T1)", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.pathname = "/";
  });
  afterEach(cleanup);

  it("sends a confirmed buyer without a school to pick one", () => {
    useAuthStore.setState({ user: buyer as never });
    render(<SchoolGate />);
    expect(nav.replace).toHaveBeenCalledWith("/onboarding/school");
  });

  it.each(["/onboarding/verify-email", "/waitlist", "/profile/school"])("leaves %s open", (path) => {
    nav.pathname = path;
    useAuthStore.setState({ user: buyer as never });
    render(<SchoolGate />);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["a buyer with a school", { ...buyer, institutionId: "unilag" }],
    ["an unconfirmed buyer", { ...buyer, emailVerifiedAt: null }],
    ["a seller", { ...buyer, role: "SELLER" }],
    ["nobody signed in", null],
  ])("leaves %s alone", (_label, user) => {
    useAuthStore.setState({ user: user as never });
    render(<SchoolGate />);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
