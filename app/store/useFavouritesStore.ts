import { create } from "zustand";
import { persist } from "zustand/middleware";

// Local favourites for now; Phase 8 replaces them with the server wishlist
export type FavouriteItem = {
  id: string; // listing id
  title: string;
  minPriceKobo: number;
  maxPriceKobo: number;
  imageUrl: string | null;
  categoryLabel: string;
};

type FavouritesStore = {
  favourites: FavouriteItem[];
  addFavourite: (item: FavouriteItem) => void;
  removeFavourite: (id: string) => void;
  toggleFavourite: (item: FavouriteItem) => void;
  isFavourited: (id: string) => boolean;
};

export const useFavouritesStore = create<FavouritesStore>()(
  persist(
    (set, get) => ({
      favourites: [],

      addFavourite: (item) =>
        set((state) => (state.favourites.some((f) => f.id === item.id) ? state : { favourites: [...state.favourites, item] })),

      removeFavourite: (id) => set((state) => ({ favourites: state.favourites.filter((f) => f.id !== id) })),

      toggleFavourite: (item) => {
        const { isFavourited, addFavourite, removeFavourite } = get();
        if (isFavourited(item.id)) removeFavourite(item.id);
        else addFavourite(item);
      },

      isFavourited: (id) => get().favourites.some((f) => f.id === id),
    }),
    {
      name: "campus-mart-favourites",
      // v0 held the mock catalogue's items (numeric ids, naira prices); they point nowhere now
      version: 1,
      migrate: () => ({ favourites: [] }),
    }
  )
);
