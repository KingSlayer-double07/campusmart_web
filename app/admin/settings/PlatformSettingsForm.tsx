"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/payments";
import { useUpdateSettings } from "@/lib/api/hooks/useAdminPayments";
import { Field, TextInput } from "../components/fields";

// The API's limits (backend/src/settings/settings.service.ts)
const MAX_FEE_PERCENT = 50;

type WholeKey = Exclude<keyof PlatformSettings, "platformFeeBps">;

interface WholeField {
  key: WholeKey;
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  error: string;
}

const whole = (field: Omit<WholeField, "error"> & { error?: string }): WholeField => ({
  error: `Enter a whole number from ${field.min} to ${field.max}`,
  ...field,
});

// Decisions DL7b and A1
const RULES: WholeField[] = [
  whole({
    key: "pickupDeadlineDays",
    id: "pickup-days",
    label: "Days for a seller to hand over an order",
    hint: "After payment, before the order is cancelled and the buyer refunded.",
    min: 1,
    max: 14,
    error: "Enter a whole number of days from 1 to 14",
  }),
  whole({
    key: "lowStockThreshold",
    id: "low-stock",
    label: "Low stock alert at",
    hint: "Sellers are told when an item has this many left or fewer.",
    min: 0,
    max: 100,
  }),
];

// Guide 8.4 with decision R1: the score is out of 100; a "Trusted seller" badge shows at 80
const TRUST: WholeField[] = [
  whole({ key: "trustWeightRating", id: "trust-rating", label: "Points for a 5-star rating", hint: "Scaled by the seller's average rating.", min: 0, max: 100 }),
  whole({
    key: "trustWeightCompleted",
    id: "trust-completed",
    label: "Points for orders handed over",
    hint: "Scaled by the share of their last 50 finished orders that reached the buyer.",
    min: 0,
    max: 100,
  }),
  whole({ key: "trustWeightVerified", id: "trust-verified", label: "Points for a verified seller", hint: "CampusMart checked their student ID.", min: 0, max: 100 }),
  whole({
    key: "trustPenaltySellerFault",
    id: "trust-penalty",
    label: "Points off per seller-fault refund",
    hint: "Each cancellation or refund that was the seller's fault in the last 90 days.",
    min: 0,
    max: 100,
  }),
];

const wholeNumber = (input: string) => (/^\d+$/.test(input.trim()) ? Number(input.trim()) : NaN);

// "2.5" -> 250 basis points; null when it isn't a percentage the API accepts
export function percentToBps(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps <= MAX_FEE_PERCENT * 100 ? bps : null;
}

export const bpsToPercent = (bps: number) => String(bps / 100);

type Errors = Partial<Record<WholeKey | "fee" | "form", string | null>>;

// Decisions P1, DL7b, A1 and R1: the platform's cut of each seller order (0 to start), how long a
// seller has to hand a paid order to a rider, when sellers hear an item is running low, and the
// trust-score weights (applied at the next nightly recalculation: R1b).
export default function PlatformSettingsForm({ settings, onSaved }: { settings: PlatformSettings; onSaved: (saved: PlatformSettings) => void }) {
  const update = useUpdateSettings();
  const [fee, setFee] = useState("");
  const [values, setValues] = useState<Partial<Record<WholeKey, string>>>({});
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    setFee(bpsToPercent(settings.platformFeeBps));
    setValues(Object.fromEntries([...RULES, ...TRUST].map((f) => [f.key, String(settings[f.key])])));
  }, [settings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const platformFeeBps = percentToBps(fee);
    const found: Errors = { fee: platformFeeBps === null ? `Enter a percentage from 0 to ${MAX_FEE_PERCENT}, such as 2.5` : null };
    const body: Partial<PlatformSettings> = {};
    for (const f of [...RULES, ...TRUST]) {
      const n = wholeNumber(values[f.key] ?? "");
      if (!(n >= f.min && n <= f.max)) found[f.key] = f.error;
      else if (n !== settings[f.key]) body[f.key] = n;
    }
    setErrors(found);
    if (Object.values(found).some(Boolean) || platformFeeBps === null) return;
    if (platformFeeBps !== settings.platformFeeBps) body.platformFeeBps = platformFeeBps;
    if (Object.keys(body).length === 0) return setErrors({ form: "Nothing has changed." });
    try {
      onSaved(await update.mutateAsync(body));
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Couldn't save. Please try again." });
    }
  };

  const input = (f: WholeField) => (
    <Field key={f.key} label={f.label} htmlFor={f.id} error={errors[f.key]} hint={f.hint}>
      <TextInput
        id={f.id}
        inputMode="numeric"
        value={values[f.key] ?? ""}
        invalid={!!errors[f.key]}
        onChange={(e) => {
          setValues((v) => ({ ...v, [f.key]: e.target.value }));
          setErrors({});
        }}
      />
    </Field>
  );

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
        {RULES.map(input)}
      </div>
      <fieldset className="flex flex-col gap-3 border-t border-border-default pt-4">
        <legend className="float-left w-full text-sm font-semibold text-foreground">Trust score</legend>
        <p className="text-xs text-foreground-muted">
          Out of 100, worked out every night. Buyers see a &ldquo;Trusted seller&rdquo; badge at 80 or more. Changes apply at the next nightly run.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">{TRUST.map(input)}</div>
      </fieldset>
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
