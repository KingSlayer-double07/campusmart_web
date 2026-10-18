import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const accountApi = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ accountApi }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import EditProfilePage from "./page";

const user = { id: "u1", email: "ada@gmail.com", username: null, firstName: "Ada", lastName: null, phone: null };

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditProfilePage />
    </QueryClientProvider>,
  );
}

describe("Editing the profile (guide 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: user as never });
  });
  afterEach(cleanup);

  it("saves the username, names and phone; empty clears", async () => {
    accountApi.updateProfile.mockResolvedValue({ ...user, username: "ada_obi" });
    renderPage();
    expect((screen.getByPlaceholderText("First name") as HTMLInputElement).value).toBe("Ada");
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "Ada_Obi" } });
    fireEvent.change(screen.getByPlaceholderText("Phone"), { target: { value: "+234 801 234 5678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() =>
      expect(accountApi.updateProfile).toHaveBeenCalledWith({
        username: "ada_obi",
        firstName: "Ada",
        lastName: null,
        phone: "+234 801 234 5678",
      }),
    );
    expect(useAuthStore.getState().user?.username).toBe("ada_obi");
  });

  it("checks the username and phone, and shows a taken username", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "no spaces!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/3 to 20/);
    expect(accountApi.updateProfile).not.toHaveBeenCalled();

    accountApi.updateProfile.mockRejectedValue(new ApiError(409, "USERNAME_TAKEN", "That username is taken"));
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "kemi" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That username is taken");
  });
});
