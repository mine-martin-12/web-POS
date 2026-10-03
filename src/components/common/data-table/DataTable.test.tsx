import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataTable, type DataTableColumn } from "./DataTable";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

interface Row {
  id: string;
  name: string;
  amount: number;
  day: string;
}
const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
  id: `r${i}`,
  name: `Item ${String(i).padStart(2, "0")}`,
  amount: (i * 7) % 30,
  day: i < 15 ? "2026-10-03" : "2026-10-02",
}));
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
  { id: "amount", header: "Amount", cell: (r) => r.amount, sortValue: (r) => r.amount, align: "right" },
];

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

function Harness(props: Partial<React.ComponentProps<typeof DataTable<Row>>> & { data?: Row[] }) {
  const [term, setTerm] = useState("");
  const data = (props.data ?? rows).filter((r) => r.name.toLowerCase().includes(term.toLowerCase()));
  return (
    <TooltipProvider>
      <DataTable<Row>
        rows={data}
        columns={columns}
        getRowId={(r) => r.id}
        mobileCard={(r) => r.name}
        emptyState={<p>Nothing yet</p>}
        filtered={term !== ""}
        onClearFilters={() => setTerm("")}
        search={{ value: term, onChange: setTerm, placeholder: "Search items" }}
        {...props}
      />
      <LocationProbe />
    </TooltipProvider>
  );
}

const renderTable = (props: Parameters<typeof Harness>[0] = {}, path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Harness {...props} />
    </MemoryRouter>,
  );

const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("DataTable", () => {
  it("pages rows and keeps the page in the URL", () => {
    renderTable();
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText("1–25 of 30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByTestId("url")).toHaveTextContent("?page=2");
  });

  it("restores page size and sort from the URL", () => {
    renderTable({}, "/?size=50&sort=amount:desc");
    expect(bodyRows()).toHaveLength(30);
    expect(within(bodyRows()[0]).getByText("29")).toBeInTheDocument();
  });

  it("sorts by clicking a header (asc → desc → off)", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /Amount/ }));
    expect(screen.getByTestId("url")).toHaveTextContent("sort=amount%3Aasc");
    expect(within(bodyRows()[0]).getAllByRole("cell")[1]).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: /Amount/ }));
    expect(screen.getByTestId("url")).toHaveTextContent("sort=amount%3Adesc");
  });

  it("selects rows and shows bulk actions", () => {
    const bulk = vi.fn(() => <button type="button">Archive selected</button>);
    renderTable({ selectable: true, bulkActions: bulk });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all on this page" }));
    expect(screen.getByText("25 selected")).toBeInTheDocument();
    expect(screen.getByText("Archive selected")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("25 selected")).not.toBeInTheDocument();
  });

  it("separates 'no data yet' from 'no results'", () => {
    renderTable({ data: [] });
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("shows a no-results state with a way out", () => {
    renderTable();
    fireEvent.change(screen.getByPlaceholderText("Search items"), { target: { value: "zzz" } });
    expect(screen.getByText('No results for "zzz".')).toBeInTheDocument();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(bodyRows()).toHaveLength(25);
  });

  it("groups rows under collapsible headings with summaries", () => {
    renderTable({
      groupBy: {
        key: (r) => r.day,
        label: (key) => `Day ${key}`,
        summary: (rs) => `${rs.length} rows`,
      },
    });
    const heading = screen.getByRole("button", { name: /Day 2026-10-03/ });
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("15 rows")).toBeInTheDocument();
    fireEvent.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Item 00")).not.toBeInTheDocument();
  });
});
