import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/profile/sell" }));
const accountApi = vi.hoisted(() => ({ sendSchoolEmailCode: vi.fn(), verifySchoolEmail: vi.fn(), becomeSeller: vi.fn() }));
vi.mock("@/lib/api/account", () => ({ accountApi }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import BecomeSellerPage from "./page";

const buyer = { id: "u1", email: "ada@gmail.com", role: "BUYER", emailVerifiedAt: "2026-10-18T00:00:00Z", institutionId: "unilag", schoolEmail: null };

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BecomeSellerPage />
    </QueryClientProvider>,
  );
}

describe("Becoming a seller (G2)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("confirms a school email with a code, then opens the store", async () => {
    useAuthStore.setState({ user: buyer as never });
    accountApi.sendSchoolEmailCode.mockResolvedValue(undefined);
    accountApi.verifySchoolEmail.mockResolvedValue({ ...buyer, role: "SELLER", schoolEmail: "ada@students.unilag.edu.ng" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter your school email address");
    fireEvent.change(screen.getByPlaceholderText("School email"), { target: { value: "ada@students.unilag.edu.ng" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(accountApi.sendSchoolEmailCode).toHaveBeenCalledWith("ada@students.unilag.edu.ng"));
    expect(await screen.findByText(/We sent a code to ada@students.unilag.edu.ng/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Resend code in/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and open my store" }));
    await waitFor(() => expect(accountApi.verifySchoolEmail).toHaveBeenCalledWith("123456"));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/sellers"));
    expect(useAuthStore.getState().user?.role).toBe("SELLER");
  });

  it("shows why a school email was refused", async () => {
    useAuthStore.setState({ user: buyer as never });
    accountApi.sendSchoolEmailCode.mockRejectedValue(new ApiError(422, "INSTITUTION_NOT_SUPPORTED", "That email isn't from a school on CampusMart yet"));
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("School email"), { target: { value: "ada@yahoo.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't from a school/);
  });

  it("opens the store in one tap with a confirmed school email", async () => {
    useAuthStore.setState({ user: { ...buyer, email: "ada@students.unilag.edu.ng", schoolEmail: "ada@students.unilag.edu.ng" } as never });
    accountApi.becomeSeller.mockResolvedValue({ ...buyer, role: "SELLER" });
    renderPage();
    expect(screen.getByText("ada@students.unilag.edu.ng")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open my store" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/sellers"));
  });

  it("tells a seller they already have a store", () => {
    useAuthStore.setState({ user: { ...buyer, role: "SELLER" } as never });
    renderPage();
    expect(screen.getByText(/You already have a store/)).toBeTruthy();
  });
});
