import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FilterBar from "./FilterBar";

function Harness({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  return (
    <FilterBar
      search={q}
      onSearch={(value) => {
        onSearch(value);
        setQ(value);
      }}
      searchPlaceholder="Search"
      status={status}
      onStatus={setStatus}
    />
  );
}

describe("FilterBar", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("searches 300 ms after typing stops, without eating a trailing space", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const box = screen.getByPlaceholderText("Search") as HTMLInputElement;

    fireEvent.change(box, { target: { value: "Lagos " } });
    act(() => vi.advanceTimersByTime(299));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledWith("Lagos");
    expect(box.value).toBe("Lagos ");
  });

  it("switches the status tab", () => {
    render(<Harness onSearch={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Switched off" }));
    expect(screen.getByRole("tab", { name: "Switched off" }).getAttribute("aria-selected")).toBe("true");
  });
});
