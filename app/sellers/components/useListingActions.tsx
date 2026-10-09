"use client";

import { useState } from "react";
import Modal from "@/app/components/Modal";
import { ToastContainer, useToast } from "@/app/components/Toast";
import type { ListingCard, OwnerListingStatus } from "@/lib/api/listings";
import { ApiError } from "@/lib/api/client";
import { useDeleteListing, useSetListingStatus } from "@/lib/api/hooks/useListings";
import { LISTING_STATUS_LABELS } from "@/lib/labels";
import StockSheet from "./StockSheet";

// Status changes, stock and delete, shared by the products list and a product's own page.
// Renders its own toasts and dialogs; spread `actions` into SellerProductCard.
export function useListingActions(onDeleted?: () => void) {
  const toast = useToast();
  const setStatus = useSetListingStatus();
  const remove = useDeleteListing();
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Pick<ListingCard, "id" | "title"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const actions = {
    onStatus: async (listing: Pick<ListingCard, "id" | "title">, status: OwnerListingStatus) => {
      try {
        const saved = await setStatus.mutateAsync({ id: listing.id, status });
        toast.success(LISTING_STATUS_LABELS[saved.status], listing.title);
      } catch (err) {
        toast.error("Couldn't change it", err instanceof ApiError ? err.message : "Please try again");
      }
    },
    onAdjustStock: (listing: Pick<ListingCard, "id">) => setStockFor(listing.id),
    onDelete: (listing: Pick<ListingCard, "id" | "title">) => {
      setDeleteError(null);
      setDeleting(listing);
    },
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success("Deleted", deleting.title);
      setDeleting(null);
      onDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete. Please try again.");
    }
  };

  const dialogs = (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <StockSheet listingId={stockFor} onClose={() => setStockFor(null)} onSaved={(title) => toast.success("Stock saved", title)} />
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete product?">
        <p className="text-sm text-foreground-muted mb-4 mt-2">
          <strong className="text-foreground">{deleting?.title}</strong> will disappear from your store and from buyers. Orders
          that include it keep their records.
        </p>
        {deleteError && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {deleteError}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={remove.isPending}
            onClick={confirmDelete}
            className="w-full py-4 rounded-full bg-red-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Yes, delete it"}
          </button>
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="w-full py-4 rounded-full bg-card border border-border-default text-foreground font-bold text-sm"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );

  return { actions, dialogs };
}
