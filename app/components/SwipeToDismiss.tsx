"use client";

import React, { ReactNode } from "react";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { Trash2 } from "lucide-react";

interface SwipeToDismissProps {
  onDismiss: () => void;
  children: ReactNode;
  threshold?: number;
  direction?: "left" | "right" | "both";
  background?: ReactNode;
}

export default function SwipeToDismiss({
  onDismiss,
  children,
  threshold = -80,
  direction = "left",
  background,
}: SwipeToDismissProps) {
  const controls = useAnimation();

  const handleDragEnd = async (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    const shouldDismissLeft = direction !== "right" && (offset < threshold || velocity < -500);
    const shouldDismissRight = direction !== "left" && (offset > Math.abs(threshold) || velocity > 500);

    if (shouldDismissLeft) {
      await controls.start({ x: "-100%", opacity: 0, transition: { duration: 0.2 } });
      onDismiss();
    } else if (shouldDismissRight) {
      await controls.start({ x: "100%", opacity: 0, transition: { duration: 0.2 } });
      onDismiss();
    } else {
      // Snap back
      controls.start({ x: 0, opacity: 1, transition: { type: "spring", bounce: 0.4, duration: 0.4 } });
    }
  };

  const dragElastic = direction === "left" ? { left: 0.5, right: 0 } 
                    : direction === "right" ? { left: 0, right: 0.5 } 
                    : 0.5;

  return (
    <div className="relative w-full overflow-hidden">
      {/* Background layer (shows when swiping) */}
      <div className="absolute inset-0 flex items-center justify-end px-6 bg-error text-white rounded-xl">
        {background || <Trash2 size={24} />}
      </div>

      {/* Foreground swiping layer */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={dragElastic}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="relative z-10 w-full bg-card touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
