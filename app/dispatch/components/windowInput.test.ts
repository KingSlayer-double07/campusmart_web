import { describe, expect, it } from "vitest";
import { suggestedStart, toLocalInput, windowError, windowFrom } from "./windowInput";

describe("arrival windows (DF8b)", () => {
  it("suggests the next half hour at least an hour away", () => {
    expect(suggestedStart(new Date(2026, 9, 18, 9, 10))).toBe("2026-10-18T10:30");
    expect(suggestedStart(new Date(2026, 9, 18, 9, 40))).toBe("2026-10-18T11:00");
    expect(toLocalInput(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02T03:04");
  });

  it("turns a start and a length into a window, and checks it", () => {
    const w = windowFrom("2026-10-18T14:00", 2)!;
    expect(new Date(w.to).getTime() - new Date(w.from).getTime()).toBe(2 * 3_600_000);
    expect(windowFrom("not a date", 2)).toBeNull();
    const now = new Date(2026, 9, 18, 9, 0);
    expect(windowError(w, null, now)).toBeNull();
    expect(windowError(windowFrom("2026-10-18T05:00", 1), null, now)).toMatch(/passed/);
    expect(windowError(w, new Date(2026, 9, 18, 13, 0).toISOString(), now)).toMatch(/deadline/);
    expect(windowError(null, null, now)).toMatch(/Choose/);
  });
});
