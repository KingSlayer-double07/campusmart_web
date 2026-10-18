"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";
import Button from "@/app/components/Button";
import FormInput from "@/app/components/FormInput";
import PageHeader from "@/app/components/PageHeader";
import { useCountdown } from "@/app/hooks/useCountdown";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import { useBecomeSeller, useSendSchoolEmailCode, useVerifySchoolEmail } from "@/lib/api/hooks/useAccount";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong. Please try again.");

// Decision G2: sellers need a school email. A buyer whose account email is one starts selling in one
// tap; anyone else confirms one with a code first. The store then needs ID verification to publish.
export default function BecomeSellerPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const becomeSeller = useBecomeSeller();
  const sendCode = useSendSchoolEmailCode();
  const verify = useVerifySchoolEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendKey, setResendKey] = useState(0);
  const { display, expired } = useCountdown(RESEND_SECONDS, !!sentTo, resendKey);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const done = () => router.push("/sellers");

  const send = async (to: string) => {
    if (!EMAIL_RE.test(to)) {
      setError("Enter your school email address");
      return;
    }
    setError(null);
    try {
      await sendCode.mutateAsync(to);
      setSentTo(to);
      setResendKey((k) => k + 1);
    } catch (err) {
      setError(message(err));
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email");
      return;
    }
    setError(null);
    try {
      await verify.mutateAsync(code);
      done();
    } catch (err) {
      setError(message(err));
    }
  };

  const shell = (body: React.ReactNode) => (
    <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
      <PageHeader title="Sell on CampusMart" />
      {body}
    </main>
  );

  if (user?.role !== "BUYER") {
    return shell(
      <p className="text-sm text-foreground-muted">
        {user?.role === "SELLER" ? (
          <>
            You already have a store.{" "}
            <Link href="/sellers" className="font-semibold text-main">
              Go to your seller pages
            </Link>
          </>
        ) : (
          "Only a buyer account can open a store."
        )}
      </p>,
    );
  }

  if (user.schoolEmail) {
    return shell(
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          Open a store with your school email <strong className="text-foreground">{user.schoolEmail}</strong>. You&apos;ll add
          your store details and a photo of your student ID before you can publish listings.
        </p>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-red-500">
            {error}
          </p>
        )}
        <Button
          loading={becomeSeller.isPending}
          disabled={becomeSeller.isPending}
          roleType="seller"
          onClick={async () => {
            setError(null);
            try {
              await becomeSeller.mutateAsync(undefined);
              done();
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          Open my store
        </Button>
      </div>,
    );
  }

  return shell(
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void (sentTo ? confirm() : send(email.trim()));
      }}
    >
      <p className="text-sm text-foreground-muted">
        Sellers use their school email, so buyers know they&apos;re students. We&apos;ll send it a 6-digit code. You keep signing in
        with {user.email}.
      </p>
      <FormInput
        icon={Mail}
        type="email"
        placeholder="School email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setSentTo(null);
        }}
        autoComplete="email"
        name="schoolEmail"
        required
      />
      {sentTo && (
        <>
          <p role="status" className="text-[13px] text-foreground-muted">
            We sent a code to {sentTo}. It expires in 10 minutes.
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
          <button
            type="button"
            disabled={!expired || sendCode.isPending}
            onClick={() => send(sentTo)}
            className="self-start text-sm font-semibold text-main disabled:text-foreground-muted"
          >
            {expired ? "Resend code" : `Resend code in ${display}`}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-red-500">
          {error}
        </p>
      )}
      <Button type="submit" loading={sendCode.isPending || verify.isPending} disabled={sendCode.isPending || verify.isPending} roleType="seller">
        {sentTo ? "Confirm and open my store" : "Send code"}
      </Button>
    </form>,
  );
}
