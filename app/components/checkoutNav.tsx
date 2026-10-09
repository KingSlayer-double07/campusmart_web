"use client";
import BottomFloatingBar, { BottomFloatingBarContainer } from './BottomFloatingBar';
import { useRouter } from "next/navigation";
import { formatNaira } from "@/lib/labels";

// The cart's bottom bar: the total and the way to checkout
export default function CheckoutNav({
  text,
  link,
  totalKobo,
  itemCount,
  disabled = false,
  hint,
}: {
  text: string;
  link: string;
  totalKobo: number;
  itemCount: number;
  disabled?: boolean;
  /** Why the button is off, e.g. "Fix the items marked above first" */
  hint?: string;
}) {
  const router = useRouter();
  return (
    <BottomFloatingBar zIndex={50}>
      <BottomFloatingBarContainer className="gap-2">
        <div className="w-full flex flex-col items-center">
          <p className="text-main font-semibold text-lg">{formatNaira(totalKobo)}</p>
          {hint && <p className="text-[11px] leading-tight text-foreground-muted text-center">{hint}</p>}
        </div>
        <button
          type="button"
          className="w-full h-10 rounded-full border bg-main border-border-default disabled:opacity-40 transition-all duration-300"
          onClick={() => router.push("/" + link)}
          disabled={disabled || itemCount <= 0}
        >
          <p className="font-medium text-sm text-white">
            {text} ({itemCount})
          </p>
        </button>
      </BottomFloatingBarContainer>
    </BottomFloatingBar>
  );
}
