import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  Search,
  Trash2,
  Wallet,
  Receipt,
  PlaneTakeoff,
  UserCheck,
  Users,
  Download,
  ExternalLink,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatDay, money, modules, type Module, type RecordRow } from "@/lib/crm/catalog";
import { formatSlaDue, slaState, slaStateLabel } from "@/lib/crm/sla";
import { buildJourney } from "@/lib/crm/journey";
import { statusGuide } from "@/lib/crm/language";
import { getSchema, type ColumnDef, type FieldDef } from "@/lib/crm/schema";
import { useCRM } from "@/lib/crm/store";
import { JourneyRail } from "./journey";
import { StatusHint } from "./help";
import { hasItinerary, hasLineItems, hasPayments } from "./document-builder";
import { RecordForm } from "./record-form";
import { cn } from "@/lib/utils";
import { errorMessage, apiBlob } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { fetchLedger, fetchReceipt, removePayment } from "@/lib/api/payments";
import { QuickPaymentForm } from "./quick-payment";
import {
  deleteAttachment,
  fetchAttachments,
  uploadAttachment,
  downloadInvoicePdf,
  createPaymentLink,
  sendInvoiceEmail,
} from "@/lib/api/modules";
import { toast } from "sonner";

export function Status({ value }: { value: string }) {
  let tone = "neutral";
  if (
    [
      "Active",
      "Confirmed",
      "Won",
      "Accepted",
      "Paid",
      "Approved",
      "Published",
      "Resolved",
      "Issued",
      "Connected",
      "Completed",
      "Vouchered",
      "Ticketed",
      "Verified",
      "Ready",
    ].includes(value)
  )
    tone = "success";
  if (
    [
      "Pending",
      "On hold",
      "Contacted",
      "Sent",
      "Partially paid",
      "In review",
      "KYC pending",
      "Documents pending",
      "Draft",
      "Requested",
      "Held",
      "Queued",
      "Scheduled",
      "Upcoming",
      "Onboarding",
      "Planning",
      "Open for sale",
      "Prospect",
      "Repeat",
      "Saved",
      "Assigned",
      "Submitted",
    ].includes(value)
  )
    tone = "warning";
  if (
    [
      "Overdue",
      "Lost",
      "Cancelled",
      "Expired",
      "Escalated",
      "No show",
      "Rejected",
      "Delayed",
      "Error",
      "Suspended",
    ].includes(value)
  )
    tone = "danger";
  if (
    [
      "New",
      "Qualified",
      "Quoted",
      "In progress",
      "Submitted",
      "Open",
      "VIP",
      "Live",
      "Departed",
      "Reissued",
      "Sent out",
    ].includes(value)
  )
    tone = "info";
  const guide = statusGuide(value);
  return (
    <span
      className={`status status-${tone} group relative`}
      title={`${guide.meaning} ${guide.next}`}
    >
      <span />
      {value}
      <StatusHint status={value} />
    </span>
  );
}

export function Avatar({ name, size = "normal" }: { name: string; size?: string }) {
  return (
    <span className={`person-avatar avatar-${size} tone-${name.length % 4}`}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

export type Stat = {
  /** Icon node rendered inside the circular badge. */
  icon: React.ReactNode;
  /** Primary value (number, formatted currency, etc). */
  value: React.ReactNode;
  /** Short label beneath the value. */
  label: string;
  /** Optional pill/badge rendered next to the value. */
  badge?: React.ReactNode;
};

export function PageHeading({
  eyebrow,
  title,
  description,
  stats,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Rapport-style stat row. When provided, renders the warm glass stat badges. */
  stats?: Stat[] | undefined;
  /** Right-aligned action buttons (export, create, etc). */
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading__title">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {stats && stats.length > 0 && (
        <div className="page-heading__stats">
          {stats.map((s, i) => (
            <div className="page-heading__stat" key={i}>
              <span className="stat-icon-circle">{s.icon}</span>
              <div>
                <div className="stat-value">
                  {s.value}
                  {s.badge}
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}

/** Rapport-style tone badge for stat pills (forest / sun / ember / light). */
export function ToneBadge({
  tone = "forest",
  children,
}: {
  tone?: "forest" | "sun" | "ember" | "light";
  children: React.ReactNode;
}) {
  const cls = `badge badge-${tone}`;
  return <span className={cls}>{children}</span>;
}

export function DateFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="select-control">
      <CalendarDays size={15} />
      <select aria-label="Date range" value={value} onChange={(e) => onChange(e.target.value)}>
        <option>This month</option>
        <option>This week</option>
        <option>Last month</option>
        <option>This year</option>
        <option>All time</option>
      </select>
      <ChevronDown size={14} />
    </div>
  );
}

export function EmptyState({
  title = "No records found",
  description = "Try a different search or clear your filters.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Search size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Schema-aware value helpers — shared by the table and the detail view
 * ------------------------------------------------------------------ */

/** Reads a schema field key ("name" or "extra:pnr") off a record row. */
export function readField(row: RecordRow, key: string): string | number {
  if (key.startsWith("extra:")) return row.extra?.[key.slice(6)] ?? "";
  const value = (row as unknown as Record<string, unknown>)[key];
  if (typeof value === "number") return value;
  return value == null ? "" : String(value);
}

/** Human label for a field key, falling back to the raw key. */
const CORE_LABELS: Record<string, string> = {
  id: "Reference",
  name: "Name",
  detail: "Details",
  destination: "Destination",
  owner: "Assigned to",
  branch: "Branch",
  date: "Date",
  amount: "Value",
  status: "Status",
  email: "Email",
  phone: "Phone",
  source: "Source",
  notes: "Notes",
};

export const labelForKey = (key: string, fields: FieldDef[]): string =>
  fields.find((f) => f.key === key)?.label ??
  CORE_LABELS[key] ??
  key
    .replace(/^extra:/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());

/** Renders one table cell for a schema column. */
export function CellValue({
  row,
  column,
  currency,
  onOpen,
}: {
  row: RecordRow;
  column: ColumnDef;
  currency: string;
  onOpen?: () => void;
}) {
  const raw = readField(row, column.key);
  const text = raw === "" || raw == null ? "—" : String(raw);

  if (column.key === "id") {
    return (
      <button type="button" className="record-id" onClick={onOpen}>
        {row.id}
      </button>
    );
  }

  switch (column.kind) {
    case "money":
      return <span className="amount-cell">{money(Number(raw) || 0, currency)}</span>;
    case "date":
      // Support tickets show SLA state on their due date cell.
      if (row.moduleId === "support" && column.key === "date") {
        const state = slaState({
          status: row.status,
          extra: row.extra ?? null,
          date: String(raw),
        });
        const tone =
          state === "breached"
            ? "text-destructive"
            : state === "due soon"
              ? "text-amber-600"
              : "text-foreground";
        return (
          <span className={tone} title={slaStateLabel(state)}>
            {raw === ""
              ? "—"
              : `${formatSlaDue({ status: row.status, extra: row.extra ?? null, date: String(raw) })} ${state === "breached" ? "⚠" : state === "due soon" ? "⏰" : ""}`}
          </span>
        );
      }
      return (
        <span className={raw === "" ? "muted-dash" : ""}>
          {raw === "" ? "—" : formatDay(String(raw))}
        </span>
      );
    case "status":
      return <Status value={String(raw || row.status)} />;
    case "person":
      return (
        <div className="customer-cell">
          <Avatar name={row.name || "?"} size="small" />
          <div>
            <strong>{row.name}</strong>
            <small>{row.email || row.phone || "No contact yet"}</small>
          </div>
        </div>
      );
    case "owner":
      return (
        <span className="owner-cell">
          <Avatar name={row.owner || "?"} size="tiny" />
          {row.owner ? row.owner.split(" ")[0] : "Unassigned"}
        </span>
      );
    case "chip":
      return raw === "" ? (
        <span className="muted-dash">—</span>
      ) : (
        <span className="cell-chip">{text}</span>
      );
    case "mono":
      return <span className="mono-id">{text}</span>;
    default:
      return <span className={raw === "" ? "muted-dash" : ""}>{text}</span>;
  }
}

/* ------------------------------------------------------------------ *
 * Record dialog — create / edit / inspect a single record
 * ------------------------------------------------------------------ */

/** Pre-fill data when one module hands a record to the next step in the journey. */
export function workflowDataFor(
  targetModuleId: string,
  sourceModuleId: string,
  row: RecordRow,
): Partial<RecordRow> {
  const data: Partial<RecordRow> = {
    name: row.name,
    email: row.email,
    phone: row.phone,
    destination: row.destination,
    amount: row.amount,
    ...(row.currency ? { currency: row.currency } : {}),
    owner: row.owner,
    branch: row.branch,
    notes: `Created from ${sourceModuleId} ${row.id}`,
  };
  if (targetModuleId === "finance" && sourceModuleId === "bookings") {
    data.detail = `Invoice for booking ${row.id}`;
    data.amount = row.amount;
    data.status = "Draft";
    data.extra = { bookingId: row.id };
  }
  if (targetModuleId === "bookings" && sourceModuleId === "leads") {
    data.detail = `Booking from lead ${row.id}`;
    data.status = "Pending";
  }
  if (targetModuleId === "bookings" && sourceModuleId === "quotations") {
    data.detail = `Booking from quotation ${row.id}`;
    data.status = "Pending";
    data.extra = { quotationId: row.id };
  }
  if (targetModuleId === "quotations" && sourceModuleId === "leads") {
    data.detail = `Quotation for ${row.name}`;
    data.status = "Draft";
  }
  if (targetModuleId === "quotations" && sourceModuleId === "packages") {
    data.extra = { packageRef: row.id };
  }
  if (targetModuleId === "visa" && sourceModuleId === "bookings") {
    data.detail = `Visa application for ${row.name}`;
    data.status = "Pending";
    data.extra = { bookingId: row.id };
  }
  return data;
}

/**
 * "Convert to customer": the two choices a person has when an enquiry turns
 * into a real customer — link to one that already exists, or make a new one
 * from this record. Shared by the record dialog and the side drawer so both
 * offer the same decision.
 */
export function CustomerLinkPicker({
  customers,
  currentRef,
  onPick,
  onCreateNew,
  onCancel,
}: {
  customers: RecordRow[];
  /** The customer already linked on this record, if any. */
  currentRef?: string;
  onPick: (customer: RecordRow) => void;
  onCreateNew: () => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = customers.filter(
    (customer) =>
      !needle ||
      `${customer.name} ${customer.email} ${customer.phone} ${customer.id}`
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="record-sheet__create">
      <p className="record-sheet__hint">
        Link this record to a customer you already have — nothing is copied, so their profile stays
        in one place. No customer yet? Make one from this record instead.
      </p>
      <label className="record-sheet__field">
        Find a customer
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or phone"
          aria-label="Search customers"
        />
      </label>
      {matches.length === 0 ? (
        <p className="record-sheet__empty">
          No customer matches “{query.trim()}”. Create a new one instead.
        </p>
      ) : (
        <ul className="record-sheet__task-list">
          {matches.map((customer) => (
            <li key={customer.id}>
              {/* Wrapped so the row button isn't hit by the list's 26px icon-button rule. */}
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  className="record-sheet__profile-btn"
                  onClick={() => onPick(customer)}
                >
                  <span className="min-w-0 flex-1 text-left">
                    <strong>{customer.name}</strong>
                    <small>
                      {customer.id}
                      {customer.email ? ` · ${customer.email}` : ""}
                      {customer.destination ? ` · ${customer.destination}` : ""}
                      {currentRef === customer.id ? " · linked already" : ""}
                    </small>
                  </span>
                  {currentRef === customer.id ? (
                    <Check size={14} aria-label="Currently linked" />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="record-sheet__actions">
        <button type="button" onClick={onCreateNew}>
          <Plus size={14} /> Create new customer
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/** Icon + copy shown above each detail section, so sections read at a glance. */
const SECTION_ICON = [ClipboardList, FileText, Wallet, Building2, Mail];

export function RecordDialog({
  module,
  row,
  onClose,
  create = false,
  initialData,
}: {
  module: Module;
  row?: RecordRow | null;
  onClose: () => void;
  create?: boolean;
  initialData?: Partial<RecordRow>;
}) {
  const {
    save,
    update,
    remove,
    fields,
    settings,
    audit,
    status: authStatus,
    getRows,
    refreshModuleRecords,
  } = useCRM();
  const [editing, setEditing] = useState(create);
  const [detailTab, setDetailTab] = useState("Overview");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [financeBusy, setFinanceBusy] = useState(false);
  const [workflowTarget, setWorkflowTarget] = useState<{
    module: Module;
    data: Partial<RecordRow>;
  } | null>(null);
  /** The "Convert to customer" screen: pick an existing one or make a new one. */
  const [linking, setLinking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currency = settings.currency;
  const customFields = fields[module.id] ?? [];
  const activeEmployees = settings.employees.filter((e) => e.active);
  const recordAudit = audit.filter((a) => a.module === module.id && a.recordId === row?.id);
  const schema = getSchema(module.id);

  const isDocument = hasLineItems(module.id) || hasItinerary(module.id) || hasPayments(module.id);

  // The journey: every related record for this one, in travel order.
  const journey = useMemo(() => {
    if (!row) return [];
    const all: Record<string, RecordRow[]> = {};
    for (const m of modules) all[m.id] = getRows(m.id);
    return buildJourney(row, module.id, all);
  }, [row, module.id, getRows]);

  // Real attachments for the open record (passports, vouchers, invoices…).
  const { data: attachments, reload: reloadAttachments } = useApiQuery(
    () => (row ? fetchAttachments({ moduleId: module.id, recordId: row.id }) : Promise.resolve([])),
    [module.id, row?.id],
    authStatus === "ready" && Boolean(row),
  );
  const files = attachments ?? [];

  const moneyModule = module.id === "finance" || module.id === "bookings";
  const { data: ledger, reload: reloadLedger } = useApiQuery(
    () =>
      row && moneyModule
        ? fetchLedger(module.id, row.id)
        : Promise.resolve({ items: [], totals: null }),
    [module.id, row?.id],
    authStatus === "ready" && Boolean(row) && moneyModule,
  );

  const downloadReceipt = async (id: string, receiptNo: string | null) => {
    try {
      const blob = await fetchReceipt(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `receipt-${receiptNo ?? id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err, "Could not download the receipt"));
    }
  };

  const handleAction = (targetModuleId: string) => {
    const targetModule = getSchema(targetModuleId);
    const targetModuleMeta = modules.find((m) => m.id === targetModuleId);
    if (!targetModule || !targetModuleMeta || !row) return;

    // Pre-fill data for the new record
    const data = workflowDataFor(targetModuleId, module.id, row);

    setWorkflowTarget({ module: targetModuleMeta, data });
  };

  /** Real invoice commerce: PDF download, Razorpay payment link, email copy. */
  const handleFinanceAction = async (action: "pdf" | "link" | "email") => {
    if (!row) return;
    setFinanceBusy(true);
    try {
      if (action === "pdf") {
        await downloadInvoicePdf(row.id);
        toast.success("Invoice PDF downloaded");
      } else if (action === "link") {
        const link = await createPaymentLink(row.id, {
          customerEmail: row.email || undefined,
          customerPhone: row.phone || undefined,
          customerName: row.name,
        });
        if (link.configured && link.checkoutUrl) {
          await navigator.clipboard?.writeText(link.checkoutUrl).catch(() => undefined);
          toast.success("Razorpay payment link copied — share it with the customer");
        } else {
          toast.info(
            "Payment link recorded. Add RAZORPAY_KEY_ID/SECRET on the server to charge real money.",
          );
        }
      } else {
        if (!row.email) {
          toast.error("Add the customer's email first");
          return;
        }
        const result = await sendInvoiceEmail(
          row.id,
          row.email,
          "We look forward to confirming your trip.",
        );
        toast.success(
          result.status === "sent"
            ? "Invoice emailed"
            : "Invoice email queued — set up SMTP to send live",
        );
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFinanceBusy(false);
    }
  };

  if (workflowTarget) {
    return (
      <RecordDialog
        module={workflowTarget.module}
        create
        initialData={workflowTarget.data}
        onClose={() => setWorkflowTarget(null)}
      />
    );
  }

  return (
    <Dialog
      open={Boolean(row) || create}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={cn("record-dialog", isDocument && "record-dialog--wide")}>
        <DialogHeader>
          <div className="eyebrow">{create ? "New record" : row?.id}</div>
          <DialogTitle>{create ? `Create ${module.noun}` : row?.name}</DialogTitle>
          <DialogDescription>
            {create
              ? `Add the details below — only the name is required.`
              : `${module.name} · ${row?.destination || "no destination yet"}`}
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <RecordForm
            module={module}
            row={row ?? null}
            create={create}
            initialData={initialData ?? undefined}
            onClose={onClose}
            onSaved={(saved, created) => {
              // Guide the user to the natural next step in the journey.
              const nextStep: Record<string, { target: string; label: string }> = {
                leads: { target: "quotations", label: "Create quotation" },
                quotations: { target: "bookings", label: "Convert to booking" },
                bookings: { target: "finance", label: "Create invoice" },
              };
              const step = created ? nextStep[module.id] : undefined;
              if (step && saved) {
                setWorkflowTarget({
                  module: modules.find((m) => m.id === step.target) ?? module,
                  data: workflowDataFor(step.target, module.id, saved),
                });
                return;
              }
              onClose();
            }}
          />
        ) : linking && row ? (
          <CustomerLinkPicker
            customers={getRows("customers")}
            currentRef={String(row.extra?.["customerRef"] ?? "")}
            onCancel={() => setLinking(false)}
            onCreateNew={() => {
              setLinking(false);
              handleAction("customers");
            }}
            onPick={(customer) => {
              // The mention in notes is what makes the link show up on the
              // customer's profile — journeys read references from there.
              const mention = `Linked to customer ${customer.id}`;
              const notes = row.notes?.includes(mention)
                ? row.notes
                : [row.notes, mention].filter(Boolean).join("\n");
              update(module.id, {
                ...row,
                notes,
                extra: { ...(row.extra ?? {}), customerRef: customer.id },
              });
              setLinking(false);
              toast.success(`Linked to ${customer.name} — open their profile to see this record`);
            }}
          />
        ) : (
          row && (
            <>
              <div className="record-hero">
                <Avatar name={row.name || "?"} />
                <div className="record-hero__meta">
                  <h3>{row.name}</h3>
                  <p>
                    {row.destination || "No destination"} · {row.owner || "Unassigned"}
                  </p>
                </div>
                <div className="record-hero__value">
                  <strong>{money(row.amount, row.currency || currency)}</strong>
                  <Status value={row.status} />
                </div>
              </div>
              <JourneyRail
                steps={journey}
                onAdd={(step) => {
                  if (!step.moduleId) return;
                  setWorkflowTarget({
                    module: modules.find((m) => m.id === step.moduleId) ?? module,
                    data: workflowDataFor(step.moduleId, module.id, row),
                  });
                }}
              />
              <div className="tabs">
                {["Overview", "Timeline", "Documents", "Notes"].map((t) => (
                  <Button
                    variant="ghost"
                    key={t}
                    className={detailTab === t ? "tab active" : "tab"}
                    onClick={() => setDetailTab(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              {detailTab === "Overview" ? (
                <div className="detail-sections">
                  {/* Quick Actions for Logic Flow */}
                  <section className="detail-section quick-actions-section">
                    <header>
                      <ArrowUpRight size={15} />
                      <h4>Quick actions</h4>
                    </header>
                    <div className="workflow-actions">
                      {module.id === "leads" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
                            <Users size={14} /> Convert to Customer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction("quotations")}
                          >
                            <FileText size={14} /> Create Quotation
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction("bookings")}
                          >
                            <PlaneTakeoff size={14} /> Convert to Booking
                          </Button>
                        </>
                      )}
                      {module.id === "bookings" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction("finance")}
                          >
                            <Receipt size={14} /> Create Invoice
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleAction("visa")}>
                            <UserCheck size={14} /> Start Visa App
                          </Button>
                        </>
                      )}
                      {module.id === "customers" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleAction("leads")}>
                            <Plus size={14} /> New Enquiry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAction("bookings")}
                          >
                            <PlaneTakeoff size={14} /> New Booking
                          </Button>
                        </>
                      )}
                      {module.id === "finance" && row && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={financeBusy}
                            onClick={() => void handleFinanceAction("pdf")}
                          >
                            <Download size={14} /> Invoice PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={financeBusy}
                            onClick={() => void handleFinanceAction("link")}
                          >
                            <ExternalLink size={14} /> Payment link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={financeBusy || !row.email}
                            onClick={() => void handleFinanceAction("email")}
                          >
                            <Share2 size={14} /> Email invoice
                          </Button>
                        </>
                      )}
                    </div>
                  </section>

                  {moneyModule && (
                    <section className="detail-section">
                      <header>
                        <Wallet size={15} />
                        <h4>Payments &amp; receipts</h4>
                      </header>
                      {!ledger || ledger.items.length === 0 ? (
                        <p className="detail-muted">
                          No money recorded yet. Record the first payment below — every entry gets
                          its own receipt number.
                        </p>
                      ) : (
                        <ul className="payment-list">
                          {ledger.items.map((entry) => (
                            <li key={entry.id}>
                              <div className="payment-list__main">
                                <strong>{money(entry.amount, entry.currency)}</strong>
                                <span className="payment-list__meta">
                                  {entry.kind === "refund" ? "Refund" : "Received"} · {entry.method}{" "}
                                  · {entry.paidOn}
                                  {entry.referenceNo ? ` · ${entry.referenceNo}` : ""}
                                  {entry.note ? ` · ${entry.note}` : ""}
                                </span>
                              </div>
                              {entry.receiptNo && (
                                <span className="payment-list__receipt">{entry.receiptNo}</span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Download receipt"
                                onClick={() => void downloadReceipt(entry.id, entry.receiptNo)}
                              >
                                <Download />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Remove this entry"
                                onClick={async () => {
                                  try {
                                    await removePayment(entry.id);
                                    reloadLedger();
                                    toast.success("Payment removed — totals updated");
                                  } catch (err) {
                                    toast.error(errorMessage(err, "Could not remove the payment"));
                                  }
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {ledger?.totals && (
                        <div className="payment-list__totals">
                          <span>
                            Received{" "}
                            <strong>{money(ledger.totals.net, row.currency || currency)}</strong>
                          </span>
                          <span>
                            Balance{" "}
                            <strong>
                              {money(ledger.totals.balance, row.currency || currency)}
                            </strong>
                          </span>
                        </div>
                      )}
                      <QuickPaymentForm
                        moduleId={module.id as "finance" | "bookings"}
                        reference={row.id}
                        currency={row.currency || currency}
                        balance={ledger?.totals?.balance}
                        onSaved={() => {
                          reloadLedger();
                          void refreshModuleRecords(module.id);
                        }}
                      />
                    </section>
                  )}

                  {schema.detailSections.map((section, index) => {
                    const Icon = SECTION_ICON[index % SECTION_ICON.length] ?? FileText;
                    const entries = section.keys
                      .map((key) => {
                        const value = readField(row, key);
                        if (value === "" || value == null) return null;
                        const formatted =
                          key === "amount" ? money(Number(value) || 0, currency) : String(value);
                        return [labelForKey(key, schema.fields), formatted] as [string, string];
                      })
                      .filter(Boolean) as Array<[string, string]>;
                    if (entries.length === 0) return null;
                    return (
                      <section className="detail-section" key={section.title}>
                        <header>
                          <Icon size={15} />
                          <h4>{section.title}</h4>
                        </header>
                        <dl className="detail-grid">
                          {entries.map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    );
                  })}
                  {customFields.length > 0 && (
                    <section className="detail-section">
                      <header>
                        <PencilLine size={15} />
                        <h4>Custom fields</h4>
                      </header>
                      <dl className="detail-grid">
                        {customFields.map((f) => (
                          <div key={f.id}>
                            <dt>{f.label}</dt>
                            <dd>{row.extra?.[f.id] ? String(row.extra[f.id]) : "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
                  {row.notes && (
                    <section className="detail-section">
                      <header>
                        <FileText size={15} />
                        <h4>Internal notes</h4>
                      </header>
                      <div className="note-box">{row.notes}</div>
                    </section>
                  )}
                  <section className="detail-section">
                    <header>
                      <Phone size={15} />
                      <h4>Reach the customer</h4>
                    </header>
                    <div className="quick-contact">
                      <a href={`mailto:${row.email}`} className={row.email ? "" : "disabled"}>
                        <Mail size={14} /> {row.email || "No email"}
                      </a>
                      <a href={`tel:${row.phone}`} className={row.phone ? "" : "disabled"}>
                        <Phone size={14} /> {row.phone || "No phone"}
                      </a>
                      <span>
                        <MapPin size={14} /> {row.branch || "No branch"}
                      </span>
                    </div>
                  </section>
                </div>
              ) : detailTab === "Timeline" ? (
                <div className="timeline">
                  {recordAudit.length > 0
                    ? recordAudit.map((a) => (
                        <div key={a.id}>
                          <span className="timeline-dot" />
                          <h4>
                            {a.action} {module.noun}
                          </h4>
                          <p>
                            {a.user} {a.action.toLowerCase()} this {module.noun}.
                          </p>
                          <small>
                            {new Date(a.at).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                      ))
                    : [
                        [
                          "Record created",
                          "This record was added to the workspace.",
                          "Catalogue sync",
                        ],
                      ].map(([title, body, time]) => (
                        <div key={title}>
                          <span className="timeline-dot" />
                          <h4>{title}</h4>
                          <p>{body}</p>
                          <small>{time}</small>
                        </div>
                      ))}
                </div>
              ) : detailTab === "Documents" ? (
                <div className="document-list">
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file || !row) return;
                      setUploading(true);
                      try {
                        await uploadAttachment(file, { moduleId: module.id, recordId: row.id });
                        reloadAttachments();
                        toast.success(`${file.name} uploaded`);
                      } catch (err) {
                        toast.error(errorMessage(err));
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  <div className="dialog-actions">
                    <Button
                      variant="outline"
                      disabled={uploading || authStatus !== "ready"}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Plus /> {uploading ? "Uploading…" : "Upload document"}
                    </Button>
                  </div>
                  {files.length === 0 ? (
                    <EmptyState
                      title="No documents"
                      description="Upload passports, vouchers or invoices against this record."
                    />
                  ) : (
                    files.map((att) => (
                      <div key={att.id}>
                        <div>
                          <h4>{att.filename}</h4>
                          <p>
                            {Math.max(1, Math.round(att.size / 1024))} KB · {att.mimeType} ·{" "}
                            {att.scanStatus.startsWith("clamav")
                              ? "Virus-scanned"
                              : att.scanStatus
                                ? "Not virus-scanned"
                                : "Scan unknown"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`Download ${att.filename}`}
                          onClick={async () => {
                            try {
                              const blob = await apiBlob(`/uploads/${att.id}`);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = att.filename;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          <ArrowDownToLine />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={`Delete ${att.filename}`}
                          onClick={async () => {
                            try {
                              await deleteAttachment(att.id);
                              reloadAttachments();
                              toast.success("Document removed");
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="notes-panel">
                  <p>{row.notes}</p>
                  {notes.map((n, i) => (
                    <div className="note-box" key={i}>
                      {n}
                    </div>
                  ))}
                  <textarea
                    aria-label="Add internal note"
                    placeholder="Add an internal note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    disabled={!note.trim()}
                    onClick={() => {
                      setNotes([...notes, note]);
                      update(module.id, { ...row, notes: [row.notes, ...notes, note].join("\n") });
                      setNote("");
                      toast.success("Note added");
                    }}
                  >
                    <Plus /> Add note
                  </Button>
                </div>
              )}
              <div className="dialog-actions">
                {deleting ? (
                  <>
                    <span>Delete this record?</span>
                    <Button variant="outline" onClick={() => setDeleting(false)}>
                      Keep record
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        remove(module.id, row.id);
                        toast.success("Record deleted");
                        onClose();
                      }}
                    >
                      Delete
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete record"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 />
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Edit details <ArrowUpRight />
                    </Button>
                  </>
                )}
              </div>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
