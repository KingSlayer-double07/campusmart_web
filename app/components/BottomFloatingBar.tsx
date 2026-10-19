import React from 'react';

interface BottomFloatingBarProps {
  children: React.ReactNode;
  zIndex?: number;
  className?: string;
}

export default function BottomFloatingBar({ children, zIndex = 50, className = '' }: BottomFloatingBarProps) {
  return (
    <nav className={`fixed bottom-0 left-0 right-0 flex flex-col gap-2 items-center pb-6 font-dmSans tracking-tight z-${zIndex} ${className}`}>
      {children}
    </nav>
  );
}

export function BottomFloatingBarContainer({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`backdrop-blur-xs flex justify-center items-center py-2 px-2 rounded-full border border-border-default w-[90%] sm:w-[80%] bg-card/30 max-w-sm sm:max-w-md ${className}`}>
      {children}
    </div>
  );
}
