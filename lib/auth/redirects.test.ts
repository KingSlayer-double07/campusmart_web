import { describe, expect, it } from "vitest";
import { afterSignIn, homeForRole, safeNext, signInPathFor } from "./redirects";

describe("homeForRole", () => {
  it.each([
    ["ADMIN", "/admin"],
    ["PICKUP_AGENT", "/agent"],
    ["SELLER", "/sellers"],
    ["BUYER", "/"],
  ] as const)("%s -> %s", (role, path) => expect(homeForRole(role)).toBe(path));
});

describe("afterSignIn", () => {
  const verified = "2026-10-08T00:00:00.000Z";

  it("sends an unverified user to verify-email first", () => {
    expect(afterSignIn({ role: "SELLER", emailVerifiedAt: null })).toBe("/onboarding/verify-email");
  });

  it("redirects by role", () => {
    expect(afterSignIn({ role: "ADMIN", emailVerifiedAt: verified })).toBe("/admin");
    expect(afterSignIn({ role: "BUYER", emailVerifiedAt: verified })).toBe("/");
  });

  it("honours a same-origin next path", () => {
    expect(afterSignIn({ role: "BUYER", emailVerifiedAt: verified }, "/orders")).toBe("/orders");
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
