import { LayoutGrid, MapPin, School, type LucideIcon } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Only screens that exist are listed, so no link leads to a missing page. Users, verifications,
// listings, disputes, payouts, reports and the audit log join as their phases land (guide 9.2.2).
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/institutions", label: "Institutions", icon: School },
  { href: "/admin/stations", label: "Pickup stations", icon: MapPin },
];

export function isActiveNav(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
