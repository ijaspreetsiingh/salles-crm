import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Plane,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Btn, EmptyState, FilterMenu, Panel, PanelHead } from "./ui";
import { Page, PageIdentity } from "./page";
import { Status } from "./common";
import { exportRows, findModule, formatDay, money } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import {
  exportRecordsCsv,
  fetchDashboardOverview,
  type DashboardOverviewDto,
} from "@/lib/api/modules";

/* ==========================================================================
   "How the business is doing"

   The second page, and the only one with charts. It answers three
   questions and nothing else:
     · how much money has come in
     · what is about to happen
     · what needs attention

   There is one set of numbers, not two. The home page lists what to do;
   this page explains the shape of the business.
   ========================================================================== */

const attentionIcon = (moduleId: string) => {
  if (moduleId === "finance") return Wallet;
  if (moduleId === "flights" || moduleId === "bookings") return Plane;
  return FileText;
};

/** A headline number, with a line underneath that says what it means. */
function BigStat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone: "pine" | "butter" | "tomato" | "ink";
}) {
  return (
    <div className="bigstat">
      <span className={`bigstat__icon bigstat__icon--${tone}`}>{icon}</span>
      <div className="bigstat__body">
        <p className="bigstat__label">{label}</p>
        <p className="bigstat__value">{value}</p>
        <p className="bigstat__hint">{hint}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [branch, setBranch] = useState("All branches");
  const [range, setRange] = useState("Last 6 months");
  const [metric, setMetric] = useState("Money booked");
  const [exporting, setExporting] = useState(false);
  const { getRows, settings, status } = useCRM();
  const currency = settings.currency;

  const { data: overview } = useApiQuery<DashboardOverviewDto>(
    () => fetchDashboardOverview(branch === "All branches" ? {} : { branch }),
    [branch],
    status === "ready",
  );

  const currencySymbol = money(0, currency).replace(/[\d.,\s]/g, "") || "₹";
  const compact = (value: number) => {
    if (Math.abs(value) >= 10000000) return `${currencySymbol}${(value / 10000000).toFixed(1)}Cr`;
    if (Math.abs(value) >= 100000) return `${currencySymbol}${(value / 100000).toFixed(1)}L`;
    if (Math.abs(value) >= 1000) return `${currencySymbol}${Math.round(value / 1000)}k`;
    return `${currencySymbol}${Math.round(value)}`;
  };

  const rows = useMemo(() => {
    const inBranch = (r: { branch: string }) => branch === "All branches" || r.branch === branch;
    const bookings = getRows("bookings").filter(inBranch);
    const leads = getRows("leads").filter(inBranch);
    const finance = getRows("finance").filter(inBranch);
    const live = bookings.filter((r) => r.status !== "Cancelled");
    return {
      bookings,
      leads,
      revenue: live.reduce((a, r) => a + r.amount, 0),
      outstanding: finance.filter((r) => r.status !== "Paid").reduce((a, r) => a + r.amount, 0),
      collected: finance.filter((r) => r.status === "Paid").reduce((a, r) => a + r.amount, 0),
      newLeads: leads.filter((r) => ["New", "Contacted", "Qualified"].includes(r.status)).length,
    };
  }, [getRows, branch]);

  const metrics = overview?.metrics ?? {
    revenue: rows.revenue,
    collected: rows.collected,
    outstanding: rows.outstanding,
    bookings: rows.bookings.length,
    confirmedBookings: 0,
    newLeads: rows.newLeads,
    quotationsSent: 0,
    upcomingDepartures: 0,
    openTasks: 0,
    conversionRate: 0,
    averageBookingValue: 0,
    grossMargin: null,
    grossMarginPercent: null,
  };

  const hasRealMargin = typeof metrics.grossMargin === "number";

  const series = overview?.revenueSeries ?? [];
  const graphData = series.map((point) => ({
    label: point.month,
    revenue: Math.round(point.revenue),
  }));

  const pipelineRows = overview?.pipeline ?? [];
  const pipelineTotal = pipelineRows.reduce((a, p) => a + p.count, 0);
  const pipelineValue = pipelineRows.reduce((a, p) => a + p.value, 0);
  const maxPipeline = Math.max(1, ...pipelineRows.map((p) => p.count));

  const departures = overview?.upcomingDepartures ?? [];
  const departureFallback = useMemo(
    () =>
      [...rows.bookings]
        .filter((r) => r.status !== "Cancelled")
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(0, 4)
        .map((r) => ({
          id: r.id,
          reference: r.id,
          name: r.name,
          destination: r.destination,
          date: r.date,
          status: r.status,
          amount: r.amount,
        })),
    [rows.bookings],
  );
  const departureList = departures.length ? departures.slice(0, 4) : departureFallback;

  const attention = (overview?.attention ?? []).map((item) => ({
    title: item.label,
    body: item.detail,
    label: item.level === "danger" ? "Late" : item.level === "warning" ? "Attention" : "Info",
    tone: item.level === "danger" ? "danger" : item.level === "warning" ? "warning" : "info",
    icon: attentionIcon(item.moduleId),
    module: item.moduleId,
  }));

  const exportReport = async () => {
    setExporting(true);
    try {
      if (status === "ready") {
        const csv = await exportRecordsCsv("bookings", branch === "All branches" ? {} : { branch });
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "traveldesk-report.csv";
        link.click();
        URL.revokeObjectURL(url);
      } else {
        exportRows(rows.bookings, "traveldesk-report");
      }
      toast.success("Report exported");
    } catch {
      exportRows(rows.bookings, "traveldesk-report");
      toast.success("Report exported");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page
      identity={
        <PageIdentity
          eyebrow="The business"
          title="How the business is doing"
          purpose="Where the money is coming from, what is about to travel, and what needs a person."
          actions={
            <>
              <Btn icon={<ArrowDownToLine />} onClick={exportReport} loading={exporting}>
                Export report
              </Btn>
              <Link
                to="/"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line-2 bg-glass-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-3"
              >
                Back to what needs you
                <ArrowRight className="size-4" />
              </Link>
            </>
          }
        />
      }
      switchboard={
        <>
          <div className="switchboard__spacer" />
          <FilterMenu
            label="Branch"
            value={branch}
            options={["All branches", ...settings.branches]}
            onChange={setBranch}
          />
          <FilterMenu
            label="Range"
            value={range}
            options={["Last 3 months", "Last 6 months", "Last 12 months", "This year"]}
            onChange={setRange}
          />
        </>
      }
      work={
        <>
          {/* One set of numbers. Not two. */}
          <div className="bigstat-grid">
            <BigStat
              icon={<Wallet className="size-4" />}
              label="Money booked"
              value={money(metrics.revenue, currency)}
              hint={`${metrics.confirmedBookings} confirmed trips`}
              tone="pine"
            />
            <BigStat
              icon={<CircleDollarSign className="size-4" />}
              label="Still to collect"
              value={money(metrics.outstanding, currency)}
              hint={`${money(metrics.collected, currency)} already paid`}
              tone="butter"
            />
            <BigStat
              icon={<Ticket className="size-4" />}
              label="Trips"
              value={String(metrics.bookings)}
              hint={`${metrics.upcomingDepartures} leaving soon`}
              tone="ink"
            />
            <BigStat
              icon={<Users className="size-4" />}
              label="New enquiries"
              value={String(metrics.newLeads)}
              hint={`${metrics.conversionRate}% became trips`}
              tone="tomato"
            />
          </div>

          <div className="analytics-grid">
            <Panel>
              <PanelHead
                title="Money over time"
                subtitle="What you have booked, month by month"
                actions={
                  <div className="switchboard__views" role="group" aria-label="Metric">
                    {(hasRealMargin ? ["Money booked", "Your profit"] : ["Money booked"]).map(
                      (v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={metric === v}
                          className={metric === v ? "is-active" : undefined}
                          onClick={() => setMetric(v)}
                        >
                          {v}
                        </button>
                      ),
                    )}
                  </div>
                }
              />
              <div className="revenue-summary">
                <h3>
                  {metric === "Your profit" && hasRealMargin
                    ? money(metrics.grossMargin ?? 0, currency)
                    : money(metrics.revenue, currency)}
                </h3>
                {hasRealMargin && (
                  <span className="chart-legend">
                    {metrics.grossMarginPercent}% of every sale is yours
                  </span>
                )}
              </div>
              {graphData.length === 0 ? (
                <div className="chart-container">
                  <EmptyState
                    icon={<TrendingUp size={22} />}
                    title="No money booked yet"
                    description="Create a trip and this chart starts showing your month by month."
                  />
                </div>
              ) : (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={graphData} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--pine)" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="var(--pine)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--line-2)"
                        strokeDasharray="3 4"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={18}
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={58}
                        tick={{ fill: "var(--muted)", fontSize: 11 }}
                        tickFormatter={compact}
                      />
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div className="chart-tooltip">
                              <strong>{label}</strong>
                              <p>{money(Number(payload[0]?.value ?? 0), currency)}</p>
                            </div>
                          ) : null
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--pine)"
                        fill="url(#revenueFill)"
                        strokeWidth={2.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHead
                title="Where enquiries are"
                subtitle="From first message to a confirmed trip"
                actions={
                  <Link
                    to="/workspace/$module"
                    params={{ module: "leads" }}
                    className="tool-icon-btn"
                    aria-label="Open enquiries"
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                }
              />
              <div className="pipeline-total">
                <strong>{pipelineTotal}</strong>
                <span>in progress</span>
                <span className="mini-badge">{money(pipelineValue, currency)}</span>
              </div>
              <div className="pipeline-bars">
                {pipelineRows.map((p) => (
                  <Link
                    key={p.stage}
                    to="/workspace/$module"
                    params={{ module: "leads" }}
                    className="pipeline-row"
                  >
                    <div>
                      <span className={`pipeline-dot pipeline-${p.stage.toLowerCase()}`} />
                      <span>{p.stage}</span>
                      <strong>{p.count}</strong>
                      <small>{money(p.value, currency)}</small>
                    </div>
                    <div className="pipeline-track">
                      <span
                        className={`pipeline-fill pipeline-${p.stage.toLowerCase()}`}
                        style={{ width: `${Math.round((p.count / maxPipeline) * 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
                {pipelineRows.length === 0 && (
                  <EmptyState
                    icon={<Users size={22} />}
                    title="No enquiries yet"
                    description="Once enquiries come in they appear here, stage by stage."
                  />
                )}
              </div>
              <Link
                className="section-bottom-link"
                to="/workspace/$module"
                params={{ module: "leads" }}
              >
                See all enquiries <ArrowRight size={14} />
              </Link>
            </Panel>
          </div>

          <div className="workday-grid">
            <Panel>
              <PanelHead
                title="Leaving soon"
                subtitle="Trips that need preparation"
                actions={
                  <Link
                    to="/workspace/$module"
                    params={{ module: "operations" }}
                    className="section-bottom-link"
                  >
                    See all <ArrowRight size={13} />
                  </Link>
                }
              />
              <div className="departure-list">
                {departureList.map((r, i) => (
                  <Link
                    to="/workspace/$module"
                    params={{ module: "bookings" }}
                    key={r.id}
                    className="departure-row"
                  >
                    <div className={`destination-icon destination-${i % 3}`}>
                      <Plane size={21} />
                    </div>
                    <div className="departure-details">
                      <h3>{r.destination || r.name}</h3>
                      <p>
                        {r.name} <span>·</span> {money(r.amount, currency)}
                      </p>
                      <div>
                        <CalendarDays size={12} /> {formatDay(r.date)}
                      </div>
                    </div>
                    <div className="departure-status">
                      <Status value={r.status} />
                      <small>{r.reference}</small>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                ))}
                {departureList.length === 0 && (
                  <EmptyState
                    icon={<Plane size={22} />}
                    title="Nothing is leaving yet"
                    description="Trips with a travel date show up here, soonest first."
                  />
                )}
              </div>
            </Panel>

            <Panel className="card-dark">
              <PanelHead title="Needs attention" subtitle="Before it becomes a problem" />
              <div className="attention-list">
                {attention.map((a) => (
                  <Link
                    to="/workspace/$module"
                    params={{ module: a.module }}
                    className="attention-row"
                    key={`${a.title}-${a.body}`}
                  >
                    <span className={`attention-icon attention-${a.tone}`}>
                      <a.icon size={17} />
                    </span>
                    <div>
                      <h4>{a.title}</h4>
                      <p>{a.body}</p>
                    </div>
                    <span className={`attention-label attention-${a.tone}`}>{a.label}</span>
                    <ChevronRight size={14} />
                  </Link>
                ))}
                {attention.length === 0 && (
                  <EmptyState
                    icon={<Sparkles size={22} />}
                    title="All clear"
                    description="Nothing is late, unassigned or waiting on a customer right now."
                  />
                )}
              </div>
              <div className="daily-insight">
                <Clock3 size={17} />
                <span>
                  {metrics.openTasks} open task{metrics.openTasks === 1 ? "" : "s"} across the team.
                </span>
                <Link to="/tasks" aria-label="Open tasks">
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </Panel>
          </div>
        </>
      }
      footer={
        <>
          <span>
            {branch} · {range}
          </span>
          <span>
            Press <kbd>/</kbd> to search · <kbd>n</kbd> to create · <kbd>?</kbd> for shortcuts
          </span>
        </>
      }
    />
  );
}
