import { Bike, LayoutGrid, MapPin, MapPinned, Package, Scale, School, Settings, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Only screens that exist are listed, so no link leads to a missing page. Users, listings,
// reports and the audit log join as their phases land (guide 9.2.2).
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/institutions", label: "Institutions", icon: School },
  { href: "/admin/places", label: "Campus places", icon: MapPinned },
  // Kept for when pickup stations come back (decision DL9)
  { href: "/admin/stations", label: "Pickup stations", icon: MapPin },
  { href: "/admin/verifications", label: "Verifications", icon: ShieldCheck },
  { href: "/admin/deliveries", label: "Deliveries", icon: Package },
  { href: "/admin/disputes", label: "Disputes", icon: Scale },
  { href: "/admin/riders", label: "Riders", icon: Bike },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function isActiveNav(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
