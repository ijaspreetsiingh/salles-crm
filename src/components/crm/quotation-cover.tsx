import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Status } from "./common";
import { money, type RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { setCommsFocus } from "@/lib/crm/handoff";
import { cn } from "@/lib/utils";
import {
  downloadQuotationPdf,
  sendQuotationEmail,
  type QuoteItemDto,
} from "@/lib/api/modules";
import { errorMessage } from "@/lib/api/client";

/** Line items live in the record's extra bag as a JSON string. */
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

/**
 * The Quotation cover — a full page that reads like the document the customer
 * will receive. The price is broken down, the validity is real, and the PDF /
 * email buttons actually produce a file.
 */
export function QuotationCover({
  row,
  currency,
  onBack,
  onEdit,
  onOpenCommunications,
}: {
  row: RecordRow;
  currency: string;
  onBack: () => void;
  onEdit: () => void;
  onOpenCommunications?: () => void;
}) {
  const { update, settings } = useCRM();
  const [emailTo, setEmailTo] = useState(row.email);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemRate, setItemRate] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => parseQuoteItems(row), [row]);
  const taxRate = settings.taxRate ?? 5;
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax || row.amount;

  const isProposal = row.extra?.["docKind"] === "proposal";
  const issued = row.date ? new Date(row.date) : new Date();
  const validUntil = new Date(issued);
  validUntil.setDate(validUntil.getDate() + 15);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const saveItems = (next: QuoteItemDto[]) => {
    update("quotations", {
      ...row,
      extra: { ...(row.extra ?? {}), quoteItems: JSON.stringify(next) },
    });
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-7 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button
          onClick={onBack}
          className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
          title="Back to quotations"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <div className="zone-identity__eyebrow">{isProposal ? "Proposal" : "Quotation"}</div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[36px]">
            {row.id}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {row.destination || "Destination not set"} · {fmt(issued)} · valid until{" "}
            {fmt(validUntil)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Status value={row.status} />
          <Button variant="outline" onClick={onEdit}>
            Edit details
          </Button>
          <Button
            onClick={async () => {
              try {
                await downloadQuotationPdf(row.id);
                toast.success("Quotation PDF downloaded");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Download size={15} /> Download PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* The document */}
        <div className="space-y-4">
          <section className="glass-card p-6">
            {/* Masthead */}
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-pine text-xl font-bold text-on-pine">
                {settings.orgName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("") || "T"}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight">{settings.orgName}</h2>
                <p className="text-xs text-muted">
                  {settings.gstin ? `GSTIN ${settings.gstin} · ` : ""}
                  {settings.supportEmail}
                </p>
                <p className="text-xs text-muted">{settings.address}</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  {isProposal ? "Proposal" : "Quotation"}
                </div>
                <div className="text-xl font-bold tracking-tight">{row.id}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                  Prepared for
                </div>
                <div className="text-base font-semibold">{row.name}</div>
                {row.email && <div className="text-xs text-muted">{row.email}</div>}
                {row.phone && <div className="text-xs text-muted">{row.phone}</div>}
                {row.destination && (
                  <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                    <MapPin className="size-3" /> {row.destination}
                  </div>
                )}
              </div>
              <div className="sm:text-right">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                  Trip summary
                </div>
                <div className="text-xs text-muted">
                  {row.detail || "Package as discussed"}
                </div>
                <div className="text-xs text-muted">
                  Travellers {row.extra?.["travellers"] ?? "—"} · Nights{" "}
                  {row.extra?.["nights"] ?? "—"}
                </div>
                <div className="text-xs text-muted">Currency {currency}</div>
              </div>
            </div>

            {/* Line items */}
            <table className="mt-6 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="pb-2">Package details</th>
                  <th className="pb-2 text-right">Rate</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-4 text-sm text-muted">
                      No line items yet — the whole package is priced as a single line.
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <tr key={`${item.label}-${index}`} className="border-b border-line">
                      <td className="py-2.5 font-medium">
                        {item.label}
                        {item.qty > 1 && <span className="text-muted"> ×{item.qty}</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {money(item.rate, currency)}
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">
                        {money(item.rate * item.qty, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-5 flex justify-end">
              <dl className="w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular-nums">{money(subtotal, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">
                    {settings.taxRegime || "GST"} ({taxRate}%)
                  </dt>
                  <dd className="tabular-nums">{money(tax, currency)}</dd>
                </div>
                <div className="flex justify-between rounded-xl bg-well px-3 py-2 text-base font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{money(total, currency)}</dd>
                </div>
              </dl>
            </div>

            {row.notes && (
              <p className="mt-5 rounded-2xl bg-well p-3 text-xs leading-relaxed text-muted">
                {row.notes}
              </p>
            )}
          </section>

          {/* Line item editor */}
          <section className="glass-card p-5">
            <h3 className="text-[15px] font-medium">Package lines</h3>
            <p className="mt-1 text-xs text-muted">
              These lines go straight into the PDF — the customer sees them as a priced
              breakdown, not a single lump sum.
            </p>
            <div className="record-sheet__quote-form mt-3">
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Bali hotel 5★, 5 nights"
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
                  saveItems([
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
                  toast.success("Line added");
                }}
              >
                <Plus size={14} />
              </button>
            </div>
            {items.length > 0 && (
              <ul className="record-sheet__task-list">
                {items.map((item, index) => (
                  <li key={`${item.label}-${index}`}>
                    <div className="min-w-0 flex-1">
                      <strong>{item.label}</strong>
                      <small>
                        {item.qty > 1 ? `${item.qty} × ` : ""}
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
              </ul>
            )}
          </section>
        </div>

        {/* Right column: send + context */}
        <div className="space-y-4">
          <section className="glass-card p-5">
            <h3 className="text-[15px] font-medium">Send it</h3>
            <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-muted">
              Email
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="customer@email.com"
                className="mt-1 w-full rounded-xl border border-line bg-glass-2 px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground"
              />
            </label>
            <Button
              className="mt-3 w-full"
              disabled={!emailTo || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await sendQuotationEmail(row.id, emailTo);
                  toast.success(
                    result.status === "sent"
                      ? "Quotation emailed"
                      : "Quotation email queued — connect SMTP on the server to send live",
                  );
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send size={15} /> Email quotation
            </Button>
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => {
                if (!onOpenCommunications) return;
                setCommsFocus({
                  name: row.name,
                  email: row.email || undefined,
                  phone: row.phone || undefined,
                  channel: "Email",
                  module: "quotations",
                  recordId: row.id,
                });
                onOpenCommunications();
              }}
            >
              <Mail size={15} /> Open in Communications
            </Button>
            <Button
              variant="outline"
              className="mt-2 w-full"
              onClick={() => {
                if (!onOpenCommunications) return;
                setCommsFocus({
                  name: row.name,
                  email: row.email || undefined,
                  phone: row.phone || undefined,
                  channel: "WhatsApp",
                  module: "quotations",
                  recordId: row.id,
                });
                onOpenCommunications();
              }}
            >
              <Phone size={15} /> WhatsApp the customer
            </Button>
          </section>

          <section className="glass-card p-5">
            <h3 className="text-[15px] font-medium">At a glance</h3>
            <dl className="mt-3 space-y-3 text-sm">
              {[
                { icon: <User className="size-4" />, label: "Customer", value: row.name },
                { icon: <FileText className="size-4" />, label: "Reference", value: row.id },
                { icon: <MapPin className="size-4" />, label: "Destination", value: row.destination || "—" },
                { icon: <Check className="size-4" />, label: "Valid until", value: fmt(validUntil) },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="mt-0.5 text-muted">{f.icon}</span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {f.label}
                    </dt>
                    <dd className="truncate font-medium">{f.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>

          <section className="glass-card flex items-center gap-3 p-5">
            <Avatar name={row.name} size="tiny" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{row.owner || "Unassigned"}</div>
              <div className="text-xs text-muted">Account owner</div>
            </div>
            <Status value={row.status} />
          </section>
        </div>
      </div>
    </div>
  );
}
