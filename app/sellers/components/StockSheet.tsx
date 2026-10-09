"use client";

import { useEffect, useState } from "react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { useListing, useUpdateListing } from "@/lib/api/hooks/useListings";

const inputClass =
  "w-24 bg-surface-muted border border-border-default rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-seller-main/30 focus:border-seller-main";

// "Adjust stock" from the products list: one number, or one per option
export default function StockSheet({ listingId, onClose, onSaved }: { listingId: string | null; onClose: () => void; onSaved: (title: string) => void }) {
  const { data: listing, isPending, isError } = useListing(listingId ?? undefined);
  const update = useUpdateListing();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) return;
    setError(null);
    setCounts(
      listing.variants.length
        ? Object.fromEntries(listing.variants.map((v) => [v.id, String(v.stock)]))
        : { stock: String(listing.stock) },
    );
  }, [listing]);

  const save = async () => {
    if (!listing) return;
    const parsed = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, /^\d+$/.test(v.trim()) ? Number(v) : NaN]));
    if (Object.values(parsed).some((n) => Number.isNaN(n))) {
      setError("Enter a whole number for each stock count");
      return;
    }
    try {
      await update.mutateAsync({
        id: listing.id,
        body: listing.variants.length
          ? {
              // Options replace the whole set, so every option is sent with its stock
              variants: listing.variants.map((v) => ({
                label: v.label,
                stock: parsed[v.id],
                ...(v.priceKobo !== null && { priceKobo: v.priceKobo }),
              })),
            }
          : { stock: parsed.stock },
      });
      onSaved(listing.title);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Please try again.");
    }
  };

  return (
    <Modal
      isOpen={!!listingId}
      onClose={onClose}
      title="Adjust stock"
      footer={
        <button
          type="button"
          onClick={save}
          disabled={!listing || update.isPending}
          className="w-full py-4 rounded-full bg-seller-main text-white font-bold text-sm disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save stock"}
        </button>
      }
    >
      {isPending ? (
        <p className="py-6 text-center text-sm text-foreground-muted">Loading…</p>
      ) : isError || !listing ? (
        <p className="py-6 text-center text-sm text-foreground-muted">We couldn&apos;t load this product.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">{listing.title}</p>
          {listing.variants.length ? (
            listing.variants.map((v) => (
              <label key={v.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground">{v.label}</span>
                <input
                  inputMode="numeric"
                  aria-label={`Stock for ${v.label}`}
                  value={counts[v.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [v.id]: e.target.value }))}
                  className={inputClass}
                />
              </label>
            ))
          ) : (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">Quantity in stock</span>
              <input
                inputMode="numeric"
                aria-label="Quantity in stock"
                value={counts.stock ?? ""}
                onChange={(e) => setCounts({ stock: e.target.value })}
                className={inputClass}
              />
            </label>
          )}
          <p className="text-xs text-foreground-muted">At 0 the listing shows as out of stock; adding stock puts it back on sale.</p>
          {error && (
            <p role="alert" className="text-xs font-medium text-red-500">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
