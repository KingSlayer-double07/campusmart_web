"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/app/components/Button";
import { CornerUpLeft } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col md:px-8 pt-8 pb-12 w-full flex-1">
      <section className="flex flex-col px-6 mt-6 w-full">
          <button
            onClick={() => router.back()}
            className="size-8 bg-card rounded-full border border-border-default flex justify-center items-center shadow-lg hover:bg-surface-muted transition shrink-0 mb-4"
          >
            <CornerUpLeft size={18} />
          </button>

          <div className="h-56 relative mb-8">
            <Image src="/login.png" alt="" fill className="object-contain" />
          </div>
          <h1 className="text-[28px] leading-[1.1] font-bold text-foreground mb-6">
            Gets you back in.
          </h1>

          <div className="mb-8">
            <Button href="/onboarding/buyers/sign-in" outerRing roleType="buyer">
              Sign in with school email
            </Button>
          </div>

          {/* "Continue with Google" returns with Google sign-in in Phase 10 */}

          <p className="text-foreground-muted text-[12.5px] text-center tracking-tight">
            Don&apos;t have an account?{" "}
            <Link
              href="/onboarding/buyers/sign-up"
              className="text-main hover:underline"
            >
              Create one here
            </Link>
          </p>
      </section>
    </div>
  );
}
