import { describe, expect, it } from "vitest";
import { isWideRoute } from "./AppFrame";
import { isActiveNav } from "../admin/components/adminNav";

describe("AppFrame", () => {
  it("lets only the admin console use the full screen width", () => {
    expect(isWideRoute("/admin")).toBe(true);
    expect(isWideRoute("/admin/stations")).toBe(true);
    expect(isWideRoute("/administrator")).toBe(false);
    expect(isWideRoute("/sellers")).toBe(false);
    expect(isWideRoute(null)).toBe(false);
  });
});

describe("admin nav", () => {
  it("marks Overview only on /admin, and sections on their sub-pages", () => {
    expect(isActiveNav("/admin", "/admin")).toBe(true);
    expect(isActiveNav("/admin/stations", "/admin")).toBe(false);
    expect(isActiveNav("/admin/stations", "/admin/stations")).toBe(true);
    expect(isActiveNav("/admin/institutions", "/admin/stations")).toBe(false);
  });
});
