"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/app/components/Button";
import SchoolPicker from "@/app/components/SchoolPicker";
import { useAuthStore } from "@/app/store/useAuthStore";
import { useGuestStore } from "@/app/store/useGuestStore";
import { ApiError } from "@/lib/api/client";
import { useSetSchool } from "@/lib/api/hooks/useAccount";
import { afterSignIn, needsSchool } from "@/lib/auth/redirects";

// Decision T1: a buyer who signed up without a school email picks their school before shopping
export default function PickSchoolPage() {
  return (
    <Suspense>
      <PickSchool />
    </Suspense>
  );
}

function PickSchool() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const user = useAuthStore((s) => s.user);
  const setSchool = useSetSchool();
  // Decision 2026-10-19: the school they browsed as a guest carries into the account
  const guestSchool = useGuestStore((s) => s.school);
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(guestSchool?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/onboarding/role-select");
    else if (!needsSchool(user)) router.replace(afterSignIn(user, next));
  }, [mounted, user, router, next]);

  const save = async () => {
    if (!selected) {
      setError("Choose your school");
      return;
    }
    setError(null);
    try {
      router.replace(afterSignIn(await setSchool.mutateAsync(selected), next));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <main className="flex w-full flex-1 flex-col gap-6 px-6 pb-12 pt-14">
      <div>
        <h1 className="text-[28px] font-bold leading-[1.1] text-foreground">Which school are you at?</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          You&apos;ll see what students there are selling, and get deliveries on that campus. You can change it later in your profile.
        </p>
        {guestSchool && selected === guestSchool.id && (
          <p className="mt-2 text-sm font-medium text-foreground">You were browsing {guestSchool.name}, so it&apos;s chosen already.</p>
        )}
      </div>
      <SchoolPicker selected={selected} onSelect={setSelected} />
      {error && (
        <p role="alert" className="text-[13px] font-medium text-red-500">
          {error}
        </p>
      )}
      <Button onClick={save} loading={setSchool.isPending} disabled={setSchool.isPending} outerRing roleType="buyer">
        Continue
      </Button>
    </main>
  );
}
