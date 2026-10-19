// Page title, a one-line explanation and the page's main action. Stacks on phones.
export default function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-foreground-muted">{description}</p>
      </div>
      {action && <div className="shrink-0 sm:w-auto">{action}</div>}
    </div>
  );
}
