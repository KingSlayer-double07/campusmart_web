"use client";

import { useEffect, useState } from "react";
import Button from "@/app/components/Button";
import InfoBanner from "@/app/components/InfoBanner";
import Modal from "@/app/components/Modal";
import type { AdminInstitution } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import { useUpdateInstitution } from "@/lib/api/hooks/useAdminInstitutions";
import { formatNaira, koboToNairaInput, nairaToKobo } from "@/lib/labels";
import { Field, TextInput } from "../components/fields";

const MAX_FEE_KOBO = 10_000_000; // the API's ceiling: ₦100,000

// Decisions DF1, DF2, C10: one flat fee per order for dispatch to a campus place. Clearing it
// stops on-campus delivery at that school; off campus and pickup still work.
export default function DeliveryFeeDialog({
  institution,
  onClose,
  onSaved,
}: {
  institution: AdminInstitution | null;
  onClose: () => void;
  onSaved: (institution: AdminInstitution) => void;
}) {
  const update = useUpdateInstitution();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!institution) return;
    setAmount(institution.deliveryFeeKobo === null ? "" : koboToNairaInput(institution.deliveryFeeKobo));
    setError(null);
  }, [institution]);

  const save = async (deliveryFeeKobo: number | null) => {
    if (!institution) return;
    try {
      const saved = await update.mutateAsync({ id: institution.id, body: { deliveryFeeKobo } });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Please try again.");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kobo = nairaToKobo(amount);
    if (kobo === null) return setError("Enter the fee in naira, such as 500");
    if (kobo > MAX_FEE_KOBO) return setError("The delivery fee can be up to ₦100,000");
    void save(kobo);
  };

  return (
    <Modal
      isOpen={!!institution}
      onClose={update.isPending ? () => undefined : onClose}
      title="Delivery fee on campus"
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {institution?.deliveryFeeKobo !== null ? (
            <Button variant="outline" className="sm:w-auto" onClick={() => void save(null)} disabled={update.isPending}>
              Stop delivery on campus
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="fee-form" className="sm:w-auto" loading={update.isPending}>
            Save fee
          </Button>
        </div>
      }
    >
      <form id="fee-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          {institution?.name}: buyers pay this once per order when a rider brings it to a campus place, however many stores
          it comes from. Off campus, the fee is settled with the rider outside the app.
        </p>
        <Field label="Fee in naira" htmlFor="delivery-fee" error={error}>
          <TextInput
            id="delivery-fee"
            inputMode="decimal"
            value={amount}
            placeholder="500"
            invalid={!!error}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        </Field>
        {institution && institution.placeCount === 0 && (
          <InfoBanner text="This school has no campus places yet, so buyers can't choose delivery on campus until you add one." />
        )}
        {institution?.deliveryFeeKobo !== null && institution && (
          <p className="text-xs text-foreground-muted">Now {formatNaira(institution.deliveryFeeKobo)} per order.</p>
        )}
      </form>
    </Modal>
  );
}
