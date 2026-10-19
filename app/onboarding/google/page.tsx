"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/useAuthStore";
import { authApi } from "@/lib/api/auth";
import { meKey } from "@/lib/api/hooks/useMe";
import { afterSignIn } from "@/lib/auth/redirects";

// Google sent the buyer back and the API set the cookies: load the account and carry on
// (picking a school first if they have none, T1)
function GoogleDone() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((user) => {
        if (cancelled) return;
        setUser(user);
        queryClient.setQueryData(meKey, user);
        router.replace(afterSignIn(user, next));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [next, router, setUser, queryClient]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center text-sm">
      {failed ? (
        <>
          <p className="font-medium text-foreground">We couldn&apos;t finish signing you in.</p>
          <Link href="/onboarding/buyers/sign-in" className="font-semibold text-main">
            Back to sign in
          </Link>
        </>
      ) : (
        <p className="text-foreground-muted" aria-busy="true">
          Signing you in…
        </p>
      )}
    </main>
  );
}

export default function GoogleDonePage() {
  return (
    <Suspense fallback={null}>
      <GoogleDone />
    </Suspense>
  );
}
