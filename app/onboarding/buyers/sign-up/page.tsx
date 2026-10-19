"use client";

import { Suspense } from "react";
import SignUpForm from "@/app/onboarding/components/SignUpForm";

export default function BuyerSignUpPage() {
  return (
    <Suspense>
      <SignUpForm accountType="BUYER" />
    </Suspense>
  );
}
