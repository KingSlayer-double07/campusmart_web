"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra classes on the sheet panel itself */
  className?: string;
}

/**
 * Reusable bottom-sheet that slides up from the bottom of the viewport.
 *
 * Animation strategy:
 *  - `shouldRender`  controls whether the DOM node exists at all.
 *  - `visible`       is the CSS-transition trigger; it is set one rAF tick
 *                    after the node mounts so the browser has a real
 *                    "from" state to animate from (opacity-0 / translate-y-full).
 *  - On close, `visible` flips to false first (starts the 300 ms exit anim),
 *    then `shouldRender` flips to false after 300 ms (removes the node).
 */
export default function BottomSheet({
  isOpen,
  onClose,
  children,
  className,
}: BottomSheetProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      document.body.style.overflow = "hidden";
      // Wait one paint so CSS has a "from" frame before we flip to visible
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      // Start exit animation, then unmount after it completes
      setVisible(false);
      const t = setTimeout(() => {
        setShouldRender(false);
        document.body.style.overflow = "unset";
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* ── Dimmed backdrop ── */}
      <div
        className={cn(
          "absolute inset-0 bg-black transition-opacity duration-300 ease-in-out",
          visible ? "opacity-50" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Sheet panel ── */}
      <div
        className={cn(
          "relative w-full max-w-md bg-card rounded-t-[28px] shadow-2xl",
          "transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "translate-y-full",
          className
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-neutral-300 rounded-full" />
        </div>

        {children}
      </div>
    </div>
  );
}
