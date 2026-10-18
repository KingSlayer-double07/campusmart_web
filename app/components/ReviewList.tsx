"use client";

import { Star } from "lucide-react";
import type { Review } from "@/lib/api/reviews";

const when = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" });

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden className={n <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-neutral-300"} />
      ))}
    </span>
  );
}

// Guide 8.4: reviews, newest first, with "Show more" while there are more
export default function ReviewList({
  reviews,
  showListing = false,
  hasMore,
  loadingMore,
  onMore,
}: {
  reviews: Review[];
  showListing?: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-border-default">
        {reviews.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-3">
            <div className="flex items-center justify-between gap-2">
              <Stars rating={r.rating} />
              <span className="text-xs text-foreground-muted">{when.format(new Date(r.createdAt))}</span>
            </div>
            {r.comment && <p className="text-sm text-foreground">{r.comment}</p>}
            <p className="text-xs text-foreground-muted">
              {r.reviewerDisplayName}
              {showListing && <> · {r.listingTitle}</>}
            </p>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" onClick={onMore} disabled={loadingMore} className="self-start py-2 text-sm font-semibold text-main disabled:opacity-50">
          {loadingMore ? "Loading…" : "Show more reviews"}
        </button>
      )}
    </div>
  );
}
