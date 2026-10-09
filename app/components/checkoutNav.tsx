"use client";
import BottomFloatingBar, { BottomFloatingBarContainer } from './BottomFloatingBar';
import { useRouter } from "next/navigation";
import { useCartStore, selectTotalPrice } from "../store/useCartStore";
import { formatNaira } from "@/lib/labels";
import { useEffect, useState } from "react";

export default function CheckoutNav({
  text,
  link,
}: {
  text: string;
  link: string;
}) {
  const router = useRouter();
  const { cart } = useCartStore();
  const totalPrice = useCartStore(selectTotalPrice);
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return (
    <BottomFloatingBar zIndex={50}>
      <BottomFloatingBarContainer className="gap-2">
        <div className="w-full flex justify-center">
          <p className="text-main font-semibold text-lg">{formatNaira(totalPrice)}</p>
        </div>
        <button
          className="w-full h-10 rounded-full border bg-main border-border-default disabled:opacity-40 transition-all duration-300"
          onClick={() => router.push("/"+link)}
          disabled={cart.length <= 0}
        >
          <p className="font-medium text-sm text-white">
            {text} ({totalQty})
          </p>
        </button>
      </BottomFloatingBarContainer>
    </BottomFloatingBar>
  );
}
