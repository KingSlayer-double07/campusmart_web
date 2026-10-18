"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/Button";
import SchoolPicker from "@/app/components/SchoolPicker";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import { useSetSchool } from "@/lib/api/hooks/useAccount";
import { afterSignIn, needsSchool } from "@/lib/auth/redirects";

// Decision T1: a buyer who signed up without a school email picks their school before shopping
export default function PickSchoolPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setSchool = useSetSchool();
  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/onboarding/role-select");
    else if (!needsSchool(user)) router.replace(afterSignIn(user));
  }, [mounted, user, router]);

  const save = async () => {
    if (!selected) {
      setError("Choose your school");
      return;
    }
    setError(null);
    try {
      router.replace(afterSignIn(await setSchool.mutateAsync(selected)));
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
