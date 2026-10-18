import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const notificationsApi = vi.hoisted(() => ({
  list: vi.fn(),
  unreadCount: vi.fn(),
  markRead: vi.fn(),
  prefs: vi.fn(),
  setPrefs: vi.fn(),
}));
vi.mock("@/lib/api/notifications", () => ({ notificationsApi }));

import { useAuthStore } from "@/app/store/useAuthStore";
import NotificationBell from "./NotificationBell";
import NotificationsInbox from "./NotificationsInbox";

const note = (overrides: object = {}) => ({
  id: "n1",
  type: "ORDER_PAID",
  title: "Payment received",
  body: "Your order CM-ABC123 is paid",
  link: "/orders/o1",
  readAt: null,
  createdAt: "2026-10-18T10:00:00Z",
  ...overrides,
});

function renderWith(ui: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

describe("Notifications (guide 10, T7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationsApi.prefs.mockResolvedValue({ orderEmails: true });
    notificationsApi.markRead.mockResolvedValue({ count: 1 });
  });
  afterEach(cleanup);

  it("lists them, opens one's link and marks it read", async () => {
    notificationsApi.list.mockResolvedValue({ items: [note(), note({ id: "n2", title: "Old", readAt: "2026-10-17T10:00:00Z", link: null })], nextCursor: null });
    renderWith(<NotificationsInbox />);
    expect(await screen.findByText("1 unread")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Payment received/ }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenCalledWith(["n1"]));
    expect(router.push).toHaveBeenCalledWith("/orders/o1");
    fireEvent.click(screen.getByRole("button", { name: /Mark all as read/ }));
    await waitFor(() => expect(notificationsApi.markRead).toHaveBeenLastCalledWith(undefined));
  });

  it("turns order and payment emails off", async () => {
    notificationsApi.list.mockResolvedValue({ items: [], nextCursor: null });
    notificationsApi.setPrefs.mockResolvedValue({ orderEmails: false });
    renderWith(<NotificationsInbox />);
    expect(await screen.findByText("No notifications yet")).toBeTruthy();
    const toggle = await screen.findByRole("switch", { name: /order and payment updates/ });
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(notificationsApi.setPrefs).toHaveBeenCalledWith({ orderEmails: false }));
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
  });

  it("shows an error with a retry", async () => {
    notificationsApi.list.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ items: [note()], nextCursor: null });
    renderWith(<NotificationsInbox />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Payment received")).toBeTruthy();
  });

  it("the bell shows the unread count once signed in", async () => {
    useAuthStore.setState({ user: { id: "u1" } as never });
    notificationsApi.unreadCount.mockResolvedValue({ count: 3 });
    renderWith(<NotificationBell href="/profile/notifications" />);
    expect(await screen.findByText("3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Notifications, 3 unread" }).getAttribute("href")).toBe("/profile/notifications");
  });
});
