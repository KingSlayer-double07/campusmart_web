import { Bike, ShieldCheck, Store, type LucideIcon } from "lucide-react";

// Decision 2026-10-19: a short swipe-through on the first visit, before the three choices.
// PLACEHOLDER copy and drawings, drafted for the owner to replace (see the Phase 10b log).
// Kept out of page.tsx: a Next.js page may only export the page and its own config.
export const INTRO_SLIDES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Store,
    title: "Your campus marketplace",
    text: "See what students at your school are selling: fashion, food, tech, services and more.",
  },
  {
    icon: ShieldCheck,
    title: "Pay with peace of mind",
    text: "We hold your payment until you have your order, and you get 48 hours to report a problem.",
  },
  {
    icon: Bike,
    title: "Delivered on campus",
    text: "A CampusMart rider brings your order to you, or you collect it from the seller.",
  },
];
