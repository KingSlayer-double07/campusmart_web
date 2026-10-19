"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerIcon?: React.ReactNode;
  className?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  headerIcon,
  className,
}: ModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      
      // Store original to properly reset if it was previously set
      const originalStyle = window.getComputedStyle(document.body).overflow;  
      document.body.style.overflow = "hidden";
      
      return () => {
        // If no overflow was set inline originally, just remove it
        document.body.style.overflow = "";
      };
    } else {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender || !mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-300",
        isOpen ? "visible" : "invisible"
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Modal Content / Bottom Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-md bg-card rounded-t-[32px] sm:rounded-[32px] h-auto max-h-[90dvh] mt-auto overflow-hidden flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isOpen ? "translate-y-0" : "translate-y-full",
          className
        )}
      >
        {/* Mobile Handle */}
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-neutral-200 rounded-full cursor-pointer" onClick={onClose} />
        </div>

        {/* Header */}
        {(title || headerIcon) && (
          <div className="flex items-center justify-between px-6 pt-2 pb-2">
            <div className="size-10 flex items-center justify-center">
              {headerIcon}
            </div>
            {title && <h2 className="text-[20px] font-bold text-foreground">{title}</h2>}
            <button
              onClick={onClose}
              className="size-10 flex items-center justify-center rounded-full bg-surface-muted text-foreground-muted hover:bg-neutral-200 transition-colors active:scale-90"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Body */}
        <main className={cn("flex-1 overflow-y-auto px-6 scroll-smooth no-scrollbar", footer ? "py-4" : "pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]")}>
          {children}
        </main>

        {/* Footer */}
        {footer && (
          <div className="px-6 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-card border-t border-border-default">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
