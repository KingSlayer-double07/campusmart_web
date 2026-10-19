import { AlertCircle } from "lucide-react";
import { ReactNode } from "react";

interface InfoBannerProps {
  title?: string;
  text: ReactNode;
  variant?: "warning" | "error";
  className?: string;
}

export default function InfoBanner({
  title,
  text,
  variant = "warning",
  className = "",
}: InfoBannerProps) {
  const isWarning = variant === "warning";
  const bgClass = isWarning ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200";
  const iconColor = isWarning ? "text-main border-main" : "text-red-500 border-red-500";

  return (
    <div className={`flex items-start gap-3 border rounded-2xl px-4 py-4 ${bgClass} ${className}`}>
      {title ? (
        // Style 1: Big icon with title
        <>
          <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
            <span className={`text-[10px] font-bold ${isWarning ? "text-main" : "text-red-500"}`}>!</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-foreground mb-0.5">{title}</p>
            <p className="text-sm text-foreground-muted leading-relaxed">{text}</p>
          </div>
        </>
      ) : (
        // Style 2: Small icon inline with text
        <>
          <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${iconColor}`}>
            <span className={`text-[10px] font-bold ${isWarning ? "text-main" : "text-red-500"}`}>!</span>
          </div>
          <p className="text-xs text-foreground-muted leading-relaxed">{text}</p>
        </>
      )}
    </div>
  );
}
