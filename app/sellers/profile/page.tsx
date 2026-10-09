"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  Camera,
  ChevronRight,
  Edit2,
  Grid,
  HelpCircle,
  Landmark,
  LogOut,
  Package,
  Settings,
  Shield,
  Star,
} from "lucide-react";
import Modal from "@/app/components/Modal";
import PageHeader from "@/app/components/PageHeader";
import { ToastContainer, useToast } from "@/app/components/Toast";
import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import type { SellerProfile } from "@/lib/api/listings";
import { useLogout } from "@/lib/api/hooks/useLogout";
import { useSellerProfile, useUpdateSellerProfile } from "@/lib/api/hooks/useSellerProfile";
import { useCanPublish } from "@/lib/api/hooks/useSellerVerification";
import { uploadImages } from "@/lib/uploads";
import VerificationCard from "../components/VerificationCard";

const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main transition";

function StoreLogo({ profile, size = 56 }: { profile: SellerProfile; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-seller-main/10 flex items-center justify-center text-seller-main font-bold"
      style={{ width: size, height: size }}
    >
      {profile.logoUrl ? (
        <Image src={profile.logoUrl} alt="Store logo" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        (profile.storeName ?? "S").charAt(0).toUpperCase()
      )}
    </div>
  );
}

// Edit the store buyers see: name, bio, logo and the online switch (guide 3.2.8)
function EditStoreSheet({
  profile,
  isOpen,
  onClose,
  onSaved,
}: {
  profile: SellerProfile;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateSellerProfile();
  const fileInput = useRef<HTMLInputElement>(null);
  const [storeName, setStoreName] = useState("");
  const [bio, setBio] = useState("");
  const [logo, setLogo] = useState<{ file: File; preview: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStoreName(profile.storeName ?? "");
    setBio(profile.bio ?? "");
    setLogo(null);
    setError(null);
  }, [isOpen, profile]);

  useEffect(() => () => {
    if (logo) URL.revokeObjectURL(logo.preview);
  }, [logo]);

  const save = async () => {
    const name = storeName.trim();
    if (name.length < 2 || name.length > 60) {
      setError("The store name must be 2 to 60 characters");
      return;
    }
    setError(null);
    try {
      let logoUrl: string | undefined;
      if (logo) {
        setUploading(true);
        const [uploaded] = await uploadImages([logo.file], "AVATAR", () => undefined);
        logoUrl = uploaded.url;
      }
      await update.mutateAsync({ storeName: name, bio: bio.trim() || null, ...(logoUrl && { logoUrl }) });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "UPLOADS_NOT_CONFIGURED"
          ? "Logo uploads aren't set up yet. Save without a new logo for now."
          : err instanceof Error
            ? err.message
            : "Couldn't save. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || update.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title="Edit store"
      footer={
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm disabled:opacity-50"
        >
          {uploading ? "Uploading logo…" : update.isPending ? "Saving…" : "Save"}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="relative size-16 overflow-hidden rounded-full bg-seller-main/10">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.preview} alt="New logo" className="size-full object-cover" />
            ) : profile.logoUrl ? (
              <Image src={profile.logoUrl} alt="Store logo" fill sizes="64px" className="object-cover" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 rounded-full border border-border-default px-4 py-2 text-sm font-semibold"
          >
            <Camera size={16} />
            {profile.logoUrl || logo ? "Change logo" : "Add a logo"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Choose a logo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setLogo({ file, preview: URL.createObjectURL(file) });
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="store-name" className="text-sm font-semibold text-foreground">
            Store name
          </label>
          <input
            id="store-name"
            value={storeName}
            maxLength={60}
            placeholder="e.g. TrendHUB NG"
            onChange={(e) => setStoreName(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-foreground-muted">Buyers see this on your listings instead of your name.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="store-bio" className="text-sm font-semibold text-foreground">
            About your store
          </label>
          <textarea
            id="store-bio"
            value={bio}
            maxLength={500}
            rows={3}
            placeholder="What you sell, when you usually drop off"
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function ProfilePage() {
  const logout = useLogout();
  const router = useRouter();
  const toast = useToast();
  const authUser = useAuthStore((s) => s.user);
  const { data: profile, isPending, isError, refetch } = useSellerProfile();
  const update = useUpdateSellerProfile();
  const [editing, setEditing] = useState(false);
  const verified = useCanPublish();

  const handleLogout = async () => {
    await logout();
    router.push("/onboarding/role-select");
  };

  const toggleOnline = () => {
    if (!profile) return;
    update.mutate(
      { isOnline: !profile.isOnline },
      { onError: () => toast.error("Couldn't change your status", "Please try again") },
    );
  };

  const menuItems = [
    { icon: Package, label: "Orders", description: "Track and manage your sales", href: "/sellers/orders" },
    { icon: Landmark, label: "Earnings", description: "View your sales and payouts", href: "/sellers/earnings" },
    { icon: Grid, label: "Inventory", description: "Manage your products", href: "/sellers/products" },
    { icon: Shield, label: "Account Security", description: "Password and active sessions", href: "/profile/account_security" },
  ];

  const settingsItems = [
    { icon: Bell, label: "Notifications", description: "Manage notification preferences", href: "/sellers/notifications" },
    { icon: Settings, label: "Settings", description: "General app settings", href: "/profile/settings" },
    { icon: HelpCircle, label: "Help & Support", description: "FAQs and contact support", href: "/profile/help" },
  ];

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main className="flex flex-col gap-6 max-w-md w-full pb-28 px-6 pt-12">
        <PageHeader title="Profile" showBack={false} />

        {/* Store card */}
        {isPending ? (
          <div className="h-40 rounded-lg bg-card animate-pulse" aria-busy="true" aria-label="Loading your store" />
        ) : isError || !profile ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border-default bg-card p-6 text-center">
            <p className="text-sm text-foreground-muted">We couldn&apos;t load your store.</p>
            <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-seller-main">
              Try again
            </button>
          </div>
        ) : (
          <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <StoreLogo profile={profile} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold text-foreground truncate">{profile.storeName ?? "Name your store"}</h2>
                  {verified && (
                    <BadgeCheck size={18} className="text-seller-main shrink-0" aria-label="Verified seller" />
                  )}
                </div>
                <p className="text-sm text-foreground-muted truncate">{authUser?.email}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-foreground-muted">
                  <Star size={12} className="fill-yellow-400 text-yellow-400" />
                  {profile.ratingCount > 0 ? `${profile.ratingAvg.toFixed(1)} from ${profile.ratingCount} reviews` : "No reviews yet"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Edit store"
                onClick={() => setEditing(true)}
                className="p-2 bg-card rounded-full border border-blue-200 hover:bg-blue-50 transition"
              >
                <Edit2 size={18} className="text-blue-600" />
              </button>
            </div>
            {profile.bio && <p className="text-sm text-foreground">{profile.bio}</p>}

            <div className="flex items-center justify-between rounded-xl bg-card/70 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{profile.isOnline ? "You're online" : "You're offline"}</p>
                <p className="text-xs text-foreground-muted">Buyers see when you&apos;re around to drop off</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profile.isOnline}
                aria-label="Online"
                onClick={toggleOnline}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ${
                  profile.isOnline ? "bg-seller-main" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`inline-block size-5 transform rounded-full bg-card shadow-md transition-transform duration-300 ${
                    profile.isOnline ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Get verified (hidden once an admin has approved the seller) */}
        <VerificationCard />

        {/* Quick Access Menu */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Quick Access</p>
          <div className="flex flex-col gap-2">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-surface-muted transition">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <IconComponent size={18} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-foreground-muted truncate">{item.description}</p>
                    </div>
                    <ChevronRight size={18} className="text-foreground-muted" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-neutral-200" />

        {/* Settings Menu */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Settings</p>
          <div className="flex flex-col gap-2">
            {settingsItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-surface-muted transition">
                    <div className="p-2 bg-surface-muted rounded-lg">
                      <IconComponent size={18} className="text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-foreground-muted truncate">{item.description}</p>
                    </div>
                    <ChevronRight size={18} className="text-foreground-muted" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition"
          >
            <div className="p-2 bg-red-100 rounded-lg">
              <LogOut size={18} className="text-red-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-red-700">Logout</p>
              <p className="text-xs text-red-600">Sign out of your account</p>
            </div>
            <ChevronRight size={18} className="text-red-400" />
          </button>
        </div>

        <div className="pt-4 border-t border-border-default">
          <p className="text-xs text-foreground-muted text-center">Campusmart v1.0.0 • {new Date().getFullYear()}</p>
        </div>
      </main>

      {profile && (
        <EditStoreSheet
          profile={profile}
          isOpen={editing}
          onClose={() => setEditing(false)}
          onSaved={() => toast.success("Store saved", "Buyers see the changes straight away")}
        />
      )}
    </>
  );
}
