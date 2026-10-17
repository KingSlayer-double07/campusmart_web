"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Loader2 } from "lucide-react";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import { inviteApi } from "@/lib/api/dispatch";
import { meKey } from "@/lib/api/hooks/useMe";
import { PASSWORD_MESSAGE, passwordSchema } from "@/lib/validations/auth";

const field =
  "w-full rounded-xl border border-border-default bg-surface-muted px-4 py-3 text-sm focus:border-main focus:outline-none focus:ring-2 focus:ring-main/30 aria-invalid:border-red-400";

// Decision DX1: a rider opens the link from their invite email and sets a password. That
// confirms their email and signs them in.
function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => inviteApi.info(token), enabled: !!token, retry: false });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordSchema.safeParse(password).success) return setError(PASSWORD_MESSAGE);
    if (password !== confirm) return setError("The two passwords don't match");
    setError(null);
    setSaving(true);
    try {
      const user = await inviteApi.accept(token, password);
      setUser(user);
      queryClient.setQueryData(meKey, user);
      router.replace("/dispatch");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  if (!token || info.isError) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-bold">This invite link doesn&apos;t work</h1>
        <p className="text-sm text-foreground-muted">It may have expired or already been used. Ask CampusMart to send you a new one.</p>
      </div>
    );
  }
  if (info.isPending) {
    return (
      <div className="flex justify-center py-10" aria-busy="true">
        <Loader2 className="animate-spin text-main" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">Welcome{info.data.firstName ? `, ${info.data.firstName}` : ""}</h1>
        <p className="text-sm text-foreground-muted">
          You&apos;ve been invited to deliver CampusMart orders at {info.data.institutionName}. Set a password for {info.data.email}.
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Password
        <input type="password" autoComplete="new-password" className={field} value={password} aria-invalid={!!error} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Password again
        <input type="password" autoComplete="new-password" className={field} value={confirm} aria-invalid={!!error} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <p className="text-xs text-foreground-muted">{PASSWORD_MESSAGE}.</p>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className="w-full rounded-full bg-main py-3.5 text-sm font-bold text-white disabled:opacity-50">
        {saving ? "Setting up…" : "Set password and start"}
      </button>
    </form>
  );
}

export default function RiderInvitePage() {
  return (
    <main className="flex min-h-dvh justify-center bg-surface-muted px-6 pt-16 font-dmSans tracking-tight text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <p className="flex items-center gap-2 font-bold">
          <Bike size={20} className="text-main" /> CampusMart Rider
        </p>
        <div className="rounded-2xl bg-card p-6">
          <Suspense fallback={null}>
            <AcceptInvite />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
