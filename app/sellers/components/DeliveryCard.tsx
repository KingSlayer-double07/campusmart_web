"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil, Phone, Store } from "lucide-react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import type { SellerProfile } from "@/lib/api/listings";
import { useUpdateSellerProfile } from "@/lib/api/hooks/useSellerProfile";
import { phoneError } from "@/lib/validations/delivery";

const inputClass =
  "w-full bg-surface-muted border border-border-default rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main transition aria-invalid:border-red-400";

interface Errors {
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  form?: string | null;
}

function validate(area: string, address: string, phone: string): Errors {
  return {
    area: area.length < 2 || area.length > 80 ? "Enter your area, such as the hall or street (2 to 80 characters)" : null,
    address: address.length < 5 || address.length > 300 ? "Enter the full address riders come to (5 to 300 characters)" : null,
    phone: phoneError(phone),
  };
}

// Where riders collect this seller's orders, and whether buyers may collect themselves
// (decisions SA1, SA4, DL1). Buyers see the area before paying; the address and phone only after.
function DeliverySheet({ profile, isOpen, onClose, onSaved }: { profile: SellerProfile; isOpen: boolean; onClose: () => void; onSaved: () => void }) {
  const update = useUpdateSellerProfile();
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [allowsPickup, setAllowsPickup] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!isOpen) return;
    setArea(profile.pickupArea ?? "");
    setAddress(profile.pickupAddress ?? "");
    setPhone(profile.contactPhone ?? "");
    setAllowsPickup(profile.allowsPickup);
    setErrors({});
  }, [isOpen, profile]);

  const save = async () => {
    const next = { pickupArea: area.trim(), pickupAddress: address.trim(), contactPhone: phone.trim() };
    const found = validate(next.pickupArea, next.pickupAddress, next.contactPhone);
    setErrors(found);
    if (found.area || found.address || found.phone) return;
    try {
      await update.mutateAsync({ ...next, allowsPickup });
      onSaved();
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Couldn't save. Please try again." });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={update.isPending ? () => undefined : onClose}
      title="Delivery and pickup"
      footer={
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pickup-area" className="text-sm font-semibold text-foreground">
            Area
          </label>
          <input
            id="pickup-area"
            value={area}
            maxLength={80}
            placeholder="e.g. Moremi Hall, or Akoka"
            aria-invalid={!!errors.area}
            onChange={(e) => setArea(e.target.value)}
            className={inputClass}
          />
          {errors.area ? (
            <p role="alert" className="text-xs font-medium text-red-500">{errors.area}</p>
          ) : (
            <p className="text-xs text-foreground-muted">Buyers see this before they pay.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pickup-address" className="text-sm font-semibold text-foreground">
            Full address
          </label>
          <textarea
            id="pickup-address"
            value={address}
            rows={2}
            maxLength={300}
            placeholder="e.g. Room 12, Block B, Moremi Hall"
            aria-invalid={!!errors.address}
            onChange={(e) => setAddress(e.target.value)}
            className={`${inputClass} resize-none`}
          />
          {errors.address ? (
            <p role="alert" className="text-xs font-medium text-red-500">{errors.address}</p>
          ) : (
            <p className="text-xs text-foreground-muted">Riders collect from here. A buyer who picks up sees it once they&apos;ve paid.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pickup-phone" className="text-sm font-semibold text-foreground">
            Phone number
          </label>
          <input
            id="pickup-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            placeholder="+234 801 234 5678"
            aria-invalid={!!errors.phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
          {errors.phone && <p role="alert" className="text-xs font-medium text-red-500">{errors.phone}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Let buyers pick up from me</p>
            <p className="text-xs text-foreground-muted">They can choose to collect from you for free instead of a rider</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowsPickup}
            aria-label="Let buyers pick up from me"
            onClick={() => setAllowsPickup((v) => !v)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-300 ${
              allowsPickup ? "bg-seller-main" : "bg-neutral-300"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-card shadow-md transition-transform duration-300 ${
                allowsPickup ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {errors.form && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {errors.form}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function DeliveryCard({ profile, onSaved }: { profile: SellerProfile; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const complete = profile.deliveryDetailsComplete;

  return (
    <section
      id="delivery"
      aria-labelledby="delivery-title"
      className={`flex flex-col gap-3 rounded-lg border p-5 ${complete ? "border-border-default bg-card" : "border-blue-200 bg-blue-50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="delivery-title" className="text-base font-semibold text-foreground">
            Delivery and pickup
          </h2>
          {!complete && (
            <p className="mt-0.5 text-xs text-foreground-muted">
              Riders collect your orders from you. Add your area, address and phone number before your products can go live.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border-default bg-card px-3 py-1.5 text-xs font-semibold text-seller-main"
        >
          <Pencil size={12} />
          {complete ? "Edit" : "Add details"}
        </button>
      </div>

      {complete && (
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-start gap-2">
            <MapPin size={15} className="mt-0.5 shrink-0 text-seller-main" />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">{profile.pickupArea}</span>
              <span className="block text-xs text-foreground-muted">{profile.pickupAddress}</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Phone size={15} className="shrink-0 text-seller-main" />
            <span className="text-foreground">{profile.contactPhone}</span>
          </li>
          <li className="flex items-center gap-2">
            <Store size={15} className="shrink-0 text-seller-main" />
            <span className="text-foreground">{profile.allowsPickup ? "Buyers can pick up from you" : "Riders only; buyers can't pick up from you"}</span>
          </li>
        </ul>
      )}

      <DeliverySheet profile={profile} isOpen={editing} onClose={() => setEditing(false)} onSaved={onSaved} />
    </section>
  );
}
