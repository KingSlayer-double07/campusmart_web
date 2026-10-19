"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import PageHeader from "@/app/components/PageHeader";
import SchoolPicker from "@/app/components/SchoolPicker";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import { useSetSchool } from "@/lib/api/hooks/useAccount";
import { useCart } from "@/lib/api/hooks/useCart";

// Decision G1: a buyer can change school; the cart empties, since its items are from the old school.
// A seller's school comes from their school email, so they can't change it here.
export default function ChangeSchoolPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cart = useCart();
  const setSchool = useSetSchool();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBuyer = user?.role === "BUYER";
  const changing = !!selected && selected !== user?.institutionId;

  const save = async () => {
    if (!changing) {
      router.push("/profile");
      return;
    }
    setError(null);
    try {
      await setSchool.mutateAsync(selected);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
      <PageHeader title="Your school" />
      {!isBuyer ? (
        <InfoBanner variant="warning" text="Your school comes from your school email, so it can't be changed here." />
      ) : (
        <>
          <SchoolPicker selected={selected ?? user?.institutionId ?? null} onSelect={setSelected} />
          {changing && cart.lineCount > 0 && (
            <InfoBanner
              variant="warning"
              title="Your cart will be emptied"
              text={`The ${cart.lineCount} item${cart.lineCount === 1 ? "" : "s"} in it are from your current school.`}
            />
          )}
          {error && (
            <p role="alert" className="text-[13px] font-medium text-red-500">
              {error}
            </p>
          )}
          <Button onClick={save} loading={setSchool.isPending} disabled={setSchool.isPending || !changing} roleType="buyer">
            Change school
          </Button>
        </>
      )}
    </main>
  );
}
