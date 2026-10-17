import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const cartApi = vi.hoisted(() => ({ get: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), merge: vi.fn() }));
const buyerOrdersApi = vi.hoisted(() => ({
  pickupStations: vi.fn(),
  campusPlaces: vi.fn(),
  checkout: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/lib/api/checkout", () => ({ cartApi, buyerOrdersApi }));
const me = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/auth", () => ({ authApi: { me } }));

import { useAuthStore } from "@/app/store/useAuthStore";
import { ApiError } from "@/lib/api/client";
import CheckoutPage from "./page";

const user = { id: "u1", emailVerifiedAt: "2026-10-01T00:00:00Z", phone: "+234 801 234 5678" };
const line = (id: string, title: string, unitPriceKobo: number, quantity = 1) => ({
  id,
  listing: { id: `l-${id}`, title, imageUrl: null, category: "TECH" },
  variant: null,
  quantity,
  unitPriceKobo,
  available: true,
  maxQuantity: 5,
});
// Tunde only sends by rider; Ada also lets buyers collect from her
const tunde = { seller: { id: "s1", storeName: "Tunde Tech", pickupArea: null }, subtotalKobo: 900_000, items: [line("c1", "Desk lamp", 450_000, 2)] };
const ada = { seller: { id: "s2", storeName: "Ada Wears", pickupArea: "Moremi Hall" }, subtotalKobo: 1_200_000, items: [line("c2", "Ankara dress", 1_200_000)] };
const cartOf = (groups: object[], campusDeliveryFeeKobo: number | null = 50_000) => ({
  groups,
  subtotalKobo: (groups as { subtotalKobo: number }[]).reduce((sum, g) => sum + g.subtotalKobo, 0),
  itemCount: (groups as { items: { quantity: number }[] }[]).reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0),
  issues: [],
  campusDeliveryFeeKobo,
});
const places = [
  { id: "p1", name: "Faculty of Science" },
  { id: "p2", name: "Main Gate" },
];

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CheckoutPage />
    </QueryClientProvider>,
  );
}

const pay = async (count: number, method = "Card") => {
  fireEvent.click(screen.getByRole("radio", { name: method }));
  fireEvent.click(screen.getByRole("button", { name: `Proceed to Pay (${count})` }));
};
const placed = { orderId: "o1", totalKobo: 950_000, authorizationUrl: null, reference: null };

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: user as never });
    me.mockResolvedValue(user);
    cartApi.get.mockResolvedValue(cartOf([tunde]));
    buyerOrdersApi.campusPlaces.mockResolvedValue(places);
    buyerOrdersApi.checkout.mockResolvedValue(placed);
  });
  afterEach(cleanup);

  it("by rider to a campus place: one fee on top, the saved phone, then the order", async () => {
    renderCheckout();
    await screen.findByRole("option", { name: "Faculty of Science" });
    expect(screen.queryByRole("radio", { name: "Pick up from the seller" })).toBeNull();
    expect(screen.getByText("This store only sends by rider.")).toBeTruthy();
    // Items ₦9,000 plus the ₦500 campus fee
    expect(screen.getAllByText("₦9,500").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Phone number for the rider") as HTMLInputElement).value).toBe("+234 801 234 5678");

    fireEvent.change(screen.getByLabelText("Place on campus"), { target: { value: "p1" } });
    await pay(2, "Bank transfer");

    await waitFor(() => expect(buyerOrdersApi.checkout).toHaveBeenCalled());
    const body = buyerOrdersApi.checkout.mock.calls[0][0];
    expect(body).toMatchObject({
      stores: [{ sellerId: "s1", method: "DISPATCH" }],
      destination: { campusPlaceId: "p1" },
      phone: "+234 801 234 5678",
      paymentMethod: "BANK_TRANSFER",
    });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/order-confirmation?orderId=o1&payment=unavailable"));
  });

  it("asks where on campus and for a valid phone before calling the API", async () => {
    useAuthStore.setState({ user: { ...user, phone: null } as never });
    me.mockResolvedValue({ ...user, phone: null });
    renderCheckout();
    await screen.findByRole("option", { name: "Faculty of Science" });
    await pay(2);
    expect(await screen.findByText("Choose where on campus")).toBeTruthy();
    expect(screen.getByText("Add a phone number so the rider can call you")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Phone number for the rider"), { target: { value: "call me" } });
    fireEvent.click(screen.getByRole("button", { name: "Proceed to Pay (2)" }));
    expect(await screen.findByText(/Enter a phone number such as/)).toBeTruthy();
    expect(buyerOrdersApi.checkout).not.toHaveBeenCalled();
  });

  it("off campus: the typed address, and the fee is agreed with the rider", async () => {
    renderCheckout();
    fireEvent.click(await screen.findByRole("radio", { name: "Off campus" }));
    expect(screen.getByText("Agreed with the rider")).toBeTruthy();
    expect(screen.getAllByText("₦9,000").length).toBeGreaterThan(0);

    await pay(2);
    expect(await screen.findByText("Enter the address the rider should bring it to")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Address off campus"), { target: { value: " 14 Akoka Road, Yaba " } });
    fireEvent.click(screen.getByRole("button", { name: "Proceed to Pay (2)" }));

    await waitFor(() => expect(buyerOrdersApi.checkout).toHaveBeenCalled());
    expect(buyerOrdersApi.checkout.mock.calls[0][0]).toMatchObject({
      destination: { address: "14 Akoka Road, Yaba" },
      phone: "+234 801 234 5678",
    });
  });

  it("picking up from the only store needs no destination, phone or fee", async () => {
    cartApi.get.mockResolvedValue(cartOf([ada]));
    renderCheckout();
    const store = await screen.findByRole("radiogroup", { name: "How Ada Wears reaches you" });
    fireEvent.click(within(store).getByRole("radio", { name: "Pick up from the seller" }));
    expect(screen.getByText(/Moremi Hall · free/)).toBeTruthy();
    expect(screen.queryByText("Where should the rider bring it?")).toBeNull();
    expect(screen.queryByText("Delivery", { selector: "span" })).toBeNull();

    await pay(1);
    await waitFor(() => expect(buyerOrdersApi.checkout).toHaveBeenCalled());
    const body = buyerOrdersApi.checkout.mock.calls[0][0];
    expect(body.stores).toEqual([{ sellerId: "s2", method: "SELLER_PICKUP" }]);
    expect(body).not.toHaveProperty("destination");
    expect(body).not.toHaveProperty("phone");
  });

  it("two stores by rider pay one fee", async () => {
    cartApi.get.mockResolvedValue(cartOf([tunde, ada]));
    renderCheckout();
    await screen.findByRole("option", { name: "Main Gate" });
    // ₦9,000 + ₦12,000 + one ₦500 fee
    expect(screen.getAllByText("₦21,500").length).toBeGreaterThan(0);
    expect(screen.getByText(/One delivery fee/)).toBeTruthy();
  });

  it("without a campus fee, only off campus is offered", async () => {
    cartApi.get.mockResolvedValue(cartOf([tunde], null));
    renderCheckout();
    const campus = await screen.findByRole("radio", { name: "On campus" });
    expect(campus.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("radio", { name: "Off campus" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/isn't available at your school yet/)).toBeTruthy();
  });

  it("on OUT_OF_STOCK, refetches the cart and says which item", async () => {
    buyerOrdersApi.checkout.mockRejectedValue(new ApiError(409, "OUT_OF_STOCK", "Desk lamp: only 1 left", { listingId: "l1", available: 1 }));
    renderCheckout();
    fireEvent.click(await screen.findByRole("radio", { name: "Off campus" }));
    fireEvent.change(screen.getByLabelText("Address off campus"), { target: { value: "14 Akoka Road, Yaba" } });
    await pay(2);
    expect(await screen.findByText("Desk lamp: only 1 left")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review cart" }).getAttribute("href")).toBe("/cart");
    await waitFor(() => expect(cartApi.get).toHaveBeenCalledTimes(2));
  });

  it("won't pay while an item can't be bought", async () => {
    cartApi.get.mockResolvedValue({
      ...cartOf([tunde]),
      issues: [{ itemId: "c1", listingId: "l1", type: "OUT_OF_STOCK", message: "Sold out", available: 0, previousPriceKobo: null, currentPriceKobo: null }],
    });
    renderCheckout();
    expect(await screen.findByText("Some items changed")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proceed to Pay (2)" }).hasAttribute("disabled")).toBe(true);
  });
});
