"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Phone, User } from "lucide-react";
import FormInput from "@/app/components/FormInput";
import PageHeader from "@/app/components/PageHeader";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import { useUpdateProfile } from "@/lib/api/hooks/useProfile";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const PHONE_RE = /^\+?\d[\d ()-]{6,19}$/;

// Guide 10: the email is the identity, so it isn't editable here
export default function EditProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const update = useUpdateProfile();
  const [form, setForm] = useState({ username: "", firstName: "", lastName: "", phone: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form | "form", string>>>({});

  // Fill the form once per signed-in user. The store's user object is replaced whenever the
  // session refreshes (/auth/me after load), and that must not wipe what's already been typed.
  const [filledFor, setFilledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!user || filledFor === user.id) return;
    setFilledFor(user.id);
    setForm({
      username: user.username ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
    });
  }, [user, filledFor]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined, form: undefined }));
  };

  const save = async () => {
    const username = form.username.trim().toLowerCase();
    const found = {
      username: username && !USERNAME_RE.test(username) ? "Use 3 to 20 lower-case letters, numbers or _" : undefined,
      phone: form.phone.trim() && !PHONE_RE.test(form.phone.trim()) ? "Enter a phone number such as +234 801 234 5678" : undefined,
    };
    setErrors(found);
    if (found.username || found.phone) return;
    try {
      await update.mutateAsync({
        username: username || null,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
      });
      toast.success("Profile saved");
      // Sellers reach this page from their own profile (guide 10: "Profile and seller profile edit forms")
      setTimeout(() => router.push(user?.role === "SELLER" ? "/sellers/profile" : "/profile"), 800);
    } catch (err) {
      if (err instanceof ApiError && err.code === "USERNAME_TAKEN") setErrors({ username: err.message });
      else setErrors({ form: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
    }
  };

  const fieldError = (key: keyof typeof errors) =>
    errors[key] && (
      <p role="alert" className="-mt-2 text-xs font-medium text-red-500">
        {errors[key]}
      </p>
    );

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-6 px-6 pb-28 pt-8">
        <PageHeader title="Edit Profile" />
        <p className="text-sm text-foreground-muted">
          Signed in as <strong className="text-foreground">{user?.email}</strong>. Your email can&apos;t be changed.
        </p>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormInput icon={User} placeholder="First name" value={form.firstName} onChange={set("firstName")} autoComplete="given-name" name="firstName" />
          <FormInput icon={User} placeholder="Last name" value={form.lastName} onChange={set("lastName")} autoComplete="family-name" name="lastName" />
          <FormInput icon={AtSign} placeholder="Username" value={form.username} onChange={set("username")} autoComplete="username" name="username" />
          {fieldError("username")}
          <FormInput icon={Phone} type="tel" placeholder="Phone" value={form.phone} onChange={set("phone")} autoComplete="tel" name="phone" />
          {fieldError("phone")}
          {fieldError("form")}
          <button
            type="submit"
            disabled={update.isPending}
            className="w-full rounded-full bg-main py-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save profile"}
          </button>
        </form>
      </main>
    </>
  );
}
