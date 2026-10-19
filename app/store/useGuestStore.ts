import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GuestSchool = { id: string; name: string };

// Decision 2026-10-19: a visitor browses without an account at a school they pick, and sees the
// intro slides once. Both stay on this phone; the school is offered when they sign up.
type GuestStore = {
  school: GuestSchool | null;
  introSeen: boolean;
  setSchool: (school: GuestSchool) => void;
  clearSchool: () => void;
  markIntroSeen: () => void;
};

export const useGuestStore = create<GuestStore>()(
  persist(
    (set) => ({
      school: null,
      introSeen: false,
      setSchool: (school) => set({ school }),
      clearSchool: () => set({ school: null }),
      markIntroSeen: () => set({ introSeen: true }),
    }),
    { name: "campus-mart-guest" },
  ),
);
