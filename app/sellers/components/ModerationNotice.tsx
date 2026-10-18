import InfoBanner from "@/app/components/InfoBanner";
import type { Listing } from "@/lib/api/listings";

// What CampusMart's moderation means for the seller's own listing (M2-M4). Nothing for a listing
// that isn't held or hidden.
export default function ModerationNotice({ listing }: { listing: Pick<Listing, "status" | "heldForReview" | "moderationReason"> }) {
  if (listing.heldForReview) {
    return (
      <InfoBanner
        variant="warning"
        title="Waiting for review"
        text="An admin checks it before buyers can see it, because it uses a word on CampusMart's banned list or was changed after being taken down. You'll get a notification when it's decided."
      />
    );
  }
  if (listing.status !== "FLAGGED") return null;
  return (
    <InfoBanner
      variant="error"
      title="Hidden by CampusMart"
      text={
        !listing.moderationReason
          ? "It's hidden while an admin reviews it."
          : /[.!?]$/.test(listing.moderationReason)
            ? // A sentence of its own, e.g. a prohibited-item report waiting for review
              listing.moderationReason
            : // An admin's M3 reason, e.g. "Poor photos: too dark"
              `Taken down: ${listing.moderationReason}. Edit it to fix this and send it for review again.`
      }
    />
  );
}
