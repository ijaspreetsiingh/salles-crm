import { useMemo, useState } from "react";
import { BedDouble, Check, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  MEAL_PLANS,
  RATE_BASIS,
  createHotelRate,
  deleteHotelRate,
  fetchHotelRates,
  updateHotelRate,
  type HotelRateDto,
} from "@/lib/api/hotel-rates";

/**
 * Rate plans — the contracted price of a room, kept where quoting happens.
 *
 * The generic record table in this module holds the hotels themselves. This
 * tab holds what a hotel *costs*: one row per room type, meal plan and season,
 * with supplier cost and selling price side by side so the margin is visible
 * before the quotation goes out, not after the trip is over.
 */

type Draft = {
  hotelName: string;
  city: string;
  roomType: string;
  mealPlan: string;
  season: string;
  validFrom: string;
  validTo: string;
  costPrice: string;
  sellingPrice: string;
  currency: string;
  basis: string;
  supplierName: string;
  cancellation: string;
  notes: string;
};

const emptyDraft = (currency: string): Draft => ({
  hotelName: "",
  city: "",
  roomType: "Deluxe",
  mealPlan: "CP",
  season: "All year",
  validFrom: "",
  validTo: "",
  costPrice: "",
  sellingPrice: "",
  currency,
  basis: "Per room per night",
  supplierName: "",
  cancellation: "",
  notes: "",
});

const toDraft = (rate: HotelRateDto): Draft => ({
  hotelName: rate.hotelName,
  city: rate.city,
  roomType: rate.roomType,
  mealPlan: rate.mealPlan,
  season: rate.season,
  validFrom: rate.validFrom ?? "",
  validTo: rate.validTo ?? "",
  costPrice: String(rate.costPrice),
  sellingPrice: String(rate.sellingPrice),
  currency: rate.currency,
  basis: rate.basis,
  supplierName: rate.supplierName,
  cancellation: rate.cancellation,
  notes: rate.notes,
});

export function HotelRates() {
  const { settings } = useCRM();
  const currency = settings.currency || "INR";
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("All cities");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(currency));
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApiQuery(
    () =>
      fetchHotelRates({
        ...(search ? { q: search } : {}),
        ...(city === "All cities" ? {} : { city }),
        inactive: showInactive,
      }),
    [search, city, showInactive],
  );

  const items = data?.items ?? [];
  const hotels = useMemo(() => new Set(items.map((item) => item.hotelName)).size, [items]);

  const startAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(currency));
    setAdding(true);
  };

  const startEdit = (rate: HotelRateDto) => {
    setAdding(false);
    setEditing(rate.id);
    setDraft(toDraft(rate));
  };

  const close = () => {
    setAdding(false);
    setEditing(null);
  };

  const save = async () => {
    const cost = Number(draft.costPrice);
    const sell = Number(draft.sellingPrice);
    if (!draft.hotelName.trim()) {
      toast.error("Which hotel is this rate for?");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Enter what the hotel charges you");
      return;
    }
    if (!Number.isFinite(sell) || sell <= 0) {
      toast.error("Enter the price you sell the room at");
      return;
    }
    setBusy(true);
    try {
      const body = {
        hotelName: draft.hotelName.trim(),
        city: draft.city.trim(),
        roomType: draft.roomType.trim() || "Standard",
        mealPlan: draft.mealPlan,
        season: draft.season.trim() || "All year",
        ...(draft.validFrom ? { validFrom: draft.validFrom } : {}),
        ...(draft.validTo ? { validTo: draft.validTo } : {}),
        costPrice: cost,
        sellingPrice: sell,
        currency: draft.currency || currency,
        basis: draft.basis,
        supplierName: draft.supplierName.trim(),
        cancellation: draft.cancellation.trim(),
        notes: draft.notes.trim(),
      };
      if (editing) {
        await updateHotelRate(editing, body);
        toast.success("Rate updated");
      } else {
        await createHotelRate(body);
        toast.success("Rate added — you can quote it straight away");
      }
      close();
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the rate"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (rate: HotelRateDto) => {
    try {
      await deleteHotelRate(rate.id);
      toast.success(`${rate.hotelName} ${rate.roomType} rate retired`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not remove the rate"));
    }
  };

  const form = (
    <section className="glass-card grid gap-3 p-4 md:grid-cols-4">
      <Field label="Hotel">
        <input
          value={draft.hotelName}
          onChange={(e) => setDraft({ ...draft, hotelName: e.target.value })}
          placeholder="e.g. Marina Bay Sands"
          autoFocus
        />
      </Field>
      <Field label="City">
        <input
          value={draft.city}
          onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          placeholder="Singapore"
        />
      </Field>
      <Field label="Room type">
        <input
          value={draft.roomType}
          onChange={(e) => setDraft({ ...draft, roomType: e.target.value })}
          placeholder="Deluxe"
        />
      </Field>
      <Field label="Meal plan">
        <select
          value={draft.mealPlan}
          onChange={(e) => setDraft({ ...draft, mealPlan: e.target.value })}
        >
          {MEAL_PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Season">
        <input
          value={draft.season}
          onChange={(e) => setDraft({ ...draft, season: e.target.value })}
          placeholder="Peak / Lean / All year"
        />
      </Field>
      <Field label="Valid from">
        <input
          type="date"
          value={draft.validFrom}
          onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })}
        />
      </Field>
      <Field label="Valid to">
        <input
          type="date"
          value={draft.validTo}
          onChange={(e) => setDraft({ ...draft, validTo: e.target.value })}
        />
      </Field>
      <Field label="Basis">
        <select value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })}>
          {RATE_BASIS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Cost to us (${draft.currency || currency})`}>
        <input
          type="number"
          min="0"
          value={draft.costPrice}
          onChange={(e) => setDraft({ ...draft, costPrice: e.target.value })}
          placeholder="0"
        />
      </Field>
      <Field label="Selling price">
        <input
          type="number"
          min="0"
          value={draft.sellingPrice}
          onChange={(e) => setDraft({ ...draft, sellingPrice: e.target.value })}
          placeholder="0"
        />
      </Field>
      <Field label="Supplier / DMC">
        <input
          value={draft.supplierName}
          onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })}
          placeholder="Who we book through"
        />
      </Field>
      <Field label="Cancellation">
        <input
          value={draft.cancellation}
          onChange={(e) => setDraft({ ...draft, cancellation: e.target.value })}
          placeholder="e.g. Free until 7 days before"
        />
      </Field>
      <Field label="Notes">
        <input
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Optional"
        />
      </Field>
      <div className="md:col-span-4 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          <Check className="size-4" /> {busy ? "Saving…" : editing ? "Save rate" : "Add rate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
        {Number(draft.sellingPrice) > 0 && Number(draft.costPrice) >= 0 && (
          <span className="text-xs text-muted">
            Margin{" "}
            <strong className="text-foreground">
              {money(
                Number(draft.sellingPrice) - Number(draft.costPrice),
                draft.currency || currency,
              )}
            </strong>
            {Number(draft.sellingPrice) > 0
              ? ` · ${Math.round(((Number(draft.sellingPrice) - Number(draft.costPrice)) / Number(draft.sellingPrice)) * 1000) / 10}%`
              : ""}
          </span>
        )}
      </div>
    </section>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Rates on file"
          value={String(items.length)}
          hint={`${hotels} hotel${hotels === 1 ? "" : "s"}`}
          tone="pine"
        />
        <Stat
          label="Average margin"
          value={
            data?.totals.avgMarginPercent === null || data?.totals.avgMarginPercent === undefined
              ? "—"
              : `${data.totals.avgMarginPercent}%`
          }
          hint="Across every rate in view"
        />
        <Stat
          label="Cities covered"
          value={String(data?.cities.length ?? 0)}
          hint="Destination pricing at a glance"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hotel, room, season or supplier"
            className="h-9 w-full rounded-xl border border-rim bg-solid pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="h-9 rounded-xl border border-rim bg-solid px-3 text-sm"
        >
          <option>All cities</option>
          {(data?.cities ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant={showInactive ? "default" : "outline"}
          onClick={() => setShowInactive((value) => !value)}
        >
          {showInactive ? "Hiding nothing" : "Show retired"}
        </Button>
        <Button size="sm" onClick={startAdd}>
          <Plus className="size-4" /> Add rate
        </Button>
      </div>

      {adding && form}
      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && items.length === 0 && <p className="text-sm text-muted">Loading rate plans…</p>}

      {!loading && items.length === 0 && !adding && (
        <section className="glass-card p-6 text-center">
          <BedDouble className="mx-auto mb-3 size-6 text-muted" />
          <h3 className="text-base font-semibold">No room rates yet</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
            Add the rates your hotels give you — cost, selling price, season and the cancellation
            rule. Every quotation after that starts from a real number instead of a guess.
          </p>
          <Button size="sm" className="mt-3" onClick={startAdd}>
            <Plus className="size-4" /> Add the first rate
          </Button>
        </section>
      )}

      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((rate) => (
            <li key={rate.id} className="glass-card p-3">
              {editing === rate.id ? (
                form
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-sm">{rate.hotelName}</strong>
                      <span className="rounded-full border border-rim px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                        {rate.roomType} · {rate.mealPlan}
                      </span>
                      {!rate.active && (
                        <span className="status status-warning">
                          <span /> Retired
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[rate.city, rate.season, rate.basis].filter(Boolean).join(" · ")}
                      {rate.validFrom || rate.validTo
                        ? ` · ${rate.validFrom || "…"} → ${rate.validTo || "…"}`
                        : ""}
                      {rate.supplierName ? ` · via ${rate.supplierName}` : ""}
                    </p>
                    {rate.cancellation && (
                      <p className="mt-0.5 truncate text-xs text-faint">{rate.cancellation}</p>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold tabular-nums">
                      {money(rate.sellingPrice, rate.currency || currency)}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-xs text-muted">
                      <TrendingUp className="size-3" />
                      {money(rate.margin, rate.currency || currency)}
                      {rate.marginPercent !== null ? ` · ${rate.marginPercent}%` : ""}
                    </div>
                    <div className="text-[11px] text-faint">
                      cost {money(rate.costPrice, rate.currency || currency)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(rate)}
                    title="Edit rate"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(rate)}
                    title="Retire rate"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  tone?: "ink" | "pine";
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === "pine" ? "text-pine" : "text-foreground"
        }`}
      >
        {value}
      </p>
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
