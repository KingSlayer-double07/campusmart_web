import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const login = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const providers = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => nav.params,
}));
vi.mock("@/lib/api/auth", () => ({
  authApi: { login, refresh: vi.fn(() => Promise.reject(new Error("no session"))), me: vi.fn(), providers },
}));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import SignInForm from "./SignInForm";

const admin = { id: "a1", email: "admin@campusmart.test", role: "ADMIN", emailVerifiedAt: "2026-10-01T00:00:00Z" };

function renderForm() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SignInForm roleType="buyer" />
    </QueryClientProvider>,
  );
}

function signIn(email = "admin@campusmart.test", password = "LocalAdmin123") {
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("SignInForm", () => {
  beforeEach(() => {
    router.replace.mockReset();
    login.mockReset();
    nav.params = new URLSearchParams();
    providers.mockResolvedValue({ google: false });
    useAuthStore.setState({ user: null });
  });
  afterEach(cleanup);

  it("asks an admin for the emailed code, then signs in with it (M7)", async () => {
    login
      .mockRejectedValueOnce(
        new ApiError(401, "ADMIN_CODE_REQUIRED", "We emailed you a 6-digit code. Enter it to finish signing in.", {
          codeSent: true,
        }),
      )
      .mockResolvedValueOnce(admin);
    renderForm();
    signIn();

    expect(await screen.findByText(/we emailed you a 6-digit code/i)).toBeTruthy();
    const code = screen.getByPlaceholderText("6-digit code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(screen.queryByRole("alert")).toBeNull();

    // Too short is caught before the API
    fireEvent.change(code, { target: { value: "12a3" } });
    expect((code as HTMLInputElement).value).toBe("123");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/6-digit code/);
    expect(login).toHaveBeenCalledTimes(1);

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(login).toHaveBeenLastCalledWith({
      email: "admin@campusmart.test",
      password: "LocalAdmin123",
      code: "123456",
    });
    expect(useAuthStore.getState().user).toEqual(admin);
  });

  it("shows a wrong code's reason and keeps the code step", async () => {
    login
      .mockRejectedValueOnce(new ApiError(401, "ADMIN_CODE_REQUIRED", "We emailed you a 6-digit code."))
      .mockRejectedValueOnce(new ApiError(401, "INVALID_CODE", "That code is incorrect", { attemptsLeft: 4 }));
    renderForm();
    signIn();
    fireEvent.change(await screen.findByPlaceholderText("6-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("That code is incorrect");
    expect(screen.getByPlaceholderText("6-digit code")).toBeTruthy();
  });

  it("starts over when the email changes", async () => {
    login.mockRejectedValueOnce(new ApiError(401, "ADMIN_CODE_REQUIRED", "We emailed you a 6-digit code."));
    renderForm();
    signIn();
    await screen.findByPlaceholderText("6-digit code");
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "other@campusmart.test" } });
    expect(screen.queryByPlaceholderText("6-digit code")).toBeNull();
  });

  it("tells a suspended user the admin's reason (M6)", async () => {
    login.mockRejectedValueOnce(
      new ApiError(
        401,
        "ACCOUNT_SUSPENDED",
        "Your account is suspended: Sold fake phones. Contact CampusMart support if you think this is a mistake.",
        { reason: "Sold fake phones" },
      ),
    );
    renderForm();
    signIn("chidi@unilag.edu.ng", "Campus2026");
    expect((await screen.findByRole("alert")).textContent).toContain("Sold fake phones");
    expect(screen.queryByPlaceholderText("6-digit code")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("offers Google to buyers once it's set up, keeping where they were going (T1, G3)", async () => {
    providers.mockResolvedValue({ google: true });
    nav.params = new URLSearchParams("next=/orders");
    renderForm();
    const google = await screen.findByRole("link", { name: "Continue with Google" });
    expect(google.getAttribute("href")).toBe("/api/auth/google?next=%2Forders");
  });

  it("hides Google until it's set up", async () => {
    renderForm();
    await waitFor(() => expect(providers).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("explains why Google sent the buyer back", () => {
    nav.params = new URLSearchParams("error=GOOGLE_BUYERS_ONLY");
    renderForm();
    expect(screen.getByRole("alert").textContent).toMatch(/Google sign-in is for buyer accounts/);
  });
});
