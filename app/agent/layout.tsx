import RoleGate from "@/app/components/RoleGate";

// Pickup-agent screens (receive and hand over parcels) arrive in Phase 6 (D16)
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate allow={["PICKUP_AGENT"]}>{children}</RoleGate>;
}
