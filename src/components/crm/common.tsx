import { useMemo, useRef, useState } from "react";
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
import { buildJourney } from "@/lib/crm/journey";
import { statusGuide } from "@/lib/crm/language";
import { getSchema, type ColumnDef, type FieldDef } from "@/lib/crm/schema";
import { useCRM } from "@/lib/crm/store";
import { JourneyRail } from "./journey";
import { StatusHint } from "./help";
import { errorMessage, apiBlob } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { deleteAttachment, fetchAttachments, uploadAttachment } from "@/lib/api/modules";
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

const recordPrefix = (module: Module) =>
  (
    ({
      leads: "LD",
      bookings: "BK",
      quotations: "QT",
      finance: "INV",
      visa: "VSA",
      support: "TKT",
    }) as Record<string, string>
  )[module.id] ?? module.id.slice(0, 3).toUpperCase();

const nextRecordId = (module: Module) =>
  `${recordPrefix(module)}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

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
  const { save, update, remove, fields, settings, audit, status: authStatus, getRows } = useCRM();
  const [editing, setEditing] = useState(create);
  const [detailTab, setDetailTab] = useState("Overview");
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [workflowTarget, setWorkflowTarget] = useState<{
    module: Module;
    data: Partial<RecordRow>;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currency = settings.currency;
  const customFields = fields[module.id] ?? [];
  const activeEmployees = settings.employees.filter((e) => e.active);
  const recordAudit = audit.filter((a) => a.module === module.id && a.recordId === row?.id);
  const schema = getSchema(module.id);

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

  const optionsFor = (field: FieldDef): string[] => {
    if (Array.isArray(field.options)) return field.options;
    if (field.options === "statuses") return schema.statuses;
    if (field.options === "owners") return activeEmployees.map((e) => e.name);
    if (field.options === "branches") return settings.branches;
    if (field.options === "sources")
      return schema.sources ?? ["Website", "WhatsApp", "Referral", "B2B agent"];
    return [];
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const base: RecordRow = row ?? {
      id: nextRecordId(module),
      name: initialData?.name ?? "",
      detail: initialData?.detail ?? "",
      destination: initialData?.destination ?? "",
      owner: initialData?.owner ?? activeEmployees[0]?.name ?? "",
      branch: initialData?.branch ?? settings.branches[0] ?? "",
      date: initialData?.date ?? new Date().toISOString().slice(0, 10),
      amount: initialData?.amount ?? 0,
      status: initialData?.status ?? schema.statuses[0] ?? "New",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      source: initialData?.source ?? "",
      notes: initialData?.notes ?? "",
      extra: initialData?.extra ?? {},
    };
    const next: RecordRow = { ...base };
    const core = next as unknown as Record<string, string | number>;
    const extras: Record<string, string | number> = { ...(base.extra ?? {}) };

    schema.fields.forEach((field) => {
      const raw = String(fd.get(`f:${field.key}`) ?? "").trim();
      if (field.key.startsWith("extra:")) {
        const key = field.key.slice(6);
        if (raw === "") delete extras[key];
        else extras[key] = field.type === "number" ? Number(raw) : raw;
        return;
      }
      core[field.key] = field.type === "number" ? Number(raw) || 0 : raw;
    });

    customFields.forEach((f) => {
      const raw = String(fd.get(`cf:${f.id}`) ?? "").trim();
      if (raw === "") delete extras[f.id];
      else extras[f.id] = f.type === "number" ? Number(raw) : raw;
    });

    if (Object.keys(extras).length > 0) next.extra = extras;
    else delete next.extra;

    if (!next.name.trim()) {
      toast.error("Please add a name before saving");
      return;
    }

    if (create) save(module.id, next);
    else update(module.id, next);
    toast.success(`${module.noun} ${create ? "created" : "updated"}`);
    onClose();
  };

  const renderInput = (field: FieldDef) => {
    const value = row
      ? readField(row, field.key)
      : (initialData?.[field.key as keyof RecordRow] ??
        (field.key.startsWith("extra:") ? initialData?.extra?.[field.key.slice(6)] : ""));
    const options = optionsFor(field);
    if (field.type === "select") {
      return (
        <select name={`f:${field.key}`} defaultValue={String(value || options[0] || "")}>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    }
    if (field.type === "textarea") {
      return (
        <textarea
          name={`f:${field.key}`}
          defaultValue={String(value)}
          placeholder={field.placeholder}
        />
      );
    }
    const inputType =
      field.type === "number" ? "number" : field.type === "date" ? "date" : (field.type as string);
    return (
      <input
        name={`f:${field.key}`}
        type={inputType}
        defaultValue={String(value)}
        placeholder={field.placeholder}
        required={field.required}
        min={field.type === "number" ? 0 : undefined}
      />
    );
  };

  const handleAction = (targetModuleId: string) => {
    const targetModule = getSchema(targetModuleId);
    const targetModuleMeta = modules.find((m) => m.id === targetModuleId);
    if (!targetModule || !targetModuleMeta || !row) return;

    // Pre-fill data for the new record
    const data: Partial<RecordRow> = {
      name: row.name,
      email: row.email,
      phone: row.phone,
      destination: row.destination,
      amount: row.amount,
      owner: row.owner,
      branch: row.branch,
      notes: `Created from ${module.noun} ${row.id}`,
    };

    // Module-specific mapping
    if (targetModuleId === "finance" && module.id === "bookings") {
      data.detail = `Invoice for booking ${row.id}`;
      data.amount = row.amount;
      data.status = "Draft";
    }
    if (targetModuleId === "bookings" && module.id === "leads") {
      data.detail = `Booking from lead ${row.id}`;
      data.status = "Pending";
    }
    if (targetModuleId === "quotations" && module.id === "leads") {
      data.detail = `Quotation for ${row.name}`;
      data.status = "Draft";
    }
    if (targetModuleId === "visa" && module.id === "bookings") {
      data.detail = `Visa application for ${row.name}`;
      data.status = "Pending";
    }

    setWorkflowTarget({ module: targetModuleMeta, data });
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
      <DialogContent className="record-dialog">
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
          <form onSubmit={handleSubmit}>
            {schema.sections.map((section) => {
              const sectionFields = schema.fields.filter((f) => f.group === section);
              const extraFields = section === "Notes" ? customFields : [];
              if (sectionFields.length === 0 && extraFields.length === 0) return null;
              return (
                <fieldset className="form-section" key={section}>
                  <legend>{section}</legend>
                  <div className="form-grid">
                    {sectionFields.map((field) => (
                      <label key={field.key} className={field.wide ? "full-width" : undefined}>
                        {field.label}
                        {field.required && <span className="req">*</span>}
                        {renderInput(field)}
                        {field.hint && <small className="field-hint">{field.hint}</small>}
                      </label>
                    ))}
                    {extraFields.map((f) => (
                      <label key={f.id}>
                        {f.label}
                        <span className="field-hint-inline">custom</span>
                        <input
                          name={`cf:${f.id}`}
                          type={
                            f.type === "number" ? "number" : f.type === "date" ? "date" : "text"
                          }
                          defaultValue={row?.extra?.[f.id] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
            <div className="dialog-actions">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                <Check /> Save {module.noun}
              </Button>
            </div>
          </form>
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
                  <strong>{money(row.amount, currency)}</strong>
                  <Status value={row.status} />
                </div>
              </div>
              <JourneyRail
                steps={journey}
                onAdd={(step) => {
                  if (!step.moduleId) return;
                  setWorkflowTarget({
                    module: modules.find((m) => m.id === step.moduleId) ?? module,
                    data: {
                      name: row.name,
                      email: row.email,
                      phone: row.phone,
                      destination: row.destination,
                      amount: row.amount,
                      owner: row.owner,
                      branch: row.branch,
                      notes: `Created from ${module.noun} ${row.id}`,
                    },
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
                    </div>
                  </section>

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
                            {Math.max(1, Math.round(att.size / 1024))} KB · {att.mimeType}
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
