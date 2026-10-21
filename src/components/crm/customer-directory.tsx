import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  Copy,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Star,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, Status } from "./common";
import { formatDay, money, type RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
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
};

export function CustomerDirectory({
  rows,
  currency,
  onOpenRecord,
}: {
  rows: RecordRow[];
  currency: string;
  onOpenRecord: (row: RecordRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("All");
  const [view, setView] = useState<"Grid" | "Table">("Grid");
  const [selected, setSelected] = useState<RecordRow | null>(null);
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

  /* ---------------- Detail page (full screen, not a modal) ---------------- */
  if (selected) {
    const meta = withMeta.find((c) => c.row.id === selected.id);
    const health = meta?.health ?? 0;
    const healthDetail = meta?.healthDetail;
    const seg = meta?.segment ?? "SMB";
    const current = rows.find((r) => r.id === selected.id) ?? selected;

    // Cross-module interactions for this customer
    const interactions: Interaction[] = (
      ["leads", "quotations", "bookings", "finance", "support"] as const
    ).flatMap((mid) =>
      getRows(mid)
        .filter((r) => r.name.trim().toLowerCase() === current.name.trim().toLowerCase())
        .map((r) => ({
          at: r.date,
          title: r.name,
          amount: r.amount,
          status: r.status,
          ref: r.id,
          module: mid,
        })),
    );
    interactions.sort((a, b) => (a.at < b.at ? 1 : -1));

    // Open pipeline across leads + quotations
    const openStatuses = [
      "New",
      "Contacted",
      "Qualified",
      "Quoted",
      "Sent",
      "Draft",
      "Pending",
      "On hold",
      "Open",
    ];
    const pipelineRows = [...getRows("leads"), ...getRows("quotations")].filter(
      (r) =>
        r.name.trim().toLowerCase() === current.name.trim().toLowerCase() &&
        openStatuses.includes(r.status),
    );
    const openPipeline = pipelineRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const wonAll = interactions.filter((i) => /^(won|accepted|confirmed|paid)/i.test(i.status));
    const wonTotal = wonAll.reduce((a, i) => a + i.amount, 0);

    // Stage funnel from this customer's leads
    const leadRows = getRows("leads").filter(
      (r) => r.name.trim().toLowerCase() === current.name.trim().toLowerCase(),
    );
    const funnelStages = ["New", "Contacted", "Qualified", "Quoted", "Won", "Lost"];
    const funnel = funnelStages.map((s) => ({
      stage: s,
      total: leadRows
        .filter((r) => r.status === s)
        .reduce((a, r) => a + (Number(r.amount) || 0), 0),
      count: leadRows.filter((r) => r.status === s).length,
    }));
    const funnelMax = Math.max(1, ...funnel.map((f) => f.total));

    // Simple month calendar with task dots from global tasks
    const now = new Date();
    const monthLabel = now.toLocaleString("en-US", { month: "long" });
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const firstDow = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7; // Mon-first
    const taskDays = new Set(
      tasks
        .filter((t) => {
          const d = new Date(t.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .map((t) => new Date(t.date).getDate()),
    );
    const today = now.getDate();

    return (
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-7 flex flex-wrap items-center gap-x-10 gap-y-4">
          <button
            onClick={() => setSelected(null)}
            className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
            title="Back to customers"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-[34px] font-semibold leading-[1.05] tracking-tight sm:text-[40px]">
              Customer
              <br />
              Information
            </h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <BarChart3 className="size-5 text-muted" />
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  {money(wonTotal, currency)}
                  <span className="rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-bold text-on-butter">
                    {wonAll.length ? `${wonAll.length} deals` : "None yet"}
                  </span>
                </div>
                <div className="text-xs text-muted">Won, all time</div>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <User className="size-5 text-pine" />
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  {money(openPipeline, currency)}
                  <span className="rounded-full bg-pine px-2.5 py-0.5 text-[11px] font-bold text-on-pine">
                    {pipelineRows.length} open
                  </span>
                </div>
                <div className="text-xs text-muted">Open pipeline</div>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <Calendar className="size-5 text-tomato" />
              </span>
              <div>
                <div className="text-xl font-semibold tracking-tight">
                  {tasks.filter((t) => !t.done).length}
                </div>
                <div className="text-xs text-muted">Open tasks in workspace</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            {/* Interaction history */}
            <section className="glass-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-medium">Interaction History</h2>
                <span className="text-xs text-muted">{interactions.length} records</span>
              </div>
              {interactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">
                  No linked leads, quotations or bookings yet — create one from the relevant
                  workspace.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {interactions.slice(0, 8).map((it, i) => (
                    <article
                      key={`${it.ref}-${i}`}
                      className={cn(
                        "rounded-3xl p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                        i === 0 ? "bg-ink text-on-ink" : "border border-line bg-glass-2",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-medium", i === 0 ? "opacity-75" : "text-muted")}>
                          {formatDay(it.at)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            i === 0 ? "bg-black/15" : "bg-well",
                          )}
                        >
                          {it.status}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold leading-tight">
                        {it.module === "finance"
                          ? "Invoice"
                          : it.module === "support"
                            ? "Ticket"
                            : it.module.slice(0, -1)}{" "}
                        {it.ref}
                      </h3>
                      <div className={cn("mt-3 text-lg font-bold", i === 0 && "opacity-90")}>
                        {money(it.amount, currency)}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Tasks schedule mini calendar */}
              <section className="glass-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-medium">Tasks Schedule</h2>
                  <span className="text-xs text-muted">
                    {monthLabel} {now.getFullYear()}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
                  {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                    <span key={d} className="py-1 font-semibold">
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <span key={`x${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const hasTask = taskDays.has(day);
                    const isToday = day === today;
                    return (
                      <span
                        key={day}
                        className={cn(
                          "relative grid aspect-square place-items-center rounded-xl text-xs",
                          isToday
                            ? "bg-pine font-bold text-on-pine"
                            : hasTask
                              ? "border border-line bg-glass-2 font-medium"
                              : "text-muted",
                        )}
                      >
                        {day}
                        {hasTask && !isToday && (
                          <i
                            className="absolute bottom-1 size-1 rounded-full bg-tomato"
                            aria-hidden
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
              </section>

              {/* Stage funnel */}
              <section className="glass-card p-5">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-[15px] font-medium">Stage Funnel</h2>
                </div>
                <div className="text-2xl font-extrabold tracking-tight">
                  {money(openPipeline, currency)}
                </div>
                <p className="mb-4 text-xs text-muted">Total in pipeline</p>
                <div className="space-y-2">
                  {funnel.map((f) => (
                    <div
                      key={f.stage}
                      className="relative overflow-hidden rounded-2xl border border-line bg-glass-2 px-4 py-2.5"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-well transition-all"
                        style={{ width: `${(f.total / funnelMax) * 100}%` }}
                        aria-hidden
                      />
                      <div className="relative flex items-center justify-between text-xs">
                        <span className="font-semibold">
                          <i
                            className={cn(
                              "mr-1.5 inline-block size-2 rounded-full",
                              f.stage === "Won"
                                ? "bg-pine"
                                : f.stage === "Lost"
                                  ? "bg-tomato"
                                  : "bg-butter",
                            )}
                          />
                          {f.stage}
                          {f.count > 0 && <span className="ml-1 text-muted">· {f.count}</span>}
                        </span>
                        <span className="font-bold">{money(f.total, currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Right column: profile + details */}
          <div className="space-y-4">
            <section className="glass-card flex flex-col items-center p-6 text-center">
              <div className="relative mb-4">
                <svg
                  className="absolute -inset-1.5 size-[calc(100%+12px)] -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden
                >
                  <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" strokeWidth="4" />
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke={healthTone(health)}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(health / 100) * 289} 289`}
                  />
                </svg>
                <span className="grid size-24 place-items-center">
                  <Avatar name={current.name} size="large" />
                </span>
                <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-ink text-[11px] font-bold text-on-ink">
                  {health}
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight">{current.name}</h2>
              <p className="mt-0.5 text-sm text-muted">{current.detail || current.id}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <span className="rounded-full bg-well px-3 py-1 text-xs font-semibold">{seg}</span>
                {current.destination && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-well px-3 py-1 text-xs font-semibold">
                    <MapPin className="size-3" /> {current.destination}
                  </span>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={`mailto:${current.email}`}
                  className="grid size-11 place-items-center rounded-full border border-line-2 bg-glass-2 transition-colors hover:bg-well"
                  title="Email"
                >
                  <Mail className="size-4" />
                </a>
                <a
                  href={`tel:${current.phone}`}
                  className="grid size-11 place-items-center rounded-full border border-line-2 bg-glass-2 transition-colors hover:bg-well"
                  title="Call"
                >
                  <Phone className="size-4" />
                </a>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-11 rounded-full"
                  title="Edit record"
                  onClick={() => onOpenRecord(current)}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </div>
            </section>

            <section className="glass-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[15px] font-medium">Detailed Information</h2>
                <Status value={current.status} />
              </div>
              <dl className="space-y-3 text-sm">
                {[
                  { icon: <User className="size-4" />, label: "Full name", value: current.name },
                  {
                    icon: <Building2 className="size-4" />,
                    label: "Company / detail",
                    value: current.detail || "—",
                  },
                  {
                    icon: <Mail className="size-4" />,
                    label: "Email",
                    value: current.email,
                    copy: current.email,
                  },
                  {
                    icon: <Phone className="size-4" />,
                    label: "Phone",
                    value: current.phone,
                    copy: current.phone,
                  },
                  {
                    icon: <MapPin className="size-4" />,
                    label: "Favourite destination",
                    value: current.destination || "—",
                  },
                  {
                    icon: <Calendar className="size-4" />,
                    label: "Last contact",
                    value: agoLabel(current.date),
                  },
                  {
                    icon: <Star className="size-4" />,
                    label: "Lifetime value",
                    value: money(current.amount, currency),
                  },
                  {
                    icon: <User className="size-4" />,
                    label: "Account owner",
                    value: current.owner || "Unassigned",
                  },
                ].map((f) => (
                  <div key={f.label} className="flex items-start gap-3">
                    <span className="mt-0.5 text-muted">{f.icon}</span>
                    <div className="min-w-0 flex-1">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {f.label}
                      </dt>
                      <dd className="truncate font-medium">{f.value}</dd>
                    </div>
                    {f.copy && (
                      <button
                        className="grid size-8 shrink-0 place-items-center rounded-full border border-line hover:bg-well"
                        title={`Copy ${f.label}`}
                        onClick={() => {
                          navigator.clipboard?.writeText(f.copy!);
                          toast.success(`${f.label} copied`);
                        }}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </dl>
              {current.notes && (
                <p className="mt-4 rounded-2xl bg-well p-3 text-xs leading-relaxed text-muted">
                  {current.notes}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

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
              onClick={() => setSelected(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(row);
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
                  <a
                    href={`mailto:${row.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title="Email"
                  >
                    <Mail className="size-3.5" />
                  </a>
                  <a
                    href={`tel:${row.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                    title="Call"
                  >
                    <Phone className="size-3.5" />
                  </a>
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
                  onClick={() => setSelected(row)}
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
    </div>
  );
}
