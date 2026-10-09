import React from "react";
import { CreditCard, Landmark, LucideIcon } from "lucide-react";
import Image from "next/image";
import type { PaymentMethod } from "@/lib/labels";

// Guide 4.3.4: each option is a PaymentMethod the API understands, never a numeric id
export interface PaymentOption {
  id: PaymentMethod;
  title: string;
  Icon?: LucideIcon;
  subLogos?: React.ReactNode;
  rightLogo?: React.ReactNode;
}

export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "CARD",
    title: "Card",
    Icon: CreditCard,
    subLogos: (
      <div className="flex gap-1 items-center ml-1">
        <Image src="/Visa_Inc.png" alt="Visa" width={36} height={12} className="object-contain h-4 w-auto" />
        <Image src="/Mastercard.png" alt="Mastercard" width={32} height={20} className="object-contain h-5 w-auto" />
        <Image src="/Verve_Card.png" alt="Verve" width={40} height={16} className="object-contain h-4 w-auto" />
      </div>
    ),
  },
  { 
    id: "BANK_TRANSFER",
    title: "Bank transfer",
    Icon: Landmark 
  },
  { 
    id: "OPAY",
    title: "OPay",
    rightLogo: (
      <Image src="/OPay.png" alt="OPay" width={52} height={20} className="object-contain h-6 w-auto" />
    ) 
  },
  { 
    id: "PALMPAY",
    title: "PalmPay",
    rightLogo: (
      <Image src="/palmpay.png" alt="PalmPay" width={52} height={20} className="object-contain h-6 w-auto" />
    ) 
  },
];
