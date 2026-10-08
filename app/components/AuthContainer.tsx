"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CornerUpLeft } from "lucide-react";
import Button from "./Button";
import TermsOverlay from "./TermsOverlay";
import PrivacyPolicyOverlay from "./PrivacyPolicyOverlay";

interface AuthContainerProps {
  roleType: "buyer" | "seller";
  type: "login" | "register";
  title: React.ReactNode;
  children: React.ReactNode;
  onSubmit: () => void;
  loading?: boolean;
  /** Shown under the form, e.g. the ApiError message */
  error?: string | null;
}

export default function AuthContainer({
  roleType,
  type,
  title,
  children,
  onSubmit,
  loading = false,
  error,
}: AuthContainerProps) {
  const router = useRouter();
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  const mainTextColor = roleType === "buyer" ? "text-main" : "text-seller-main";

  return (
    <div className="flex flex-col md:px-8 pt-8 pb-12 w-full flex-1">
      <section className="flex flex-col px-6 mt-6 w-full">
        <button
          onClick={() => router.back()}
          className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0 mb-4"
        >
          <CornerUpLeft size={18} />
        </button>
        
        <h1 className="text-[28px] leading-[1.1] font-bold text-foreground mb-6">
          {title}
        </h1>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) onSubmit();
          }}
        >
          <div className="flex flex-col gap-4 mb-4">
            {children}
          </div>

          {error && (
            <p role="alert" className="text-[13px] font-medium text-red-500 mb-4">
              {error}
            </p>
          )}

          <div className="mb-8 mt-2">
            <Button
              type="submit"
              loading={loading}
              disabled={loading}
              outerRing
              roleType={roleType}
            >
              {type === "login" ? "Sign in" : "Create an Account"}
            </Button>
          </div>
        </form>

        {type === "register" ? (
          <p className="text-foreground-muted text-[12.5px] text-center mb-6 tracking-tight">
            By clicking &ldquo;Create an Account&rdquo; you agree with
            <br />
            CampusMart{" "}
            <button
              type="button"
              onClick={() => setIsTermsOpen(true)}
              className={`${mainTextColor} hover:underline font-medium`}
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              type="button"
              onClick={() => setIsPrivacyOpen(true)}
              className={`${mainTextColor} hover:underline font-medium`}
            >
              Privacy Policy
            </button>
          </p>
        ) : (
          <p className="text-foreground-muted text-[12.5px] text-center mb-6 tracking-tight">
            Forgotten your password?{" "}
            <Link href={`/onboarding/forgot-password?role=${roleType}`} className={`${mainTextColor} hover:underline`}>
              Recover it here
            </Link>
          </p>
        )}

        {/* "Continue with Google" returns with Google sign-in in Phase 10 */}

        <p className="text-foreground-muted text-[12.5px] text-center tracking-tight">
          {type === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <Link href={`/onboarding/${roleType}s/sign-up`} className={`${mainTextColor} hover:underline`}>
                Create one here
              </Link>
            </>
          ) : (
            <>
              {roleType === "buyer" ? "You have an account with us? Lovely!" : "Already have an account?"}{" "}
              <Link href={`/onboarding/${roleType}s/sign-in`} className={`${mainTextColor} hover:underline`}>
                Login here
              </Link>
            </>
          )}
        </p>
      </section>

      {type === "register" && (
        <>
          <TermsOverlay
            isOpen={isTermsOpen}
            onClose={() => setIsTermsOpen(false)}
            onAccept={() => setIsTermsOpen(false)}
          />
          <PrivacyPolicyOverlay
            isOpen={isPrivacyOpen}
            onClose={() => setIsPrivacyOpen(false)}
            onAccept={() => setIsPrivacyOpen(false)}
          />
        </>
      )}
    </div>
  );
}
