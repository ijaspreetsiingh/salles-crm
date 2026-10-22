import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  CalendarPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  ExternalLink as LinkOut,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "./ui";
import { Avatar, Status, labelForKey, readField } from "./common";
import { JourneyRail } from "./journey";
import { buildJourney } from "@/lib/crm/journey";
import { money, type Module, type RecordRow, modules } from "@/lib/crm/catalog";
import { getSchema, type FieldDef } from "@/lib/crm/schema";
import { useCRM } from "@/lib/crm/store";
import { setCommsFocus } from "@/lib/crm/handoff";
import {
  downloadInvoicePdf,
  createPaymentLink,
  sendInvoiceEmail,
  downloadQuotationPdf,
  sendQuotationEmail,
  type QuoteItemDto,
} from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";

/** Status pills that mean "this customer could pay us" — profile entry points. */
const PROFILE_MODULES = new Set(["customers", "leads"]);

/**
 * The right-side record panel — the same drawer design the workspace already
 * uses for help & settings. Opening any enquiry, customer, booking, invoice…
 * slides this panel in and shows what is actually useful: who they are, how to
 * reach them, what is pending and what money is riding on it.
 */
export function RecordSheet({
  module,
  row,
  onClose,
  onEdit,
  onWorkflow,
  onOpenProfile,
}: {
  module: Module;
  row: RecordRow;
  onClose: () => void;
  onEdit: () => void;
  /** Cross-module moves: convert lead → booking, booking → invoice… */
  onWorkflow: (targetModuleId: string, created?: RecordRow) => void;
  /** Opens the full Customer Information page. */
  onOpenProfile?: (row: RecordRow) => void;
}) {
  const {
    user,
    settings,
    fields,
    audit,
    getRows,
    tasks,
    addTask,
    toggleTask,
    removeTask,
    update,
    save,
  } = useCRM();
  const currency = row.currency || settings.currency;
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [taskBusy, setTaskBusy] = useState(false);
  /**
   * The panel is a two-screen flow: the record itself, and the "next step"
   * screen (create a quotation / proposal / convert to booking). No popups —
   * everything happens inside this drawer.
   */
  const [step, setStep] = useState<"record" | "create">("record");
  const [createKind, setCreateKind] = useState<"quotations" | "proposals">("quotations");

  const schema = getSchema(module.id);
  const customFields = fields[module.id] ?? [];

  // Every non-empty core field, in the schema's reading order.
  const entries = useMemo(
    () =>
      schema.fields
        .map((field: FieldDef) => ({ field, value: readField(row, field.key) }))
        .filter(
          ({ value }) => value !== "" && value !== null && value !== undefined,
        )
        .map(({ field, value }) => ({
          label: labelForKey(field.key, schema.fields),
          value:
            field.key === "amount" ? money(Number(value) || 0, currency) : String(value),
        })),
    [schema, row, currency],
  );

  // The journey: related records in travel order.
  const journey = useMemo(() => {
    const all: Record<string, RecordRow[]> = {};
    for (const m of modules) all[m.id] = getRows(m.id);
    return buildJourney(row, module.id, all);
  }, [row, module.id, getRows]);

  // Follow-ups pinned to this record.
  const recordTasks = useMemo(
    () => tasks.filter((t) => t.relatedModule === module.id && t.relatedRecordId === row.id),
    [tasks, module.id, row.id],
  );

  const auditEntries = audit.filter((a) => a.module === module.id && a.recordId === row.id).slice(-5);

  const addFollowUp = (rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) return;
    addTask({
      title,
      type: "Follow-up",
      owner: user?.name ?? "Me",
      date: noteDate,
      priority: "High",
      done: false,
      relatedModule: module.id,
      relatedRecordId: row.id,
    });
    toast.success("Task added");
  };
  const contactPhone = row.phone.replaceAll(/[^\d+]/g, "");

  return (
    <Sheet
      open
      onClose={onClose}
      title={step === "create" ? (createKind === "proposals" ? "New proposal" : "New quotation") : row.id}
      description={
        step === "create"
          ? `For ${row.name} · ${row.destination || "no destination yet"}`
          : `${module.name} · ${row.destination || "no destination yet"}`
      }
      width={560}
      footer={
        step === "create" ? null : (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onEdit}>
              <Pencil size={15} /> Edit {module.noun}
            </Button>
          </>
        )
      }
    >
      {step === "create" ? (
        <CreateDocumentForm
          kind={createKind}
          sourceRow={row}
          sourceModule={module}
          currency={currency}
          onBack={() => setStep("record")}
          onCreated={async (created) => {
            toast.success(
              `${createKind === "proposals" ? "Proposal" : "Quotation"} ${created.id} created`,
            );
            setStep("record");
            // Show the fresh document straight away in this drawer.
            onWorkflow("__open__", created);
          }}
        />
      ) : (
        <>
      {/* Hero */}
      <div className="record-sheet__hero">
        <Avatar name={row.name || "?"} />
        <div className="record-sheet__hero-meta">
          <h3>{row.name}</h3>
          <p>
            {row.owner || "Unassigned"} · {module.noun} · saved{" "}
            {row.date ? new Date(row.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
          </p>
        </div>
        <div className="record-sheet__hero-side">
          <strong>{money(row.amount, currency)}</strong>
          <Status value={row.status} />
        </div>
      </div>

      {/* Contact row — email/WhatsApp open Communications with this contact */}
      {(row.email || contactPhone) && (
        <div className="record-sheet__contact">
          {row.email && (
            <>
              <button
                type="button"
                className="record-sheet__contact-btn"
                title={`Open ${row.email} in Communications`}
                onClick={() => {
                  setCommsFocus({
                    name: row.name,
                    email: row.email,
                    phone: contactPhone || undefined,
                    channel: "Email",
                    module: module.id,
                    recordId: row.id,
                  });
                  onWorkflow("__comms__");
                }}
              >
                <Mail size={15} /> Email
              </button>
              <button
                type="button"
                className="record-sheet__contact-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(row.email);
                  toast.success("Email copied");
                }}
              >
                <Copy size={13} />
              </button>
            </>
          )}
          {contactPhone && (
            <>
              <a href={`tel:${contactPhone}`} className="record-sheet__contact-btn">
                <Phone size={15} /> Call
              </a>
              <button
                type="button"
                className="record-sheet__contact-btn"
                title={`Open WhatsApp conversation for ${contactPhone}`}
                onClick={() => {
                  setCommsFocus({
                    name: row.name,
                    email: row.email || undefined,
                    phone: contactPhone,
                    channel: "WhatsApp",
                    module: module.id,
                    recordId: row.id,
                  });
                  onWorkflow("__comms__");
                }}
              >
                <MessageSquare size={15} /> WhatsApp
              </button>
            </>
          )}
        </div>
      )}

      {/* Cross-module moves — everything happens in this same drawer */}
      {step === "record" && workflowTargetsFor(module.id).length > 0 && (
        <section className="record-sheet__section">
          <h4>
            <UserCheck size={14} /> Next step
          </h4>
          <div className="record-sheet__actions">
            {workflowTargetsFor(module.id).map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => {
                  if (target.id === "bookings") {
                    // Converting is a one-click action: no second form, the
                    // booking is created straight from the enquiry.
                    onWorkflow(target.id);
                    return;
                  }
                  setCreateKind(target.id === "proposals" ? "proposals" : "quotations");
                  setStep("create");
                }}
              >
                <Briefcase size={14} /> {target.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCreateKind("proposals");
                setStep("create");
              }}
            >
              <FileText size={14} /> Create proposal
            </button>
          </div>
        </section>
      )}

      {/* Full quote cover */}
      {step === "record" && module.id === "quotations" && onOpenProfile && (
        <section className="record-sheet__section">
          <h4>
            <LinkOut size={14} /> Full picture
          </h4>
          <button type="button" className="record-sheet__profile-btn" onClick={() => onOpenProfile(row)}>
            View the full quote
            <small>Company masthead · priced breakdown · validity · send to customer</small>
            <ExternalLink size={15} />
          </button>
        </section>
      )}

      {/* Professional quotation builder */}
      {step === "record" && module.id === "quotations" && (
        <QuotationSection row={row} currency={currency} />
      )}

      {/* Module-specific money actions */}
      {module.id === "finance" && (
        <section className="record-sheet__section">
          <h4>
            <Download size={14} /> Invoice
          </h4>
          <div className="record-sheet__actions">
            <button
              type="button"
              onClick={async () => {
                try {
                  await downloadInvoicePdf(row.id);
                  toast.success("Invoice PDF downloaded");
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Download size={14} /> Invoice PDF
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const link = await createPaymentLink(row.id, {
                    customerEmail: row.email || undefined,
                    customerPhone: row.phone || undefined,
                    customerName: row.name,
                  });
                  if (link.configured && link.checkoutUrl) {
                    await navigator.clipboard?.writeText(link.checkoutUrl).catch(() => undefined);
                    toast.success("Razorpay payment link copied");
                  } else {
                    toast.info("Payment link recorded — add Razorpay keys on the server to charge.");
                  }
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <ExternalLink size={14} /> Payment link
            </button>
            {row.email && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await sendInvoiceEmail(row.id, row.email, "We look forward to confirming your trip.");
                    toast.success(result.status === "sent" ? "Invoice emailed" : "Invoice email queued — connect SMTP to send live");
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <Mail size={14} /> Email invoice
              </button>
            )}
          </div>
        </section>
      )}

      {/* Profile */}
      {PROFILE_MODULES.has(module.id) && onOpenProfile && module.id !== "quotations" && (
        <section className="record-sheet__section">
          <h4>
            <LinkOut size={14} /> Full picture
          </h4>
          <button type="button" className="record-sheet__profile-btn" onClick={() => onOpenProfile(row)}>
            View complete profile
            <small>
              Interaction history · invoices &amp; bookings · tasks schedule · stage funnel
            </small>
            <ExternalLink size={15} />
          </button>
        </section>
      )}

      {/* Tasks */}
      <section className="record-sheet__section">
        <h4>
          <UserCheck size={14} /> Follow-ups ({recordTasks.filter((t) => !t.done).length} open)
        </h4>
        {recordTasks.length > 0 && (
          <ul className="record-sheet__task-list">
            {recordTasks.map((task) => (
              <li key={task.id} className={task.done ? "is-done" : undefined}>
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={(e) => toggleTask(task.id, e.target.checked)}
                  aria-label={`Mark ${task.title} ${task.done ? "open" : "done"}`}
                />
                <div className="min-w-0">
                  <strong>{task.title}</strong>
                  <small>
                    {task.date
                      ? new Date(task.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      : "—"}{" "}
                    · {task.owner || "Me"} · {task.priority}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={`Remove task ${task.title}`}
                  onClick={() => {
                    removeTask?.(task.id);
                    toast.success("Task removed");
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="record-sheet__tasks">
          <label>
            <Plus size={13} /> Add task
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder={`e.g. ${module.id === "leads" ? "Call ... about quotation" : "Follow up with ..."}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setNoteTitle((current) => {
                    if (current.trim()) addFollowUp(current);
                    return "";
                  });
                }
              }}
            />
            <input
              type="date"
              value={noteDate}
              onChange={(e) => setNoteDate(e.target.value)}
            />
            <button
              type="button"
              disabled={!noteTitle.trim() || taskBusy}
              onClick={() => {
                if (!noteTitle.trim()) return;
                addFollowUp(noteTitle);
                setNoteTitle("");
              }}
            >
              <CalendarPlus size={13} />
            </button>
          </label>
        </div>
      </section>

      {/* Journey */}
      <JourneyRail
        steps={journey}
        onAdd={(step) => {
          if (!step.moduleId) return;
          onWorkflow(step.moduleId);
        }}
      />

      {/* Everything else */}
      <section className="record-sheet__section">
        <h4>
          <Briefcase size={14} /> All details
        </h4>
        <dl className="record-sheet__grid">
          {entries.map((entry) => (
            <div key={entry.label}>
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
          {customFields.filter((f) => row.extra?.[f.id] !== undefined).map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>{String(row.extra?.[f.id])}</dd>
            </div>
          ))}
          {entries.length === 0 && <p className="record-sheet__empty">No details yet — press Edit to fill them in.</p>}
        </dl>
      </section>

      {row.notes && (
        <section className="record-sheet__section">
          <h4>Notes</h4>
          <p className="record-sheet__notes">{row.notes}</p>
        </section>
      )}

      {auditEntries.length > 0 && (
        <section className="record-sheet__section">
          <h4>Recent activity</h4>
          <ul className="record-sheet__audit">
            {auditEntries.map((a) => (
              <li key={a.id}>
                <span className="record-sheet__audit-action">{a.action}</span>
                <span className="record-sheet__audit-label">{a.label || ""}</span>
                <small>{a.user}</small>
                <small>{new Date(a.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
        </>
      )}
    </Sheet>
  );
}

/**
 * Quote line items live in the record's extra bag as JSON (extra columns hold
 * strings/numbers only — arrays are serialised).
 */
export function parseQuoteItems(row: RecordRow): QuoteItemDto[] {
  const raw = row.extra?.["quoteItems"];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as QuoteItemDto[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof (item as { rate?: unknown }).rate === "number")
      .map((item) => ({
        label: String(item.label || "Package component").slice(0, 90),
        qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
        rate: Number(item.rate),
      }));
  } catch {
    return [];
  }
}

/** Which cross-module moves make business sense from where. */
function workflowTargetsFor(moduleId: string): Array<{ id: string; label: string }> {
  switch (moduleId) {
    case "leads":
      return [
        { id: "quotations", label: "Create quotation" },
        { id: "bookings", label: "Convert to booking" },
      ];
    case "quotations":
      return [{ id: "bookings", label: "Convert to booking" }];
    case "bookings":
      return [
        { id: "finance", label: "Create invoice" },
        { id: "visa", label: "Start visa app" },
      ];
    case "customers":
      return [{ id: "leads", label: "New enquiry" }];
    default:
      return [];
  }
}

/* ====================================================================== */

/**
 * Quotation builder inside the side panel: itemised package lines that feed
 * the professional PDF (masthead, validity, terms), ready to download or email.
 */
function QuotationSection({ row, currency }: { row: RecordRow; currency: string }) {
  const { update, settings } = useCRM();
  const items = parseQuoteItems(row);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemRate, setItemRate] = useState("");
  const [emailTo, setEmailTo] = useState(row.email);

  const saveItems = (next: QuoteItemDto[]) => {
    update("quotations", {
      ...row,
      extra: { ...(row.extra ?? {}), quoteItems: JSON.stringify(next) },
    });
  };

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const taxRate = settings.taxRate ?? 5;
  const tax = Math.round((subtotal * taxRate) / 100);

  return (
    <section className="record-sheet__section">
      <h4>
        <FileText size={14} /> Quotation packages
      </h4>
      <p className="record-sheet__hint">
        Line items go straight into the professional quote PDF � company masthead,
        validity date, tax and terms included.
      </p>
      {items.length === 0 && (
        <p className="record-sheet__empty">
          No line items yet � the quote PDF will show the whole package as one line
          (which is fine for simple trips).
        </p>
      )}
      {items.length > 0 && (
        <ul className="record-sheet__task-list">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <div className="min-w-0 flex-1">
                <strong>{item.label}</strong>
                <small>
                  {item.qty > 1 ? `${item.qty} � ` : ""}
                  {money(item.rate, currency)} = {money(item.rate * item.qty, currency)}
                </small>
              </div>
              <button
                type="button"
                aria-label={`Remove line ${item.label}`}
                onClick={() => {
                  saveItems(items.filter((_, i) => i !== index));
                  toast.success("Line removed");
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          <li className="record-sheet__totals">
            <div className="min-w-0 flex-1">
              <strong>Subtotal + {settings.taxRegime || "GST"} {taxRate}%</strong>
              <small>Quoted total: {money(subtotal + tax, currency)}</small>
            </div>
          </li>
        </ul>
      )}
      <div className="record-sheet__quote-form">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="e.g. Goa hotel 4?, 3 nights"
          aria-label="Package line description"
        />
        <input
          type="number"
          min="1"
          value={itemQty}
          onChange={(e) => setItemQty(e.target.value)}
          aria-label="Quantity"
          className="record-sheet__quote-qty"
        />
        <input
          type="number"
          min="0"
          value={itemRate}
          onChange={(e) => setItemRate(e.target.value)}
          placeholder="Rate"
          aria-label="Rate per unit"
          className="record-sheet__quote-rate"
        />
        <button
          type="button"
          aria-label="Add package line"
          disabled={!itemName.trim() || !itemRate}
          onClick={() => {
            const next: QuoteItemDto[] = [
              ...items,
              {
                label: itemName.trim(),
                qty: Math.max(1, Number(itemQty) || 1),
                rate: Number(itemRate) || 0,
              },
            ];
            saveItems(next);
            setItemName("");
            setItemQty("1");
            setItemRate("");
            toast.success("Line added to the quote");
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="record-sheet__actions">
        <button
          type="button"
          onClick={async () => {
            try {
              await downloadQuotationPdf(row.id);
              toast.success("Quotation PDF downloaded");
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Download size={14} /> Download quote PDF
        </button>
        {emailTo && (
          <button
            type="button"
            onClick={async () => {
              try {
                const result = await sendQuotationEmail(row.id, emailTo);
                toast.success(
                  result.status === "sent"
                    ? "Quotation emailed"
                    : "Quotation email queued � connect SMTP on the server to send live",
                );
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Mail size={14} /> Email quote
          </button>
        )}
      </div>
      {!row.email && (
        <label className="record-sheet__hint">
          Customer email for sending the quote:
          <div className="record-sheet__quote-form">
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="customer@email.com"
            />
          </div>
        </label>
      )}
    </section>
  );
}

/* ====================================================================== */

/**
 * Screen 2 of the side panel: create a quotation or a proposal for the record
 * the user came from. Real fields (destination, dates, travellers, amount),
 * real line items, and the new document lands in the workspace immediately.
 */
function CreateDocumentForm({
  kind,
  sourceRow,
  sourceModule,
  currency,
  onBack,
  onCreated,
}: {
  kind: "quotations" | "proposals";
  sourceRow: RecordRow;
  sourceModule: Module;
  currency: string;
  onBack: () => void;
  onCreated: (created: RecordRow) => void | Promise<void>;
}) {
  const { createRecord, settings } = useCRM();
  const isProposal = kind === "proposals";
  const [destination, setDestination] = useState(sourceRow.destination || "");
  const [travelDate, setTravelDate] = useState(
    sourceRow.date || new Date().toISOString().slice(0, 10),
  );
  const [travellers, setTravellers] = useState("2");
  const [amount, setAmount] = useState(String(sourceRow.amount || ""));
  const [detail, setDetail] = useState(
    sourceRow.detail || (isProposal ? "Proposal for the requested journey" : "Trip quotation"),
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuoteItemDto[]>([
    { label: sourceRow.destination || "Package", qty: 1, rate: Number(sourceRow.amount) || 0 },
  ]);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemRate, setItemRate] = useState("");
  const [busy, setBusy] = useState(false);

  const total = items.reduce((sum, item) => sum + item.qty * item.rate, 0);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const moduleId = isProposal ? "quotations" : "quotations";
      const prefix = isProposal ? "PR" : "QT";
      const newRow: RecordRow = {
        id: `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        name: sourceRow.name,
        detail: detail || (isProposal ? "Travel proposal" : "Trip quotation"),
        destination,
        owner: sourceRow.owner || settings.employees[0]?.name || "",
        branch: sourceRow.branch || settings.branches[0] || "",
        date: travelDate,
        amount: total || Number(amount) || 0,
        currency,
        status: "Draft",
        email: sourceRow.email,
        phone: sourceRow.phone,
        source: isProposal ? "Proposal" : "Website",
        notes:
          notes ||
          (isProposal
            ? `Proposal created from ${sourceModule.noun} ${sourceRow.id}`
            : `Quotation created from ${sourceModule.noun} ${sourceRow.id}`),
        extra: {
          ...(sourceRow.extra ?? {}),
          quoteItems: JSON.stringify(items),
          travellers,
          docKind: isProposal ? "proposal" : "quotation",
        },
      };
      const created = await createRecord(moduleId, newRow);
      if (created) await onCreated(created);
      else toast.error("Could not create the document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="record-sheet__create">
      <button
        type="button"
        className="record-sheet__back"
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Back to {sourceModule.noun}
      </button>
      <p className="record-sheet__hint">
        {isProposal
          ? "A proposal is a soft, no-commitment pitch. It carries the same professional PDF layout and validity as a quotation."
          : "A quotation is a priced, valid offer. It becomes a real PDF with your company masthead, tax and terms."}
      </p>

      <label className="record-sheet__field">
        Destination
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Bali, Indonesia"
        />
      </label>
      <div className="record-sheet__field-row">
        <label className="record-sheet__field">
          Travel date
          <input
            type="date"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
          />
        </label>
        <label className="record-sheet__field">
          Travellers
          <input
            type="number"
            min="1"
            value={travellers}
            onChange={(e) => setTravellers(e.target.value)}
          />
        </label>
      </div>
      <label className="record-sheet__field">
        {isProposal ? "What is being proposed" : "Summary"}
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="e.g. 6 nights Bali with flights and transfers"
        />
      </label>

      <div className="record-sheet__field-label">Package lines</div>
      <ul className="record-sheet__task-list">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <div className="min-w-0 flex-1">
              <strong>{item.label}</strong>
              <small>
                {item.qty > 1 ? `${item.qty} � ` : ""}
                {money(item.rate, currency)} = {money(item.rate * item.qty, currency)}
              </small>
            </div>
            <button
              type="button"
              aria-label={`Remove line ${item.label}`}
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        <li className="record-sheet__totals">
          <div className="min-w-0 flex-1">
            <strong>Total</strong>
            <small>{money(total, currency)}</small>
          </div>
        </li>
      </ul>
      <div className="record-sheet__quote-form">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="e.g. Hotel, 5 nights"
          aria-label="Package line description"
        />
        <input
          type="number"
          min="1"
          value={itemQty}
          onChange={(e) => setItemQty(e.target.value)}
          aria-label="Quantity"
          className="record-sheet__quote-qty"
        />
        <input
          type="number"
          min="0"
          value={itemRate}
          onChange={(e) => setItemRate(e.target.value)}
          placeholder="Rate"
          aria-label="Rate per unit"
          className="record-sheet__quote-rate"
        />
        <button
          type="button"
          aria-label="Add package line"
          disabled={!itemName.trim() || !itemRate}
          onClick={() => {
            setItems([
              ...items,
              {
                label: itemName.trim(),
                qty: Math.max(1, Number(itemQty) || 1),
                rate: Number(itemRate) || 0,
              },
            ]);
            setItemName("");
            setItemQty("1");
            setItemRate("");
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      <label className="record-sheet__field">
        Notes for the customer
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Inclusions, exclusions, payment terms�"
          rows={3}
        />
      </label>

      <div className="record-sheet__actions">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={create} disabled={busy}>
          <Check size={15} />
          {busy
            ? "Creating�"
            : isProposal
              ? "Create proposal"
              : "Create quotation"}
        </Button>
      </div>
    </div>
  );
}
