"use client";

import { useState, useEffect } from "react";
import { Check, Copy, MapPin } from "lucide-react";
import PageHeader from "../components/PageHeader";
import { usePickupStore } from "../store/usePickupStore";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import type { PickupStation } from "@/lib/api/checkout";
import { usePickupStations } from "@/lib/api/hooks/useBuyerOrders";
import { summarizeOpeningHours } from "@/lib/openingHours";

export default function PickupStationPage() {
  const router = useRouter();
  const { selectedStationId, selectStation } = usePickupStore();
  const stations = usePickupStations();
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLocalSelectedId(selectedStationId);
  }, [selectedStationId]);

  if (!mounted) return null;

  const list = stations.data ?? [];
  const localSelected = list.find((s) => s.id === localSelectedId) ?? null;

  const handleSelect = (station: PickupStation) => {
    setLocalSelectedId((prev) => (prev === station.id ? null : station.id));
  };

  const handleConfirm = () => {
    if (localSelected) {
      selectStation(localSelected.id);
      router.back();
    }
  };

  const handleCopy = (text: string) => {
    const succeed = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(succeed).catch(() => fallbackCopy(text, succeed));
    } else {
      fallbackCopy(text, succeed);
    }
  };

  const fallbackCopy = (text: string, onSuccess: () => void) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      onSuccess();
    } catch (_) {}
    document.body.removeChild(ta);
  };

  return (
    <>
      <main className="pb-0 pt-8">
        {/* Page header */}
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-5">
            <PageHeader title="Select Pickup Station" />
          </div>
          <div className="w-full h-0.5 rounded-full bg-neutral-200" />
        </div>

        {/* Station list */}
        <div className="flex flex-col gap-3 px-5 pb-32">
          {stations.isPending && (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading pickup stations">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-muted" />
              ))}
            </div>
          )}
          {stations.isError && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="font-medium text-foreground">We couldn&apos;t load the pickup stations</p>
              <p className="text-sm text-foreground-muted">
                {stations.error instanceof ApiError && stations.error.status === 403
                  ? stations.error.message
                  : "Check your connection and try again."}
              </p>
              <button type="button" onClick={() => stations.refetch()} className="text-sm font-semibold text-main">
                Try again
              </button>
            </div>
          )}
          {stations.isSuccess && list.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MapPin size={24} className="text-main" />
              <p className="font-medium text-foreground">No pickup stations yet</p>
              <p className="text-sm text-foreground-muted">
                Your school doesn&apos;t have a pickup station on CampusMart yet, so orders can&apos;t be placed. Please check back soon.
              </p>
            </div>
          )}
          {list.map((station) => {
            const isSelected = localSelected?.id === station.id;

            return (
              <div
                key={station.id}
                role="button"
                aria-pressed={isSelected}
                aria-label={station.name}
                tabIndex={0}
                onClick={() => handleSelect(station)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSelect(station)}
                className="w-full text-left cursor-pointer"
              >
                <div
                  className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                    isSelected
                      ? "border-border-default shadow-lg/7"
                      : "border-border-default bg-surface-muted"
                  }`}
                >
                  {/* Top row — radio + name + address */}
                  <div className="flex gap-3 items-start p-4">
                    {/* Radio circle */}
                    <div className="shrink-0 mt-0.5">
                      {isSelected ? (
                        <div className="size-6 rounded-full bg-main flex items-center justify-center shadow-md shadow-orange-200">
                          <Check size={13} color="white" strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="size-6 rounded-full border-2 border-border-default bg-card" />
                      )}
                    </div>

                    {/* Name + address */}
                    <div className="flex flex-col gap-0.5">
                      <p className="font-semibold text-sm leading-tight text-foreground">
                        {station.name}
                      </p>
                      <p className="text-xs text-foreground-muted leading-relaxed">
                        {station.address}
                      </p>
                    </div>
                  </div>

                  {/* Expanded dropdown when selected */}
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      isSelected ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="mx-4 mb-4 border-t border-border-default pt-3 flex flex-col gap-3">
                      {/* Contact Information */}
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-semibold text-foreground">
                          Contact Information
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {station.contactName}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-foreground-muted">
                            {station.contactPhone}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(station.contactPhone);
                            }}
                            className="text-main transition-transform active:scale-90"
                            aria-label="Copy phone number"
                          >
                            {copied ? (
                              <Check size={16} strokeWidth={2.5} />
                            ) : (
                              <Copy size={16} strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Opening Hours */}
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-semibold text-foreground">
                          Opening Hours
                        </p>
                        {summarizeOpeningHours(station.openingHours).map((line) => (
                          <p key={line.days} className="text-xs text-foreground-muted">
                            {line.days}: {line.hours}
                          </p>
                        ))}
                        {station.openingHours.length < 7 && (
                          <p className="text-xs text-foreground-muted">Closed on other days</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Sticky confirm button */}
      <main className="fixed bottom-0 left-0 right-0 flex justify-center pb-6 font-dmSans tracking-tight z-50">
        <div className="backdrop-blur-xs flex justify-center items-center py-2 px-2 rounded-full border border-border-default w-[80%] bg-card/30 max-w-sm gap-2">
          <div className="w-full flex justify-center">
            <p className="text-foreground font-medium text-sm truncate px-2">
              {localSelected ? localSelected.name : "No station selected"}
            </p>
          </div>
          <button
            className="w-full h-10 rounded-full border bg-main border-border-default disabled:opacity-40 transition-all duration-300"
            onClick={handleConfirm}
            disabled={!localSelected}
          >
            <p className="font-medium text-sm text-white">Confirm</p>
          </button>
        </div>
      </main>
    </>
  );
}
