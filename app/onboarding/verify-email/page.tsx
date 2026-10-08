"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Button from "@/app/components/Button";
import { useCountdown } from "@/app/hooks/useCountdown";
import { useAuthStore } from "@/app/store/useAuthStore";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { meKey } from "@/lib/api/hooks/useMe";
import { homeForRole } from "@/lib/auth/redirects";
import { codeSchema } from "@/lib/validations/auth";

const RESEND_SECONDS = 60;

function codeErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.code === "INVALID_CODE") {
    const left = (err.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
    return left ? `That code is incorrect. ${left} ${left === 1 ? "try" : "tries"} left.` : err.message;
  }
  if (err.code === "CODE_LOCKED" || err.code === "CODE_EXPIRED") {
    return `${err.message} Tap "Resend code" for a new one.`;
  }
  return err.message;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendKey, setResendKey] = useState(0);
  // A code was emailed at sign-up, so the first resend waits a minute (the API allows 1 a minute)
  const { display, expired } = useCountdown(RESEND_SECONDS, true, resendKey);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!user) router.replace("/onboarding/role-select");
    else if (user.emailVerifiedAt) router.replace(homeForRole(user.role));
  }, [mounted, user, router]);

  const handleVerify = async () => {
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) {
      setError("Enter the 6-digit code from the email");
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      const verified = await authApi.verifyEmail(parsed.data);
      queryClient.setQueryData(meKey, verified);
      setUser(verified); // the effect above routes buyers to / and sellers to /sellers
    } catch (err) {
      setError(codeErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await authApi.resendVerification();
      setCode("");
      setNotice("We sent a new code. Earlier codes no longer work.");
      setResendKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  if (!mounted || !user) return null;

  return (
    <div className="flex flex-col px-6 pt-14 pb-12 w-full flex-1">
      <div className="size-14 rounded-full bg-orange-100 flex items-center justify-center mb-6">
        <MailCheck size={26} className="text-main" />
      </div>
      <h1 className="text-[28px] leading-[1.1] font-bold text-foreground mb-3">
        Check your
        <br />
        school email.
      </h1>
      <p className="text-[14px] text-foreground-muted mb-8">
        We sent a 6-digit code to <span className="text-foreground">{user.email}</span>. It expires in 10 minutes.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!verifying) void handleVerify();
        }}
      >
        <label htmlFor="code" className="sr-only">
          Verification code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full text-center text-[28px] font-bold tracking-[0.5em] bg-surface-muted rounded-[12px] px-4 py-4 outline-none focus:bg-card focus:ring-2 focus:ring-main/30"
        />

        {error && (
          <p role="alert" className="text-[13px] font-medium text-red-500 mt-3">
            {error}
          </p>
        )}
        {notice && !error && <p className="text-[13px] font-medium text-green-600 mt-3">{notice}</p>}

        <div className="mt-6">
          <Button type="submit" loading={verifying} disabled={verifying || code.length !== 6} outerRing>
            Verify email
          </Button>
        </div>
      </form>

      <p className="text-foreground-muted text-[13px] text-center mt-6">
        Didn&apos;t get it?{" "}
        {expired ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="text-main font-medium hover:underline disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        ) : (
          <span>Resend in {display}</span>
        )}
      </p>
    </div>
  );
}
