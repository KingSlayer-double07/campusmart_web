import { describe, expect, it } from "vitest";
import { PROHIBITED_ITEMS } from "@/lib/prohibitedItems";
import { LEGAL_EFFECTIVE_DATE, legalDateLabel, legalMarkdown, PRIVACY, TERMS } from "./legal";

const text = (doc: typeof TERMS) =>
  [...doc.summary, ...doc.sections.flatMap((s) => [s.heading, ...s.body.flatMap((b) => (typeof b === "string" ? [b] : b.list))])].join("\n");

describe("Terms and Privacy (T5)", () => {
  it("covers delivery and pickup, the payment hold and 48-hour window, refunds by fault and the prohibited list", () => {
    const terms = text(TERMS);
    expect(terms).toMatch(/CampusMart rider/);
    expect(terms).toMatch(/Pickup from the seller/);
    expect(terms).toMatch(/48 hours to report a problem/);
    expect(terms).toMatch(/The seller's fault/);
    expect(terms).toMatch(/Your fault/);
    expect(terms).toMatch(/Nobody's fault/);
    expect(terms).toMatch(/delivery fee is refunded only when the whole order is refunded before anything was picked up/);
    for (const item of PROHIBITED_ITEMS) expect(terms).toContain(item);
  });

  it("states the deadlines the app enforces", () => {
    const terms = text(TERMS);
    expect(terms).toMatch(/expires after 30 minutes/);
    expect(terms).toMatch(/within 3 days of payment/);
    expect(terms).toMatch(/5 days to collect/);
    expect(terms).toMatch(/payouts pause for 24 hours/);
  });

  it("explains the Nigeria Data Protection Act rights, the processors and the 6-year records", () => {
    const privacy = text(PRIVACY);
    expect(privacy).toMatch(/Nigeria Data Protection Act 2023/);
    expect(privacy).toMatch(/Nigeria Data Protection Commission/);
    for (const processor of ["Paystack", "Cloudinary", "Render", "Vercel", "Neon", "Sentry", "Google"]) {
      expect(privacy).toContain(processor);
    }
    expect(privacy).toMatch(/6 years/);
    expect(privacy).toMatch(/never sell your data/);
  });

  it("says it's a draft until you approve it", () => {
    expect(LEGAL_EFFECTIVE_DATE).toBeNull();
    expect(legalDateLabel()).toBe("Draft, not yet in effect");
  });

  it("keeps the review copy in docs/legal in step with the app", async () => {
    await expect(legalMarkdown([TERMS, PRIVACY])).toMatchFileSnapshot("../../docs/legal/terms-and-privacy.md");
  });
});
