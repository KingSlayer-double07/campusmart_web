"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import Modal from "@/app/components/Modal";
import { ApiError } from "@/lib/api/client";
import { useCreateReview } from "@/lib/api/hooks/useReviews";

const COMMENT_MAX = 500;
const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// Guide 8.4: rate an item you received. Reviews can't be edited later (R4).
export default function RateItemDialog({
  sellerOrderId,
  listingId,
  title,
  isOpen,
  onClose,
  onDone,
}: {
  sellerOrderId: string;
  listingId: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useCreateReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRating(0);
    setComment("");
    setError(null);
  }, [isOpen]);

  const submit = async () => {
    if (rating === 0) return setError("Choose 1 to 5 stars");
    try {
      await create.mutateAsync({ sellerOrderId, body: { listingId, rating, ...(comment.trim() && { comment: comment.trim() }) } });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your rating. Please try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Rate ${title}`}>
      <div className="mt-2 flex flex-col gap-4">
        <div role="radiogroup" aria-label="Your rating" className="flex flex-col items-center gap-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => {
                  setRating(n);
                  setError(null);
                }}
                className="p-1"
              >
                <Star size={30} aria-hidden className={n <= rating ? "fill-amber-400 text-amber-400" : "text-neutral-300"} />
              </button>
            ))}
          </div>
          <p className="h-4 text-xs text-foreground-muted">{WORDS[rating]}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          What did you think? (optional)
          <textarea
            value={comment}
            maxLength={COMMENT_MAX}
            rows={3}
            onChange={(e) => setComment(e.target.value)}
            className="rounded-xl border border-border-default bg-surface-muted px-3 py-2 text-sm font-normal focus:border-main focus:outline-none"
          />
          <span className="self-end text-xs font-normal text-foreground-muted">
            {comment.length}/{COMMENT_MAX}
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-500">
            {error}
          </p>
        )}
        <p className="text-xs text-foreground-muted">Your first name or username shows with your rating. It can&apos;t be changed later.</p>
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className="w-full rounded-full bg-main py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? "Sending…" : "Send rating"}
        </button>
      </div>
    </Modal>
  );
}
