import { useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  CalendarRange,
  Check,
  Download,
  IndianRupee,
  ListChecks,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ItineraryEditor } from "./document-builder";
import { downloadPackagePdf } from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";
import { money, type RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import {
  emptyPlan,
  fromPrice,
  packageMargin,
  planExtra,
  planQuoteExtra,
  plannedNights,
  priceForTravellers,
  quoteItemsFromPlan,
  readPackagePlan,
  type PackagePlan,

} from "@/lib/crm/package-plan";

/**
 * The package builder — the one screen where a travel agency's product is
 * actually defined: who it is for, what happens on each day, what is included,
 * and what it costs as the group grows.
 *
 * It sits inside the normal record panel, so a package is still an ordinary
 * record. The last step turns the package into a priced quotation for one
 * customer, carrying the itinerary and inclusions onto the quotation PDF.
 */
export function PackagePlanSection({
  row,
  currency,
  onQuoted,
}: {
  row: RecordRow;
  currency: string;
  onQuoted: (created: RecordRow) => void;
}) {
  const { update, createRecord, settings } = useCRM();
  const plan = useMemo(() => readPackagePlan(row), [row]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PackagePlan>(plan);

  const startEditing = () => {
    setDraft(plan.slabs.length > 0 ? plan : { ...plan, slabs: [{ pax: 2, rate: 0 }] });
    setEditing(true);
  };

  const savePlan = () => {
    const cleaned: PackagePlan = {
      ...draft,
      days: draft.days.filter((day) => day.title.trim() || day.detail.trim()),
      inclusions: draft.inclusions.filter(Boolean),
      exclusions: draft.exclusions.filter(Boolean),
      slabs: draft.slabs
        .filter((slab) => slab.pax > 0 && slab.rate > 0)
        .sort((a, b) => a.pax - b.pax),
    };
    update("packages", { ...row, extra: { ...(row.extra ?? {}), ...planExtra(cleaned) } });
    setEditing(false);
    toast.success("Package plan saved");
  };

  if (editing) {
    return (
      <section className="record-sheet__section">
        <h4>
          <Pencil size={14} /> Edit this package
        </h4>
        <PlanEditor draft={draft} currency={currency} onChange={setDraft} />
        <div className="record-sheet__actions">
          <button type="button" onClick={savePlan}>
            <Check size={14} /> Save the plan
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            <X size={14} /> Cancel
          </button>
        </div>
      </section>
    );
  }

  const nights = plannedNights(plan);
  const from = fromPrice(plan);
  const margin = packageMargin(plan, 2);

  const download = async () => {
    try {
      await downloadPackagePdf(row.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not build the package PDF"));
    }
  };

  return (
    <>
      <section className="record-sheet__section">
        <h4>
          <CalendarRange size={14} /> The plan
        </h4>
        {plan.days.length === 0 ? (
          <p className="record-sheet__empty">
            No day-by-day plan yet. A customer decides on the itinerary first, so write the days
            down before this package goes out.
          </p>
        ) : (
          <ol className="mt-1 space-y-2">
            {plan.days.map((day, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-ink text-[11px] font-bold text-on-ink">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <strong className="block text-[12.5px] leading-tight text-foreground">
                    {day.title || `Day ${index + 1}`}
                  </strong>
                  {day.detail && (
                    <p className="mt-0.5 whitespace-pre-line text-[11.5px] leading-relaxed text-muted">
                      {day.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="record-sheet__actions">
          <button type="button" onClick={startEditing}>
            <Pencil size={14} /> {plan.days.length === 0 ? "Write the plan" : "Edit day-by-day"}
          </button>
          <button type="button" onClick={download}>
            <Download size={14} /> Package PDF
          </button>
        </div>
      </section>

      <section className="record-sheet__section">
        <h4>
          <BadgeIndianRupee size={14} /> Price by group size
        </h4>
        {plan.slabs.length === 0 ? (
          <p className="record-sheet__empty">
            No per-person price yet. Set what each traveller pays for 2, 4 or 6 people — that is
            what an enquiry is quoted from.
          </p>
        ) : (
          <ul className="record-sheet__task-list">
            {plan.slabs.map((slab) => (
              <li key={slab.pax}>
                <div className="min-w-0 flex-1">
                  <strong>
                    {slab.pax} traveller{slab.pax === 1 ? "" : "s"}
                  </strong>
                  <small>{money(slab.rate, currency)} per person</small>
                </div>
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {money(slab.rate * slab.pax, currency)} total
                </span>
              </li>
            ))}
            <li className="record-sheet__totals">
              <div className="min-w-0 flex-1">
                <strong>From {from === null ? "—" : money(from, currency)} per person</strong>
                <small>
                  {nights !== null ? `${nights} night${nights === 1 ? "" : "s"} · ` : ""}
                  {plan.validTo ? `valid till ${plan.validTo}` : "no validity date set"}
                </small>
              </div>
            </li>
          </ul>
        )}
        <p className="record-sheet__hint">
          {margin.amount === null
            ? "Supplier cost is not on record, so margin is unknown — fill “cost per person” in the plan to see it."
            : `Margin ${money(margin.amount, currency)} per person (${margin.percent}%) at the 2-traveller rate.`}
        </p>
      </section>

      {(plan.inclusions.length > 0 || plan.exclusions.length > 0) && (
        <section className="record-sheet__section">
          <h4>
            <ListChecks size={14} /> What is included
          </h4>
          {plan.inclusions.length > 0 && (
            <ul className="record-sheet__task-list">
              {plan.inclusions.map((line) => (
                <li key={line}>
                  <Check size={13} className="shrink-0 text-pine" />
                  <span className="min-w-0 flex-1 text-[12.5px] leading-tight text-foreground">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {plan.exclusions.length > 0 && (
            <>
              <p className="record-sheet__hint">Not included</p>
              <ul className="record-sheet__task-list">
                {plan.exclusions.map((line) => (
                  <li key={line}>
                    <X size={13} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 text-[12.5px] leading-tight text-muted">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <PackageQuoteForm
        row={row}
        plan={plan}
        currency={currency}
        taxRate={settings.taxRate ?? 5}
        onQuoted={onQuoted}
        createRecord={createRecord}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *\
   Quote one customer from the package
\* ------------------------------------------------------------------ */

function PackageQuoteForm({
  row,
  plan,
  currency,
  taxRate,
  onQuoted,
  createRecord,
}: {
  row: RecordRow;
  plan: PackagePlan;
  currency: string;
  taxRate: number;
  onQuoted: (created: RecordRow) => void;
  createRecord: (module: string, row: RecordRow) => Promise<RecordRow | null>;
}) {
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [travelDate, setTravelDate] = useState(row.date || new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const adultCount = Math.max(1, Math.round(Number(adults) || 1));
  const childCount = Math.max(0, Math.round(Number(children) || 0));
  const price = priceForTravellers(plan, adultCount, childCount);
  const items = quoteItemsFromPlan(plan, row.name, adultCount, childCount);
  const tax = Math.round((price.total * taxRate) / 100);
  const grandTotal = price.total + tax;
  const priced = price.perPerson > 0;

  const create = async () => {
    if (busy) return;
    if (!priced) {
      toast.error("Set a per-person price in the plan first");
      return;
    }
    if (!customer.trim()) {
      toast.error("Add the customer's name — a quote needs someone to send it to");
      return;
    }
    setBusy(true);
    try {
      const created = await createRecord("quotations", {
        id: `QT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        name: customer.trim(),
        detail: `${row.name} — ${adultCount} traveller${adultCount === 1 ? "" : "s"}${
          childCount > 0 ? `, ${childCount} child${childCount === 1 ? "" : "ren"}` : ""
        }`,
        destination: row.destination,
        owner: row.owner,
        branch: row.branch,
        date: travelDate,
        amount: grandTotal,
        ...(row.currency ? { currency: row.currency } : {}),
        status: "Draft",
        email: email.trim(),
        phone: "",
        source: "Package",
        notes: plan.terms || `Quotation built from package ${row.id}`,
        extra: {
          ...planQuoteExtra(plan, { travellers: adultCount, packageRef: row.id }),
          quoteItems: JSON.stringify(items),
        },
      });
      if (!created) {
        toast.error("Could not create the quotation");
        return;
      }
      setCustomer("");
      setEmail("");
      onQuoted(created);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="record-sheet__section">
      <h4>
        <Send size={14} /> Quote a customer
      </h4>
      <p className="record-sheet__hint">
        Builds a priced quotation with this itinerary, the inclusions and the terms attached.
      </p>
      <div className="record-sheet__field-row">
        <label className="record-sheet__field">
          Travellers
          <input
            type="number"
            min={1}
            value={adults}
            onChange={(e) => setAdults(e.target.value)}
            aria-label="Number of travellers"
          />
        </label>
        <label className="record-sheet__field">
          Children
          <input
            type="number"
            min={0}
            value={children}
            onChange={(e) => setChildren(e.target.value)}
            aria-label="Number of children"
          />
        </label>
      </div>
      <label className="record-sheet__field">
        Customer name
        <input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="e.g. Priya Mehta"
          aria-label="Customer name"
        />
      </label>
      <div className="record-sheet__field-row">
        <label className="record-sheet__field">
          Email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
            aria-label="Customer email"
          />
        </label>
        <label className="record-sheet__field">
          Travel date
          <input
            type="date"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
            aria-label="Travel date"
          />
        </label>
      </div>

      <ul className="record-sheet__task-list">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <div className="min-w-0 flex-1">
              <strong>{item.label}</strong>
              <small>
                {item.qty} × {money(item.rate, currency)} = {money(item.qty * item.rate, currency)}
              </small>
            </div>
          </li>
        ))}
        <li className="record-sheet__totals">
          <div className="min-w-0 flex-1">
            <strong>
              {money(price.total, currency)} + GST {taxRate}%
            </strong>
            <small>{money(grandTotal, currency)} quoted for {adultCount + childCount} travellers</small>
          </div>
        </li>
      </ul>
      {price.childRateAssumed && (
        <p className="record-sheet__hint">
          No child rate is set, so children are quoted at the adult rate. Add a child rate in the
          plan if children travel cheaper.
        </p>
      )}
      {!priced && (
        <p className="record-sheet__hint">
          This package has no per-person price, so it cannot be quoted yet.
        </p>
      )}
      <div className="record-sheet__actions">
        <button type="button" onClick={create} disabled={busy || !priced}>
          <IndianRupee size={14} /> Create the quotation
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *\
   The editor
\* ------------------------------------------------------------------ */

function PlanEditor({
  draft,
  currency,
  onChange,
}: {
  draft: PackagePlan;
  currency: string;
  onChange: (next: PackagePlan) => void;
}) {
  return (
    <div className="space-y-3">
      <ItineraryEditor days={draft.days} onChange={(days) => onChange({ ...draft, days })} />

      <LineListEditor
        label="What is included"
        placeholder="e.g. 5 nights in a 4-star hotel with breakfast"
        items={draft.inclusions}
        onChange={(inclusions) => onChange({ ...draft, inclusions })}
      />
      <LineListEditor
        label="Not included"
        placeholder="e.g. International flights, visa fees"
        items={draft.exclusions}
        onChange={(exclusions) => onChange({ ...draft, exclusions })}
      />

      <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Price per person
          </span>
          <span className="text-[11.5px] text-muted">{currency}</span>
        </div>
        <div className="space-y-2">
          {draft.slabs.map((slab, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={slab.pax}
                aria-label={`Group size row ${index + 1}`}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    slabs: draft.slabs.map((s, i) =>
                      i === index ? { ...s, pax: Math.max(1, Number(e.target.value) || 1) } : s,
                    ),
                  })
                }
                className="h-9 w-16 rounded-xl border border-line-2 bg-solid px-2 text-[12.5px] text-foreground"
              />
              <span className="text-[12px] text-muted">travellers pay</span>
              <input
                type="number"
                min={0}
                value={slab.rate || ""}
                placeholder="48000"
                aria-label={`Price per person row ${index + 1}`}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    slabs: draft.slabs.map((s, i) =>
                      i === index ? { ...s, rate: Number(e.target.value) || 0 } : s,
                    ),
                  })
                }
                className="h-9 min-w-0 flex-1 rounded-xl border border-line-2 bg-solid px-2 text-[12.5px] text-foreground"
              />
              <span className="text-[12px] text-muted">each</span>
              <button
                type="button"
                aria-label={`Remove price row ${index + 1}`}
                onClick={() => onChange({ ...draft, slabs: draft.slabs.filter((_, i) => i !== index) })}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:text-tomato"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              slabs: [...draft.slabs, { pax: Math.max(2, (draft.slabs.at(-1)?.pax ?? 0) + 2), rate: 0 }],
            })
          }
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-[12.5px] font-semibold text-foreground hover:bg-well"
        >
          <Plus size={14} /> Add another group size
        </button>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          A bigger group normally pays less. A party smaller than the smallest row is quoted at that
          row's rate — that is the “from” price.
        </p>
      </div>

      <div className="record-sheet__field-row">
        <label className="record-sheet__field">
          Cost per person
          <input
            type="number"
            min={0}
            value={draft.costPerPerson ?? ""}
            placeholder="supplier cost"
            onChange={(e) =>
              onChange({ ...draft, costPerPerson: Number(e.target.value) || null })
            }
          />
        </label>
        <label className="record-sheet__field">
          Child rate
          <input
            type="number"
            min={0}
            value={draft.childRate ?? ""}
            placeholder="empty = adult rate"
            onChange={(e) => onChange({ ...draft, childRate: Number(e.target.value) || null })}
          />
        </label>
        <label className="record-sheet__field">
          Single supplement
          <input
            type="number"
            min={0}
            value={draft.singleSupplement ?? ""}
            placeholder="one traveller"
            onChange={(e) =>
              onChange({ ...draft, singleSupplement: Number(e.target.value) || null })
            }
          />
        </label>
      </div>

      <div className="record-sheet__field-row">
        <label className="record-sheet__field">
          Valid from
          <input
            type="date"
            value={draft.validFrom}
            onChange={(e) => onChange({ ...draft, validFrom: e.target.value })}
          />
        </label>
        <label className="record-sheet__field">
          Valid till
          <input
            type="date"
            value={draft.validTo}
            onChange={(e) => onChange({ ...draft, validTo: e.target.value })}
          />
        </label>
      </div>

      <label className="record-sheet__field">
        Terms on the quote
        <textarea
          rows={3}
          value={draft.terms}
          placeholder="e.g. 25% advance confirms the booking; balance 15 days before departure."
          onChange={(e) => onChange({ ...draft, terms: e.target.value })}
        />
      </label>
    </div>
  );
}

function LineListEditor({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    const line = value.trim();
    if (!line) return;
    onChange([...items.filter((item) => item !== line), line]);
    setValue("");
  };
  return (
    <div className="rounded-2xl border border-line bg-glass-2 p-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</span>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12.5px] text-foreground">
              <span className="min-w-0 flex-1 leading-tight">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((line) => line !== item))}
                className="text-faint hover:text-tomato"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="record-sheet__quote-form">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={label}
        />
        <button type="button" onClick={add} aria-label={`Add to ${label.toLowerCase()}`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

/** Kept for the empty-plan case so callers do not import the lib directly. */
export const emptyPackagePlan: () => PackagePlan = emptyPlan;
