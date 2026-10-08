"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";
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

    setError(null);
    setLoading(true);
    try {
      const user = await authApi.login(parsed.data);
      setUser(user);
      queryClient.setQueryData(meKey, user);
      router.replace(afterSignIn(user, next));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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
        placeholder="School email"
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
        autoComplete="current-password"
        name="password"
        required
      />
    </AuthContainer>
  );
}
