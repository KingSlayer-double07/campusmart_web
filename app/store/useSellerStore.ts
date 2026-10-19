import { create } from "zustand";
import type { AnalyticsRange } from "@/lib/api/analytics";

// UI state only: the range the seller picked, shared by the dashboard and analytics (guide 7.2).
// The numbers come from the API (useSellerStats); the online switch lives on the server.
export type SellerStore = {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
};

export const useSellerStore = create<SellerStore>()((set) => ({
  range: "7d",
  setRange: (range) => set({ range }),
}));
