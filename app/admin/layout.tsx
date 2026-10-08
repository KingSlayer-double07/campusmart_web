import RoleGate from "@/app/components/RoleGate";

// The full desktop admin console (sidebar, max-w-6xl) arrives in Phase 9 (D16)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["ADMIN"]}>{children}</RoleGate>;
}
