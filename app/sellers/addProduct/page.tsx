"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/app/components/PageHeader";
import { useCreateListing } from "@/lib/api/hooks/useListings";
import ListingForm from "../components/ListingForm";
import { emptyValues } from "../components/listingFormModel";

// Guide 3.2.6: photos upload straight to Cloudinary, then the listing is created and the seller
// lands on their products. Pickup location and availability are gone: the buyer picks the station,
// and availability is the listing's status.
export default function AddProductPage() {
  const router = useRouter();
  const createListing = useCreateListing();
  const [initialValues] = useState(emptyValues);

  return (
    <main className="flex flex-col max-w-md w-full pb-32 bg-card">
      <div className="bg-card px-4 pt-10 pb-4 sticky top-0 z-10 border-b border-border-default">
        <PageHeader title="Add Product" />
      </div>
      <ListingForm
        mode="create"
        initialValues={initialValues}
        onSubmit={async (fields, images, intent) => {
          await createListing.mutateAsync({
            ...fields,
            images,
            status: intent === "DRAFT" ? "DRAFT" : "ACTIVE",
          });
          router.push("/sellers/products");
        }}
      />
    </main>
  );
}
