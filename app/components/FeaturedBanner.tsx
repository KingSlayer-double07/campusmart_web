"use client";
import { featuredDisplays } from "./data";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function FeaturedBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const featured = featuredDisplays[currentIndex];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % featuredDisplays.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) =>
      prev === 0 ? featuredDisplays.length - 1 : prev - 1
    );
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleNext();
    }
    if (isRightSwipe) {
      handlePrev();
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  return (
    <section className="flex flex-col gap-2 bg-card py-4 px-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">Featured</p>
      </div>
      
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative"
      >
        <Link href={featured.ctaLink || "/"}>
          <div
            className={`relative w-full h-44 rounded-lg overflow-hidden bg-gradient-to-r ${featured.backgroundColor} flex items-end justify-between p-4`}
          >
            {featured.image && (
              <Image
                src={featured.image}
                alt={featured.title}
                fill
                className="absolute inset-0 object-cover opacity-60"
              />
            )}
            <div className="relative z-10 flex flex-col gap-1 flex-1">
              <p className={`${featured.textColor} text-lg font-semibold leading-tight`}>
                {featured.title}
              </p>
              <p className={`${featured.textColor} text-xs opacity-90`}>
                {featured.subtitle}
              </p>
            </div>
            <button
              className={`relative z-10 ${featured.textColor} flex items-center gap-1 px-3 py-1.5 rounded-full border border-current bg-card/10 backdrop-blur-sm hover:bg-card/20 transition text-xs font-medium`}
              onClick={(e) => {
                e.preventDefault();
              }}
            >
              {featured.ctaText}
              <ChevronRight size={14} />
            </button>
          </div>
        </Link>

        {/* Progress bar moved to bottom middle */}
        <div className="flex gap-1 justify-center mt-4">
          {featuredDisplays.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex
                  ? "bg-main w-6"
                  : "bg-neutral-300 w-1"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}