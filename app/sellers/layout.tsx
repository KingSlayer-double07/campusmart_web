import RoleGate from "@/app/components/RoleGate";
import SellersNav from "./components/sellersNav";

export default function SellersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex justify-center max-w-dvw min-h-dvh bg-surface-muted text-foreground font-dmSans tracking-tight">
      <RoleGate allow={["SELLER"]}>
        {children}
        <SellersNav />
      </RoleGate>
    </div>
  );
}
