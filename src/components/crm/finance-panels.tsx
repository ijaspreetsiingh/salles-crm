import { useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  Ban,
  Check,
  FileSpreadsheet,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  createPayable,
  deletePayable,
  fetchPayables,
  fetchTaxSummary,
  settlePayable,
  type PayableDto,
} from "@/lib/api/payables";
import {
  createExpense,
  deleteExpense,
  fetchExpenses,
  fetchProfitLoss,
  type ExpenseDto,
} from "@/lib/api/expenses";

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, string> = {
  due: "To pay",
  partial: "Part paid",
  paid: "Settled",
};

/* ================================================================== *\
   Payables — the money the agency owes its suppliers
\* ================================================================== */

export function Payables() {
  const { settings, getRows } = useCRM();
  const currency = settings.currency || "INR";
  const [filter, setFilter] = useState<"all" | "open" | "overdue" | "paid">("open");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [settling, setSettling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState({
    supplierName: "",
    reference: "",
    description: "",
    amount: "",
    gstRate: "",
    dueDate: today(),
    notes: "",
  });
  const [settle, setSettle] = useState({
    amount: "",
    paidOn: today(),
    method: "Bank transfer",
    referenceNo: "",
  });

  const { data, loading, error, reload } = useApiQuery(() => fetchPayables(), []);

  const supplierNames = useMemo(
    () =>
      [
        ...new Set(
          getRows("suppliers")
            .map((row) => row.name)
            .filter(Boolean),
        ),
      ].slice(0, 200),
    [getRows],
  );
  const bookingRefs = useMemo(
    () =>
      getRows("bookings")
        .map((row) => row.id)
        .slice(0, 300),
    [getRows],
  );

  const items = data?.items ?? [];
  const totals = data?.totals;

  const visible = items.filter((item) => {
    if (filter === "open" && item.balance <= 0.5) return false;
    if (filter === "paid" && item.balance > 0.5) return false;
    if (filter === "overdue" && !item.overdue) return false;
    if (search.trim()) {
      const haystack = `${item.supplierName} ${item.reference} ${item.description}`.toLowerCase();
      if (!haystack.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  const save = async () => {
    const amount = Number(draft.amount);
    if (!draft.supplierName.trim()) {
      toast.error("Whose bill is this? Add the supplier name");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the bill amount");
      return;
    }
    setBusy(true);
    try {
      const gst = Number(draft.gstRate);
      await createPayable({
        supplierName: draft.supplierName.trim(),
        amount,
        currency,
        ...(draft.reference.trim() ? { reference: draft.reference.trim() } : {}),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(Number.isFinite(gst) && gst > 0 ? { gstRate: gst } : {}),
        ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      });
      toast.success("Bill added to payables");
      setAdding(false);
      setDraft({
        supplierName: "",
        reference: "",
        description: "",
        amount: "",
        gstRate: "",
        dueDate: today(),
        notes: "",
      });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the bill"));
    } finally {
      setBusy(false);
    }
  };

  const pay = async (row: PayableDto) => {
    const amount = Number(settle.amount) || row.balance;
    if (amount <= 0) {
      toast.error("Enter the amount you paid");
      return;
    }
    setBusy(true);
    try {
      await settlePayable(row.id, {
        amount,
        paidOn: settle.paidOn,
        method: settle.method,
        ...(settle.referenceNo.trim() ? { referenceNo: settle.referenceNo.trim() } : {}),
      });
      toast.success(`${money(amount, row.currency || currency)} settled with ${row.supplierName}`);
      setSettling(null);
      setSettle({ amount: "", paidOn: today(), method: "Bank transfer", referenceNo: "" });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not record the payment"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: PayableDto) => {
    try {
      await deletePayable(row.id);
      toast.success("Bill removed");
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the bill"));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Outstanding"
          value={money(totals?.outstanding ?? 0, currency)}
          hint={`${items.filter((item) => item.balance > 0.5).length} ${items.filter((item) => item.balance > 0.5).length === 1 ? "bill" : "bills"} open`}
          tone="pine"
        />
        <Stat
          label="Overdue"
          value={money(totals?.overdue ?? 0, currency)}
          hint="Past the supplier's due date"
          tone={totals?.overdue ? "tomato" : "ink"}
        />
        <Stat label="Settled" value={money(totals?.paid ?? 0, currency)} hint="Already paid out" />
        <Stat
          label="Billed"
          value={money(totals?.billed ?? 0, currency)}
          hint="Every supplier bill"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "To pay"],
            ["overdue", "Overdue"],
            ["paid", "Settled"],
            ["all", "All bills"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier, booking or note"
          className="h-9 min-w-[220px] flex-1 rounded-xl border border-rim bg-solid px-3 text-sm"
        />
        <Button size="sm" onClick={() => setAdding((open) => !open)}>
          <Plus className="size-4" /> Add supplier bill
        </Button>
      </div>

      {adding && (
        <section className="glass-card grid gap-3 p-4 md:grid-cols-3">
          <Field label="Supplier">
            <input
              list="payable-suppliers"
              value={draft.supplierName}
              onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })}
              placeholder="e.g. Emirates Holidays"
              autoFocus
            />
            <datalist id="payable-suppliers">
              {supplierNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Against booking">
            <input
              list="payable-refs"
              value={draft.reference}
              onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
              placeholder="BK-2401"
            />
            <datalist id="payable-refs">
              {bookingRefs.map((ref) => (
                <option key={ref} value={ref} />
              ))}
            </datalist>
          </Field>
          <Field label={`Amount (${currency})`}>
            <input
              type="number"
              min="0"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="GST on bill %">
            <input
              type="number"
              min="0"
              max="28"
              value={draft.gstRate}
              onChange={(e) => setDraft({ ...draft, gstRate: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            />
          </Field>
          <Field label="What is it for">
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="e.g. 3 nights, 2 rooms, Marina"
            />
          </Field>
          <div className="md:col-span-3 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              <Check className="size-4" /> {busy ? "Saving…" : "Add bill"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && items.length === 0 && <p className="text-sm text-muted">Loading payables…</p>}

      {!loading && items.length === 0 && (
        <section className="glass-card p-6 text-center">
          <BadgeIndianRupee className="mx-auto mb-3 size-6 text-muted" />
          <h3 className="text-base font-semibold">No supplier bills yet</h3>
          <p className="mt-1 text-sm text-muted">
            Add what a hotel, airline or DMC billed you. Settle it in part or in full and the
            outstanding amount stays correct on its own.
          </p>
        </section>
      )}

      {visible.length > 0 && (
        <ul className="grid gap-2">
          {visible.map((item) => (
            <li key={item.id} className="glass-card p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="truncate text-sm">{item.supplierName}</strong>
                    <BillPill
                      label={item.overdue ? "Overdue" : (STATUS_LABEL[item.status] ?? item.status)}
                    />
                    {item.reference && (
                      <span className="text-xs text-faint">for {item.reference}</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {item.description || "Supplier bill"}
                    {item.dueDate ? ` · due ${item.dueDate}` : ""}
                    {item.gstRate > 0 ? ` · GST ${item.gstRate}%` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">
                    {money(item.amount, item.currency || currency)}
                  </div>
                  <div className="text-xs text-muted">
                    {money(item.paid, item.currency || currency)} paid
                    {item.balance > 0.5
                      ? ` · ${money(item.balance, item.currency || currency)} left`
                      : ""}
                  </div>
                </div>
                {item.balance > 0.5 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSettling(settling === item.id ? null : item.id);
                        setSettle({ ...settle, amount: String(item.balance) });
                      }}
                    >
                      <Wallet className="size-4" /> Settle
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove(item)}
                      title="Remove bill"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
                {item.balance <= 0.5 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-pine">
                    <Check className="size-3.5" /> Settled
                  </span>
                )}
              </div>

              {settling === item.id && (
                <div className="mt-3 grid gap-3 rounded-xl border border-rim bg-solid/60 p-3 md:grid-cols-4">
                  <Field label={`Amount (${currency})`}>
                    <input
                      type="number"
                      min="0"
                      value={settle.amount}
                      onChange={(e) => setSettle({ ...settle, amount: e.target.value })}
                    />
                  </Field>
                  <Field label="Paid on">
                    <input
                      type="date"
                      value={settle.paidOn}
                      onChange={(e) => setSettle({ ...settle, paidOn: e.target.value })}
                    />
                  </Field>
                  <Field label="Mode">
                    <select
                      value={settle.method}
                      onChange={(e) => setSettle({ ...settle, method: e.target.value })}
                    >
                      {["Bank transfer", "UPI", "Card", "Cash", "Cheque", "Razorpay"].map(
                        (mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="UTR / cheque no.">
                    <input
                      value={settle.referenceNo}
                      onChange={(e) => setSettle({ ...settle, referenceNo: e.target.value })}
                      placeholder="Optional"
                    />
                  </Field>
                  <div className="md:col-span-4 flex items-center gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void pay(item)}>
                      <Check className="size-4" /> {busy ? "Saving…" : "Record payment"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSettling(null)}>
                      <Ban className="size-4" /> Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {(data?.suppliers?.length ?? 0) > 0 && (
        <section className="glass-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Owed by supplier</h3>
          <ul className="grid gap-1.5">
            {data!.suppliers.slice(0, 12).map((supplier) => (
              <li key={supplier.name} className="flex items-center justify-between text-sm">
                <span className="truncate">{supplier.name}</span>
                <span className="font-semibold">
                  {money(supplier.outstanding, currency)}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {supplier.count} bill{supplier.count === 1 ? "" : "s"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ================================================================== *\
   Tax & GST — the working paper an accountant hands to the CA
\* ================================================================== */

const monthLabel = (key: string) => {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const periodFor = (preset: string): { from: string; to: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (preset === "This month") {
    return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) };
  }
  if (preset === "This quarter") {
    const quarterStart = month - (month % 3);
    return {
      from: iso(new Date(year, quarterStart, 1)),
      to: iso(new Date(year, quarterStart + 3, 0)),
    };
  }
  if (preset === "Last financial year") {
    const start = month + 1 >= 4 ? year - 1 : year - 2;
    return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
  }
  const start = month + 1 >= 4 ? year : year - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
};

export function TaxSummary() {
  const { settings } = useCRM();
  const currency = settings.currency || "INR";
  const [preset, setPreset] = useState("This financial year");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const period = custom ?? periodFor(preset);

  const { data, loading, error } = useApiQuery(
    () => fetchTaxSummary(period.from, period.to),
    [period.from, period.to],
  );

  const net = data?.net ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["This month", "This quarter", "This financial year", "Last financial year"].map(
          (option) => (
            <Button
              key={option}
              size="sm"
              variant={!custom && preset === option ? "default" : "outline"}
              onClick={() => {
                setCustom(null);
                setPreset(option);
              }}
            >
              {option}
            </Button>
          ),
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="date"
            value={period.from}
            onChange={(e) => setCustom({ from: e.target.value, to: period.to })}
            className="h-9 rounded-xl border border-rim bg-solid px-2 text-sm"
          />
          to
          <input
            type="date"
            value={period.to}
            onChange={(e) => setCustom({ from: period.from, to: e.target.value })}
            className="h-9 rounded-xl border border-rim bg-solid px-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Output GST"
          value={money(data?.output.tax ?? 0, currency)}
          hint={`${data?.output.count ?? 0} invoices · on ${money(data?.output.taxable ?? 0, currency)}`}
          tone="pine"
        />
        <Stat
          label="Input credit"
          value={money(data?.input.tax ?? 0, currency)}
          hint={`${data?.input.count ?? 0} supplier ${(data?.input.count ?? 0) === 1 ? "bill" : "bills"}`}
          tone="butter"
        />
        <Stat
          label={net >= 0 ? "Net payable" : "Net credit"}
          value={money(Math.abs(net), currency)}
          hint={net >= 0 ? "Output tax − input credit" : "Input credit carries forward"}
          tone={net > 0 ? "tomato" : "pine"}
        />
      </div>

      {(data?.tcs?.count ?? 0) > 0 && (
        <section className="glass-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">TCS collected u/s 206C(1G)</span>
            <span className="tabular-nums">
              {money(data!.tcs!.collected, currency)}
              <span className="ml-2 text-xs text-muted">
                on {data!.tcs!.count} invoice{data!.tcs!.count === 1 ? "" : "s"}
                {data!.tcs!.byRate.length
                  ? ` · ${data!.tcs!.byRate.map((row) => `${row.rate}%`).join(", ")}`
                  : ""}
              </span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Held for the government, deposited against the buyer&apos;s PAN — not part of revenue.
          </p>
        </section>
      )}

      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && !data && <p className="text-sm text-muted">Working out the numbers…</p>}

      {data && (
        <>
          <section className="glass-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="size-4" /> Month by month
            </h3>
            {data.months.length === 0 ? (
              <p className="text-sm text-muted">No invoices or supplier bills in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">Month</th>
                      <th className="py-1.5 text-right font-medium">Output GST</th>
                      <th className="py-1.5 text-right font-medium">Input credit</th>
                      <th className="py-1.5 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((month) => (
                      <tr key={month.month} className="border-t border-rim">
                        <td className="py-1.5">{monthLabel(month.month)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(month.output, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(month.input, currency)}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">
                          {money(month.net, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.rates.length > 0 && (
            <section className="glass-card p-4">
              <h3 className="mb-2 text-sm font-semibold">By rate</h3>
              <ul className="grid gap-1.5">
                {data.rates.map((rate) => (
                  <li key={rate.rate} className="flex items-center justify-between text-sm">
                    <span>{rate.rate}%</span>
                    <span className="text-xs text-muted">
                      collected {money(rate.output, currency)} · credit{" "}
                      {money(rate.input, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.invoices.length > 0 && (
            <section className="glass-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Invoices in this period</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">Invoice</th>
                      <th className="py-1.5 font-medium">Customer</th>
                      <th className="py-1.5 font-medium">Date</th>
                      <th className="py-1.5 text-right font-medium">Rate</th>
                      <th className="py-1.5 text-right font-medium">Taxable</th>
                      <th className="py-1.5 text-right font-medium">GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((invoice) => (
                      <tr key={invoice.reference} className="border-t border-rim">
                        <td className="py-1.5 font-medium">{invoice.reference}</td>
                        <td className="py-1.5">{invoice.name}</td>
                        <td className="py-1.5 text-muted">{invoice.date}</td>
                        <td className="py-1.5 text-right tabular-nums">{invoice.rate}%</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(invoice.taxable, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(invoice.tax, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/* ================================================================== *\
   Expenses — everything the agency pays that is not a supplier bill
\* ================================================================== */

export function Expenses() {
  const { settings } = useCRM();
  const currency = settings.currency || "INR";
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("Rent & office");
  const { data, loading, error, reload } = useApiQuery(() => fetchExpenses(), []);

  const [draft, setDraft] = useState({
    vendor: "",
    description: "",
    amount: "",
    gstRate: "",
    spentOn: today(),
    method: "Bank transfer",
    referenceNo: "",
  });

  const items = data?.items ?? [];
  const totals = data?.totals;
  const categories = data?.categories ?? [
    "Rent & office",
    "Salaries",
    "Marketing & ads",
    "Software & tools",
    "Travel & meals",
    "Bank & fees",
    "Utilities",
    "Professional fees",
    "Other",
  ];

  const save = async () => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the amount you spent");
      return;
    }
    setBusy(true);
    try {
      const gst = Number(draft.gstRate);
      await createExpense({
        category,
        amount,
        currency,
        spentOn: draft.spentOn,
        method: draft.method,
        ...(draft.vendor.trim() ? { vendor: draft.vendor.trim() } : {}),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(Number.isFinite(gst) && gst > 0 ? { gstRate: gst } : {}),
        ...(draft.referenceNo.trim() ? { referenceNo: draft.referenceNo.trim() } : {}),
      });
      toast.success("Expense recorded");
      setAdding(false);
      setDraft({
        vendor: "",
        description: "",
        amount: "",
        gstRate: "",
        spentOn: today(),
        method: "Bank transfer",
        referenceNo: "",
      });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the expense"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ExpenseDto) => {
    try {
      await deleteExpense(row.id);
      toast.success("Expense removed");
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the expense"));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Spent"
          value={money(totals?.spent ?? 0, currency)}
          hint={`${totals?.count ?? 0} entr${(totals?.count ?? 0) === 1 ? "y" : "ies"}`}
          tone="tomato"
        />
        <Stat label="Average" value={money(totals?.average ?? 0, currency)} hint="Per entry" />
        <Stat
          label="Biggest head"
          value={totals?.byCategory[0]?.category ?? "—"}
          hint={
            totals?.byCategory[0]
              ? money(totals.byCategory[0].amount, currency)
              : "Nothing recorded yet"
          }
        />
        <Stat
          label="Categories in use"
          value={String(totals?.byCategory.length ?? 0)}
          hint="Rent, salaries, ads…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAdding((open) => !open)}>
          <Plus className="size-4" /> Add expense
        </Button>
        <span className="text-xs text-muted">
          Supplier bills go in Payables. This is rent, salaries, ads, software and the rest.
        </span>
      </div>

      {adding && (
        <section className="glass-card grid gap-3 p-4 md:grid-cols-4">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid to">
            <input
              value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              placeholder="e.g. WeWork"
              autoFocus
            />
          </Field>
          <Field label={`Amount (${currency})`}>
            <input
              type="number"
              min="0"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={draft.spentOn}
              onChange={(e) => setDraft({ ...draft, spentOn: e.target.value })}
            />
          </Field>
          <Field label="What for">
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="e.g. October office rent"
            />
          </Field>
          <Field label="GST %">
            <input
              type="number"
              min="0"
              max="28"
              value={draft.gstRate}
              onChange={(e) => setDraft({ ...draft, gstRate: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Mode">
            <select
              value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value })}
            >
              {["Bank transfer", "UPI", "Card", "Cash", "Cheque"].map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference">
            <input
              value={draft.referenceNo}
              onChange={(e) => setDraft({ ...draft, referenceNo: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <div className="md:col-span-4 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              <Check className="size-4" /> {busy ? "Saving…" : "Add expense"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && items.length === 0 && <p className="text-sm text-muted">Loading expenses…</p>}

      {!loading && items.length === 0 && (
        <section className="glass-card p-6 text-center">
          <Receipt className="mx-auto mb-3 size-6 text-muted" />
          <h3 className="text-base font-semibold">No expenses recorded yet</h3>
          <p className="mt-1 text-sm text-muted">
            Add rent, salaries and ads so the profit figure on the Profitability tab is the real
            one, not revenue minus supplier bills.
          </p>
        </section>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <ul className="grid gap-2">
            {items.slice(0, 100).map((item) => (
              <li key={item.id} className="glass-card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="truncate text-sm">{item.category}</strong>
                    <span className="text-xs text-faint">{item.spentOn}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[item.vendor, item.description].filter(Boolean).join(" · ") || item.method}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {money(item.amount, item.currency || currency)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Remove expense"
                  onClick={() => void remove(item)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <section className="glass-card h-fit p-4">
            <h3 className="mb-2 text-sm font-semibold">Where it went</h3>
            <ul className="grid gap-2">
              {(totals?.byCategory ?? []).map((row) => (
                <li key={row.category} className="flex items-center justify-between text-sm">
                  <span className="truncate">{row.category}</span>
                  <span className="font-semibold tabular-nums">{money(row.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *\
   Profitability — revenue, supplier cost, expenses, what is left
\* ================================================================== */

export function ProfitLoss() {
  const { settings } = useCRM();
  const currency = settings.currency || "INR";
  const [preset, setPreset] = useState("This financial year");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const period = custom ?? periodFor(preset);

  const { data, loading, error } = useApiQuery(
    () => fetchProfitLoss(period.from, period.to),
    [period.from, period.to],
  );

  const profit = data?.netProfit ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["This month", "This quarter", "This financial year", "Last financial year"].map(
          (option) => (
            <Button
              key={option}
              size="sm"
              variant={!custom && preset === option ? "default" : "outline"}
              onClick={() => {
                setCustom(null);
                setPreset(option);
              }}
            >
              {option}
            </Button>
          ),
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="date"
            value={period.from}
            onChange={(e) => setCustom({ from: e.target.value, to: period.to })}
            className="h-9 rounded-xl border border-rim bg-solid px-2 text-sm"
          />
          to
          <input
            type="date"
            value={period.to}
            onChange={(e) => setCustom({ from: period.from, to: e.target.value })}
            className="h-9 rounded-xl border border-rim bg-solid px-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && !data && <p className="text-sm text-muted">Building the P&L…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Revenue (net of GST)"
              value={money(data.revenue.net, currency)}
              hint={`${data.revenue.invoices} invoices · ${money(data.revenue.invoiced, currency)} billed`}
              tone="pine"
            />
            <Stat
              label="Supplier cost"
              value={money(data.supplierCost, currency)}
              hint={
                data.revenue.net > 0
                  ? `${Math.round((data.supplierCost / data.revenue.net) * 1000) / 10}% of revenue`
                  : "No revenue in this period"
              }
              tone="butter"
            />
            <Stat
              label="Running expenses"
              value={money(data.expenses, currency)}
              hint="Rent, salaries, ads, software"
              tone="butter"
            />
            <Stat
              label={profit >= 0 ? "Net profit" : "Net loss"}
              value={money(Math.abs(profit), currency)}
              hint={
                data.netMargin !== null
                  ? `${data.netMargin}% margin · gross ${data.grossMargin}%`
                  : "Add invoices to see a margin"
              }
              tone={profit >= 0 ? "pine" : "tomato"}
            />
          </div>

          <section className="glass-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4" /> Month by month
            </h3>
            {data.months.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">Month</th>
                      <th className="py-1.5 text-right font-medium">Revenue</th>
                      <th className="py-1.5 text-right font-medium">Supplier cost</th>
                      <th className="py-1.5 text-right font-medium">Expenses</th>
                      <th className="py-1.5 text-right font-medium">Net profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((month) => (
                      <tr key={month.month} className="border-t border-rim">
                        <td className="py-1.5">{monthLabel(month.month)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(month.revenue, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(month.supplierCost, currency)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {money(month.expenses, currency)}
                        </td>
                        <td
                          className={`py-1.5 text-right font-semibold tabular-nums ${
                            month.netProfit < 0 ? "text-tomato" : ""
                          }`}
                        >
                          {money(month.netProfit, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.expenseCategories.length > 0 && (
            <section className="glass-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Expenses by head</h3>
              <ul className="grid gap-1.5">
                {data.expenseCategories.map((row) => (
                  <li key={row.category} className="flex items-center justify-between text-sm">
                    <span className="truncate">{row.category}</span>
                    <span className="font-semibold tabular-nums">
                      {money(row.amount, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BillPill({ label }: { label: string }) {
  const tone = label === "Overdue" ? "danger" : label === "Settled" ? "success" : "warning";
  return (
    <span className={`status status-${tone}`}>
      <span />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "pine" | "tomato" | "butter";
}) {
  const toneClass =
    tone === "pine"
      ? "text-pine"
      : tone === "tomato"
        ? "text-tomato"
        : tone === "butter"
          ? "text-foreground"
          : "text-foreground";
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</span>
      <span className="[&>input]:h-9 [&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-rim [&>input]:bg-solid [&>input]:px-3 [&>input]:text-sm [&>select]:h-9 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:border-rim [&>select]:bg-solid [&>select]:px-3 [&>select]:text-sm">
        {children}
      </span>
    </label>
  );
}
