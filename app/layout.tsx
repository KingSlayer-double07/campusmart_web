import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import PWAInstallPrompt from "./components/PWAInstallPrompt";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import { Analytics } from "@vercel/analytics/next";
import Providers from "./providers";
import AuthProvider from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import AppFrame from "./components/AppFrame";

const satoshi = localFont({
  src: [
    // { path: './localFonts/Satoshi-Light.otf', weight: '300', style: 'normal' },
    { path: "./localFonts/Satoshi-Medium.otf", weight: "500", style: "normal" },
    { path: "./localFonts/Satoshi-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi", // This creates a CSS variable
  display: "swap", // Ensures text is visible during load
});

const jost = localFont({
  src: "./localFonts/Jost-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Campusmart",
  description:
    "Campusmart - The ultimate marketplace for students. Buy and sell items easily within your campus community.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Campusmart",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ff681f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${jost.variable} ${satoshi.variable} antialiased`}
      >
        <ServiceWorkerRegister />
        <PWAInstallPrompt />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppFrame>
            <Providers>
              <AuthProvider>
                {children}
              </AuthProvider>
            </Providers>
          </AppFrame>
        </ThemeProvider>
        {/* vercel analytics to monitor metrics. cos why not */}
        <Analytics />
      </body>
    </html>
  );
}
