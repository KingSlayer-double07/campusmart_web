import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OfflineFallback from "./page";

describe("offline fallback (/~offline)", () => {
  afterEach(cleanup);

  it("says the user is offline and offers a retry and the cart", () => {
    const { container } = render(<OfflineFallback />);
    expect(screen.getByRole("heading", { name: /you're offline/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View Offline Cart" }).getAttribute("href")).toBe("/cart");
    // The old page showed a mis-encoded emoji ("ðŸ“¡")
    expect(container.textContent).not.toMatch(/ð|Ÿ/);
  });
});
