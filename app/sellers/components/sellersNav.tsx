"use client";
import { ClipboardList, Home, Package, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SellersNav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;
  const baseIcon = "p-2 rounded-full border border-border-default transition-all";
  const activeIcon = "bg-seller-main text-white py-2 px-4";
  const inactiveIcon = "bg-card text-foreground";

  const navItems = [
    { href: "/sellers", icon: Home, label: "Dashboard" },
    { href: "/sellers/products", icon: Package, label: "Inventory" },
    { href: "/sellers/orders", icon: ClipboardList, label: "Orders" },
    { href: "/sellers/earnings", icon: Wallet, label: "Earnings" },
    { href: "/sellers/profile", icon: UserRound, label: "Profile" },
  ];

  return (
    <main className="fixed bottom-0 left-0 w-full flex justify-center pb-6 z-40 font-dmSans text-sm">
      <div className="backdrop-blur-sm flex gap-2 items-center py-2 px-2 rounded-full border border-border-default">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex gap-1 items-center rounded-full ${baseIcon} ${
                active ? activeIcon : inactiveIcon
              }`}
            >
              <Icon size={18} />
              {active && <p className="font-medium">{item.label}</p>}
            </Link>
          );
        })}
      </div>
    </main>
  );
}