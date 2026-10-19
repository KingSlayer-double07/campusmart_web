import { describe, expect, it } from "vitest";
import { deliveryLine } from "./delivery";

describe("deliveryLine", () => {
  it("names the campus place, the address, an old station, or pickup", () => {
    expect(deliveryLine({ destination: { campusPlace: { id: "p1", name: "Moremi Hall" }, address: null }, pickupStation: null })).toBe(
      "Delivery to Moremi Hall",
    );
    expect(deliveryLine({ destination: { campusPlace: null, address: "14 Akoka Road" }, pickupStation: null })).toBe("Delivery to 14 Akoka Road");
    expect(deliveryLine({ destination: null, pickupStation: { id: "s1", name: "Library Pickup Point" } as never })).toBe("Library Pickup Point");
    expect(deliveryLine({ destination: null, pickupStation: null })).toBe("Pickup from the seller");
  });
});
