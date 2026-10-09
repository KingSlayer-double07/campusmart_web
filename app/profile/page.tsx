"use client";

import { useState, useEffect } from "react";
import { LogOut, Edit2 } from "lucide-react";
import Nav from "../components/nav";
import PageHeader from "../components/PageHeader";
import ActionListItem from "../components/ActionListItem";
import { useCart } from "@/lib/api/hooks/useCart";
import { useAuthStore } from "../store/useAuthStore";
import { useLogout } from "@/lib/api/hooks/useLogout";
import { useRouter } from "next/navigation";
import { profileMenuGroups } from "../lib/data";

export default function ProfilePage() {
  const [mounted, setMounted] = useState(false);
  const cart = useCart();
  const logout = useLogout();
  const authUser = useAuthStore((s) => s.user);
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

  const fullName = [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ");
  const user = {
    name: fullName || authUser?.username || authUser?.email?.split("@")[0] || "",
    email: authUser?.email ?? "",
    phone: "",
    verified: !!authUser?.emailVerifiedAt,
    joinedDate: authUser
      ? new Date(authUser.createdAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" })
      : "",
  };

  return (
    <>
      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Profile" showBack={false} />

        <div className="flex flex-col gap-6">
          {/* User card */}
          <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6 flex flex-col gap-4 mt-6">
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

          {/* Menu groups */}
          <div className="flex flex-col gap-6 mt-2">
            {profileMenuGroups.map((group, groupIdx) => (
              <div key={group.title} className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
                  {group.title}
                </p>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => {
                    const badge = item.href === "/cart" && cart.lineCount > 0 ? (
                      <span className="bg-main text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                        {cart.lineCount}
                      </span>
                    ) : undefined;
                    
                    return (
                      <ActionListItem
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        href={item.href}
                        badge={badge}
                      />
                    );
                  })}
                </div>
                {groupIdx < profileMenuGroups.length - 1 && <div className="h-px bg-neutral-200 mt-3" />}
              </div>
            ))}

            {/* Danger Zone */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
                Danger Zone
              </p>
              <ActionListItem
                icon={LogOut}
                label="Logout"
                description="Sign out of your account"
                onClick={handleLogout}
                iconBg="bg-red-50"
                iconColor="text-red-500"
                className="hover:bg-red-50"
              />
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border-default">
              <p className="text-xs text-foreground-muted text-center">
                Campusmart v1.0.0 â€¢ {new Date().getFullYear()}
              </p>
            </div>
          </div>
        </div>
      </main>
      <Nav />
    </>
  );
}

