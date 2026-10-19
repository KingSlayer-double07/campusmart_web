import { create } from "zustand";
import { persist } from "zustand/middleware";

// The guest cart only (D14, guide 4.3.1). Signed in, the cart lives on the server: useCart() picks
// the right one, and AuthProvider merges this into the account's cart after sign-in.
export type CartItem = {
  id: string; // listing id
  variantId: string | null;
  name: string;
  priceKobo: number; // D3: whole kobo
  image: string | null;
  quantity: number;
  category: string;
  size: string; // the option's label, or "default" without options
  stockCount: number;
  sellerId?: string; // for grouping by store; older lines may lack it
  storeName?: string;
};

type CartStore = {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  increaseQty: (id: string, size: string) => void;
  decreaseQty: (id: string, size: string) => void;
  removeFromCart: (id: string, size: string) => void;
  removeMultipleFromCart: (keysToRemove: string[]) => void;
  setQuantity: (id: string, size: string, quantity: number) => void;
  getItemById: (id: string, size: string) => CartItem | undefined;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      cart: [],

      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find(
            (i) => i.id === item.id && i.size === item.size
          );

          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.id === item.id && i.size === item.size
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }

          return { cart: [...state.cart, item] };
        }),

      increaseQty: (id, size) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.id === id && item.size === size
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        })),

      decreaseQty: (id, size) =>
        set((state) => ({
          cart: state.cart
            .map((item) =>
              item.id === id && item.size === size
                ? { ...item, quantity: item.quantity - 1 }
                : item
            )
            .filter((item) => item.quantity > 0),
        })),

      removeFromCart: (id, size) =>
        set((state) => ({
          cart: state.cart.filter(
            (item) => !(item.id === id && item.size === size)
          ),
        })),

      removeMultipleFromCart: (keysToRemove) =>
        set((state) => ({
          cart: state.cart.filter(
            (item) => !keysToRemove.includes(`${item.id}|${item.size}`)
          ),
        })),

      setQuantity: (id, size, quantity) =>
        set((state) => ({
          cart: state.cart
            .map((item) => (item.id === id && item.size === size ? { ...item, quantity } : item))
            .filter((item) => item.quantity > 0),
        })),

      getItemById: (id, size) =>
        get().cart.find((i) => i.id === id && i.size === size),

    }),
    {
      name: "campus-mart-cart",
      // v0 held the mock catalogue's items (numeric ids, naira prices); they point nowhere now
      version: 1,
      migrate: () => ({ cart: [] }),
    }
  )
);

// Pure selector for total price calculation
export const selectTotalPrice = (state: CartStore) =>
  state.cart.reduce((total, item) => total + item.priceKobo * item.quantity, 0);
