import { ShieldCheck } from "lucide-react";

// Decision R2: a trust score of 80 or more shows as "Trusted seller"; the number never shows
export default function TrustedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-green-50 font-semibold text-green-700 ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <ShieldCheck size={size === "md" ? 14 : 12} aria-hidden />
      Trusted seller
    </span>
  );
}
