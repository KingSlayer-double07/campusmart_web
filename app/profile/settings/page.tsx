"use client";

import { useState, useEffect } from "react";
import { Moon, Sun, Settings } from "lucide-react";
import Nav from "../../components/nav";
import PageHeader from "../../components/PageHeader";
import PageHero from "../../components/PageHero";
import ActionListItem from "../../components/ActionListItem";
import BottomSheet from "../../components/BottomSheet";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useToast, ToastContainer } from "../../components/Toast";
import { settingGroups } from "../../lib/data";

/* ─────────────────────────────────────────────
   Dark Mode confirmation sheet
───────────────────────────────────────────── */
function DarkModeSheet({
  isOpen,
  darkMode,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  darkMode: boolean;
  onConfirm: (pick: "light" | "dark") => void;
  onCancel: () => void;
}) {
  const [pick, setPick] = useState<"light" | "dark">(!darkMode ? "dark" : "light");

  return (
    <BottomSheet isOpen={isOpen} onClose={onCancel}>
      <div className="px-6 pt-4 pb-8 flex flex-col items-center gap-5">
        {/* Icon */}
        <div className="size-16 rounded-full bg-seller-card flex items-center justify-center">
          <Moon size={28} className="text-yellow-400" fill="#facc15" />
        </div>

        {/* Title + subtitle */}
        <div className="text-center">
          <h2 className="text-[18px] font-bold text-foreground">
            {darkMode ? "Switch to Light Mode?" : "Enable Dark Mode?"}
          </h2>
          <p className="text-sm text-foreground-muted mt-1 leading-relaxed">
            Switch to a darker theme that&apos;s easier on your eyes, especially at night.
          </p>
        </div>

        {/* Preview cards */}
        <div className="flex gap-3 w-full">
          {/* Light */}
          <button
            onClick={() => setPick("light")}
            className={`relative flex-1 rounded-2xl border-2 p-4 flex flex-col items-start gap-2 transition-all bg-card ${
              pick === "light" ? "border-main" : "border-border-default"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <div className="size-5 rounded-full bg-neutral-300 shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <div className="h-1.5 bg-neutral-200 rounded-full w-3/4" />
                <div className="h-1.5 bg-neutral-200 rounded-full w-1/2" />
              </div>
            </div>
            <p className="text-[11px] text-foreground-muted font-medium self-center mt-1">Light</p>
            {pick === "light" && (
              <div className="absolute top-2 right-2 size-5 rounded-full bg-main flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">✓</span>
              </div>
            )}
          </button>

          {/* Dark */}
          <button
            onClick={() => setPick("dark")}
            className={`relative flex-1 rounded-2xl border-2 p-4 flex flex-col items-start gap-2 transition-all bg-seller-card ${
              pick === "dark" ? "border-main" : "border-neutral-700"
            }`}
          >
            <div className="flex items-center gap-2 w-full">
              <div className="size-5 rounded-full bg-neutral-600 shrink-0" />
              <div className="flex flex-col gap-1 flex-1">
                <div className="h-1.5 bg-neutral-600 rounded-full w-3/4" />
                <div className="h-1.5 bg-neutral-600 rounded-full w-1/2" />
              </div>
            </div>
            <p className="text-[11px] text-foreground-muted font-medium self-center mt-1">Dark</p>
            {pick === "dark" && (
              <div className="absolute top-2 right-2 size-5 rounded-full bg-main flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">✓</span>
              </div>
            )}
          </button>
        </div>

        {/* Confirm */}
        <button
          onClick={() => onConfirm(pick)}
          className="w-full bg-seller-card text-white rounded-full py-3.5 font-semibold text-[15px] hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          {pick === "dark" ? <>🌙 Enable Dark Mode</> : <><Sun size={16} /> Stay in Light Mode</>}
        </button>

        {/* Secondary */}
        <button
          onClick={onCancel}
          className="w-full bg-surface-muted text-foreground-muted rounded-full py-3.5 font-semibold text-[15px] line-through hover:bg-neutral-200 transition-all"
        >
          {pick === "dark" ? "Stay in Light Mode" : "Enable Dark Mode"}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const { languageLabel, setDarkMode } = useSettingsStore(); // keep setDarkMode if other parts of app rely on it, otherwise we can just use useTheme
  const { theme, setTheme, resolvedTheme } = useTheme();
  const toast = useToast();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [showDarkMode, setShowDarkMode] = useState(false);

  const currentThemeIsDark = mounted ? (theme === "dark" || resolvedTheme === "dark") : false;

  const handleDarkModeConfirm = (pick: "light" | "dark") => {
    const enabling = pick === "dark";
    setTheme(pick);
    setDarkMode(enabling); // Sync with store if needed
    setShowDarkMode(false);
    if (enabling) {
      toast.dark("Dark Mode Enabled", "App theme has been switched to dark");
    } else {
      toast.info("Light Mode Enabled", "App theme has been switched to light");
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} duration={3500} />

      <main className="pb-28 pt-8 px-6">
        <PageHeader title="Settings" showBack={true} />

        <PageHero icon={Settings} title="Customize your App Experience" />

        <div className="flex flex-col gap-7">
          {settingGroups.map((group) => (
            <section key={group.title} className="flex flex-col gap-4">
              <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
                {group.title}
              </p>

              {group.items.map((item, itemIdx) => {
                const isLanguage = item.label === "Language";
                const isDarkMode = item.label === "Dark Mode";

                const desc = isLanguage
                  ? languageLabel
                  : isDarkMode
                  ? currentThemeIsDark ? "Dark theme enabled" : "Switch to dark theme"
                  : item.description;

                const rightElement = isDarkMode ? (
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      currentThemeIsDark ? "bg-seller-card text-yellow-400" : "bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {currentThemeIsDark ? "On" : "Off"}
                  </span>
                ) : undefined;

                return (
                  <div key={item.label} className="flex flex-col">
                    <ActionListItem
                      variant="plain"
                      icon={item.icon}
                      label={item.label}
                      description={desc}
                      href={isDarkMode ? null : item.href}
                      onClick={isDarkMode ? () => setShowDarkMode(true) : undefined}
                      rightElement={rightElement}
                    />
                    {itemIdx < group.items.length - 1 && (
                      <div className="h-px bg-surface-muted mt-2 mb-2" />
                    )}
                  </div>
                );
              })}
            </section>
          ))}

          {/* ── ABOUT ── */}
          <section className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-widest text-foreground-muted uppercase">
              About
            </p>
            <div className="flex items-center justify-between py-1">
              <p className="text-sm font-medium text-foreground">App Version</p>
              <p className="text-sm text-foreground-muted font-medium">v1.0</p>
            </div>
          </section>
        </div>
      </main>

      <Nav />

      {/* Dark mode sheet */}
      <DarkModeSheet
        isOpen={showDarkMode}
        darkMode={currentThemeIsDark}
        onConfirm={handleDarkModeConfirm}
        onCancel={() => setShowDarkMode(false)}
      />
    </>
  );
}
