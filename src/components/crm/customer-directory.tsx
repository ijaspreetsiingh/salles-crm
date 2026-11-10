import { useMemo, useState } from "react";
import { Building2, Copy, Mail, MapPin, Phone, Star, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Status, RecordDialog, workflowDataFor } from "./common";
import { RecordSheet } from "./record-sheet";
import {
  formatDay,
  money,
  type Module,
  type RecordRow,
  modules,
  findModule,
} from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { setCommsFocus } from "@/lib/crm/handoff";
import { cn } from "@/lib/utils";
import { customerHealth, customerSegment, customerSignals, healthColour } from "@/lib/crm/customer";

/** The colour of the health ring. */
const healthTone = healthColour;

const agoLabel = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const hrs = Math.round(diff / 36e5);
  if (hrs < 1) return "just now";
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "1 d ago";
  if (days < 30) return `${days} d ago`;
  return formatDay(iso);
};

type Interaction = {
  at: string;
  title: string;
  amount: number;
  status: string;
  ref: string;
  module: string;
  /** The actual record behind the card, so clicking opens real details. */
  row: RecordRow;
};

export function CustomerDirectory({
  rows,
  currency,
  onOpenProfile,
  onOpenCommunications,
}: {
  rows: RecordRow[];
  currency: string;
  /** Opens the full-page Customer Information cover. */
  onOpenProfile: (row: RecordRow) => void;
  /** Sends the user to Communications. */
  onOpenCommunications: () => void;
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("All");
  const [view, setView] = useState<"Grid" | "Table">("Grid");
  const [sheet, setSheet] = useState<{ row: RecordRow; module: Module } | null>(null);
  const [sheetEdit, setSheetEdit] = useState<RecordRow | null>(null);
  const [workflowCreate, setWorkflowCreate] = useState<{
    module: Module;
    data: Partial<RecordRow>;
  } | null>(null);
  const { getRows, tasks } = useCRM();

  const withMeta = useMemo(
    () =>
      rows.map((r) => {
        const signals = customerSignals(r, {
          bookings: getRows("bookings"),
          invoices: getRows("finance"),
          enquiries: getRows("leads"),
          tasks,
        });
        const health = customerHealth(signals);
        return {
          row: r,
          signals,
          health: health.score,
          healthDetail: health,
          segment: customerSegment(signals),
        };
      }),
    [rows, getRows, tasks],
  );

  const visible = withMeta.filter(
    (c) =>
      (segment === "All" || c.segment === segment) &&
      `${c.row.name} ${c.row.destination} ${c.row.detail} ${c.row.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  /** The record side panel + its edit/convert forms, shared by both views. */
  const sheetNodes = (
    <>
      {sheet && !sheetEdit && (
        <RecordSheet
          module={sheet.module}
          row={sheet.row}
          onClose={() => {
            setSheet(null);
            setSheetEdit(null);
          }}
          onEdit={() => setSheetEdit(sheet.row)}
          onWorkflow={(targetModuleId) => {
            setWorkflowCreate({
              module: findModule(targetModuleId) ?? sheet.module,
              data: workflowDataFor(targetModuleId, sheet.module.id, sheet.row),
            });
            setSheet(null);
            setSheetEdit(null);
          }}
          onOpenProfile={(profileRow) => {
            setSheet(null);
            setSheetEdit(null);
            onOpenProfile(profileRow);
          }}
        />
      )}
      {sheetEdit && sheet && (
        <RecordDialog module={sheet.module} row={sheetEdit} onClose={() => setSheetEdit(null)} />
      )}
      {workflowCreate && !sheet && (
        <RecordDialog
          module={workflowCreate.module}
          create
          initialData={workflowCreate.data}
          onClose={() => setWorkflowCreate(null)}
        />
      )}
    </>
  );

  /* ---------------- Grid directory ---------------- */
  return (
    <div className="animate-fade-in">
      <div className="workspace-toolbar mb-4">
        <div className="search-field">
          <input
            aria-label="Search customers"
            placeholder="Search name, destination, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["All", "Enterprise", "Mid-market", "SMB", "Lapsed"].map((s) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                segment === s
                  ? "bg-ink font-medium text-on-ink"
                  : "bg-glass-2 text-muted hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
          <div className="segmented-control ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className={cn("rounded-full", view === "Grid" && "bg-well font-semibold")}
              onClick={() => setView("Grid")}
            >
              Grid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("rounded-full", view === "Table" && "bg-well font-semibold")}
              onClick={() => setView("Table")}
            >
              Table
            </Button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="glass-card py-16 text-center text-sm text-muted">
          No customers match this view.
        </p>
      ) : view === "Grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map(({ row, health, healthDetail, segment: seg }) => (
            <article
              key={row.id}
              onClick={() => onOpenProfile(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpenProfile(row);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Open ${row.name}`}
              className="glass-card group cursor-pointer p-5 transition-all hover:-translate-y-1 hover:shadow-pop"
            >
              <div className="flex items-start justify-between">
                <Avatar name={row.name} size="normal" />
                {row.status === "VIP" && (
                  <span
                    className="grid size-8 place-items-center rounded-full bg-butter text-on-butter"
                    title="VIP"
                  >
                    <Star className="size-4 fill-current" />
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-base font-bold tracking-tight">{row.name}</h3>
              <p className="mt-0.5 truncate text-xs text-muted">
                {row.detail || row.id}
                {row.destination ? ` · ${row.destination}` : ""}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-well p-3">
                <div>
                  <div className="text-[11px] font-semibold text-muted">Lifetime</div>
                  <div className="text-sm font-bold">{money(row.amount, currency)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted">Last contact</div>
                  <div className="text-sm font-bold">{agoLabel(row.date)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${health}%`, background: healthTone(health) }}
                  />
                </div>
                <span className="text-[11px] font-bold text-muted">
                  {healthDetail?.label ?? health}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold">
                  {seg}
                </span>
                <div className="flex gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommsFocus({
                        name: row.name,
                        email: row.email || undefined,
                        phone: row.phone || undefined,
                        channel: "Email",
                        module: "customers",
                        recordId: row.id,
                      });
                      onOpenCommunications();
                    }}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title="Open in Communications (email)"
                  >
                    <Mail className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommsFocus({
                        name: row.name,
                        email: row.email || undefined,
                        phone: row.phone || undefined,
                        channel: "WhatsApp",
                        module: "customers",
                        recordId: row.id,
                      });
                      onOpenCommunications();
                    }}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title="Open in Communications (WhatsApp)"
                  >
                    <Phone className="size-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {["Customer", "Segment", "Lifetime", "Last contact", "Health", "Status"].map(
                  (h) => (
                    <th key={h} className="pb-3">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, health, healthDetail, segment: seg }) => (
                <tr
                  key={row.id}
                  onClick={() => onOpenProfile(row)}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-well"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={row.name} size="tiny" />
                      <div>
                        <div className="font-semibold">{row.name}</div>
                        <div className="text-xs text-muted">{row.detail || row.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="rounded-full bg-well px-2.5 py-0.5 text-xs font-semibold">
                      {seg}
                    </span>
                  </td>
                  <td className="font-bold">{money(row.amount, currency)}</td>
                  <td className="text-xs text-muted">{agoLabel(row.date)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-well">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${health}%`, background: healthTone(health) }}
                        />
                      </div>
                      <span className="text-xs font-bold">{healthDetail?.label ?? health}</span>
                    </div>
                  </td>
                  <td>
                    <Status value={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs font-medium text-muted">{visible.length} customers</p>
        </div>
      )}
      {sheetNodes}
    </div>
  );
}
