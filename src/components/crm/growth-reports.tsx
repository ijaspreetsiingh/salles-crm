import { useMemo, useState } from "react";
import { ArrowUpRight, Clock, Download, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "./common";
import { money, type RecordRow } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

/* ================= Chart primitives (ported from Rapport design) ================= */

const CHART_TONES = ["var(--pine)", "var(--tomato)", "var(--butter)", "#3d7565"];

/** Smooth SVG path through points (Catmull-Rom → Bézier). */
const smoothPath = (pts: [number, number][]) => {
  if (pts.length < 2) return "";
  const f = pts[0];
  if (!f) return "";
  let d = `M${f[0]},${f[1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
};

const compact = (v: number) =>
  Math.abs(v) >= 100000
    ? `${Math.round(v / 1000)}K`
    : Math.abs(v) >= 1000
      ? `${Math.round(v / 1000)}K`
      : String(v);

function BarPlot({
  labels,
  series,
  max,
  moneyMode,
  currency,
}: {
  labels: string[];
  series: number[][];
  max: number;
  moneyMode: boolean;
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 700;
  const H = 210;
  const left = 46;
  const step = (W - left) / Math.max(labels.length, 1);

  return (
    <div className="relative">
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-11 z-20 -translate-x-1/2 rounded-xl border border-rim bg-solid px-3 py-1.5 shadow-pop"
          style={{ left: `${((left + (hover + 0.5) * step) / W) * 100}%` }}
        >
          <div className="text-center text-xs">
            <span className="font-semibold">{labels[hover]}</span>
            <div className="font-bold text-pine">
              {series.map((s, j) => (
                <span key={j} className="ml-1">
                  {moneyMode ? money(s[hover] ?? 0, currency) : (s[hover] ?? 0)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <svg
        role="img"
        aria-label="Monthly bar chart"
        viewBox={`0 0 ${W} ${H + 30}`}
        className="h-56 w-full cursor-pointer select-none"
        onMouseLeave={() => setHover(null)}
      >
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={W}
              y1={H - (v / max) * H}
              y2={H - (v / max) * H}
              stroke="var(--line)"
              strokeDasharray="2 4"
            />
            <text
              x="0"
              y={Math.max(12, H - (v / max) * H + 4)}
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {moneyMode ? compact(v) : v}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          let bottom = H;
          const on = hover === i;
          return (
            <g
              key={`${l}-${i}`}
              onMouseEnter={() => setHover(i)}
              className="transition-all duration-200"
            >
              <rect
                x={left + i * step + 3}
                y={0}
                width={step - 9}
                height={H}
                rx="6"
                fill={on ? "var(--well)" : "var(--well)"}
                opacity={on ? 1 : 0.55}
              />
              {series.map((s, j) => {
                const h = ((s[i] ?? 0) / max) * H;
                bottom -= h;
                return (
                  <rect
                    key={j}
                    x={left + i * step + 3}
                    y={bottom}
                    width={step - 9}
                    height={h}
                    fill={CHART_TONES[j % CHART_TONES.length]}
                    rx="4"
                    className="transition-all duration-300"
                    style={{ filter: on ? "brightness(1.12)" : "none" }}
                  />
                );
              })}
              <text
                x={left + (i + 0.5) * step}
                y={H + 23}
                textAnchor="middle"
                fontSize="11"
                fill={on ? "var(--text)" : "var(--muted-foreground)"}
                fontWeight={on ? 700 : 400}
              >
                {l}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LinePlot({ labels, values, max }: { labels: string[]; values: number[]; max: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = values.map(
    (v, i) =>
      [46 + (i * 644) / Math.max(values.length - 1, 1), 190 - (v / max) * 175] as [number, number],
  );
  const first = pts[0];
  const last = pts.at(-1);
  const d = smoothPath(pts);
  const active = hover !== null ? pts[hover] : null;

  return (
    <div className="relative">
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute -top-11 z-20 -translate-x-1/2 rounded-xl border border-rim bg-solid px-3 py-1.5 shadow-pop"
          style={{ left: `${(active[0] / 700) * 100}%` }}
        >
          <div className="text-center text-xs">
            <span className="font-semibold">{labels[hover]}</span>
            <div className="font-bold text-pine">{values[hover]}%</div>
          </div>
        </div>
      )}
      <svg
        role="img"
        aria-label="Win rate trend"
        viewBox="0 0 700 225"
        className="h-56 w-full cursor-crosshair select-none"
        onMouseLeave={() => setHover(null)}
      >
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line
              x1="46"
              x2="690"
              y1={190 - (v / max) * 175}
              y2={190 - (v / max) * 175}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
            <text x="0" y={194 - (v / max) * 175} fontSize="11" fill="var(--muted-foreground)">
              {v}%
            </text>
          </g>
        ))}
        {first && last && (
          <path d={`${d} L${last[0]},190 L${first[0]},190 Z`} fill="var(--pine)" opacity=".14" />
        )}
        <path
          d={d}
          stroke="var(--pine)"
          fill="none"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {active && (
          <g>
            <line
              x1={active[0]}
              x2={active[0]}
              y1={15}
              y2={190}
              stroke="var(--pine)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity=".7"
            />
            <circle cx={active[0]} cy={active[1]} r="7" fill="var(--pine)" fillOpacity=".3" />
            <circle
              cx={active[0]}
              cy={active[1]}
              r="4.5"
              fill="var(--pine)"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r="16"
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {labels.map((l, i) => (
          <text
            key={`${l}-${i}`}
            x={46 + (i * 644) / Math.max(labels.length - 1, 1)}
            y="218"
            textAnchor="middle"
            fontSize="11"
            fill={hover === i ? "var(--text)" : "var(--muted-foreground)"}
            fontWeight={hover === i ? 700 : 400}
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ================= Aggregation helpers ================= */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const lastNMonths = (n: number) => {
  const out: { key: string; label: string; y: number; m: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: MONTHS[d.getMonth()] ?? "",
      y: d.getFullYear(),
      m: d.getMonth(),
    });
  }
  return out;
};

const monthKey = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}`;
};

const WON_RE = /^(won|accepted|confirmed|paid|completed|departed|approved|resolved)/i;
const LOST_RE = /^(lost|declined|cancelled|rejected|expired|closed)/i;

type Segment = "Enterprise" | "Mid-market" | "SMB";
const segmentOf = (r: RecordRow): Segment =>
  r.amount >= 200000 ? "Enterprise" : r.amount >= 60000 ? "Mid-market" : "SMB";
const SEGMENT_TONE: Record<Segment, string> = {
  Enterprise: "bg-pine",
  "Mid-market": "bg-tomato",
  SMB: "bg-butter",
};

/* ================= Growth Reports page ================= */

export function GrowthReports() {
  const { getRows, settings } = useCRM();
  const currency = settings.currency;
  const [range, setRange] = useState<"3M" | "6M" | "12M">("6M");
  const [unit, setUnit] = useState<"amount" | "percent">("amount");

  const count = range === "3M" ? 3 : range === "6M" ? 6 : 12;
  const months = useMemo(() => lastNMonths(count), [count]);
  const monthIndex = useMemo(() => new Map(months.map((m, i) => [m.key, i])), [months]);

  const leads = useMemo(() => getRows("leads"), [getRows]);
  const customers = useMemo(() => getRows("customers"), [getRows]);
  const quotations = useMemo(() => getRows("quotations"), [getRows]);
  const bookings = useMemo(() => getRows("bookings"), [getRows]);
  const finance = useMemo(() => getRows("finance"), [getRows]);

  /** Revenue won per month, split by segment (from won leads + quotations + bookings + paid invoices). */
  const revenueSeries = useMemo(() => {
    const buckets: Record<Segment, number[]> = { Enterprise: [], "Mid-market": [], SMB: [] };
    for (const s of Object.keys(buckets) as Segment[]) buckets[s] = months.map(() => 0);
    const wonRows: RecordRow[] = [...leads, ...quotations, ...bookings, ...finance].filter((r) =>
      WON_RE.test(r.status),
    );
    for (const r of wonRows) {
      const idx = monthIndex.get(monthKey(r.date));
      if (idx === undefined) continue;
      const bucket = buckets[segmentOf(r)];
      bucket[idx] = (bucket[idx] ?? 0) + (Number(r.amount) || 0);
    }
    const raw = [buckets.Enterprise, buckets["Mid-market"], buckets.SMB];
    if (unit === "amount") return { series: raw, max: Math.max(1, ...raw.flat()) };
    const totals = months.map((_, i) => raw.reduce((a, s) => a + (s[i] ?? 0), 0) || 1);
    return {
      series: raw.map((s) => s.map((v, i) => Math.round((v / (totals[i] ?? 1)) * 100))),
      max: 100,
    };
  }, [leads, quotations, bookings, finance, months, monthIndex, unit]);

  const revenueTotal = revenueSeries.series.reduce((a, s) => a + s.reduce((x, y) => x + y, 0), 0);
  const segmentTotals = (["Enterprise", "Mid-market", "SMB"] as Segment[]).map(
    (s) =>
      revenueSeries.series[(["Enterprise", "Mid-market", "SMB"] as Segment[]).indexOf(s)]?.reduce(
        (a, b) => a + b,
        0,
      ) ?? 0,
  );

  /** Lead sources donut — how leads found us. */
  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of leads) {
      const s = (r.source || "Other").trim() || "Other";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return list.length ? list : ([["Referral", 1]] as [string, number][]);
  }, [leads]);
  const sourceTotal = sources.reduce((a, [, n]) => a + (n ?? 0), 0);
  const SOURCE_COLORS = [
    "var(--pine)",
    "#2f7d57",
    "#8a6d1a",
    "var(--tomato)",
    "#3d7565",
    "var(--butter)",
  ];

  /** New customers per month (from customers module). */
  const newCustomers = useMemo(() => {
    const counts = months.map(() => 0);
    for (const r of customers) {
      const idx = monthIndex.get(monthKey(r.date));
      if (idx !== undefined) counts[idx] = (counts[idx] ?? 0) + 1;
    }
    return counts;
  }, [customers, months, monthIndex]);
  const newCustomersTotal = newCustomers.reduce((a, b) => a + b, 0);

  /** Win rate per month from leads. */
  const winRate = useMemo(() => {
    const won = months.map(() => 0);
    const closed = months.map(() => 0);
    for (const r of leads) {
      const idx = monthIndex.get(monthKey(r.date));
      if (idx === undefined) continue;
      if (WON_RE.test(r.status)) {
        won[idx] = (won[idx] ?? 0) + 1;
        closed[idx] = (closed[idx] ?? 0) + 1;
      } else if (LOST_RE.test(r.status)) closed[idx] = (closed[idx] ?? 0) + 1;
    }
    const values = months.map((_, i) =>
      closed[i] ? Math.round(((won[i] ?? 0) / (closed[i] ?? 1)) * 100) : 0,
    );
    const totalWon = won.reduce((a, b) => a + b, 0);
    const totalClosed = closed.reduce((a, b) => a + b, 0);
    const avg = totalClosed ? Math.round((totalWon / totalClosed) * 100) : 0;
    return { values, avg, won: totalWon, closed: totalClosed };
  }, [leads, months, monthIndex]);

  /** Rep performance — won revenue per owner. */
  const reps = useMemo(() => {
    const byOwner = new Map<
      string,
      { won: number; deals: number; closed: number; total: number }
    >();
    for (const r of [...leads, ...quotations]) {
      const owner = r.owner || "Unassigned";
      const e = byOwner.get(owner) ?? { won: 0, deals: 0, closed: 0, total: 0 };
      e.total += 1;
      if (WON_RE.test(r.status)) {
        e.won += Number(r.amount) || 0;
        e.deals += 1;
        e.closed += 1;
      } else if (LOST_RE.test(r.status)) e.closed += 1;
      byOwner.set(owner, e);
    }
    return [...byOwner.entries()]
      .map(([owner, v]) => ({
        owner,
        ...v,
        rate: v.closed ? Math.round((v.deals / v.closed) * 100) : 0,
      }))
      .sort((a, b) => b.won - a.won)
      .slice(0, 5);
  }, [leads, quotations]);

  /** Top customers by lifetime value. */
  const topCustomers = useMemo(
    () => [...customers].sort((a, b) => b.amount - a.amount).slice(0, 6),
    [customers],
  );

  const avgWonDeal = useMemo(() => {
    const won = [...leads, ...quotations].filter((r) => WON_RE.test(r.status));
    return won.length ? won.reduce((a, r) => a + (Number(r.amount) || 0), 0) / won.length : 0;
  }, [leads, quotations]);

  const exportCSV = () => {
    const csv = [
      "Rep,Won,Deals,Win rate,Records",
      ...reps.map((r) => `${r.owner},${r.won},${r.deals},${r.rate}%,${r.total}`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growth-report-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported Growth Report as CSV");
  };

  const labels = months.map((m) => m.label);

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header controls */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted">
          Live report from your CRM records · last {count} months
        </div>
        <div className="flex items-center gap-2">
          <div className="segmented-control">
            {(["3M", "6M", "12M"] as const).map((r) => (
              <Button
                key={r}
                variant="ghost"
                size="sm"
                className={cn("rounded-full", range === r && "bg-well font-semibold")}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={exportCSV}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Top stat row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: <Users className="text-pine" />,
            value: newCustomersTotal,
            label: `New customers, last ${count} months`,
          },
          {
            icon: <Trophy className="text-foreground" />,
            value: money(avgWonDeal, currency),
            label: "Average won deal",
          },
          {
            icon: <Clock className="text-tomato" />,
            value: `${winRate.avg}%`,
            label: "Win rate, closed deals",
          },
        ].map((s) => (
          <div key={s.label} className="glass-card flex items-center gap-3.5 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-rim bg-glass-2">
              {s.icon}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold tracking-tight">{s.value}</div>
              <div className="truncate text-xs text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid: revenue by segment + lead sources */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="glass-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Revenue by segment</h2>
            <div className="flex items-center gap-2">
              <div className="segmented-control">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("rounded-full px-3", unit === "amount" && "bg-well font-semibold")}
                  onClick={() => setUnit("amount")}
                >
                  Amount
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("rounded-full px-3", unit === "percent" && "bg-well font-semibold")}
                  onClick={() => setUnit("percent")}
                >
                  %
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight">
              {unit === "amount" ? money(revenueTotal, currency) : "100%"}
            </span>
            <span className="text-xs font-medium text-muted">
              {unit === "amount" ? `won, last ${count} months` : "share of monthly revenue"}
            </span>
          </div>
          <div className="my-4 flex flex-wrap gap-2 text-xs">
            {(["Enterprise", "Mid-market", "SMB"] as Segment[]).map((s, i) => (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold",
                  "bg-ink text-on-ink",
                )}
              >
                <i className={cn("size-2 rounded-full", SEGMENT_TONE[s])} />
                {s} {money(segmentTotals[i] ?? 0, currency)}
              </span>
            ))}
          </div>
          <BarPlot
            labels={labels}
            series={revenueSeries.series}
            max={revenueSeries.max}
            moneyMode={unit === "amount"}
            currency={currency}
          />
        </section>

        <section className="glass-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Lead sources</h2>
          </div>
          <p className="text-xs text-muted">
            How the {newCustomersTotal} customers who joined in the last {count} months reached us.
            One customer can come through several channels.
          </p>
          <div className="my-6 flex justify-center">
            <div className="relative size-44">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                {sources.map(([name, n], i) => {
                  const prev = sources.slice(0, i).reduce((a, [, v]) => a + (v ?? 0), 0);
                  const circ = 251.3;
                  const len = ((n ?? 0) / sourceTotal) * circ - 2;
                  const off = -(prev / sourceTotal) * circ;
                  return (
                    <circle
                      key={name}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={SOURCE_COLORS[i % SOURCE_COLORS.length]}
                      strokeWidth="11"
                      strokeDasharray={`${len} ${circ}`}
                      strokeDashoffset={off}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 grid place-content-center text-center">
                <span className="text-3xl font-extrabold tracking-tight">{sourceTotal}</span>
                <span className="text-[11px] font-semibold text-muted">leads</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs font-semibold">
            {sources.map(([name, n], i) => (
              <div key={name} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <i
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                  />
                  <span className="truncate">{name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span>{n}</span>
                  <span className="font-normal text-muted">
                    {Math.round(((n ?? 0) / sourceTotal) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom: new customers + win rate trend */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="glass-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">New customers per month</h2>
            <button
              className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
              title="Open customers"
            >
              <ArrowUpRight className="size-4 text-muted" />
            </button>
          </div>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{newCustomersTotal}</span>
            <span className="text-xs font-medium text-muted">
              joined in the last {count} months
            </span>
          </div>
          <BarPlot
            labels={labels}
            series={[newCustomers]}
            max={Math.max(1, ...newCustomers)}
            moneyMode={false}
            currency={currency}
          />
        </section>

        <section className="glass-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Win rate trend</h2>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{winRate.avg}%</span>
            <span className="text-xs font-medium text-muted">
              {winRate.won} won of {winRate.closed} closed, last {count} months
            </span>
          </div>
          <p className="my-3 text-xs font-medium text-muted">
            ● Win rate per month · dashed grid = 0 / avg / 100%
          </p>
          <LinePlot labels={labels} values={winRate.values} max={100} />
        </section>
      </div>

      {/* Rep performance + top customers */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="glass-card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Rep performance</h2>
          {reps.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No assigned leads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    {["Rep", "Won", "Deals", "Win rate", "Records"].map((h) => (
                      <th key={h} className="pb-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reps.map((r) => (
                    <tr key={r.owner} className="border-t border-line">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.owner} size="small" />
                          <span className="font-semibold">{r.owner}</span>
                        </div>
                      </td>
                      <td className="font-bold text-pine">{money(r.won, currency)}</td>
                      <td>{r.deals}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-well">
                            <div
                              className="h-full rounded-full bg-pine"
                              style={{ width: `${r.rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">{r.rate}%</span>
                        </div>
                      </td>
                      <td className="text-muted">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass-card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Top customers</h2>
          {topCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No customers yet.</p>
          ) : (
            <ol className="space-y-3">
              {topCustomers.map((c, i) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="w-4 text-xs font-bold text-muted">{i + 1}</span>
                  <Avatar name={c.name} size="small" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {c.detail || c.destination || c.id}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold">{money(c.amount, currency)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
