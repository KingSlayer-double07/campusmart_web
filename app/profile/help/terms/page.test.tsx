import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }), usePathname: () => "/profile/help/terms" }));

import TermsPage from "./page";
import TermsOverlay from "../../../components/TermsOverlay";

describe("Terms & Privacy (T5)", () => {
  afterEach(cleanup);

  it("shows the draft Terms, then the Privacy Policy", () => {
    render(<TermsPage />);
    expect(screen.getByText("Draft, not yet in effect")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "7. Payment hold, refunds and disputes" })).toBeTruthy();
    expect(screen.getByText(/Firearms, ammunition, explosives/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Privacy Policy" }));
    expect(screen.getByRole("tab", { name: "Privacy Policy" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "8. Your rights" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "4. Prohibited items" })).toBeNull();
    // No made-up contact addresses (T4): support contacts live on Help
    expect(document.body.textContent).not.toMatch(/privacy@campusmart/);
  });

  it("shows the same Terms in the sign-up overlay", () => {
    render(<TermsOverlay isOpen onClose={() => {}} onAccept={() => {}} />);
    expect(screen.getByText("Draft, not yet in effect")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "6. Delivery and pickup" })).toBeTruthy();
  });
});
