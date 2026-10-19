import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsStore = {
  language: string;       // e.g. "en-us"
  languageLabel: string;  // e.g. "English (US)"
  darkMode: boolean;
  setLanguage: (code: string, label: string) => void;
  setDarkMode: (val: boolean) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      language: "en-us",
      languageLabel: "English (US)",
      darkMode: false,
      setLanguage: (code, label) => set({ language: code, languageLabel: label }),
      setDarkMode: (val) => set({ darkMode: val }),
    }),
    { name: "campusmart-settings" }
  )
);
