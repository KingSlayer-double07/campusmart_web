import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-default bg-card px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-main-subtle">
        <Icon size={22} className="text-main" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
