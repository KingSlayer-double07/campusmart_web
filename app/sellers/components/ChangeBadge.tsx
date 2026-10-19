import { TrendingDown, TrendingUp } from "lucide-react";

// Change against the days before; null means there was nothing to compare with (guide 7.1)
export default function ChangeBadge({ pct, tone = "light" }: { pct: number | null; tone?: "light" | "dark" }) {
  const muted = tone === "dark" ? "text-white/50" : "text-foreground-muted";
  if (pct === null) return <span className={`text-xs font-medium ${muted}`}>New</span>;
  if (pct === 0) return <span className={`text-xs font-semibold ${muted}`}>0%</span>;
  const up = pct > 0;
  const colour = up ? (tone === "dark" ? "text-green-400" : "text-green-600") : tone === "dark" ? "text-red-400" : "text-red-500";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${colour}`} aria-label={`${up ? "Up" : "Down"} ${Math.abs(pct)}%`}>
      <Icon size={11} aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}
