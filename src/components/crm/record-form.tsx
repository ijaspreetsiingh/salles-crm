/**
 * The create / edit surface for every module.
 *
 * A CRM form is where the work actually happens, so this is not a list of
 * inputs: it is a document editor. It knows the module's sections, links
 * records to real customers and bookings, computes nights and balances,
 * contains the structured rows (sectors, rooms, travellers, checklists) and
 * only reports success once the server has kept the change.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money, type Module, type RecordRow } from "@/lib/crm/catalog";
import { editorsFor, type EditorRow } from "@/lib/crm/editors";
import { getSchema, type FieldDef } from "@/lib/crm/schema";
import { nextRecordId, recordPrefix } from "@/lib/crm/ids";
import { useCRM } from "@/lib/crm/store";
import {
  ChecklistEditor,
  DocumentSummary,
  ItineraryEditor,
  LineItemsEditor,
  PaymentsLedger,
  RepeatableEditor,
  documentTotals,
  hasItinerary,
  hasLineItems,
  hasPayments,
  parseChecklist,
  parseItinerary,
  parseLineItems,
  parsePayments,
  parseTable,
  type ItineraryDay,
  type LineItem,
  type PaymentEntry,
} from "./document-builder";
import { useApiQuery } from "@/lib/api/hooks";
import { createPayment as apiCreatePayment, fetchLedger, removePayment } from "@/lib/api/payments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const today = () => new Date().toISOString().slice(0, 10);

const addDays = (iso: string, days: number) => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) => {
  if (!from || !to) return 0;
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
};

/** The status a brand-new record should start in, not whatever the API lists first. */
const START_STATUS: Record<string, string> = {
  leads: "New",
  quotations: "Draft",
  finance: "Draft",
  packages: "Draft",
  bookings: "Pending",
  hotels: "Requested",
  flights: "Held",
  transfers: "Requested",
  visa: "Documents pending",
  groups: "Planning",
  operations: "Upcoming",
  suppliers: "KYC pending",
  customers: "Active",
  companies: "Prospect",
};

const startStatus = (moduleId: string, statuses: string[]) => {
  const preferred = START_STATUS[moduleId];
  if (preferred && statuses.includes(preferred)) return preferred;
  return statuses[0] ?? "New";
};

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

/** Modules whose name field is the customer on the record. */
const CUSTOMER_MODULES = new Set(["leads", "quotations", "bookings", "finance", "support", "visa"]);

type Draft = {
  name: string;
  email: string;
  phone: string;
  destination: string;
  owner: string;
  branch: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  detail: string;
  source: string;
  notes: string;
  extra: Record<string, string | number>;
};

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));

export function RecordForm({
  module,
  row,
  create,
  initialData,
  onClose,
  onSaved,
}: {
  module: Module;
  row?: RecordRow | null | undefined;
  create: boolean;
  initialData?: Partial<RecordRow> | undefined;
  onClose: () => void;
  onSaved: (saved: RecordRow, created: boolean) => void;
}) {
  const {
    settings,
    getRows,
    createRecord,
    updateRecord,
    refreshModuleRecords,
    status: authStatus,
  } = useCRM();
  const schema = getSchema(module.id);
  const spec = editorsFor(module.id);
  const currency = row?.currency || initialData?.currency || settings.currency;
  const employees = settings.employees.filter((e) => e.active);

  const customers = getRows("customers");
  const bookings = getRows("bookings");

  /* ---------------- Draft ---------------- */

  const [draft, setDraft] = useState<Draft>(() => {
    const extras = { ...(row?.extra ?? {}), ...(initialData?.extra ?? {}) };
    return {
      name: text(row?.name ?? initialData?.name),
      email: text(row?.email ?? initialData?.email),
      phone: text(row?.phone ?? initialData?.phone),
      destination: text(row?.destination ?? initialData?.destination),
      owner: text(row?.owner ?? initialData?.owner ?? employees[0]?.name ?? ""),
      branch: text(row?.branch ?? initialData?.branch ?? settings.branches[0] ?? ""),
      date: text(row?.date ?? initialData?.date) || today(),
      amount: Number(row?.amount ?? initialData?.amount ?? 0),
      currency: text(row?.currency ?? initialData?.currency ?? settings.currency),
      status: text(row?.status ?? initialData?.status ?? startStatus(module.id, schema.statuses)),
      detail: text(row?.detail ?? initialData?.detail),
      source: text(row?.source ?? initialData?.source),
      notes: text(row?.notes ?? initialData?.notes),
      customerType: text(row?.customerType ?? initialData?.customerType ?? ""),
      extra: extras,
    };
  });

  const [items, setItems] = useState<LineItem[]>(() => parseLineItems(row));
  const [days, setDays] = useState<ItineraryDay[]>(() => parseItinerary(row));
  const [taxPercent, setTaxPercent] = useState<number>(() => {
    const stored = Number(row?.extra?.["gst"] ?? Number.NaN);
    if (Number.isFinite(stored)) return stored;
    return module.id === "finance" || module.id === "quotations"
      ? Number(settings.taxRate ?? 0)
      : 0;
  });
  /**
   * TCS on an invoice, defaulting to the organisation's rate. Stored per
   * invoice as `extra.tcsRate` so an old invoice keeps the rate it was issued
   * with even after the default is changed.
   */
  const [tcsPercent, setTcsPercent] = useState<number>(() => {
    const stored = Number(row?.extra?.["tcsRate"] ?? Number.NaN);
    if (Number.isFinite(stored)) return stored;
    return module.id === "finance" ? Number(settings.tcsPercent ?? 0) : 0;
  });
  const [payments, setPayments] = useState<PaymentEntry[]>(() => {
    const stored = parsePayments(row);
    if (stored.length > 0) return stored;
    const received = Number(row?.extra?.["received"] ?? 0);
    if (received > 0) {
      return [
        {
          date: text(row?.extra?.["invoiceDate"]) || text(row?.date) || today(),
          amount: received,
          method: text(row?.extra?.["paymentMode"]) || "Bank transfer",
          note: "Recorded before payments were itemised",
        },
      ];
    }
    return [];
  });

  const moneyLedger = hasPayments(module.id);

  const { data: ledger, reload: reloadLedger } = useApiQuery(
    () =>
      row && moneyLedger
        ? fetchLedger(module.id, row.id)
        : Promise.resolve({ items: [], totals: null }),
    [module.id, row?.id, moneyLedger],
    authStatus === "ready" && Boolean(row) && moneyLedger,
  );

  // Server payments are the truth once the record exists.
  useEffect(() => {
    if (!ledger?.items?.length) return;
    setPayments(
      ledger.items.map((entry) => ({
        id: entry.id,
        ...(entry.receiptNo ? { receiptNo: entry.receiptNo } : {}),
        date: entry.paidOn,
        amount: entry.amount,
        method: entry.method,
        ...(entry.referenceNo ? { reference: entry.referenceNo } : {}),
        ...(entry.note ? { note: entry.note } : {}),
      })),
    );
  }, [ledger]);

  const [tables, setTables] = useState<Record<string, EditorRow[]>>(() => {
    const out: Record<string, EditorRow[]> = {};
    for (const table of spec.tables ?? []) {
      const stored = parseTable(row, table.key);
      out[table.key] = stored.length > 0 ? stored : (table.seed ?? []);
    }
    return out;
  });

  const [checks, setChecks] = useState<Record<string, EditorRow[]>>(() => {
    const out: Record<string, EditorRow[]> = {};
    for (const list of spec.checklists ?? []) {
      out[list.key] = parseChecklist(row, list.key, list.items);
    }
    return out;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [linkedCustomer, setLinkedCustomer] = useState<string | null>(() => {
    const found = customers.find(
      (customer) => customer.name.trim().toLowerCase() === text(row?.name).trim().toLowerCase(),
    );
    return found?.id ?? null;
  });

  const buildLines = hasLineItems(module.id);
  const buildItinerary = hasItinerary(module.id);
  const buildPayments = hasPayments(module.id);
  const chargesTax = module.id === "quotations" || module.id === "finance";
  const isDocument = buildLines || buildItinerary || buildPayments;

  const totals = documentTotals(items, chargesTax ? taxPercent : 0, payments, draft.amount);

  /* ---------------- Field plumbing ---------------- */

  const isExtra = (key: string) => key.startsWith("extra:");
  const extraKey = (key: string) => key.slice(6);

  const valueOf = (field: FieldDef) =>
    isExtra(field.key)
      ? text(draft.extra[extraKey(field.key)])
      : text(draft[field.key as keyof Draft]);

  const setField = (field: FieldDef, value: string | number) => {
    setErrors((prev) => {
      if (!prev[field.key]) return prev;
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
    if (isExtra(field.key)) {
      const key = extraKey(field.key);
      setDraft((prev) => ({ ...prev, extra: { ...prev.extra, [key]: value } }));
      return;
    }
    setDraft((prev) => ({ ...prev, [field.key]: value }) as Draft);
  };

  const optionsFor = (field: FieldDef): string[] => {
    if (Array.isArray(field.options)) return field.options;
    switch (field.options) {
      case "statuses":
        return schema.statuses;
      case "owners":
        return employees.map((e) => e.name);
      case "branches":
        return settings.branches;
      case "sources":
        return schema.sources ?? ["Website", "WhatsApp", "Referral", "B2B agent"];
      case "customers":
        return customers.map((customer) => customer.name).filter(Boolean);
      case "bookings":
        return bookings.map((booking) => booking.id);
      case "suppliers":
        return getRows("suppliers")
          .map((supplier) => supplier.name)
          .filter(Boolean);
      case "packages":
        return getRows("packages")
          .map((pkg) => pkg.name)
          .filter(Boolean);
      case "hotels":
        return getRows("hotels")
          .map((hotel) => hotel.name)
          .filter(Boolean);
      default:
        return [];
    }
  };

  /** Picking a known customer fills the rest of the contact block. */
  const handleNameChange = (value: string) => {
    setDraft((prev) => ({ ...prev, name: value }));
    setErrors((prev) => {
      if (!prev["name"]) return prev;
      const next = { ...prev };
      delete next["name"];
      return next;
    });
    const match = customers.find(
      (customer) => customer.name.trim().toLowerCase() === value.trim().toLowerCase(),
    );
    setLinkedCustomer(match?.id ?? null);
    if (match) {
      setDraft((prev) => ({
        ...prev,
        name: match.name,
        email: prev.email || match.email,
        phone: prev.phone || match.phone,
      }));
    }
  };

  /* ---------------- Validation ---------------- */

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const field of schema.fields) {
      const value = valueOf(field).trim();
      if (field.required && !value) found[field.key] = `${field.label} is required`;
      if (value && field.type === "email" && !isEmail(value))
        found[field.key] = "That does not look like an email address";
      if (value && field.type === "tel" && value.replace(/\D/g, "").length < 7)
        found[field.key] = "Add a phone number with at least 7 digits";
      if (value && field.type === "number" && Number(value) < 0)
        found[field.key] = `${field.label} cannot be negative`;
    }

    // Dates that have to make sense together, per module.
    const extra = draft.extra;
    if (module.id === "hotels") {
      const checkin = text(extra["checkin"]);
      const checkout = text(extra["checkout"]);
      if (checkin && checkout && checkout <= checkin)
        found["extra:checkout"] = "Check-out must be after check-in";
    }
    if (module.id === "bookings") {
      const departure = text(extra["departure"]);
      const back = text(extra["return"]);
      if (departure && back && back < departure)
        found["extra:return"] = "Return date cannot be before departure";
    }
    if (module.id === "groups") {
      const departure = draft.date;
      const back = text(extra["return"]);
      if (departure && back && back < departure)
        found["extra:return"] = "Return date cannot be before departure";
    }
    if (buildPayments && totals.paid > totals.total + 0.5) {
      found["payments"] = "Payments received are more than the document total";
    }
    return found;
  };

  const focusFirstError = (found: Record<string, string>) => {
    const firstKey = Object.keys(found)[0];
    if (!firstKey) return;
    document
      .querySelector<HTMLElement>(`[data-field="${firstKey}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    document
      .querySelector<HTMLElement>(
        `[data-field="${firstKey}"] input, [data-field="${firstKey}"] select, [data-field="${firstKey}"] textarea`,
      )
      ?.focus();
  };

  /* ---------------- Save ---------------- */

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authStatus !== "ready") {
      toast.error("Not connected — start the backend before saving records");
      return;
    }
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      toast.error("A few details still need your attention");
      focusFirstError(found);
      return;
    }
    setErrors({});

    const extras: Record<string, string | number> = { ...draft.extra };
    // Empty inputs should clear the stored value, not save "".
    for (const field of schema.fields) {
      if (!isExtra(field.key)) continue;
      const key = extraKey(field.key);
      const value = valueOf(field);
      if (value === "") delete extras[key];
      else extras[key] = value;
    }
    let amount = Number(draft.amount) || 0;
    let tableRows: Record<string, EditorRow[]> = tables;

    // A stay's nights come from its dates, so the room table never asks twice.
    if (module.id === "hotels") {
      const nights = daysBetween(text(extras["checkin"]), text(extras["checkout"]));
      const held = tableRows["rooms"];
      if (nights > 0 && held && held.length > 0) {
        const rooms = held.map((row) => ({
          ...row,
          nights: Number(row.nights) > 0 ? Number(row.nights) : nights,
        }));
        tableRows = { ...tableRows, rooms };
        setTables((prev) => ({ ...prev, rooms }));
        if (draft.amount <= 0) {
          const rate = rooms.reduce(
            (sum, row) =>
              sum +
              (Number(row.count) || 0) * (Number(row.nights) || nights) * (Number(row.rate) || 0),
            0,
          );
          if (rate > 0) amount = rate;
        }
      }
    }

    // Structured tables keep their rows and write the summary keys the list reads.
    for (const table of spec.tables ?? []) {
      const rows = (tableRows[table.key] ?? []).filter((entry) =>
        Object.values(entry).some((value) => String(value ?? "").trim() !== ""),
      );
      if (rows.length > 0) extras[table.key] = JSON.stringify(rows);
      else delete extras[table.key];
      if (table.derive) {
        const derived = table.derive(rows);
        for (const [key, value] of Object.entries(derived)) {
          if (value === "" || value === 0) delete extras[key];
          else extras[key] = value;
        }
      }
    }

    for (const list of spec.checklists ?? []) {
      const rows = checks[list.key] ?? [];
      const done = rows.filter((row) => row.done).length;
      extras[list.key] = JSON.stringify(rows);
      if (list.derive) {
        for (const [key, value] of Object.entries(list.derive(rows))) extras[key] = value;
      }
      if (done > 0) extras[`${list.key}Done`] = done;
      else delete extras[`${list.key}Done`];
    }

    const status = draft.status;

    if (buildLines && items.length > 0) {
      extras["quoteItems"] = JSON.stringify(
        items.map(({ label, qty, rate }) => ({ label, qty, rate })),
      );
      amount = totals.total;
      if (totals.cost !== null) extras["cost"] = totals.cost;
    }
    if (buildItinerary) {
      if (days.length > 0) extras["itinerary"] = JSON.stringify(days);
      else delete extras["itinerary"];
      // A package keeps its day list inside the stored plan as well. Editing the
      // days here has to update that copy, or the package builder would show the
      // old plan back.
      const storedPlan = row?.extra?.["packagePlan"];
      if (typeof storedPlan === "string" && storedPlan.trim()) {
        try {
          const plan = JSON.parse(storedPlan) as Record<string, unknown>;
          plan["days"] = days.filter((day) => day.title.trim() || day.detail.trim());
          extras["packagePlan"] = JSON.stringify(plan);
        } catch {
          // A corrupted plan is left alone; the builder rewrites it on save.
        }
      }
    }
    // Payments are written to the ledger after the record exists, so no
    // JSON copy is kept here and the two can never disagree.
    if (chargesTax) extras["gst"] = taxPercent;
    // Written even when zero, so clearing TCS on one invoice sticks.
    if (module.id === "finance") extras["tcsRate"] = tcsPercent;

    // The list, calendar and operations board read the core date, so a booking
    // starts on its departure and a hotel stay starts on its check-in.
    let coreDate = draft.date;
    if (module.id === "bookings" && text(extras["departure"])) coreDate = text(extras["departure"]);
    if (module.id === "hotels" && text(extras["checkin"])) coreDate = text(extras["checkin"]);

    if (linkedCustomer) extras["customerRef"] = linkedCustomer;

    const next: RecordRow = {
      ...(row ?? {
        id: nextRecordId(module),
        name: "",
        detail: "",
        destination: "",
        owner: "",
        branch: "",
        date: "",
        amount: 0,
        status,
        email: "",
        phone: "",
        source: "",
        notes: "",
      }),
      name: draft.name.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      destination: draft.destination.trim(),
      owner: draft.owner,
      branch: draft.branch,
      date: coreDate,
      amount,
      currency: draft.currency,
      status,
      detail: draft.detail,
      source: draft.source,
      notes: draft.notes,
      ...(Object.keys(extras).length > 0 ? { extra: extras } : {}),
    };

    setSaving(true);
    try {
      const saved = create
        ? await createRecord(module.id, next)
        : await updateRecord(module.id, next);
      if (!saved) return; // the store has already explained what failed

      if (moneyLedger) {
        try {
          const onServer = (ledger?.items ?? []).map((entry) => entry.id);
          const keep = new Set(payments.map((entry) => entry.id).filter(Boolean) as string[]);
          for (const id of onServer) {
            if (!keep.has(id)) await removePayment(id);
          }
          for (const entry of payments) {
            if (entry.id) continue;
            await apiCreatePayment({
              module: module.id as "finance" | "bookings",
              reference: saved.id,
              amount: entry.amount,
              ...(saved.currency ? { currency: saved.currency } : {}),
              method: entry.method,
              ...(entry.reference ? { referenceNo: entry.reference } : {}),
              ...(entry.note ? { note: entry.note } : {}),
              paidOn: entry.date,
            });
          }
          if (payments.length > 0 || onServer.length > 0) {
            reloadLedger();
            await refreshModuleRecords(module.id);
          }
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Record saved, but the payment ledger did not update: ${error.message}`
              : "Record saved, but the payment ledger did not update",
          );
        }
      }

      toast.success(create ? `${module.noun} ${saved.id} created` : `${module.noun} updated`);
      onSaved(saved, create);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Fields declared as "Contact" belong to the "Customer" section on modules
   * that call it that — otherwise a booking would render no contact block.
   */
  const sectionOf = (field: FieldDef) =>
    field.group === "Contact" && schema.sections.includes("Customer") ? "Customer" : field.group;

  /* ---------------- Section progress ---------------- */

  const sections = useMemo(() => {
    return schema.sections
      .map((section) => {
        const sectionFields = schema.fields.filter((field) => sectionOf(field) === section);
        const required = sectionFields.filter((field) => field.required);
        const filled = required.filter((field) => valueOf(field).trim() !== "").length;
        return { section, empty: sectionFields.length === 0, complete: filled === required.length };
      })
      .filter((entry) => !entry.empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, draft, checks]);

  const counts = useMemo(
    () => ({
      travellers: (tables["travellers"] ?? []).filter((r) => text(r.name).trim()).length,
      sectors: (tables["sectors"] ?? []).filter((r) => text(r.from).trim()).length,
      rooms: (tables["rooms"] ?? []).filter((r) => text(r.roomType).trim()).length,
    }),
    [tables],
  );

  /* ---------------- Inputs ---------------- */

  const renderInput = (field: FieldDef) => {
    const value = valueOf(field);
    const options = optionsFor(field);
    const listId = `dl-${field.key.replace(/[^a-z0-9]/gi, "")}`;
    const hint = (() => {
      if (module.id === "hotels" && field.key === "extra:checkout") {
        const nights = daysBetween(text(draft.extra["checkin"]), value);
        return nights > 0 ? `${nights} night${nights === 1 ? "" : "s"} · ${value}` : undefined;
      }
      if (module.id === "bookings" && field.key === "extra:return") {
        const nights = daysBetween(text(draft.extra["departure"]), value);
        return nights > 0 ? `${nights} night${nights === 1 ? "" : "s"} on the road` : undefined;
      }
      if (module.id === "finance" && field.key === "date") {
        const terms = daysBetween(text(draft.extra["invoiceDate"]) || today(), value);
        return terms > 0 ? `Net ${terms} days from the invoice date` : undefined;
      }
      if (module.id === "quotations" && field.key === "extra:validUntil" && value) {
        const left = daysBetween(today(), value);
        return left >= 0
          ? `Valid for ${left} more day${left === 1 ? "" : "s"}`
          : "This validity date has passed";
      }
      return undefined;
    })();

    const common = {
      "aria-label": field.label,
      "aria-invalid": Boolean(errors[field.key]),
    };

    // The package link stores the package's reference, not its name, so the
    // quote keeps pointing at the right plan even after a rename. The empty
    // option is honest: nothing is selected until the person picks a package.
    if (field.key === "extra:packageRef") {
      const packages = getRows("packages");
      return (
        <div data-field={field.key}>
          <select
            {...common}
            value={text(draft.extra["packageRef"])}
            onChange={(e) => setField(field, e.target.value)}
          >
            <option value="">No package — price this quote manually</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} · {pkg.id}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {packages.length > 0
              ? "Pick a package to carry its itinerary, inclusions and pricing into this quote."
              : "No packages yet — build one under Packages, then pick it here to reuse its plan."}
          </p>
        </div>
      );
    }

    if (field.type === "select") {
      if (options.length === 0) {
        return (
          <div data-field={field.key}>
            <input
              {...common}
              value={value}
              onChange={(e) => setField(field, e.target.value)}
              placeholder="Type a value — none to pick from yet"
            />
            {hint && <p className="field-hint">{hint}</p>}
          </div>
        );
      }
      return (
        <div data-field={field.key}>
          <select
            {...common}
            value={value || options[0]}
            onChange={(e) => setField(field, e.target.value)}
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          {hint && <p className="field-hint">{hint}</p>}
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div data-field={field.key}>
          <textarea
            {...common}
            rows={3}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => setField(field, e.target.value)}
          />
          {hint && <p className="field-hint">{hint}</p>}
        </div>
      );
    }

    if (field.key === "amount") {
      return (
        <div data-field={field.key}>
          <span className="amount-with-currency">
            <input
              {...common}
              type="number"
              min={0}
              step="any"
              value={draft.amount || ""}
              placeholder="0"
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))
              }
            />
            <select
              aria-label="Currency"
              className="currency-select"
              value={draft.currency}
              onChange={(e) => setDraft((prev) => ({ ...prev, currency: e.target.value }))}
            >
              {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </span>
          {hint && <p className="field-hint">{hint}</p>}
        </div>
      );
    }

    const isCustomer = CUSTOMER_MODULES.has(module.id) && field.key === "name";
    return (
      <div data-field={field.key}>
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type}
          min={field.type === "number" ? 0 : undefined}
          step={field.type === "number" ? "any" : undefined}
          value={value}
          placeholder={field.placeholder}
          list={isCustomer ? listId : undefined}
          onChange={(e) =>
            isCustomer ? handleNameChange(e.target.value) : setField(field, e.target.value)
          }
        />
        {isCustomer && (
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        )}
        {isCustomer && linkedCustomer && (
          <p className="field-hint inline-flex items-center gap-1.5 text-pine">
            <Check className="size-3" /> Linked to customer {linkedCustomer}
          </p>
        )}
        {hint && <p className="field-hint">{hint}</p>}
      </div>
    );
  };

  const renderField = (field: FieldDef) => (
    <label
      key={field.key}
      className={cn(field.wide && "full-width", errors[field.key] && "has-error")}
    >
      <span className="field-label">
        {field.label}
        {field.required && <span className="req">*</span>}
      </span>
      {renderInput(field)}
      {errors[field.key] ? (
        <p className="field-error">{errors[field.key]}</p>
      ) : (
        field.hint &&
        !["extra:checkout", "extra:return"].includes(field.key) && (
          <p className="field-hint">{field.hint}</p>
        )
      )}
    </label>
  );

  const errorCount = Object.keys(errors).length;
  const summaryCurrency = draft.currency || currency;

  return (
    <form onSubmit={handleSubmit} className="record-form" noValidate>
      {/* Section jump bar — shows what is still missing, one click away. */}
      <div className="record-form__nav" role="tablist" aria-label="Form sections">
        <span className="record-form__ref">
          {create ? `${recordPrefix(module)} · new` : row?.id}
        </span>
        {sections.map(({ section, complete }) => (
          <button
            key={section}
            type="button"
            className={cn("record-form__chip", complete && "is-done")}
            onClick={() => {
              document
                .getElementById(`section-${module.id}-${section}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {complete && <Check className="size-3" />}
            {section}
          </button>
        ))}
      </div>

      {errorCount > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle className="size-4" />
          <span>
            {errorCount} field{errorCount === 1 ? " needs" : "s need"} fixing before this{" "}
            {module.noun} can be saved.
          </span>
        </div>
      )}

      <div className={isDocument ? "doc-grid" : undefined}>
        <div className="doc-grid__main">
          {buildLines && (
            <LineItemsEditor
              items={items}
              onChange={setItems}
              currency={summaryCurrency}
              showCost
              label={
                module.id === "quotations"
                  ? "What the quote covers"
                  : module.id === "bookings"
                    ? "Services on this booking"
                    : "What is being charged"
              }
            />
          )}

          {buildItinerary && <ItineraryEditor days={days} onChange={setDays} />}

          {(spec.tables ?? []).map((table) => (
            <RepeatableEditor
              key={table.key}
              spec={table}
              rows={tables[table.key] ?? []}
              onChange={(next) => setTables((prev) => ({ ...prev, [table.key]: next }))}
              currency={summaryCurrency}
            />
          ))}

          {schema.sections.map((section) => {
            const sectionFields = schema.fields.filter((field) => sectionOf(field) === section);
            if (sectionFields.length === 0) return null;
            return (
              <section
                key={section}
                id={`section-${module.id}-${section}`}
                className="form-section-card"
              >
                <div className="form-section-head">
                  <span className="form-section-label">{section}</span>
                  {module.id === "bookings" && section === "Trip" && counts.travellers > 0 && (
                    <span className="form-section-tag">{counts.travellers} travellers</span>
                  )}
                  {module.id === "hotels" && section === "Rooms" && counts.rooms > 0 && (
                    <span className="form-section-tag">{counts.rooms} room types</span>
                  )}
                </div>
                <div className="form-grid">{sectionFields.map(renderField)}</div>

                {/* Terms shortcuts sit with the amounts, where they are used. */}
                {module.id === "finance" && section === "Amounts" && (
                  <div className="form-quick-row">
                    <span className="form-quick-label">Payment terms</span>
                    {[0, 7, 15, 30].map((term) => (
                      <button
                        key={term}
                        type="button"
                        className="form-quick"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            date: addDays(text(prev.extra["invoiceDate"]) || today(), term),
                          }))
                        }
                      >
                        {term === 0 ? "Due on receipt" : `Net ${term}`}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {(spec.checklists ?? []).map((list) => (
            <ChecklistEditor
              key={list.key}
              spec={list}
              rows={checks[list.key] ?? []}
              onChange={(next) => setChecks((prev) => ({ ...prev, [list.key]: next }))}
            />
          ))}

          {buildPayments && (
            <div data-field="payments">
              <PaymentsLedger
                payments={payments}
                onChange={setPayments}
                currency={summaryCurrency}
                total={totals.total}
              />
              {errors["payments"] && <p className="field-error">{errors["payments"]}</p>}
            </div>
          )}

          {module.id === "quotations" && (
            <p className="record-form__note">
              <ExternalLink className="size-3.5" /> Saving a quotation offers a one-click conversion
              to a booking, so nothing is retyped.
            </p>
          )}
        </div>

        {isDocument ? (
          <DocumentSummary
            totals={totals}
            currency={summaryCurrency}
            taxPercent={chargesTax ? taxPercent : 0}
            onTaxChange={chargesTax ? setTaxPercent : undefined}
            tcsPercent={module.id === "finance" ? tcsPercent : 0}
            onTcsChange={module.id === "finance" ? setTcsPercent : undefined}
            showPayments={buildPayments}
            validity={text(draft.extra["validUntil"]) || undefined}
          />
        ) : (
          <aside className="record-rail">
            <div className="record-rail__title">At a glance</div>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{draft.status}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{draft.owner || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{draft.date || "—"}</dd>
              </div>
              {draft.amount > 0 && (
                <div>
                  <dt>Value</dt>
                  <dd>{money(draft.amount, summaryCurrency)}</dd>
                </div>
              )}
            </dl>
            {schema.tips[0] && (
              <p className="record-rail__tip">
                <Star className="size-3.5" /> {schema.tips[0]}
              </p>
            )}
          </aside>
        )}
      </div>

      <div className="record-form__footer">
        <span className="record-form__footer-hint">
          {create ? "Saved to your workspace once you press save." : `Editing ${row?.id}`}
        </span>
        <div className="record-form__footer-actions">
          <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="default" type="submit" disabled={saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check /> {create ? `Create ${module.noun}` : `Save ${module.noun}`}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
