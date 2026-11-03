/**
 * Document builders — the parts of a real travel document that a table of
 * flat fields can never express.
 *
 *   • Line items      a quote or invoice is a list of priced services.
 *   • Payments        money arrives in instalments, each with a date and mode.
 *   • Itinerary       a package is day 1, day 2, day 3 … not one text blob.
 *
 * Everything here is controlled by the dialog that owns the record, and is
 * written into the record's `extra` bag on save. Nothing is derived by the
 * server yet, so the totals shown here are the same numbers that end up in
 * the PDF and the list — one calculation, one truth.
 */
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { money, type RecordRow } from "@/lib/crm/catalog";
import type { ChecklistSpec, EditorColumn, EditorRow, TableSpec } from "@/lib/crm/editors";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *\
   Shape
\* ------------------------------------------------------------------ */

export type LineItem = {
  label: string;
  /** Travellers, nights or units. */
  qty: number;
  /** Selling rate per unit. */
  rate: number;
  /** What the supplier charges for the same line, when known. */
  cost?: number;
};

export type PaymentEntry = {
  /** Server payment id — present once this entry exists in the ledger. */
  id?: string;
  /** Receipt number printed on the receipt, e.g. RCP-0007. */
  receiptNo?: string;
  /** ISO date the money arrived. */
  date: string;
  amount: number;
  method: string;
  /** Bank UTR, cheque number, Razorpay id… */
  reference?: string;
  note?: string;
};

export type ItineraryDay = {
  title: string;
  detail: string;
};

export const PAYMENT_METHODS = [
  "Bank transfer",
  "UPI",
  "Card",
  "Cash",
  "Cheque",
  "Razorpay",
] as const;

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *\
   Reading what is already stored
\* ------------------------------------------------------------------ */

function readJson<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseLineItems(row: RecordRow | null | undefined): LineItem[] {
  const items = readJson<Partial<LineItem>>(row?.extra?.["quoteItems"]);
  return items
    .map((item) => ({
      label: String(item.label ?? "Service").slice(0, 120),
      qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
      rate: Number(item.rate) || 0,
      ...(item.cost !== undefined && Number(item.cost) > 0 ? { cost: Number(item.cost) } : {}),
    }))
    .filter((item) => item.label.trim().length > 0);
}

export function parsePayments(row: RecordRow | null | undefined): PaymentEntry[] {
  return readJson<Partial<PaymentEntry>>(row?.extra?.["payments"])
    .map((entry) => ({
      ...(entry.id ? { id: String(entry.id) } : {}),
      ...(entry.receiptNo ? { receiptNo: String(entry.receiptNo) } : {}),
      date: String(entry.date ?? today()).slice(0, 10),
      amount: Number(entry.amount) || 0,
      method: String(entry.method ?? "Bank transfer"),
      ...(entry.reference ? { reference: String(entry.reference) } : {}),
      ...(entry.note ? { note: String(entry.note) } : {}),
    }))
    .filter((entry) => entry.amount > 0);
}

export function parseItinerary(row: RecordRow | null | undefined): ItineraryDay[] {
  return readJson<Partial<ItineraryDay>>(row?.extra?.["itinerary"])
    .map((day) => ({
      title: String(day.title ?? "").slice(0, 120),
      detail: String(day.detail ?? "").slice(0, 600),
    }))
    .filter((day) => day.title.trim().length > 0 || day.detail.trim().length > 0);
}

/* ------------------------------------------------------------------ *\
   Totals
\* ------------------------------------------------------------------ */

export type DocumentTotals = {
  subtotal: number;
  cost: number | null;
  tax: number;
  total: number;
  margin: number | null;
  marginPercent: number | null;
  paid: number;
  balance: number;
};

/**
 * One calculation for the dialog, the list and the PDF.
 *
 * Tax is only added when a rate is given; margin is only reported when every
 * line has a cost — a half-known margin would be a guess, and guesses have no
 * place in an invoice.
 */
export function documentTotals(
  items: LineItem[],
  taxPercent: number,
  payments: PaymentEntry[] = [],
  fallbackAmount = 0,
): DocumentTotals {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const priced = items.filter((item) => item.rate > 0);
  const allCostsKnown = priced.length > 0 && priced.every((item) => (item.cost ?? 0) > 0);
  const cost = allCostsKnown
    ? priced.reduce((sum, item) => sum + item.qty * (item.cost ?? 0), 0)
    : null;
  const tax = taxPercent > 0 ? Math.round((subtotal * taxPercent) / 100) : 0;
  const total = subtotal > 0 ? subtotal + tax : Math.max(0, fallbackAmount);
  const paid = payments.reduce((sum, entry) => sum + entry.amount, 0);
  const margin = cost === null ? null : subtotal - cost;
  return {
    subtotal,
    cost,
    tax,
    total,
    margin,
    marginPercent: margin === null || subtotal === 0 ? null : Math.round((margin / subtotal) * 1000) / 10,
    paid,
    balance: Math.max(0, total - paid),
  };
}

/** The status an invoice earns from its payments — never typed by hand. */
export function derivedInvoiceStatus(totals: DocumentTotals): string | null {
  if (totals.paid <= 0) return null;
  return totals.paid >= totals.total ? "Paid" : "Partially paid";
}

/* ------------------------------------------------------------------ *\
   Shared bits
\* ------------------------------------------------------------------ */

const inputClass =
  "h-9 w-full rounded-xl border border-line-2 bg-glass-3 px-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-pine";

function RowShell({ children }: { children: React.ReactNode }) {
  return <div className="grid items-center gap-2">{children}</div>;
}

/* ------------------------------------------------------------------ *\
   Line items
\* ------------------------------------------------------------------ */

export function LineItemsEditor({
  items,
  onChange,
  currency,
  showCost = false,
  label = "What you are charging for",
}: {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
  currency: string;
  showCost?: boolean;
  label?: string;
}) {
  const [draft, setDraft] = useState({ label: "", qty: "1", rate: "", cost: "" });

  const add = () => {
    const name = draft.label.trim();
    if (!name) return;
    const next: LineItem = {
      label: name,
      qty: Number(draft.qty) > 0 ? Number(draft.qty) : 1,
      rate: Number(draft.rate) || 0,
      ...(showCost && Number(draft.cost) > 0 ? { cost: Number(draft.cost) } : {}),
    };
    onChange([...items, next]);
    setDraft({ label: "", qty: "1", rate: "", cost: "" });
  };

  const update = (index: number, patch: Partial<LineItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {label}
        </span>
        <span className="text-[11.5px] text-muted">{items.length} line{items.length === 1 ? "" : "s"}</span>
      </div>

      {items.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {items.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="grid grid-cols-[1fr_54px_92px_auto] items-center gap-2"
            >
              <input
                aria-label={`Line ${index + 1} description`}
                value={item.label}
                onChange={(e) => update(index, { label: e.target.value })}
                className={inputClass}
              />
              <input
                aria-label={`Line ${index + 1} quantity`}
                type="number"
                min={1}
                value={item.qty}
                onChange={(e) => update(index, { qty: Number(e.target.value) || 1 })}
                className={cn(inputClass, "text-right")}
              />
              <input
                aria-label={`Line ${index + 1} rate`}
                type="number"
                min={0}
                value={item.rate || ""}
                onChange={(e) => update(index, { rate: Number(e.target.value) || 0 })}
                className={cn(inputClass, "text-right")}
              />
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="grid size-9 place-items-center rounded-xl text-faint transition-colors hover:bg-well hover:text-tomato"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <RowShell>
        <div className="grid grid-cols-[1fr_54px_92px_auto] items-center gap-2">
          <input
            aria-label="New line description"
            placeholder="e.g. Bali hotel 5★, 6 nights"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={inputClass}
          />
          <input
            aria-label="New line quantity"
            type="number"
            min={1}
            placeholder="1"
            value={draft.qty}
            onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
            className={cn(inputClass, "text-right")}
          />
          <input
            aria-label="New line rate"
            type="number"
            min={0}
            placeholder="0"
            value={draft.rate}
            onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
            className={cn(inputClass, "text-right")}
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.label.trim()}
            className="grid size-9 place-items-center rounded-xl bg-ink text-on-ink transition-opacity disabled:opacity-35"
            aria-label="Add line"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {showCost && (
          <input
            aria-label="New line supplier cost"
            type="number"
            min={0}
            placeholder="Supplier cost (optional — used for margin)"
            value={draft.cost}
            onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
            className={cn(inputClass, "mt-1.5")}
          />
        )}
      </RowShell>

      {items.length === 0 && (
        <p className="mt-2 text-[12px] leading-relaxed text-faint">
          Add each service you are charging for — hotel, flight, transfer. The total below is what
          the customer sees on the {currency} document.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *\
   Itinerary (packages)
\* ------------------------------------------------------------------ */

export function ItineraryEditor({
  days,
  onChange,
}: {
  days: ItineraryDay[];
  onChange: (next: ItineraryDay[]) => void;
}) {
  const update = (index: number, patch: Partial<ItineraryDay>) =>
    onChange(days.map((day, i) => (i === index ? { ...day, ...patch } : day)));

  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          <CalendarDays className="size-3.5" /> Day-by-day plan
        </span>
        <span className="text-[11.5px] text-muted">{days.length} day{days.length === 1 ? "" : "s"}</span>
      </div>

      <div className="space-y-2">
        {days.map((day, index) => (
          <div key={index} className="rounded-xl border border-line bg-solid p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-ink text-[11px] font-bold text-on-ink">
                {index + 1}
              </span>
              <input
                aria-label={`Day ${index + 1} title`}
                placeholder="Arrival in Denpasar, transfer to Nusa Dua"
                value={day.title}
                onChange={(e) => update(index, { title: e.target.value })}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={`Remove day ${index + 1}`}
                onClick={() => onChange(days.filter((_, i) => i !== index))}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:text-tomato"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <textarea
              aria-label={`Day ${index + 1} details`}
              placeholder="Meals, hotel, activities, inclusions for this day…"
              value={day.detail}
              onChange={(e) => update(index, { detail: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-xl border border-line-2 bg-glass-3 px-2.5 py-1.5 text-[12.5px] text-foreground outline-none placeholder:text-faint focus:border-pine"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...days, { title: "", detail: "" }])}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-well"
      >
        <Plus className="size-3.5" /> Add day {days.length + 1}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *\
   Payments
\* ------------------------------------------------------------------ */

export function PaymentsLedger({
  payments,
  onChange,
  currency,
  total,
}: {
  payments: PaymentEntry[];
  onChange: (next: PaymentEntry[]) => void;
  currency: string;
  total: number;
}) {
  const [draft, setDraft] = useState({
    amount: "",
    method: "Bank transfer",
    reference: "",
    date: today(),
    note: "",
  });

  const add = () => {
    const amount = Number(draft.amount) || 0;
    if (amount <= 0) return;
    onChange([
      ...payments,
      {
        date: draft.date || today(),
        amount,
        method: draft.method,
        ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      },
    ]);
    setDraft({ amount: "", method: "Bank transfer", reference: "", date: today(), note: "" });
  };

  const paid = payments.reduce((sum, entry) => sum + entry.amount, 0);
  const balance = Math.max(0, total - paid);

  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          <Wallet className="size-3.5" /> Payments received
        </span>
        <span className="text-[11.5px] tabular-nums text-muted">
          {money(paid, currency)} of {money(total, currency)}
        </span>
      </div>

      {payments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {payments.map((entry, index) => (
            <li
              key={`${entry.date}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-solid px-2.5 py-1.5"
            >
              <span className="text-[12px] text-muted tabular-nums">{entry.date}</span>
              <span className="text-[12.5px] font-semibold tabular-nums">
                {money(entry.amount, currency)}
              </span>
              <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-muted">
                {entry.method}
              </span>
              {entry.receiptNo && (
                <span className="text-[10.5px] font-semibold text-pine">{entry.receiptNo}</span>
              )}
              {entry.reference && (
                <span className="truncate text-[11px] text-faint">{entry.reference}</span>
              )}
              <button
                type="button"
                aria-label={`Remove payment of ${entry.amount}`}
                onClick={() => onChange(payments.filter((_, i) => i !== index))}
                className="ml-auto grid size-7 place-items-center rounded-lg text-faint hover:text-tomato"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[92px_1fr_96px] gap-2">
        <input
          aria-label="Payment date"
          type="date"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          className={inputClass}
        />
        <input
          aria-label="Payment reference"
          placeholder="Reference (UTR, cheque no.)"
          value={draft.reference}
          onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))}
          className={inputClass}
        />
        <select
          aria-label="Payment method"
          value={draft.method}
          onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value }))}
          className={inputClass}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
      </div>

      <div className="mt-1.5 grid grid-cols-[1fr_96px] gap-2">
        <input
          aria-label="Payment note"
          placeholder="Note (optional)"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          className={inputClass}
        />
        <input
          aria-label="Payment amount"
          type="number"
          min={0}
          placeholder={String(balance || 0)}
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={cn(inputClass, "text-right")}
        />
      </div>

      <button
        type="button"
        onClick={add}
        disabled={!(Number(draft.amount) > 0)}
        className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl bg-pine px-3 text-[12.5px] font-semibold text-on-pine transition-opacity disabled:opacity-35"
      >
        <Receipt className="size-3.5" /> Record payment
      </button>

      <p className="mt-2 text-[11.5px] text-faint">
        {balance > 0
          ? `${money(balance, currency)} still to collect.`
          : total > 0
            ? "Fully paid."
            : "Set the amount or add line items first."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *\
   The summary rail
\* ------------------------------------------------------------------ */

export function DocumentSummary({
  totals,
  currency,
  taxPercent,
  onTaxChange,
  tcsPercent = 0,
  onTcsChange,
  showPayments = false,
  validity,
}: {
  totals: DocumentTotals;
  currency: string;
  taxPercent: number;
  onTaxChange?: ((value: number) => void) | undefined;
  /** TCS under 206C(1G), charged on the GST-inclusive value. 0 hides it. */
  tcsPercent?: number;
  onTcsChange?: ((value: number) => void) | undefined;
  showPayments?: boolean;
  validity?: string | undefined;
}) {
  // TCS sits on top of tax, so it is computed from the GST-inclusive total.
  const tcs = tcsPercent > 0 ? Math.round((totals.total * tcsPercent) / 100) : 0;
  const rows = useMemo(
    () =>
      [
        { label: "Subtotal", value: money(totals.subtotal, currency), strong: false },
        ...(taxPercent > 0 && totals.tax > 0
          ? [{ label: `GST ${taxPercent}%`, value: money(totals.tax, currency), strong: false }]
          : []),
        { label: "Total", value: money(totals.total, currency), strong: true },
        ...(tcs > 0
          ? [
              { label: `TCS ${tcsPercent}%`, value: money(tcs, currency), strong: false },
              { label: "Payable incl. TCS", value: money(totals.total + tcs, currency), strong: false },
            ]
          : []),
        ...(totals.cost !== null
          ? [{ label: "Supplier cost", value: money(totals.cost, currency), strong: false }]
          : []),
      ] as Array<{ label: string; value: string; strong: boolean }>,
    [totals, currency, taxPercent, tcs, tcsPercent],
  );

  return (
    <aside className="sticky top-3 h-fit rounded-2xl border border-line bg-solid p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Document
      </div>

      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className={cn("text-[12.5px]", row.strong ? "font-semibold text-foreground" : "text-muted")}>
              {row.label}
            </dt>
            <dd
              className={cn(
                "tabular-nums",
                row.strong ? "text-[15px] font-bold text-foreground" : "text-[12.5px] text-muted",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {totals.margin !== null && (
        <div className="mt-3 rounded-xl bg-well px-3 py-2">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            Your profit
          </div>
          <div className="text-[14px] font-bold tabular-nums text-foreground">
            {money(totals.margin, currency)}{" "}
            <span className="text-[12px] font-semibold text-muted">
              ({totals.marginPercent}%)
            </span>
          </div>
        </div>
      )}

      {showPayments && totals.total > 0 && (
        <div className="mt-3 space-y-1 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted">Received</span>
            <span className="text-[12.5px] font-semibold tabular-nums">
              {money(totals.paid, currency)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-muted">Balance</span>
            <span
              className={cn(
                "text-[12.5px] font-bold tabular-nums",
                totals.balance > 0 ? "text-tomato" : "text-pine",
              )}
            >
              {money(totals.balance, currency)}
            </span>
          </div>
        </div>
      )}

      {onTaxChange && (
        <label className="mt-3 block border-t border-line pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            GST rate %
          </span>
          <input
            type="number"
            min={0}
            max={28}
            step={0.5}
            value={taxPercent}
            onChange={(e) => onTaxChange(Number(e.target.value) || 0)}
            className={cn(inputClass, "mt-1 text-right")}
          />
        </label>
      )}

      {onTcsChange && (
        <label className="mt-2 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            TCS % (206C 1G)
          </span>
          <input
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={tcsPercent}
            onChange={(e) => onTcsChange(Number(e.target.value) || 0)}
            className={cn(inputClass, "mt-1 text-right")}
          />
          <span className="mt-1 block text-[10.5px] text-faint">
            Collected for the government and printed separately on the invoice.
          </span>
        </label>
      )}

      {validity && (
        <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-muted">
          Valid until {validity}
        </p>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ *\
   Structured tables (sectors, rooms, travellers, contracts…)
\* ------------------------------------------------------------------ */

/** Reads a JSON table out of the record's `extra` bag. */
export function parseTable(row: RecordRow | null | undefined, key: string): EditorRow[] {
  return readJson<EditorRow>(row?.extra?.[key]).filter(
    (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

/** Reads (or seeds) a checklist, keeping the order the spec declares. */
export function parseChecklist(
  row: RecordRow | null | undefined,
  key: string,
  items: string[],
): EditorRow[] {
  const stored = readJson<EditorRow>(row?.extra?.[key]);
  const byLabel = new Map(stored.map((entry) => [String(entry.label ?? ""), entry]));
  const merged = items.map((label) => ({
    label,
    done: Boolean(byLabel.get(label)?.done),
  }));
  // Keep any extra, hand-added documents the user typed earlier.
  for (const entry of stored) {
    const label = String(entry.label ?? "");
    if (label && !items.includes(label)) merged.push({ label, done: Boolean(entry.done) });
  }
  return merged;
}

const cellInput =
  "h-8 w-full rounded-lg border border-line-2 bg-glass-3 px-2 text-[12.5px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-pine";

function EditorCell({
  column,
  value,
  onChange,
  currency,
  label,
}: {
  column: EditorColumn;
  value: string | number | undefined;
  onChange: (next: string | number) => void;
  currency: string;
  label: string;
}) {
  if (column.type === "select") {
    return (
      <select
        aria-label={label}
        value={String(value ?? column.options?.[0] ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={cellInput}
      >
        {(column.options ?? []).map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }
  const type =
    column.type === "date" || column.type === "time"
      ? column.type
      : column.type === "text"
        ? "text"
        : "number";
  return (
    <div className="relative">
      <input
        aria-label={label}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={column.type === "percent" ? "0.5" : column.type === "money" ? "any" : undefined}
        placeholder={column.placeholder}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) =>
          onChange(type === "number" ? Number(e.target.value) || 0 : e.target.value)
        }
        className={cn(
          cellInput,
          type === "number" && "text-right tabular-nums",
          column.type === "money" && "pr-9",
        )}
      />
      {column.type === "money" && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10.5px] font-semibold text-faint">
          {currency}
        </span>
      )}
    </div>
  );
}

export function RepeatableEditor({
  spec,
  rows,
  onChange,
  currency,
}: {
  spec: TableSpec;
  rows: EditorRow[];
  onChange: (next: EditorRow[]) => void;
  currency: string;
}) {
  const addRow = () => {
    const blank: EditorRow = {};
    for (const column of spec.columns) {
      blank[column.key] = column.type === "select" ? (column.options?.[0] ?? "") : "";
    }
    onChange([...rows, blank]);
  };

  const update = (index: number, key: string, value: string | number) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  const gridTemplate = `minmax(0,1fr) ${spec.columns
    .slice(1)
    .map((column) => column.width ?? "minmax(0,1fr)")
    .join(" ")} 32px`;

  const total = spec.totalColumn
    ? rows.reduce((sum, row) => sum + (Number(row[spec.totalColumn!]) || 0), 0)
    : null;

  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {spec.title}
        </span>
        <span className="shrink-0 text-[11.5px] text-muted">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {spec.hint && <p className="mb-2 text-[11.5px] leading-relaxed text-faint">{spec.hint}</p>}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          <div className="hidden gap-1.5 md:grid" style={{ gridTemplateColumns: gridTemplate }}>
            {spec.columns.map((column) => (
              <span
                key={column.key}
                className="truncate text-[10px] font-semibold uppercase tracking-wide text-faint"
              >
                {column.label}
              </span>
            ))}
            <span />
          </div>
          {rows.map((row, index) => (
            <div
              key={index}
              className="grid gap-1.5 rounded-xl border border-line bg-solid p-1.5 md:border-0 md:bg-transparent md:p-0"
              style={{
                gridTemplateColumns: "minmax(0,1fr)",
              }}
            >
              <div className="grid gap-1.5" style={{ gridTemplateColumns: gridTemplate }}>
                {spec.columns.map((column) => (
                  <EditorCell
                    key={column.key}
                    column={column}
                    value={row[column.key] as string | number | undefined}
                    onChange={(value) => update(index, column.key, value)}
                    currency={currency}
                    label={`${spec.title} row ${index + 1} ${column.label}`}
                  />
                ))}
                <button
                  type="button"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="grid size-8 place-items-center rounded-lg text-faint transition-colors hover:bg-well hover:text-tomato"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-well"
        >
          <Plus className="size-3.5" /> {spec.addLabel}
        </button>
        {total !== null && total > 0 && (
          <span className="text-[12px] font-semibold tabular-nums text-foreground">
            {money(total, currency)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ChecklistEditor({
  spec,
  rows,
  onChange,
}: {
  spec: ChecklistSpec;
  rows: EditorRow[];
  onChange: (next: EditorRow[]) => void;
}) {
  const done = rows.filter((row) => row.done).length;
  const percent = rows.length === 0 ? 0 : Math.round((done / rows.length) * 100);

  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {spec.title}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11.5px] font-semibold tabular-nums",
            percent === 100 ? "text-pine" : "text-muted",
          )}
        >
          {done}/{rows.length} done
        </span>
      </div>
      {spec.hint && <p className="mb-2 text-[11.5px] leading-relaxed text-faint">{spec.hint}</p>}

      <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-well">
        <div
          className="h-full rounded-full bg-pine transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {rows.map((row, index) => (
          <li key={String(row.label)}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-well">
              <input
                type="checkbox"
                checked={Boolean(row.done)}
                onChange={(e) =>
                  onChange(
                    rows.map((entry, i) =>
                      i === index ? { ...entry, done: e.target.checked } : entry,
                    ),
                  )
                }
                className="size-4 shrink-0 accent-[var(--pine)]"
              />
              <span
                className={cn(
                  "text-[12.5px] leading-tight",
                  row.done ? "text-muted line-through" : "text-foreground",
                )}
              >
                {String(row.label)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {percent === 100 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-pine">
          <CheckCircle2 className="size-3.5" /> Nothing pending here.
        </p>
      )}
    </div>
  );
}

/** Which modules get which builder. */
export const DOCUMENT_MODULES = {
  quotation: "quotations",
  invoice: "finance",
  package: "packages",
} as const;

export const hasLineItems = (moduleId: string) =>
  moduleId === "quotations" || moduleId === "finance" || moduleId === "bookings";

export const hasItinerary = (moduleId: string) => moduleId === "packages";

export const hasPayments = (moduleId: string) =>
  moduleId === "finance" || moduleId === "bookings";
