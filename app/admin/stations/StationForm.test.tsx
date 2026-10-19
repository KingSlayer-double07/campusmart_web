import { describe, expect, it } from "vitest";
import { rowsFromHours } from "@/lib/openingHours";
import { validateStation } from "./StationForm";

const good = {
  institutionId: "i1",
  name: "Main Gate",
  address: "Main Gate, University Road",
  contactName: "Bola Ade",
  contactPhone: "+234 801 234 5678",
};

describe("validateStation", () => {
  it("accepts a complete station", () => {
    expect(Object.values(validateStation(good, rowsFromHours(null), true)).filter(Boolean)).toEqual([]);
  });

  it("needs an institution when adding, but not when editing", () => {
    expect(validateStation({ ...good, institutionId: "" }, rowsFromHours(null), true).institutionId).toBeTruthy();
    expect(validateStation({ ...good, institutionId: "" }, rowsFromHours(null), false).institutionId).toBeUndefined();
  });

  it("explains a bad phone number and missing hours", () => {
    const closedAllWeek = rowsFromHours(null).map((r) => ({ ...r, isOpen: false }));
    const errors = validateStation({ ...good, contactPhone: "call me" }, closedAllWeek, true);
    expect(errors.contactPhone).toMatch(/phone number/);
    expect(errors.openingHours).toBe("Open the station on at least one day");
  });
});
