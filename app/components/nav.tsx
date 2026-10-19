"use client";
import BottomFloatingBar from './BottomFloatingBar';
import { Heart, Home, ShoppingCart, TextSearch, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);
  const baseIcon = "p-2 rounded-full border border-border-default transition-all";
  const activeIcon = "bg-main text-white py-2 px-4";
  const inactiveIcon = "bg-card text-foreground hover:bg-surface-muted";

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/categories", icon: TextSearch, label: "Categories" },
    { href: "/favourites", icon: Heart, label: "Favourites" },
    { href: "/cart", icon: ShoppingCart, label: "Cart" },
    { href: "/profile", icon: UserRound, label: "Account" },
  ];

  return (
    <BottomFloatingBar zIndex={70} className="text-sm">
      <div className="backdrop-blur-sm flex gap-4 items-center py-2 px-2 rounded-full border border-border-default">
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
    </BottomFloatingBar>
  );
}
