"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import BottomSheet from "./BottomSheet";

// Guide 8.1: favourites live in the account, so a guest is asked to sign in first
export default function SignInToSaveSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Back to the same item after signing in
  const pathname = usePathname();
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div role="dialog" aria-labelledby="save-sign-in-title" className="flex flex-col items-center gap-3 px-6 pb-8 pt-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-orange-50">
          <Heart size={26} className="text-main" aria-hidden />
        </div>
        <h2 id="save-sign-in-title" className="text-base font-semibold text-foreground">
          Sign in to save favourites
        </h2>
        <p className="text-sm text-foreground-muted">Your favourites stay with your account on every device.</p>
        <Link href={`/onboarding/buyers/sign-in?next=${encodeURIComponent(pathname)}`} className="mt-2 w-full rounded-full bg-main py-3 text-sm font-semibold text-white">
          Sign in
        </Link>
        <button type="button" onClick={onClose} className="text-sm font-medium text-foreground-muted">
          Not now
        </button>
      </div>
    </BottomSheet>
  );
}
