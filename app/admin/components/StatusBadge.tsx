import { cn } from "@/lib/utils/cn";

export default function StatusBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        active ? "bg-green-100 text-green-700" : "bg-surface-muted text-foreground-muted",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-green-500" : "bg-neutral-400")} />
      {active ? "Active" : "Switched off"}
    </span>
  );
}
