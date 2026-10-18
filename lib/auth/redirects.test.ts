import { describe, expect, it } from "vitest";
import { afterSignIn, homeForRole, needsSchool, safeNext, signInPathFor } from "./redirects";

describe("homeForRole", () => {
  it.each([
    ["ADMIN", "/admin"],
    ["PICKUP_AGENT", "/agent"],
    ["DISPATCH", "/dispatch"],
    ["SELLER", "/sellers"],
    ["BUYER", "/"],
  ] as const)("%s -> %s", (role, path) => expect(homeForRole(role)).toBe(path));
});

describe("afterSignIn", () => {
  const verified = "2026-10-08T00:00:00.000Z";
  const school = "i1";

  it("sends an unverified user to verify-email first", () => {
    expect(afterSignIn({ role: "SELLER", emailVerifiedAt: null, institutionId: school })).toBe("/onboarding/verify-email");
  });

  it("redirects by role", () => {
    expect(afterSignIn({ role: "ADMIN", emailVerifiedAt: verified, institutionId: null })).toBe("/admin");
    expect(afterSignIn({ role: "BUYER", emailVerifiedAt: verified, institutionId: school })).toBe("/");
  });

  it("asks a buyer without a school to pick one first (T1), even with a next path", () => {
    expect(afterSignIn({ role: "BUYER", emailVerifiedAt: verified, institutionId: null }, "/orders")).toBe("/onboarding/school");
    expect(needsSchool({ role: "SELLER", institutionId: null })).toBe(false);
  });

  it("honours a same-origin next path", () => {
    expect(afterSignIn({ role: "BUYER", emailVerifiedAt: verified, institutionId: school }, "/orders")).toBe("/orders");
  });
});

describe("safeNext", () => {
  it.each(["https://evil.test", "//evil.test", "/onboarding/buyers/sign-in", "", null])(
    "rejects %p",
    (next) => expect(safeNext(next)).toBeNull(),
  );
});

describe("signInPathFor", () => {
  it("uses the seller sign-in for seller pages and the buyer one elsewhere", () => {
    expect(signInPathFor("/sellers/orders")).toBe("/onboarding/sellers/sign-in");
    expect(signInPathFor("/checkout")).toBe("/onboarding/buyers/sign-in");
  });
});
