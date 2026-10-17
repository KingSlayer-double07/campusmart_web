"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

interface DetectedCode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

// The BarcodeDetector API exists on Chrome for Android, not everywhere (guide 6.6)
export function scanningSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

// Reads a QR code with the camera and hands back its text. Typing the code always works too.
export default function CodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        timer = setInterval(async () => {
          if (!video.current) return;
          try {
            const [found] = await detector.detect(video.current);
            if (found?.rawValue) {
              stopped = true;
              onCode(found.rawValue);
            }
          } catch {
            // a frame that couldn't be read; try the next one
          }
        }, 300);
      })
      .catch(() => setError("We couldn't open the camera. Type the code instead."));

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Stop scanning"
          className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"
        >
          <X size={16} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-500">
          {error}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-foreground-muted">
          <Camera size={14} /> Point the camera at the QR code on the seller’s screen
        </p>
      )}
    </div>
  );
}
