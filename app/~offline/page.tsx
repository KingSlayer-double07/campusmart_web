"use client";

import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export default function OfflineFallback() {
  return (
    <main className="flex flex-col items-center justify-center min-h-dvh bg-surface-muted px-6 text-center">
      <div className="bg-card p-8 rounded-2xl shadow-sm border border-border-default max-w-sm w-full flex flex-col items-center gap-4">
        <WifiOff className="w-12 h-12 text-main mb-2" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground tracking-tight">you&apos;re offline</h1>
        <p className="text-sm text-foreground-muted mb-4 leading-relaxed">
          It looks like you've lost your internet connection. But don&apos;t worry, parts of the app are still available offline!
        </p>
        <div className="flex flex-col w-full gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-main text-white py-3 rounded-full font-medium hover:brightness-105 active:scale-[0.98] transition-all"
          >
            Try Again
          </button>
          <Link href="/cart" className="w-full text-main font-medium py-3 rounded-full hover:bg-surface-muted active:scale-[0.98] transition-all border border-border-default">
            View Offline Cart
          </Link>
        </div>
      </div>
    </main>
  );
}

