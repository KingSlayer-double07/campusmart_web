"use client";
import { ChevronLeft, CornerUpLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

interface PageHeaderProps {
  showBack?: boolean;
  rightItems?: React.ReactNode;
  title?: any;
}

export default function PageHeader({
  showBack = true,
  rightItems,
  title
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between">
      {showBack && (
        <button
          onClick={() => router.back()}
          className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0"
        >
          {/* <ChevronLeft size={18} /> */}
          
          <CornerUpLeft size={18} />
        </button>
      )}
      <p className="tracking-tighter font-semibold text-lg">{title}</p>
      {rightItems ? <div className="shrink-0">{rightItems}</div> : <div className="size-8" />}
    </div>
  );
}
