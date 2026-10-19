import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/settings", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api/hooks/useLogout", () => ({ useLogout: () => vi.fn() }));

import AdminShell from "./AdminShell";
import { ADMIN_NAV } from "./adminNav";

describe("AdminShell navigation", () => {
  afterEach(cleanup);

  // 15 links don't fit a laptop's height or a phone's width (reported on staging, 2026-10-19)
  it("lets both lists scroll, so every link can be reached", () => {
    render(<AdminShell>page</AdminShell>);
    const [sidebar, pill] = screen.getAllByRole("navigation", { name: "Admin" });
    expect(sidebar.className).toContain("overflow-y-auto");
    expect(sidebar.className).toContain("min-h-0");
    const pillList = pill.firstElementChild as HTMLElement;
    expect(pillList.className).toContain("overflow-x-auto");
    expect(pillList.className).toContain("max-w-full");
    for (const nav of [sidebar, pillList]) {
      const links = nav.querySelectorAll("a");
      expect(links).toHaveLength(ADMIN_NAV.length);
      links.forEach((a) => expect(a.className).toContain("shrink-0"));
    }
  });

  it("marks the current page's link in both lists", () => {
    render(<AdminShell>page</AdminShell>);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/admin/settings", "/admin/settings"]);
  });
});
