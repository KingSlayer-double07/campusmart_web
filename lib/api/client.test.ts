import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as null | { role: string },
  clearAuth: vi.fn(),
}));

vi.mock("@/app/store/useAuthStore", () => ({
  useAuthStore: { getState: () => authState },
}));

import { ApiError, fetchApi } from "./client";
import { authApi } from "./auth";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ok = (data: unknown) => jsonResponse(200, { success: true, data, timestamp: "t" });
const unauthorized = () =>
  jsonResponse(401, { statusCode: 401, code: "UNAUTHENTICATED", message: "Unauthorized" });
const noContent = () => new Response(null, { status: 204 });

function urls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c) => c[0] as string);
}

describe("fetchApi", () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authState.user = null;
    authState.clearAuth.mockReset();
    assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/sellers", assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls the same-origin /api prefix and unwraps the success envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ id: "u1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/auth/me")).resolves.toEqual({ id: "u1" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("throws ApiError with status, code, message and details on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          statusCode: 409,
          code: "OUT_OF_STOCK",
          message: "Only 2 left",
          details: { available: 2 },
          path: "/api/cart/items",
          timestamp: "t",
        }),
      ),
    );

    const error = await fetchApi("/cart/items").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "OUT_OF_STOCK",
      message: "Only 2 left",
      details: { available: 2 },
    });
  });

  it("throws ApiError(0, 'NETWORK') when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchApi("/listings")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("times out after 15 seconds with ApiError(0, 'NETWORK')", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    const pending = fetchApi("/listings").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({ status: 0, code: "NETWORK", message: "Request timed out" });
  });

  it("silently refreshes once on a 401 and retries the original request", async () => {
    authState.user = { role: "BUYER" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized()) // access token expired
      .mockResolvedValueOnce(noContent()) // POST /auth/refresh rotates cookies
      .mockResolvedValueOnce(ok([{ id: "o1" }])); // retry succeeds
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/orders")).resolves.toEqual([{ id: "o1" }]);
    expect(urls(fetchMock)).toEqual(["/api/orders", "/api/auth/refresh", "/api/orders"]);
    expect(authState.clearAuth).not.toHaveBeenCalled();
  });

  it("refreshes for GET /auth/me too, so app start after 15 idle minutes stays signed in", async () => {
    authState.user = { role: "BUYER" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(noContent())
      .mockResolvedValueOnce(ok({ id: "u1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/auth/me")).resolves.toEqual({ id: "u1" });
    expect(urls(fetchMock)).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
  });

  it("shares one in-flight refresh between parallel 401s", async () => {
    authState.user = { role: "BUYER" };
    let refreshCalls = 0;
    const seen = new Set<string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/refresh") {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 10));
          return noContent();
        }
        // First call to each endpoint is a 401; the retry succeeds
        if (!seen.has(url)) {
          seen.add(url);
          return unauthorized();
        }
        return ok(url);
      }),
    );

    const results = await Promise.all([fetchApi("/a"), fetchApi("/b"), fetchApi("/c")]);
    expect(results).toEqual(["/api/a", "/api/b", "/api/c"]);
    expect(refreshCalls).toBe(1);
  });

  it("never refreshes on a 401 from a credential route such as login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/auth/login", { method: "POST" })).rejects.toMatchObject({ status: 401 });
    expect(urls(fetchMock)).toEqual(["/api/auth/login"]);
  });

  it("clears auth and sends a signed-in seller to sign-in when the refresh is rejected", async () => {
    authState.user = { role: "SELLER" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized()),
    );

    await expect(fetchApi("/sellers/me")).rejects.toMatchObject({ status: 401 });
    expect(authState.clearAuth).toHaveBeenCalledTimes(1);
    // ...and back to the page after signing in
    expect(assign).toHaveBeenCalledWith("/onboarding/sellers/sign-in?next=%2Fsellers");
  });

  it("does not redirect a guest whose refresh is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized()),
    );

    await expect(fetchApi("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    [429, "TOO_MANY_REQUESTS"],
    [500, "INTERNAL_ERROR"],
    [502, "UNKNOWN"],
  ])("keeps the user signed in when the refresh answers %i (says nothing about the session)", async (status, code) => {
    authState.user = { role: "BUYER" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(jsonResponse(status, { statusCode: status, code, message: "Try again" })),
    );

    await expect(fetchApi("/orders")).rejects.toMatchObject({ status });
    expect(authState.clearAuth).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("signs out when the refresh is forbidden (suspended, or school switched off)", async () => {
    authState.user = { role: "BUYER" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(jsonResponse(403, { statusCode: 403, code: "INSTITUTION_INACTIVE", message: "Off" })),
    );

    await expect(fetchApi("/orders")).rejects.toMatchObject({ status: 401 });
    expect(authState.clearAuth).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/onboarding/buyers/sign-in?next=%2Fsellers");
  });

  it("joins the sign-in page's silent refresh to one already running (refresh tokens are single-use)", async () => {
    let refreshCalls = 0;
    let finish!: () => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/auth/refresh") {
          refreshCalls += 1;
          return new Promise<Response>((resolve) => (finish = () => resolve(noContent())));
        }
        return Promise.resolve(refreshCalls ? ok({ id: "u1" }) : unauthorized());
      }),
    );

    const me = fetchApi("/auth/me"); // 401, so it starts a refresh
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    const silent = authApi.refresh(); // the sign-in page's, while the first is still on its way
    finish();
    await expect(Promise.all([me, silent])).resolves.toEqual([{ id: "u1" }, undefined]);
    expect(refreshCalls).toBe(1);
  });

  it("takes turns with other tabs through a browser lock when there is one", async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal("navigator", { locks: { request } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(noContent()).mockResolvedValueOnce(ok([])),
    );

    await expect(fetchApi("/orders")).resolves.toEqual([]);
    expect(request).toHaveBeenCalledWith("campusmart-session-refresh", expect.any(Function));
  });

  it("keeps the user signed in when the refresh fails on the network", async () => {
    authState.user = { role: "BUYER" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(unauthorized())
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    );

    await expect(fetchApi("/orders")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
    expect(authState.clearAuth).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
