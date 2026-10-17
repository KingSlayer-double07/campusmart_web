"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/payments";
import { useUpdateSettings } from "@/lib/api/hooks/useAdminPayments";
import { Field, TextInput } from "../components/fields";

// The API's limits (backend/src/settings/settings.service.ts)
const MAX_FEE_PERCENT = 50;
const DAYS = { min: 1, max: 14 };
const LOW_STOCK = { min: 0, max: 100 };

const wholeNumber = (input: string) => (/^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN);

// "2.5" -> 250 basis points; null when it isn't a percentage the API accepts
export function percentToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps <= MAX_FEE_PERCENT * 100 ? bps : null;
}

export const bpsToPercent = (bps: number) => String(bps / 100);

interface Errors {
  fee?: string | null;
  days?: string | null;
  lowStock?: string | null;
  form?: string | null;
}

// Decisions P1, DL7b and A1: the platform's cut of each seller order (0 to start), how long a
// seller has to hand a paid order to a rider, and when sellers hear an item is running low.
export default function PlatformSettingsForm({ settings, onSaved }: { settings: PlatformSettings; onSaved: (saved: PlatformSettings) => void }) {
  const update = useUpdateSettings();
  const [fee, setFee] = useState("");
  const [days, setDays] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    setFee(bpsToPercent(settings.platformFeeBps));
    setDays(String(settings.pickupDeadlineDays));
    setLowStock(String(settings.lowStockThreshold));
  }, [settings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const platformFeeBps = percentToBps(fee);
    const pickupDeadlineDays = wholeNumber(days);
    const lowStockThreshold = wholeNumber(lowStock);
    const found: Errors = {
      fee: platformFeeBps === null ? `Enter a percentage from 0 to ${MAX_FEE_PERCENT}, such as 2.5` : null,
      days: pickupDeadlineDays >= DAYS.min && pickupDeadlineDays <= DAYS.max ? null : `Enter a whole number of days from ${DAYS.min} to ${DAYS.max}`,
      lowStock:
        lowStockThreshold >= LOW_STOCK.min && lowStockThreshold <= LOW_STOCK.max
          ? null
          : `Enter a whole number from ${LOW_STOCK.min} to ${LOW_STOCK.max}`,
    };
    setErrors(found);
    if (found.fee || found.days || found.lowStock || platformFeeBps === null) return;
    const body = {
      ...(platformFeeBps !== settings.platformFeeBps && { platformFeeBps }),
      ...(pickupDeadlineDays !== settings.pickupDeadlineDays && { pickupDeadlineDays }),
      ...(lowStockThreshold !== settings.lowStockThreshold && { lowStockThreshold }),
    };
    if (Object.keys(body).length === 0) return setErrors({ form: "Nothing has changed." });
    try {
      onSaved(await update.mutateAsync(body));
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Couldn't save. Please try again." });
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-border-default bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Platform fee (%)"
          htmlFor="platform-fee"
          error={errors.fee}
          hint="Taken from each seller order's items before the payout. Delivery fees aren't included."
        >
          <TextInput
            id="platform-fee"
            inputMode="decimal"
            value={fee}
            invalid={!!errors.fee}
            onChange={(e) => {
              setFee(e.target.value);
              setErrors({});
            }}
          />
        </Field>
        <Field
          label="Days for a seller to hand over an order"
          htmlFor="pickup-days"
          error={errors.days}
          hint="After payment, before the order is cancelled and the buyer refunded."
        >
          <TextInput
            id="pickup-days"
            inputMode="numeric"
            value={days}
            invalid={!!errors.days}
            onChange={(e) => {
              setDays(e.target.value);
              setErrors({});
            }}
          />
        </Field>
        <Field
          label="Low stock alert at"
          htmlFor="low-stock"
          error={errors.lowStock}
          hint="Sellers are told when an item has this many left or fewer."
        >
          <TextInput
            id="low-stock"
            inputMode="numeric"
            value={lowStock}
            invalid={!!errors.lowStock}
            onChange={(e) => {
              setLowStock(e.target.value);
              setErrors({});
            }}
          />
        </Field>
      </div>
      {errors.form && (
        <p role="alert" className="text-sm font-medium text-red-500">
          {errors.form}
        </p>
      )}
      <p className="text-xs text-foreground-muted">Fee and days apply to orders paid from now on. Every change is kept in the audit log.</p>
      <Button type="submit" className="sm:w-auto sm:self-end" loading={update.isPending}>
        Save settings
      </Button>
    </form>
  );
}
