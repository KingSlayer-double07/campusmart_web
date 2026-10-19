"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CornerUpLeft, KeyRound, Lock, Mail } from "lucide-react";
import Button from "@/app/components/Button";
import FormInput from "@/app/components/FormInput";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { firstError, loginSchema, resetPasswordSchema } from "@/lib/validations/auth";

type Step = "email" | "reset" | "done";

function ForgotPassword() {
  const router = useRouter();
  const roleType = useSearchParams().get("role") === "seller" ? "seller" : "buyer";
  const signInPath = `/onboarding/${roleType}s/sign-in`;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestCode = async () => {
    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Always 204, whether or not the account exists
      await authApi.forgotPassword(parsed.data);
      setEmail(parsed.data);
      setStep("reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    const parsed = resetPasswordSchema.safeParse({ code, newPassword, confirmPassword });
    if (!parsed.success) {
      setError(firstError(parsed));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword({ email, code: parsed.data.code, newPassword: parsed.data.newPassword });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col px-6 pt-14 pb-12 w-full flex-1">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0 mb-4"
      >
        <CornerUpLeft size={18} />
      </button>

      {step === "done" ? (
        <>
          <h1 className="text-[28px] leading-[1.1] font-bold text-foreground mb-3">Password updated.</h1>
          <p className="text-[14px] text-foreground-muted mb-8">
            Every device was signed out. Sign in again with your new password.
          </p>
          <Button href={signInPath} roleType={roleType} outerRing>
            Sign in
          </Button>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) void (step === "email" ? requestCode() : reset());
          }}
        >
          <h1 className="text-[28px] leading-[1.1] font-bold text-foreground mb-3">
            {step === "email" ? "Forgot your password?" : "Set a new password."}
          </h1>
          <p className="text-[14px] text-foreground-muted mb-6">
            {step === "email"
              ? "Enter your school email and we'll send you a 6-digit code."
              : `If ${email} has an account, we've sent it a 6-digit code. It expires in 10 minutes.`}
          </p>

          <div className="flex flex-col gap-4 mb-4">
            {step === "email" ? (
              <FormInput
                icon={Mail}
                type="email"
                placeholder="School email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                name="email"
              />
            ) : (
              <>
                <FormInput
                  icon={KeyRound}
                  type="text"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  name="code"
                />
                <FormInput
                  icon={Lock}
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  name="newPassword"
                />
                <FormInput
                  icon={Lock}
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  name="confirmPassword"
                />
              </>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[13px] font-medium text-red-500 mb-4">
              {error}
            </p>
          )}

          <div className="mt-2 mb-6">
            <Button type="submit" loading={loading} disabled={loading} roleType={roleType} outerRing>
              {step === "email" ? "Send code" : "Update password"}
            </Button>
          </div>

          {step === "reset" && (
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="w-full text-[13px] text-foreground-muted hover:underline"
            >
              Didn&apos;t get a code? Send another
            </button>
          )}
        </form>
      )}

      <p className="text-foreground-muted text-[12.5px] text-center tracking-tight mt-6">
        Remembered it?{" "}
        <Link href={signInPath} className="text-main hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPassword />
    </Suspense>
  );
}
