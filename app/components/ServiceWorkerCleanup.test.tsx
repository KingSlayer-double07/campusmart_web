import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ServiceWorkerCleanup from "./ServiceWorkerCleanup";

describe("ServiceWorkerCleanup", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  function stubWorkers() {
    const unregister = vi.fn();
    const serviceWorker = {
      register: vi.fn(),
      getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
    };
    Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
    return { ...serviceWorker, unregister };
  }

  it("drops leftover workers outside production and never registers one itself", async () => {
    const sw = stubWorkers();
    render(<ServiceWorkerCleanup />);
    await waitFor(() => expect(sw.unregister).toHaveBeenCalled());
    expect(sw.register).not.toHaveBeenCalled();
  });

  it("leaves the worker to Serwist in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const sw = stubWorkers();
    render(<ServiceWorkerCleanup />);
    expect(sw.getRegistrations).not.toHaveBeenCalled();
    expect(sw.register).not.toHaveBeenCalled();
  });
});
