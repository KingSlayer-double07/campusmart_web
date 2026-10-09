import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SellerStats = {
  views: number;
  viewsChange: number;
  orders: number;
  ordersChange: number;
  totalSales: number;
  totalSalesChange: number;
};

// UI state only. The online switch lives on the server (PATCH /sellers/me, guide 3.2.8);
// the dashboard numbers become real in Phase 7 and this store goes away then.
export type SellerStore = {
  stats: SellerStats;
  setStats: (stats: Partial<SellerStats>) => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSellerStore = create<SellerStore>()((set) => ({
  stats: {
    views: 1204,
    viewsChange: 12,
    orders: 15,
    ordersChange: 5,
    totalSales: 364500,
    totalSalesChange: -2,
  },
  setStats: (partial) => set((state) => ({ stats: { ...state.stats, ...partial } })),
}));
