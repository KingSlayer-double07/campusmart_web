"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import Nav from "../../../components/nav";
import PageHeader from "../../../components/PageHeader";
import { ToastContainer, useToast } from "../../../components/Toast";
import { ApiError } from "@/lib/api/client";
import { useSendSupportReport, useSupportContacts } from "@/lib/api/hooks/useSupport";

const MAX_CHARS = 1500;

// Decision T4: the address comes from SUPPORT_EMAIL ("coming soon" until it's set). The form here
// always works: it goes to the admins' queue like any report.
export default function EmailSupportPage() {
  const router = useRouter();
  const toast = useToast();
  const contacts = useSupportContacts();
  const send = useSendSupportReport();
  const [subject, setSubject] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!subject.trim() || message.trim().length < 10) {
      setError("Add a subject and a message of at least 10 characters");
      return;
    }
    setError(null);
    const code = orderCode.trim().toUpperCase();
    try {
      await send.mutateAsync({
        type: code ? "ORDER" : "OTHER",
        message: [subject.trim(), code && `Order: ${code}`, message.trim()].filter(Boolean).join("\n\n"),
      });
      toast.success("Message sent", "Our team will get back to you");
      setTimeout(() => router.back(), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  };

  const email = contacts.data?.email;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
        <PageHeader title="Email Support" showBack />

        <div className="flex items-center gap-3 rounded-2xl border border-border-default p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-orange-100">
            <Mail size={18} className="text-main" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-foreground">Email us</p>
            {contacts.isPending ? (
              <span className="mt-1 block h-4 w-40 animate-pulse rounded bg-surface-muted" aria-label="Loading" />
            ) : email ? (
              <a href={`mailto:${email}`} className="font-medium text-main">
                {email}
              </a>
            ) : (
              <p className="text-foreground-muted">Coming soon. Send us a message below instead.</p>
            )}
          </div>
        </div>

        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm font-semibold text-foreground">Or message us here</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Subject
            <input
              value={subject}
              maxLength={120}
              onChange={(e) => setSubject(e.target.value)}
              className="rounded-2xl bg-surface-muted px-4 py-3.5 text-sm font-normal outline-none focus:ring-2 focus:ring-main/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Order code (optional)
            <input
              value={orderCode}
              maxLength={20}
              placeholder="CM-…"
              onChange={(e) => setOrderCode(e.target.value)}
              className="rounded-2xl bg-surface-muted px-4 py-3.5 text-sm font-normal uppercase outline-none focus:ring-2 focus:ring-main/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Message
            <textarea
              rows={6}
              maxLength={MAX_CHARS}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="resize-none rounded-2xl bg-surface-muted px-4 py-3.5 text-sm font-normal outline-none focus:ring-2 focus:ring-main/30"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-500">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={send.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-main py-4 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            <Send size={16} />
            {send.isPending ? "Sending…" : "Send message"}
          </button>
          <p className="text-center text-xs text-foreground-muted">
            Something broken?{" "}
            <Link href="/profile/help/report" className="font-semibold text-main">
              Report a problem
            </Link>
          </p>
        </form>
      </main>
      <Nav />
    </>
  );
}
