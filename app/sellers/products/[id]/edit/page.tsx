"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { ApiError } from "@/lib/api/client";
import { useListing, useUpdateListing } from "@/lib/api/hooks/useListings";
import ListingForm from "../../../components/ListingForm";
import { valuesFromListing } from "../../../components/listingFormModel";

// Guide 3.2.6g: the add form in edit mode. Photos and options sent here replace the saved ones.
export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: listing, isPending, isError, error, refetch } = useListing(id);
  const updateListing = useUpdateListing();

  const header = (
    <div className="bg-card px-4 pt-10 pb-4 sticky top-0 z-10 border-b border-border-default">
      <PageHeader title="Edit Product" />
    </div>
  );

  if (isPending) {
    return (
      <main className="flex flex-col max-w-md w-full pb-32 bg-card">
        {header}
        <div className="flex flex-col gap-4 px-4 py-6 animate-pulse" aria-busy="true" aria-label="Loading product">
          <div className="h-24 w-full rounded-xl bg-surface-muted" />
          <div className="h-10 w-full rounded-xl bg-surface-muted" />
          <div className="h-24 w-full rounded-xl bg-surface-muted" />
        </div>
      </main>
    );
  }

  if (isError || !listing || !listing.isOwner) {
    const missing = !listing || (error instanceof ApiError && error.status === 404) || !listing.isOwner;
    return (
      <main className="flex flex-col max-w-md w-full pb-32 bg-card">
        {header}
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="font-medium text-foreground">{missing ? "This product isn't one of yours" : "We couldn't load this product"}</p>
          {missing ? (
            <Link href="/sellers/products" className="text-sm font-semibold text-seller-main">
              Back to your products
            </Link>
          ) : (
            <button type="button" onClick={() => refetch()} className="text-sm font-semibold text-seller-main">
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col max-w-md w-full pb-32 bg-card">
      {header}
      <ListingForm
        key={listing.id}
        mode="edit"
        initialValues={valuesFromListing(listing)}
        onSubmit={async (fields, images) => {
          await updateListing.mutateAsync({
            id: listing.id,
            // Options sent replace the saved set; none sent means the listing has none
            body: { ...fields, images, variants: fields.variants ?? [] },
          });
          router.push(`/sellers/products/${listing.id}`);
        }}
      />
    </main>
  );
}
