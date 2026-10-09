import RoleGate from "@/app/components/RoleGate";
import AdminShell from "./components/AdminShell";

// The admin console (D16): full width, its own navigation, admins only. The API enforces the role.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate allow={["ADMIN"]}>
      <AdminShell>{children}</AdminShell>
    </RoleGate>
  );
}
