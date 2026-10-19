"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import Button from "@/app/components/Button";
import { useGuestStore } from "@/app/store/useGuestStore";
import { cn } from "@/lib/utils/cn";

// Decision 2026-10-19: a short swipe-through on the first visit, before the three choices.
// PLACEHOLDER copy and drawings, drafted for the owner to replace (see the Phase 10b log).
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

const SWIPE_PX = 50;

export default function IntroPage() {
  const router = useRouter();
  const markIntroSeen = useGuestStore((s) => s.markIntroSeen);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = index === INTRO_SLIDES.length - 1;
  const { icon: Icon, title, text } = INTRO_SLIDES[index];

  const finish = () => {
    markIntroSeen();
    router.replace("/onboarding/role-select");
  };
  const go = (to: number) => setIndex(Math.min(Math.max(to, 0), INTRO_SLIDES.length - 1));

  return (
    <div
      className="flex flex-1 flex-col px-6 pb-10 pt-8"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex justify-end">
        {!last && (
          <button type="button" onClick={finish} className="text-sm font-semibold text-foreground-muted">
            Skip
          </button>
        )}
      </div>

      <section
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${INTRO_SLIDES.length}`}
        className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      >
        <div className="flex size-40 items-center justify-center rounded-full bg-main/10">
          <Icon size={72} className="text-main" aria-hidden />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] font-bold leading-[1.1] text-foreground">{title}</h1>
          <p className="text-[15px] leading-relaxed text-foreground-muted">{text}</p>
        </div>
      </section>

      <div className="mb-8 flex justify-center gap-2" role="tablist" aria-label="Slides">
        {INTRO_SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Slide ${i + 1}`}
            onClick={() => go(i)}
            className={cn("h-2 rounded-full transition-all", i === index ? "w-6 bg-main" : "w-2 bg-neutral-300")}
          />
        ))}
      </div>

      <Button onClick={() => (last ? finish() : go(index + 1))} outerRing roleType="buyer">
        {last ? "Get started" : "Next"}
      </Button>
    </div>
  );
}
