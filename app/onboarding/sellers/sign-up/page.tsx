"use client";

import { Suspense } from "react";
import SignUpForm from "@/app/onboarding/components/SignUpForm";

export default function SellerSignUpPage() {
  return (
    <Suspense>
      <SignUpForm accountType="SELLER" />
    </Suspense>
  );
}
