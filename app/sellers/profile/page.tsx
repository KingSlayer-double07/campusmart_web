"use client";

import { useState, useEffect } from "react";

import {
  LogOut,
  Settings,
  Landmark,
  Package,
  Grid,
  Shield,
  Bell,
  HelpCircle,
  ChevronRight,
  Edit2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { useCartStore } from "@/app/store/useCartStore";
import { useSellerStore } from "@/app/store/useSellerStore";

import { useAuthStore } from "@/app/store/useAuthStore";
import { useLogout } from "@/lib/api/hooks/useLogout";

export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  const logout = useLogout();
  const authUser = useAuthStore((s) => s.user);
  const { cart } = useCartStore();
  const { isOnline } = useSellerStore();
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/onboarding/role-select");
  };

  // Mock user data
  const user = {
    name: authUser?.firstName || authUser?.email?.split('@')[0] || "Seller",
    email: authUser?.email || "seller@example.com",
    phone: "+234 701 234 5678",
    verified: isOnline,
    joinedDate: "January 2024",
  };

  const menuItems = [
    {
      icon: Package,
      label: "Pending Orders",
      description: "Track and manage your sales",
      href: "/sellers/orders",
      badge: null,
    },
    {
      icon: Landmark,
      label: "Earnings",
      description: "View your sales and payouts",
      href: "/sellers/earnings",
      badge: cart.length > 0 ? `${cart.length}` : null,
    },
    {
      icon: Grid,
      label: "Inventory",
      description: "Manage your product inventory",
      href: "/sellers/products",
      badge: "2",
    },
    {
      icon: Shield,
      label: "Account Security",
      description: "Manage passwords and verification",
      href: "#",
      badge: null,
    }
  ];

  const settingsItems = [
    {
      icon: Bell,
      label: "Notifications",
      description: "Manage notification preferences",
      href: "#",
    },
    {
      icon: Settings,
      label: "Settings",
      description: "General app settings",
      href: "#",
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      description: "FAQs and contact support",
      href: "#",
    },
  ];

  return (
    <main className="flex flex-col gap-6 max-w-md w-full pb-28 px-6 pt-12">
        <PageHeader title="Profile" showBack={false} />

        {/* User Profile Card */}
        <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-lg font-semibold text-foreground">
                  {user.name}
                </h2>
                {user.verified && (
                  <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground mb-1">{user.email}</p>
              <p className="text-sm text-foreground-muted">{user.phone}</p>
              <p className="text-xs text-foreground-muted mt-2">
                Member since {user.joinedDate}
              </p>
            </div>
            <button className="p-2 bg-card rounded-full border border-blue-200 hover:bg-blue-50 transition">
              <Edit2 size={18} className="text-blue-600" />
            </button>
          </div>
        </div>

        {/* Quick Access Menu */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Quick Access</p>
          <div className="flex flex-col gap-2">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-border-default hover:bg-surface-muted transition">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <IconComponent size={18} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-foreground-muted truncate">
                        {item.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="bg-main text-white text-xs font-semibold px-2 py-1 rounded-full">
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight size={18} className="text-foreground-muted" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-neutral-200" />

        {/* Settings Menu */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Settings</p>
          <div className="flex flex-col gap-2">
            {settingsItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <Link key={item.label} href={item.href}>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:border-border-default hover:bg-surface-muted transition">
                    <div className="p-2 bg-surface-muted-100 rounded-lg">
                      <IconComponent size={18} className="text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-foreground-muted truncate">
                        {item.description}
                      </p>
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
          <button onClick={handleLogout} className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition">
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

        {/* Footer Info */}
        <div className="pt-4 border-t border-border-default">
          <p className="text-xs text-foreground-muted text-center">
            Campusmart v1.0.0 â€¢ {new Date().getFullYear()}
          </p>
        </div>
    </main>
  );
}

