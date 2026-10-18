"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, Store } from "lucide-react";
import AuthContainer from "@/app/components/AuthContainer";
import FormInput from "@/app/components/FormInput";
import { useAuthStore } from "@/app/store/useAuthStore";
import { authApi, type AccountType } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { firstError, signUpSchema } from "@/lib/validations/auth";

// Held until Phase 3 saves it through PATCH /sellers/me
export const PENDING_STORE_NAME_KEY = "campus-mart-pending-store-name";

const TITLES: Record<AccountType, React.ReactNode> = {
  BUYER: (
    <>
      Join your campus
      <br />
      marketplace in seconds.
    </>
  ),
  SELLER: (
    <>
      Start selling on
      <br />
      Campus Mart in seconds.
    </>
  ),
};

// D7: email and password are the only fields, and the API sends a 6-digit code. A seller needs a school
// email, from which the API finds the school; a buyer may use any email and picks their school next (T1).
export default function SignUpForm({ accountType }: { accountType: AccountType }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    const parsed = signUpSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const user = await authApi.register({
        email: parsed.data.email,
        password: parsed.data.password,
        accountType,
      });
      setUser(user);
      if (accountType === "SELLER" && storeName.trim()) {
        localStorage.setItem(PENDING_STORE_NAME_KEY, storeName.trim());
      }
      router.push("/onboarding/verify-email");
    } catch (err) {
      // Sellers only: a buyer's email doesn't have to be a school's (G4: an unlisted school waits)
      if (err instanceof ApiError && err.code === "INSTITUTION_NOT_SUPPORTED") {
        router.push("/waitlist");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      roleType={accountType === "SELLER" ? "seller" : "buyer"}
      type="register"
      title={TITLES[accountType]}
      onSubmit={handleSignUp}
      loading={loading}
      error={error}
    >
      {accountType === "SELLER" && (
        <FormInput
          icon={Store}
          type="text"
          placeholder="Store name (optional)"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          autoComplete="organization"
          name="storeName"
        />
      )}
      <FormInput
        icon={Mail}
        type="email"
        placeholder={accountType === "SELLER" ? "School email" : "Email"}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        name="email"
        required
      />
      <FormInput
        icon={Lock}
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        name="password"
        required
      />
      <FormInput
        icon={Lock}
        type="password"
        placeholder="Confirm password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        name="confirmPassword"
        required
      />
    </AuthContainer>
  );
}
