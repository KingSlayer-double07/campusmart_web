export type DeviceKind = "phone" | "tablet" | "desktop";

// A readable "Chrome on Android" style label for the Active Sessions page. Heuristic on purpose.
export function describeUserAgent(ua: string | null | undefined): { label: string; kind: DeviceKind } {
  if (!ua) return { label: "Unknown device", kind: "desktop" };

  const os = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;

  const kind: DeviceKind =
    /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
      ? "tablet"
      : /Mobile|iPhone/.test(ua)
        ? "phone"
        : "desktop";

  const label = browser && os ? `${browser} on ${os}` : (browser ?? os ?? "Unknown device");
  return { label, kind };
}
