import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchApi } from "./client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls the same-origin /api prefix and unwraps the success envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { success: true, data: { id: "u1" }, timestamp: "t" }),
    );
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

    await expect(fetchApi("/listings")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK",
    });
  });
});
