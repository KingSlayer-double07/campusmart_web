import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const buyerOrdersApi = vi.hoisted(() => ({ pickupStations: vi.fn() }));
vi.mock("@/lib/api/checkout", () => ({ buyerOrdersApi, cartApi: {} }));

import { usePickupStore } from "@/app/store/usePickupStore";
import PickupStationPage from "./page";

const station = (id: string, name: string) => ({
  id,
  name,
  address: `${name} address`,
  contactName: "Mr Bello",
  contactPhone: "+234 801 234 5678",
  openingHours: [
    { day: "MON", open: "09:00", close: "17:00" },
    { day: "TUE", open: "09:00", close: "17:00" },
    { day: "SAT", open: "10:00", close: "14:00" },
  ],
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PickupStationPage />
    </QueryClientProvider>,
  );
}

describe("PickupStationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePickupStore.setState({ selectedStationId: null });
  });
  afterEach(cleanup);

  it("lists the school's stations with their hours and keeps only the chosen id", async () => {
    buyerOrdersApi.pickupStations.mockResolvedValue([station("st1", "Hostel Gate"), station("st2", "Library Pickup Point")]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Library Pickup Point" }));
    expect(screen.getAllByText("Mon–Tue: 09:00–17:00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sat: 10:00–14:00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(usePickupStore.getState().selectedStationId).toBe("st2");
    expect(router.back).toHaveBeenCalled();
  });

  it("explains when the school has no stations yet", async () => {
    buyerOrdersApi.pickupStations.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No pickup stations yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled")).toBe(true);
  });
});
