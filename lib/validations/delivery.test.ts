import { describe, expect, it } from "vitest";
import { addressError, phoneError } from "./delivery";

describe("delivery fields mirror the API", () => {
  it.each(["+234 801 234 5678", "08012345678", "0801-234-5678", "+2348012345678"])("accepts the phone %p", (p) => {
    expect(phoneError(p)).toBeNull();
  });

  it.each(["", "call me", "123", "+234 801 234 5678 ext 9"])("refuses the phone %p", (p) => {
    expect(phoneError(p)).not.toBeNull();
  });

  it("needs an address of 5 to 300 characters", () => {
    expect(addressError("14 Akoka Road, Yaba")).toBeNull();
    expect(addressError("   ")).toMatch(/Enter the address/);
    expect(addressError("Yaba")).toMatch(/5 to 300/);
    expect(addressError("x".repeat(301))).toMatch(/5 to 300/);
  });
});
