export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex justify-center md:items-center w-full min-h-dvh bg-card md:bg-surface-muted text-foreground font-satoshi font-medium tracking-tighter md:py-12">
      <main className="flex flex-col max-w-md w-full justify-start bg-card md:shadow-xl md:rounded-[32px] md:border md:border-border-default h-dvh md:h-auto md:max-h-full overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
