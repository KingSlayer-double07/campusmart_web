import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  pathname: "/categories",
  params: new URLSearchParams("category=TECH"),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
}));

import SearchBar from "./SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    nav.router.push.mockReset();
    nav.router.replace.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("on the categories page, writes q into the URL 300 ms after typing stops", () => {
    vi.useFakeTimers();
    nav.pathname = "/categories";
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lamp" } });
    act(() => vi.advanceTimersByTime(299));
    expect(nav.router.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(nav.router.replace).toHaveBeenCalledWith("/categories?category=TECH&q=lamp", { scroll: false });
  });

  it("elsewhere, searching opens the categories page", () => {
    nav.pathname = "/";
    render(<SearchBar />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "desk lamp" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(nav.router.push).toHaveBeenCalledWith("/categories?q=desk%20lamp");
  });
});
