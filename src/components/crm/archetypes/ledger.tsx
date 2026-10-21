import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDay, money, type RecordRow } from "@/lib/crm/catalog";
import type { ColumnDef } from "@/lib/crm/schema";
import { CellValue, Status } from "../common";
import { EmptyState, FilterMenu, IconBtn } from "../ui";

/* ==========================================================================
   A2 — Ledger.

   A dense, sortable, filterable data table. This is the workhorse view for
   records-heavy modules (finance, suppliers, transfers, companies…).

   It gives every list the same feel:
     · every row's name is clickable (not just the reference code)
     · a column picker so the table fits the question being asked
     · real page sizes (25 / 50 / 100) instead of a fixed six rows
     · bulk actions with a visible, reversible selection bar
     · sticky header, hairline rows, tabular numbers
   ========================================================================== */

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export type LedgerProps = {
  rows: RecordRow[];
  columns: ColumnDef[];
  currency: string;
  /** Column keys that can be sorted. */
  sortableKeys?: string[];
  sort?: SortState;
  onSort?: (next: SortState) => void;
  onOpen: (row: RecordRow) => void;
  /** Where "create" lives — used by the empty state. */
  onCreate?: () => void;
  createLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptySteps?: string[];
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  /** Extra toolbar content (module-specific filters). */
  toolbar?: ReactNode;
  /** Row actions rendered at the end of each row. */
  rowActions?: (row: RecordRow) => ReactNode;
  onExport?: (rows: RecordRow[]) => void;
  /** Bulk operations available when rows are selected. */
  bulkActions?: (ids: string[], clear: () => void) => ReactNode;
  pageSize?: number;
  /** Hide the built-in pagination (for embedded tables). */
  hidePagination?: boolean;
};

export function Ledger({
  rows,
  columns,
  currency,
  sortableKeys = ["id", "name", "destination", "date", "amount", "status", "owner"],
  sort,
  onSort,
  onOpen,
  onCreate,
  createLabel = "Create record",
  emptyTitle,
  emptyDescription,
  emptySteps,
  emptyIcon,
  emptyAction,
  toolbar,
  rowActions,
  onExport,
  bulkActions,
  pageSize: initialPageSize = 25,
  hidePagination = false,
}: LedgerProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [hidden, setHidden] = useState<string[]>([]);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const visible = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const pick = (r: RecordRow): string | number => {
        if (sort.key === "amount") return r.amount;
        const v = (r as unknown as Record<string, unknown>)[sort.key];
        if (typeof v === "number") return v;
        return v == null ? "" : String(v);
      };
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
  }, [rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = hidePagination
    ? sorted
    : sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));

  const toggleSort = (key: string) => {
    if (!onSort) return;
    if (!sort || sort.key !== key) onSort({ key, dir: "asc" });
    else if (sort.dir === "asc") onSort({ key, dir: "desc" });
    else onSort(null);
  };

  const toggleAll = () => {
    if (allChecked) setSelected((s) => s.filter((id) => !pageRows.some((r) => r.id === id)));
    else setSelected((s) => [...new Set([...s, ...pageRows.map((r) => r.id)])]);
  };

  const clearSelection = () => setSelected([]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? "Nothing here yet"}
        description={emptyDescription}
        steps={emptySteps}
        actions={
          emptyAction ??
          (onCreate ? (
            <button
              type="button"
              className="h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-on-ink transition-opacity hover:opacity-90"
              onClick={onCreate}
            >
              {createLabel}
            </button>
          ) : null)
        }
      />
    );
  }

  return (
    <div className="rounded-[var(--r-card)] border border-line bg-glass shadow-xs backdrop-blur-xl">
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ink px-4 py-2.5 text-on-ink">
          <span className="text-[12.5px] font-semibold">{selected.length} selected</span>
          <span className="flex-1" />
          {bulkActions?.(selected, clearSelection)}
          {onExport && (
            <button
              type="button"
              className="rounded-full bg-on-ink/15 px-3 py-1 text-[12px] font-semibold transition-colors hover:bg-on-ink/25"
              onClick={() => onExport(sorted.filter((r) => selected.includes(r.id)))}
            >
              Export selected
            </button>
          )}
          <button
            type="button"
            className="rounded-full p-1 transition-colors hover:bg-on-ink/15"
            onClick={clearSelection}
            aria-label="Clear selection"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          {toolbar}
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table workspace-table">
          <thead>
            <tr>
              <th style={{ width: 38 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                />
              </th>
              {visible.map((column) => {
                const canSort = sortableKeys.includes(column.key) && column.sortable !== false;
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={column.align === "right" ? "align-right" : undefined}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              {(rowActions || columns.length > 0) && <th style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className={selected.includes(row.id) ? "is-selected" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(row.id) ? s.filter((id) => id !== row.id) : [...s, row.id],
                      )
                    }
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                {visible.map((column) => (
                  <td key={column.key} className={cn(column.align === "right" && "align-right")}>
                    {column.kind === "person" ? (
                      <button
                        type="button"
                        className="customer-cell customer-cell--link"
                        onClick={() => onOpen(row)}
                      >
                        <CellValue row={row} column={column} currency={currency} />
                      </button>
                    ) : column.key === "id" ? (
                      <button type="button" className="record-id" onClick={() => onOpen(row)}>
                        {row.id}
                      </button>
                    ) : (
                      <CellValue
                        row={row}
                        column={column}
                        currency={currency}
                        onOpen={() => onOpen(row)}
                      />
                    )}
                  </td>
                ))}
                {(rowActions || columns.length > 0) && (
                  <td>
                    {rowActions ? (
                      rowActions(row)
                    ) : (
                      <button
                        type="button"
                        className="record-id"
                        onClick={() => onOpen(row)}
                        aria-label={`Open ${row.name}`}
                      >
                        <span aria-hidden>···</span>
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <div className="flex items-center gap-3">
          <span>
            Showing {hidePagination ? sorted.length : (safePage - 1) * pageSize + 1}–
            {hidePagination ? sorted.length : Math.min(safePage * pageSize, sorted.length)} of{" "}
            {sorted.length} {sorted.length === 1 ? "record" : "records"}
          </span>
          {columns.length > 0 && (
            <div className="relative">
              <IconBtn
                label="Choose columns"
                onClick={() => setColumnsOpen((o) => !o)}
                className="size-7"
              >
                <Columns3 className="size-3.5" />
              </IconBtn>
              {columnsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColumnsOpen(false)} />
                  <div className="filter__menu right-0 left-auto z-50">
                    <div className="filter__label">Visible columns</div>
                    {columns.map((c) => {
                      const on = !hidden.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          className="filter__option"
                          onClick={() =>
                            setHidden((h) => (on ? [...h, c.key] : h.filter((k) => k !== c.key)))
                          }
                        >
                          <span
                            className={cn(
                              "grid size-4 place-items-center rounded-[5px] border text-[10px]",
                              on ? "border-pine bg-pine text-on-pine" : "border-line-2",
                            )}
                          >
                            {on ? "✓" : ""}
                          </span>
                          {c.label}
                        </button>
                      );
                    })}
                    {hidden.length > 0 && (
                      <button
                        type="button"
                        className="filter__option text-muted"
                        onClick={() => setHidden([])}
                      >
                        Reset columns
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {!hidePagination && (
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-full border border-line-2 bg-glass-3 px-2.5 text-[12px] text-foreground"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Rows per page"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full border border-line-2 text-muted transition-colors hover:bg-well hover:text-foreground disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[62px] text-center text-[12px] text-muted tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-full border border-line-2 text-muted transition-colors hover:bg-well hover:text-foreground disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact summary row used above a ledger. */
export function LedgerSummary({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="module-stats">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value}</strong>
          <p>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export { Status, money, formatDay };
