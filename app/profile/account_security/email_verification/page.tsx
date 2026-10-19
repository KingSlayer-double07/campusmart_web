"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Mail, MailWarning } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import { useMe } from "@/lib/api/hooks/useMe";

export default function EmailVerificationPage() {
  const { data: user, isPending, isError, refetch } = useMe();
  const verified = !!user?.emailVerifiedAt;

  return (
    <>
      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Email Verification" showBack={true} />

        {isPending && !user && <div className="mt-8 h-24 rounded-2xl bg-surface-muted animate-pulse" aria-busy="true" />}

        {isError && !user && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-foreground-muted">We couldn&apos;t load your account.</p>
            <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-main">
              Try again
            </button>
          </div>
        )}

        {user && (
          <>
            <div className="flex flex-col items-center gap-2 mt-8 mb-8">
              <div
                className={`size-16 rounded-full flex items-center justify-center ${verified ? "bg-green-100" : "bg-orange-100"}`}
              >
                {verified ? (
                  <CheckCircle2 size={32} className="text-green-500" />
                ) : (
                  <MailWarning size={32} className="text-main" />
                )}
              </div>
              <p className="text-lg font-bold text-foreground">{verified ? "Email Verified" : "Email Not Verified"}</p>
              <p className="text-sm text-foreground-muted text-center">
                {verified
                  ? "Your school email has been verified"
                  : "Verify your school email to buy and sell on CampusMart"}
              </p>
            </div>

            <div className="flex flex-col gap-7">
              <div className="flex items-center gap-3 py-1">
                <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-main" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{user.email}</p>
                  {verified ? (
                    <p className="text-xs font-medium text-green-500">
                      ● Verified on{" "}
                      {new Date(user.emailVerifiedAt!).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-main">● Waiting for the 6-digit code</p>
                  )}
                </div>
              </div>

              {!verified && (
                <Link
                  href="/onboarding/verify-email"
                  className="w-full text-center bg-main text-white rounded-full py-3 font-semibold text-[15px]"
                >
                  Verify now
                </Link>
              )}

              <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-4">
                <AlertCircle size={18} className="text-main shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">Why verify your email?</p>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    Your school email proves you&apos;re part of the campus. It can&apos;t be changed, and we use it
                    for important updates about your orders and payments.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <Nav />
    </>
  );
}
