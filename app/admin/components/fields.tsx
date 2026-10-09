"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// The input look used across the app's forms (see app/sellers/addProduct), in the buyer accent
export const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-main/30 focus:border-main transition disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-foreground-muted">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({ invalid, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(inputClass, invalid && "border-red-400 focus:border-red-400 focus:ring-red-200", className)}
      {...props}
    />
  );
}

export function TextArea({
  invalid,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(inputClass, "resize-none", invalid && "border-red-400", className)}
      {...props}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(inputClass, "appearance-none pr-10", invalid && "border-red-400", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted"
      />
    </div>
  );
}

// Same switch as the notification settings page
export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-main/40",
        checked ? "bg-main" : "bg-neutral-300",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 transform rounded-full bg-card shadow-md transition-transform duration-300",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
