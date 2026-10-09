import { create } from "zustand";
import { persist } from "zustand/middleware";

// Guide 4.3.3: only the chosen station's id is kept; the station itself comes from
// GET /pickup-stations, so a renamed or switched-off station is never shown stale.
type PickupStore = {
  selectedStationId: string | null;
  selectStation: (id: string) => void;
  clearSelectedStation: () => void;
};

export const usePickupStore = create<PickupStore>()(
  persist(
    (set) => ({
      selectedStationId: null,
      selectStation: (id) => set({ selectedStationId: id }),
      clearSelectedStation: () => set({ selectedStationId: null }),
    }),
    {
      name: "campus-mart-pickup",
      // v0 kept a whole mock station (ids "1"–"9"); nothing to carry over
      version: 1,
      migrate: () => ({ selectedStationId: null }),
    }
  )
);
