"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ImageOff, Star } from "lucide-react";
import Modal from "@/app/components/Modal";
import PageHeader from "@/app/components/PageHeader";
import { StatusBadge, skuOf, statusActions } from "@/app/sellers/components/SellerProductCard";
import { useListingActions } from "@/app/sellers/components/useListingActions";
import VerificationNotice from "@/app/sellers/components/VerificationNotice";
import { useCanPublish } from "@/lib/api/hooks/useSellerVerification";
import { ApiError } from "@/lib/api/client";
import { useListing } from "@/lib/api/hooks/useListings";
import { CATEGORY_LABELS, CONDITION_LABELS, formatNaira, formatPriceRange } from "@/lib/labels";

const dateFormat = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 bg-card rounded-2xl py-4 border border-border-default">
      <p className="text-[11px] text-foreground-muted font-medium">{label}</p>
      <div className="text-[22px] font-bold text-foreground leading-none">{value}</div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, isPending, isError, error, refetch } = useListing(id);
  const { actions, dialogs } = useListingActions(() => router.push("/sellers/products"));
  const canPublish = useCanPublish();
  const [expanded, setExpanded] = useState(false);
  const [photo, setPhoto] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);

  const shell = (body: React.ReactNode) => (
    <main className="flex flex-col w-full max-w-md min-h-dvh bg-surface-muted pb-32">
      <div className="bg-card px-4 pt-10 pb-4">
        <PageHeader
          title="Product Details"
          showBack
          rightItems={
            product?.isOwner ? (
              <Link href={`/sellers/products/${product.id}/edit`} className="px-5 py-2 rounded-full bg-seller-main text-white text-sm font-semibold">
                Edit
              </Link>
            ) : undefined
          }
        />
      </div>
      {body}
    </main>
  );

  if (isPending) {
    return shell(
      <div className="flex flex-col gap-4 px-4 py-4 animate-pulse" aria-busy="true" aria-label="Loading product">
        <div className="h-56 rounded-3xl bg-card" />
        <div className="h-24 rounded-3xl bg-card" />
      </div>,
    );
  }

  if (isError || !product || !product.isOwner) {
    const missing = product ? !product.isOwner : error instanceof ApiError && error.status === 404;
    return shell(
      <div className="flex flex-col items-center gap-3 py-32 text-center text-sm">
        <p className="text-foreground-muted">{missing ? "Product not found." : "We couldn't load this product."}</p>
        {missing ? (
          <Link href="/sellers/products" className="font-semibold text-seller-main">
            Back to your products
          </Link>
        ) : (
          <button type="button" onClick={() => refetch()} className="font-semibold text-seller-main">
            Try again
          </button>
        )}
      </div>,
    );
  }

  const longDescription = product.description.length > 120;
  const current = product.images[photo] ?? product.images[0];

  return (
    <>
      {shell(
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="bg-card rounded-3xl overflow-hidden flex flex-col items-center justify-center pt-6 pb-4 gap-3 relative">
            <div className="relative w-48 h-48 rounded-2xl overflow-hidden bg-surface-muted flex items-center justify-center text-foreground-muted">
              {current ? <Image src={current.url} alt={product.title} fill className="object-cover" sizes="192px" /> : <ImageOff size={28} />}
            </div>
            {product.images.length > 1 && (
              <div className="flex items-center gap-1.5 mt-1">
                {product.images.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={() => setPhoto(i)}
                    className={`rounded-full transition-all ${i === photo ? "w-4 h-2 bg-seller-main" : "size-2 bg-neutral-300"}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-card rounded-3xl p-5 border border-border-default">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-lg font-bold text-foreground leading-snug">{product.title}</p>
                <p className="text-[12px] text-foreground-muted">
                  SKU {skuOf(product.id)} • {CATEGORY_LABELS[product.category]}
                </p>
              </div>
              <p className="text-xl font-bold text-seller-main shrink-0">{formatPriceRange(product.minPriceKobo, product.maxPriceKobo)}</p>
            </div>
            <div className="mt-3">
              <StatusBadge status={product.status} />
            </div>
          </div>

          <div className="flex gap-3">
            <StatBox label="In stock" value={product.stock} />
            <StatBox
              label="Rating"
              value={
                product.ratingCount > 0 ? (
                  <span className="flex items-center gap-1">
                    <Star size={18} className="fill-yellow-400 text-yellow-400" />
                    {product.ratingAvg.toFixed(1)}
                  </span>
                ) : (
                  "–"
                )
              }
            />
          </div>

          {product.variants.length > 0 && (
            <div className="bg-card rounded-3xl p-5 border border-border-default flex flex-col">
              <p className="text-[11px] font-bold text-foreground-muted uppercase tracking-widest mb-2">Options</p>
              {product.variants.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2.5 border-b border-border-default last:border-b-0 text-sm">
                  <span className="text-foreground">{v.label}</span>
                  <span className="text-foreground-muted">
                    {formatNaira(v.priceKobo ?? product.priceKobo)} · {v.stock} left
                  </span>
                </div>
              ))}
            </div>
          )}

          {product.description && (
            <div className="bg-card rounded-3xl p-5 border border-border-default flex flex-col gap-2">
              <p className="text-[11px] font-bold text-foreground-muted uppercase tracking-widest">Description</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {expanded || !longDescription ? product.description : `${product.description.slice(0, 120)}…`}
              </p>
              {longDescription && (
                <button type="button" onClick={() => setExpanded((e) => !e)} className="text-seller-main text-sm font-semibold self-end">
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}

          <div className="bg-card rounded-3xl p-5 border border-border-default flex flex-col gap-0">
            <p className="text-[11px] font-bold text-foreground-muted uppercase tracking-widest mb-3">Details</p>
            {[
              { label: "Category", value: CATEGORY_LABELS[product.category] },
              { label: "Condition", value: CONDITION_LABELS[product.condition] },
              { label: "Added on", value: dateFormat.format(new Date(product.createdAt)) },
              { label: "Last updated", value: dateFormat.format(new Date(product.updatedAt)) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-border-default last:border-b-0">
                <p className="text-sm text-foreground-muted">{label}</p>
                <p className="text-sm font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>,
      )}

      {/* Manage Listing CTA */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-24 px-4 z-30 pointer-events-none">
        <div className="w-full max-w-md pointer-events-auto">
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="w-full py-4 rounded-full bg-card border border-border-default text-foreground font-bold text-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition active:scale-[0.98]"
          >
            Manage Listing
          </button>
        </div>
      </div>

      <Modal isOpen={manageOpen} onClose={() => setManageOpen(false)} title="Manage Listing">
        <div className="flex flex-col gap-3 mt-4">
          {product.status === "FLAGGED" && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              CampusMart is reviewing this listing, so it can&apos;t be published or moved yet.
            </p>
          )}
          {!canPublish && (product.status === "DRAFT" || product.status === "ARCHIVED") && <VerificationNotice />}
          {statusActions(product.status, canPublish).map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={false}
              onClick={() => {
                setManageOpen(false);
                void actions.onStatus(product, a.status);
              }}
              className={`w-full py-4 rounded-full font-bold text-sm transition active:scale-[0.98] ${
                a.status === "ACTIVE" ? "bg-seller-main text-white" : "bg-card border border-border-default text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setManageOpen(false);
              actions.onAdjustStock(product);
            }}
            className="w-full py-4 rounded-full bg-card border border-border-default text-foreground font-bold text-sm transition active:scale-[0.98]"
          >
            Adjust stock
          </button>
          <button
            type="button"
            onClick={() => {
              setManageOpen(false);
              actions.onDelete(product);
            }}
            className="w-full py-4 rounded-full bg-red-50 text-red-500 font-bold text-sm transition active:scale-[0.98]"
          >
            Delete Product
          </button>
        </div>
      </Modal>

      {dialogs}
    </>
  );
}
