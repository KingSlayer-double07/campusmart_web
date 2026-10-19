"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type UserRole = "buyer" | "seller";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  roleType?: UserRole;
  outerRing?: boolean;
  loading?: boolean;
  href?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", roleType = "buyer", outerRing = false, loading, children, href, disabled, ...props }, ref) => {
    
    // Core styles based on variant and role
    const variants = {
      primary: {
        buyer: "bg-main text-white hover:brightness-105",
        seller: "bg-seller-main text-white hover:brightness-105",
      },
      secondary: {
        buyer: "bg-card text-main border border-main hover:bg-surface-muted",
        seller: "bg-card text-seller-main border border-seller-main hover:bg-surface-muted",
      },
      outline: {
        buyer: "bg-card text-foreground border border-border-default hover:bg-surface-muted",
        seller: "bg-card text-foreground border border-border-default hover:bg-surface-muted",
      },
      ghost: {
        buyer: "bg-transparent text-foreground-muted hover:bg-surface-muted",
        seller: "bg-transparent text-foreground-muted hover:bg-surface-muted",
      },
      danger: {
        buyer: "bg-red-500 text-white hover:bg-red-600",
        seller: "bg-red-500 text-white hover:bg-red-600",
      }
    };

    const sizes = {
      sm: "py-2 px-4 text-[13px]",
      md: "py-2.5 px-6 text-[15px]",
      lg: "py-3.5 px-8 text-[17px]",
    };

    const baseStyles = "flex items-center justify-center rounded-full font-medium transition-all duration-150 active:scale-95 active:opacity-80 disabled:opacity-40 disabled:pointer-events-none w-full";
    const variantStyles = variants[variant][roleType];
    const sizeStyles = sizes[size];

    const innerContent = (
      <>
        {loading && (
          <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </>
    );

    const buttonElement = (
      <button
        ref={ref}
        className={cn(!outerRing && baseStyles, !outerRing && variantStyles, !outerRing && sizeStyles, className, outerRing && "w-full")}
        disabled={disabled || loading}
        {...props}
      >
        {!outerRing ? innerContent : (
          <div className={cn("p-2 border border-border-default rounded-full w-full", className)}>
            <div className={cn(baseStyles, variantStyles, sizeStyles)}>
              {innerContent}
            </div>
          </div>
        )}
      </button>
    );

    if (href) {
      return (
        <Link href={href} className="w-full block">
          {buttonElement}
        </Link>
      );
    }

    return buttonElement;
  }
);

Button.displayName = "Button";

export default Button;
