"use client";

import { Suspense } from "react";
import SignInForm from "@/app/onboarding/components/SignInForm";

export default function SellerSignInPage() {
  return (
    <Suspense>
      <SignInForm roleType="seller" />
    </Suspense>
  );
}
