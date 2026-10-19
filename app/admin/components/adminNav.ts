import {
  Bike,
  Flag,
  LayoutGrid,
  MapPin,
  MapPinned,
  Package,
  PackageSearch,
  Scale,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Only screens that exist are listed, so no link leads to a missing page (guide 9.2.2)
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/listings", label: "Listings", icon: PackageSearch },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/institutions", label: "Institutions", icon: School },
  { href: "/admin/places", label: "Campus places", icon: MapPinned },
  // Kept for when pickup stations come back (decision DL9)
  { href: "/admin/stations", label: "Pickup stations", icon: MapPin },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/deliveries", label: "Deliveries", icon: Package },
  { href: "/admin/disputes", label: "Disputes", icon: Scale },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/riders", label: "Riders", icon: Bike },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function isActiveNav(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
