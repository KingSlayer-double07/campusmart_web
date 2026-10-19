// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy, PROTECTED_PREFIXES } from "./proxy";

function run(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(path, "http://localhost:3000"));
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return proxy(request);
}

describe("proxy", () => {
  it.each(PROTECTED_PREFIXES)("sends a visitor without auth cookies on %s to sign-in", (prefix) => {
    const res = run(`${prefix}/x?tab=1`);
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe(
      prefix === "/sellers" ? "/onboarding/sellers/sign-in" : "/onboarding/buyers/sign-in",
    );
    expect(location.searchParams.get("next")).toBe(`${prefix}/x?tab=1`);
  });

  it.each(["access_token", "refresh_token"])("lets a request with %s through", (cookie) => {
    const res = run("/orders", { [cookie]: "x" });
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a guest open the cart, and asks them to sign in for checkout and store pages (decision 2026-10-19)", () => {
    // The proxy runs only on the matcher's paths
    expect(PROTECTED_PREFIXES).not.toContain("/cart");
    expect(config.matcher).not.toContain("/cart/:path*");
    expect(config.matcher).toContain("/stores/:path*");
    expect(new URL(run("/checkout").headers.get("location")!).searchParams.get("next")).toBe("/checkout");
    expect(new URL(run("/stores/s1").headers.get("location")!).pathname).toBe("/onboarding/buyers/sign-in");
  });

  it("never looks for the old auth_token cookie", () => {
    expect(run("/profile", { auth_token: "dev-mock-token" }).status).toBe(307);
  });

  it("lets a signed-out rider open their invite link", () => {
    expect(run("/dispatch/invite?token=abc").headers.get("location")).toBeNull();
    expect(run("/dispatch/jobs/1").status).toBe(307);
  });

  it("matches every protected prefix", () => {
    expect(config.matcher).toEqual(PROTECTED_PREFIXES.map((p) => `${p}/:path*`));
  });
});
