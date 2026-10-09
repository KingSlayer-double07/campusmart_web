import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const register = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { register } }));

import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/app/store/useAuthStore";
import SignUpForm from "./SignUpForm";

function fill(email: string, password = "Campus2026", confirm = password) {
  fireEvent.change(screen.getByPlaceholderText("School email"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
}

describe("SignUpForm", () => {
  beforeEach(() => {
    router.push.mockReset();
    register.mockReset();
    useAuthStore.setState({ user: null });
  });
  afterEach(cleanup);

  it("asks only for school email, password and confirmation", () => {
    render(<SignUpForm accountType="BUYER" />);
    expect(screen.getAllByRole("textbox").map((i) => i.getAttribute("name"))).toEqual(["email"]);
    expect(screen.queryByPlaceholderText(/username|phone/i)).toBeNull();
  });

  it("sends a non-school domain to /waitlist (422 INSTITUTION_NOT_SUPPORTED)", async () => {
    register.mockRejectedValue(
      new ApiError(422, "INSTITUTION_NOT_SUPPORTED", "CampusMart isn't available for your school yet"),
    );
    render(<SignUpForm accountType="BUYER" />);
    fill("ada@gmail.com");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/waitlist"));
    expect(register).toHaveBeenCalledWith({
      email: "ada@gmail.com",
      password: "Campus2026",
      accountType: "BUYER",
    });
  });

  it("shows the friendly message for a switched-off school instead of the waitlist", async () => {
    register.mockRejectedValue(
      new ApiError(
        403,
        "INSTITUTION_INACTIVE",
        "CampusMart isn't available at your school right now. Please check back soon.",
      ),
    );
    render(<SignUpForm accountType="BUYER" />);
    fill("ada@unilag.edu.ng");
    expect(await screen.findByText(/isn't available at your school right now/)).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("goes to verify-email after a school-email sign-up", async () => {
    const user = { id: "u1", email: "ada@unilag.edu.ng", role: "SELLER", emailVerifiedAt: null };
    register.mockResolvedValue(user);
    render(<SignUpForm accountType="SELLER" />);
    fill("ada@unilag.edu.ng");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/verify-email"));
    expect(register.mock.calls[0][0].accountType).toBe("SELLER");
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("shows the API error message under the form", async () => {
    register.mockRejectedValue(new ApiError(409, "CONFLICT", "An account with this email already exists"));
    render(<SignUpForm accountType="BUYER" />);
    fill("ada@unilag.edu.ng");
    expect((await screen.findByRole("alert")).textContent).toContain("An account with this email already exists");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("validates before calling the API", async () => {
    render(<SignUpForm accountType="BUYER" />);
    fill("ada@unilag.edu.ng", "Campus2026", "Different2026");
    expect((await screen.findByRole("alert")).textContent).toContain("Passwords don't match");
    expect(register).not.toHaveBeenCalled();
  });
});
