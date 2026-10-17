"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Guide 6.6: the seller-order code as a QR, so the rider can scan it (DX5). The code is printed
// beside it, since typing always works.
export default function CodeQr({ value, size = 160 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) return <div style={{ width: size, height: size }} className="rounded-lg bg-surface-muted" aria-hidden="true" />;
  return (
    <div
      role="img"
      aria-label={`QR code for ${value}`}
      style={{ width: size, height: size }}
      className="rounded-lg bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
