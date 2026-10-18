import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/profile/help/report" }));
const supportApi = vi.hoisted(() => ({ report: vi.fn(), contacts: vi.fn() }));
vi.mock("@/lib/api/support", async (actual) => ({ ...(await actual<object>()), supportApi }));
const uploadImages = vi.hoisted(() => vi.fn());
vi.mock("@/lib/uploads", () => ({ uploadImages }));

import { ApiError } from "@/lib/api/client";
import ReportPage from "./page";
import CallUsPage from "../call_us/page";

function renderWith(ui: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

describe("Help (guide 10, T4)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("sends a report with a screenshot and the device", async () => {
    supportApi.report.mockResolvedValue({ id: "r1" });
    uploadImages.mockResolvedValue([{ url: "https://res.cloudinary.com/x/image/upload/v1/campusmart/support/u1/a.jpg", publicId: "p" }]);
    renderWith(<ReportPage />);
    fireEvent.click(screen.getByRole("button", { name: /Send report/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Choose what it's about/);
    fireEvent.click(screen.getByLabelText("A payment"));
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "I was charged twice for CM-ABC123" } });
    fireEvent.change(screen.getByLabelText("Choose a screenshot"), { target: { files: [new File(["x"], "shot.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send report/ }));
    await waitFor(() =>
      expect(supportApi.report).toHaveBeenCalledWith({
        type: "PAYMENT",
        message: expect.stringMatching(/^I was charged twice for CM-ABC123\n\nDevice: /),
        screenshotUrl: "https://res.cloudinary.com/x/image/upload/v1/campusmart/support/u1/a.jpg",
      }),
    );
    expect(uploadImages.mock.calls[0][1]).toBe("SUPPORT");
    expect(await screen.findByText("Report sent")).toBeTruthy();
  });

  it("explains when screenshots can't be uploaded yet", async () => {
    uploadImages.mockRejectedValue(new ApiError(503, "UPLOADS_NOT_CONFIGURED", "not set up"));
    renderWith(<ReportPage />);
    fireEvent.click(screen.getByLabelText("Something isn’t working"));
    fireEvent.change(screen.getByLabelText("What happened?"), { target: { value: "The checkout button does nothing" } });
    fireEvent.change(screen.getByLabelText("Choose a screenshot"), { target: { files: [new File(["x"], "shot.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Send report/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Screenshots can't be uploaded yet/);
    expect(supportApi.report).not.toHaveBeenCalled();
  });

  it("call us shows the numbers that are set and 'coming soon' for the rest", async () => {
    supportApi.contacts.mockResolvedValue({ email: null, phone: "+234 801 234 5678", whatsapp: null });
    renderWith(<CallUsPage />);
    const call = await screen.findByRole("link", { name: /Call us/ });
    expect(call.getAttribute("href")).toBe("tel:+2348012345678");
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });
});
