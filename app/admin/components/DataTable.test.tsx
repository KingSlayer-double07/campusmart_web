import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import DataTable, { type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  status: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Name", cell: (r) => <span>{r.name}</span> },
  { key: "status", header: "Status", cell: (r) => <span>{r.status}</span>, hideOnPhone: true },
  { key: "id", header: "Code", cell: (r) => <span>{r.id}</span> },
];

const base = {
  label: "Things",
  columns,
  rowKey: (r: Row) => r.id,
  isLoading: false,
  isError: false,
  onRetry: () => undefined,
  empty: <p>Nothing here</p>,
};

describe("DataTable", () => {
  afterEach(cleanup);

  it("shows a loading state", () => {
    render(<DataTable {...base} rows={undefined} isLoading />);
    expect(screen.getByLabelText("Loading things").getAttribute("aria-busy")).toBe("true");
  });

  it("shows an error with a retry button", () => {
    const onRetry = vi.fn();
    render(<DataTable {...base} rows={undefined} isError onRetry={onRetry} />);
    expect(screen.getByText(/couldn't load things/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the empty state when there are no rows", () => {
    render(<DataTable {...base} rows={[]} />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders a table for wide screens and cards for phones", () => {
    render(
      <DataTable
        {...base}
        rows={[{ id: "r1", name: "Alpha", status: "On" }]}
        rowActions={(r) => <button type="button">Edit {r.name}</button>}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(within(table).getByText("Alpha")).toBeTruthy();

    const cards = screen.getByRole("list", { name: "Things" });
    expect(within(cards).getByText("Alpha")).toBeTruthy();
    expect(within(cards).getByText("Code")).toBeTruthy();
    // hideOnPhone keeps the status column off the cards
    expect(within(cards).queryByText("Status")).toBeNull();
    expect(within(cards).getByRole("button", { name: "Edit Alpha" })).toBeTruthy();
  });

  it("offers Load more when there is another page", () => {
    const onLoadMore = vi.fn();
    render(<DataTable {...base} rows={[{ id: "r1", name: "Alpha", status: "On" }]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalled();
  });
});
