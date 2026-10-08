// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware, PROTECTED_PREFIXES } from "./middleware";

function run(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(path, "http://localhost:3000"));
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return middleware(request);
}

describe("middleware", () => {
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

  it("never looks for the old auth_token cookie", () => {
    expect(run("/profile", { auth_token: "dev-mock-token" }).status).toBe(307);
  });

  it("matches every protected prefix", () => {
    expect(config.matcher).toEqual(PROTECTED_PREFIXES.map((p) => `${p}/:path*`));
  });
});
