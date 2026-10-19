"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import FormInput from "@/app/components/FormInput";
import InfoBanner from "@/app/components/InfoBanner";
import Nav from "@/app/components/nav";
import PageHeader from "@/app/components/PageHeader";
import PageHero from "@/app/components/PageHero";
import { accountApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useLogout } from "@/lib/api/hooks/useLogout";

// Decision T6: personal details are anonymised and the account can't be used again; orders and
// payments are kept for 6 years. An account made with Google confirms by typing DELETE.
export default function DeleteAccountPage() {
  const router = useRouter();
  const logout = useLogout();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!secret) {
      setError("Enter your password, or type DELETE");
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await accountApi.deleteAccount(secret === "DELETE" ? { confirm: "DELETE" } : { password: secret });
      await logout();
      router.replace("/onboarding/role-select");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <>
      <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
        <PageHeader title="Delete Account" showBack />
        <PageHero icon={Trash2} iconBg="bg-red-50" iconColor="text-red-500" title="Delete your CampusMart account?" />
        <div className="flex flex-col gap-2 text-sm text-foreground-muted">
          <p>Your name, email, phone, school email, store details and payout account are removed, and you&apos;re signed out everywhere.</p>
          <p>Records of your orders and payments are kept for 6 years, as the law requires for tax, without your contact details.</p>
          <p>You can&apos;t delete it while an order is on its way or within its 48-hour window, or while a payout to you is unpaid.</p>
        </div>
        <InfoBanner variant="error" title="This can't be undone" text="You'd need a new account to use CampusMart again." />
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <FormInput
            icon={Lock}
            type="password"
            placeholder="Password, or DELETE for a Google account"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="current-password"
            name="password"
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-red-500">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={deleting}
            className="w-full rounded-full bg-red-500 py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </main>
      <Nav />
    </>
  );
}
