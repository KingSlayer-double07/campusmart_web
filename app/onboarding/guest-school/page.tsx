"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerUpLeft } from "lucide-react";
import Button from "@/app/components/Button";
import SchoolPicker from "@/app/components/SchoolPicker";
import { useGuestStore } from "@/app/store/useGuestStore";
import { useSchools } from "@/lib/api/hooks/useAccount";

// Decision 2026-10-19: "Browse Items" needs no account, only a school to browse. It's kept on the
// phone and offered again if the visitor signs up.
export default function GuestSchoolPage() {
  const router = useRouter();
  const schools = useSchools();
  const current = useGuestStore((s) => s.school);
  const setSchool = useGuestStore((s) => s.setSchool);
  const [selected, setSelected] = useState<string | null>(current?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const browse = () => {
    const school = schools.data?.find((s) => s.id === selected);
    if (!school) {
      setError("Choose a school to browse");
      return;
    }
    setSchool({ id: school.id, name: school.name });
    router.replace("/");
  };

  return (
    <main className="flex w-full flex-1 flex-col gap-6 px-6 pb-12 pt-8">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-card shadow-lg transition hover:bg-surface-muted"
      >
        <CornerUpLeft size={18} />
      </button>
      <div>
        <h1 className="text-[28px] font-bold leading-[1.1] text-foreground">Which school do you want to browse?</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          No account needed to look around. You&apos;ll sign in when you check out.
        </p>
      </div>
      <SchoolPicker
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          setError(null);
        }}
      />
      {error && (
        <p role="alert" className="text-[13px] font-medium text-red-500">
          {error}
        </p>
      )}
      <Button onClick={browse} outerRing roleType="buyer">
        Start browsing
      </Button>
      <p className="text-center text-sm text-foreground-muted">
        Have an account?{" "}
        <Link href="/onboarding/buyers/sign-in" className="font-semibold text-main">
          Sign in
        </Link>
      </p>
    </main>
  );
}
