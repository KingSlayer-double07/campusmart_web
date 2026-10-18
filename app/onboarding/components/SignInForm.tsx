"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Lock, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import AuthContainer from "@/app/components/AuthContainer";
import FormInput from "@/app/components/FormInput";
import { useAuthStore } from "@/app/store/useAuthStore";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { meKey } from "@/lib/api/hooks/useMe";
import { afterSignIn } from "@/lib/auth/redirects";
import { firstError, loginSchema } from "@/lib/validations/auth";

const TITLES = {
  buyer: (
    <>
      Welcome back!
      <br />
      Log in to continue.
    </>
  ),
  seller: (
    <>
      Welcome back!
      <br />
      Log in to continue earning.
    </>
  ),
};

export default function SignInForm({ roleType }: { roleType: "buyer" | "seller" }) {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Decision M7: an admin's right password emails a 6-digit code; the sign-in finishes with it
  const [codeStep, setCodeStep] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // The middleware sent us here because no access cookie reached the page. The refresh cookie
  // only travels to /api/auth, so try a silent refresh before asking for the password.
  useEffect(() => {
    if (!next) return;
    let cancelled = false;
    authApi
      .refresh()
      .then(() => authApi.me())
      .then((user) => {
        if (cancelled) return;
        setUser(user);
        queryClient.setQueryData(meKey, user);
        router.replace(afterSignIn(user, next));
      })
      .catch(() => undefined); // no live session: show the form
    return () => {
      cancelled = true;
    };
  }, [next, router, setUser, queryClient]);

  const handleLogin = async () => {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }

    if (codeStep && !/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const user = await authApi.login(codeStep ? { ...parsed.data, code } : parsed.data);
      setUser(user);
      queryClient.setQueryData(meKey, user);
      router.replace(afterSignIn(user, next));
    } catch (err) {
      if (err instanceof ApiError && err.code === "ADMIN_CODE_REQUIRED") {
        setCodeStep(err.message);
        setCode("");
      } else {
        // A suspended account's message carries the admin's reason (M6)
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContainer
      roleType={roleType}
      type="login"
      title={TITLES[roleType]}
      onSubmit={handleLogin}
      loading={loading}
      error={error}
    >
      <FormInput
        icon={Mail}
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setCodeStep(null);
        }}
        autoComplete="email"
        name="email"
        required
      />
      <FormInput
        icon={Lock}
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setCodeStep(null);
        }}
        autoComplete="current-password"
        name="password"
        required
      />
      {codeStep && (
        <>
          <p role="status" className="text-[13px] text-foreground-muted">
            {codeStep}
          </p>
          <FormInput
            icon={KeyRound}
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            name="code"
            autoFocus
            required
          />
        </>
      )}
    </AuthContainer>
  );
}
