"use client";

import { useState, useMemo } from "react";
import { LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import FormInput from "../../../components/FormInput";
import Button from "../../../components/Button";
import { useToast, ToastContainer } from "../../../components/Toast";

import { passwordRequirements as requirements } from "../../../lib/data";
import { ApiError } from "@/lib/api/client";
import { useChangePassword } from "@/lib/api/hooks/useSessions";

function strengthLabel(passed: number): { label: string; color: string } {
  if (passed === 0) return { label: "", color: "" };
  if (passed === 1) return { label: "Weak password", color: "text-red-500" };
  if (passed === 2) return { label: "Use a Stronger Password", color: "text-main" };
  return { label: "Strong password ✓", color: "text-green-500" };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changePassword = useChangePassword();
  const loading = changePassword.isPending;

  const passed = useMemo(
    () => requirements.filter((r) => r.test(next)).length,
    [next]
  );

  const { label: strengthText, color: strengthColor } = strengthLabel(
    next ? passed : 0
  );

  /* highlight new-password field border red when strength < 3 and has value */
  const newFieldError = next.length > 0 && passed < requirements.length;

  const handleSubmit = async () => {
    if (passed < requirements.length || next !== confirm || !current) return;
    setError(null);
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success("Password Updated!", "Your other devices have been signed out");
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => router.back(), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update your password. Please try again.");
    }
  };

  const canSubmit =
    current.length > 0 && passed === requirements.length && next === confirm && !loading;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={3500} />

      <main className="pb-36 pt-8 px-6">
        <PageHeader title="Change Password" showBack={true} />

        {/* Hero */}
        <div className="flex flex-col items-center gap-3 mt-8 mb-8">
          <div className="size-16 rounded-full bg-orange-100 flex items-center justify-center">
            <LockKeyhole size={30} className="text-main" />
          </div>
          <p className="text-lg font-semibold text-foreground text-center">
            Create a Strong Unique Password
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {/* Current Password */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground-muted font-medium">
              Current Password
            </label>
            <FormInput
              icon={LockKeyhole}
              type="password"
              placeholder="Password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              id="current-password"
              name="current-password"
              autoComplete="current-password"
            />
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-foreground-muted font-medium">
              New Password
            </label>
            <div
              className={`rounded-[12px] transition-all duration-200 ${
                newFieldError ? "ring-2 ring-red-400" : ""
              }`}
            >
              <FormInput
                icon={LockKeyhole}
                type="password"
                placeholder="New password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                id="new-password"
                name="new-password"
                autoComplete="new-password"
              />
            </div>
            {strengthText && (
              <p className={`text-xs font-medium mt-1 ${strengthColor}`}>
                {strengthText}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground-muted font-medium">
              Confirm New Password
            </label>
            <FormInput
              icon={LockKeyhole}
              type="password"
              placeholder="Re-enter new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              id="confirm-password"
              name="confirm-password"
              autoComplete="new-password"
            />
            {confirm.length > 0 && next !== confirm && (
              <p className="text-xs font-medium text-red-500 mt-1">
                Passwords do not match
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-500">
              {error}
            </p>
          )}

          {/* Password Requirements card */}
          <div className="rounded-xl border border-border-default bg-surface-muted p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              Password Requirements
            </p>
            <ul className="flex flex-col gap-1.5">
              {requirements.map((req) => {
                const ok = req.test(next);
                return (
                  <li key={req.label} className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold ${
                        ok ? "text-green-500" : "text-neutral-300"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`text-sm ${
                        ok ? "text-foreground" : "text-foreground-muted"
                      }`}
                    >
                      {req.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-6 z-50">
        <div className="w-full max-w-md px-6">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full"
          >
            {loading ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </div>
    </>
  );
}
