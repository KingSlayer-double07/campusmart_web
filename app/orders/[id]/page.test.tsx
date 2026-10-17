import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "o1" }), useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
const buyerOrdersApi = vi.hoisted(() => ({ pickupStations: vi.fn(), checkout: vi.fn(), list: vi.fn(), get: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));
const paymentsApi = vi.hoisted(() => ({ config: vi.fn(), pay: vi.fn() }));
vi.mock("@/lib/api/payments", () => ({ paymentsApi }));

import { ApiError } from "@/lib/api/client";
import OrderDetailPage from "./page";

const sellerOrder = (overrides: object = {}) => ({
  id: "so1",
  code: "CM-7F3K2Q",
  collectionCode: "048213",
  seller: { id: "s1", storeName: "Tunde Tech" },
  fulfillmentStatus: "AWAITING_DROPOFF",
  subtotalKobo: 900_000,
  itemCount: 2,
  imageUrl: null,
  dropOffDeadline: null,
  droppedOffAt: null,
  collectedAt: null,
  cancelledAt: null,
  cancelReason: null,
  items: [{ id: "i1", listingId: "l1", variantId: null, title: "Desk lamp", variantLabel: null, imageUrl: null, unitPriceKobo: 450_000, quantity: 2 }],
  ...overrides,
});
const order = (overrides: object = {}, so: object = {}) => ({
  id: "o1",
  status: "PAID",
  paymentMethod: "CARD",
  subtotalKobo: 900_000,
  totalKobo: 900_000,
  createdAt: "2026-10-09T10:00:00Z",
  expiresAt: "2026-10-09T10:30:00Z",
  paidAt: "2026-10-09T10:05:00Z",
  pickupStation: {
    id: "st1",
    name: "Library Pickup Point",
    address: "Main library",
    contactName: "Mr Bello",
    contactPhone: "+234 801 234 5678",
    openingHours: [{ day: "MON", open: "09:00", close: "17:00" }],
  },
  sellerOrders: [sellerOrder(so)],
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderDetailPage />
    </QueryClientProvider>,
  );
}

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentsApi.config.mockResolvedValue({ paymentsEnabled: false, methods: ["CARD", "BANK_TRANSFER"] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Pay now opens a fresh Paystack page for an unpaid order (P7)", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    paymentsApi.config.mockResolvedValue({ paymentsEnabled: true, methods: ["CARD", "BANK_TRANSFER"] });
    paymentsApi.pay.mockResolvedValue({ authorizationUrl: "https://checkout.paystack.com/xyz", reference: "CM_o1_2" });
    buyerOrdersApi.get.mockResolvedValue(order({ status: "PENDING_PAYMENT", paidAt: null }, { fulfillmentStatus: "PENDING" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pay ₦9,000 now" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.paystack.com/xyz"));
    expect(paymentsApi.pay).toHaveBeenCalledWith("o1");
  });

  it("says why Pay now didn't work, and hides it while payment is off", async () => {
    paymentsApi.config.mockResolvedValue({ paymentsEnabled: true, methods: ["CARD", "BANK_TRANSFER"] });
    paymentsApi.pay.mockRejectedValue(new ApiError(409, "ORDER_NOT_PAYABLE", "This order can't be paid any more"));
    buyerOrdersApi.get.mockResolvedValue(order({ status: "PENDING_PAYMENT", paidAt: null }, { fulfillmentStatus: "PENDING" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pay ₦9,000 now" }));
    expect(await screen.findByText("Couldn't open the payment page")).toBeTruthy();
    expect(screen.getByText("This order can't be paid any more")).toBeTruthy();
    cleanup();

    paymentsApi.config.mockResolvedValue({ paymentsEnabled: false, methods: ["CARD", "BANK_TRANSFER"] });
    renderPage();
    expect(await screen.findByText(/Online payment isn't switched on yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pay .* now/ })).toBeNull();
  });

  it("a paid delivery waits for a rider; a refunded store says so", async () => {
    buyerOrdersApi.get.mockResolvedValue(
      order({
        pickupStation: null,
        destination: { campusPlace: { id: "p1", name: "Faculty of Science" }, address: null },
        deliveryFeeKobo: 50_000,
        buyerPhone: "+234 801 234 5678",
        sellerOrders: [
          sellerOrder({ deliveryMethod: "DISPATCH", fulfillmentStatus: "AWAITING_RIDER" }),
          sellerOrder({ id: "so2", code: "CM-ABC234", seller: { id: "s2", storeName: "Ada Wears" }, deliveryMethod: "DISPATCH", fulfillmentStatus: "CANCELLED", cancelReason: "SELLER_CANCELLED" }),
        ],
      }),
    );
    renderPage();
    expect(await screen.findByText(/Waiting for a rider/)).toBeTruthy();
    expect(screen.getByText(/Cancelled and refunded/)).toBeTruthy();
  });

  it("shows the per-seller timeline, and the collection code only once dropped off", async () => {
    buyerOrdersApi.get.mockResolvedValue(order());
    renderPage();
    expect(await screen.findByText("CM-7F3K2Q")).toBeTruthy();
    expect(screen.queryByText("048213")).toBeNull();
    expect(screen.getByText("Drop-off").closest("li")?.getAttribute("aria-current")).toBe("step");
    cleanup();

    buyerOrdersApi.get.mockResolvedValue(order({}, { fulfillmentStatus: "DROPPED_OFF" }));
    renderPage();
    expect(await screen.findByText("048213")).toBeTruthy();
    expect(screen.getByText("Your collection code")).toBeTruthy();
    expect(screen.getByText("Ready for pickup").closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("delivery orders show where the rider goes, and a pickup seller's address only once paid", async () => {
    const delivered = {
      pickupStation: null,
      destination: { campusPlace: { id: "p1", name: "Faculty of Science" }, address: null },
      deliveryFeeKobo: 50_000,
      buyerPhone: "+234 801 234 5678",
    };
    const pickup = (paid: boolean) =>
      sellerOrder({
        id: "so2",
        code: "CM-ABC234",
        seller: { id: "s2", storeName: "Ada Wears" },
        deliveryMethod: "SELLER_PICKUP",
        fulfillmentStatus: "PENDING",
        pickupFrom: { area: "Moremi Hall", address: paid ? "Room 12, Block B" : null, phone: paid ? "+234 809 000 0000" : null },
      });
    buyerOrdersApi.get.mockResolvedValue(
      order(
        { ...delivered, status: "PENDING_PAYMENT", paidAt: null, sellerOrders: [sellerOrder({ deliveryMethod: "DISPATCH", fulfillmentStatus: "PENDING" }), pickup(false)] },
      ),
    );
    renderPage();
    expect(await screen.findByText("Delivery to Faculty of Science")).toBeTruthy();
    expect(screen.getByText(/Delivery fee ₦500, once for the whole order/)).toBeTruthy();
    expect(screen.getByText("The rider will call +234 801 234 5678")).toBeTruthy();
    expect(screen.getByText("Delivered by a rider")).toBeTruthy();
    expect(screen.getByText("You pick up from the seller · Moremi Hall")).toBeTruthy();
    expect(screen.getByText(/show once you've paid/)).toBeTruthy();
    expect(screen.queryByText("Room 12, Block B")).toBeNull();
    expect(screen.queryByRole("region", { name: "Pickup station" })).toBeNull();
    cleanup();

    buyerOrdersApi.get.mockResolvedValue(order({ ...delivered, sellerOrders: [pickup(true)] }));
    renderPage();
    expect(await screen.findByText("Room 12, Block B")).toBeTruthy();
    expect(screen.getByRole("link", { name: /\+234 809 000 0000/ }).getAttribute("href")).toBe("tel:+2348090000000");
  });

  it("cancels an unpaid order after asking", async () => {
    const cancelled = order({ status: "CANCELLED", paidAt: null }, { fulfillmentStatus: "CANCELLED", cancelReason: "BUYER_CANCELLED" });
    buyerOrdersApi.get
      .mockResolvedValueOnce(order({ status: "PENDING_PAYMENT", paidAt: null }, { fulfillmentStatus: "PENDING" }))
      .mockResolvedValue(cancelled);
    buyerOrdersApi.cancel.mockResolvedValue(cancelled);
    renderPage();
    expect(await screen.findByText(/Waiting for payment/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() => expect(buyerOrdersApi.cancel).toHaveBeenCalledWith("o1"));
    expect(await screen.findByText("Order cancelled")).toBeTruthy();
    expect(await screen.findByText("Cancelled by you")).toBeTruthy();
  });

  it("says when the order isn't yours or can't load", async () => {
    buyerOrdersApi.get.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Order not found"));
    renderPage();
    expect(await screen.findByText("We can't find this order")).toBeTruthy();
    cleanup();

    buyerOrdersApi.get.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    renderPage();
    expect(await screen.findByText("We couldn't load this order")).toBeTruthy();
  });
});
