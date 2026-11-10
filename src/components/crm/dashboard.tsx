import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Plane,
  Plus,
  TrendingUp,
  Users,
  Wallet,
  ArrowUp,
  ArrowDown,
  Ticket,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Btn, EmptyState, Panel, PanelHead } from "./ui";
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
   Dashboard — Enterprise level.

   Answers: how much money, what's in pipeline, what needs attention,
   and what's departing soon. Clean, scannable, action-oriented.
   ========================================================================== */

const attentionIcon = (moduleId: string) => {
  if (moduleId === "finance") return Wallet;
  if (moduleId === "flights" || moduleId === "bookings") return Plane;
  return FileText;
};

/** Enterprise KPI card with trend indicator. */
function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  trendLabel,
  tone = "pine",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  tone?: "pine" | "butter" | "tomato" | "ink";
}) {
  const trendIcon =
    trend === "up" ? (
      <ArrowUp className="size-4" />
    ) : trend === "down" ? (
      <ArrowDown className="size-4" />
    ) : null;
  const trendColor = trend === "up" ? "text-pine" : trend === "down" ? "text-tomato" : "text-muted";
  return (
    <Panel className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          {trend && trendLabel && (
            <p className="mt-2 text-xs flex items-center gap-1">
              {trendIcon}
              <span className={trendColor}>
                <b>{trendLabel}</b>
              </span>
            </p>
          )}
        </div>
        <div className="grid size-12 place-items-center rounded-xl bg-well">{Icon}</div>
      </div>
    </Panel>
  );
}

/** Revenue trend area chart. Shows an honest empty state until real data exists. */
function RevenueChart({
  data,
  loading,
}: {
  data: { label: string; revenue: number }[];
  loading?: boolean;
}) {
  if (data.length === 0) {
    return (
      <Panel className="h-[320px]">
        <PanelHead title="Revenue Trend" subtitle="Last 6 months — booking value" />
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-sm text-muted">
          {loading
            ? "Loading your revenue…"
            : "No revenue recorded yet. This chart fills in from your own invoices — nothing is estimated."}
        </p>
      </Panel>
    );
  }
  return (
    <Panel className="h-[320px]">
      <PanelHead title="Revenue Trend" subtitle="Last 6 months — booking value" />
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="text-line" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7db" }} />
          <Legend />
          <Area type="monotone" dataKey="revenue" stroke="#2f5c50" fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}

/** Pipeline stage bars. */
function PipelineBars({
  data,
  loading,
  currency,
}: {
  data: { stage: string; count: number; value: number }[];
  loading?: boolean;
  currency: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Panel className="h-[320px]">
      <PanelHead title="Sales Pipeline" subtitle="Enquiries by stage" />
      {data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-sm text-muted">
          {loading
            ? "Loading your pipeline…"
            : "No enquiries in the pipeline yet. Add your first lead and the stages appear here."}
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-3">
              <span className="w-20 text-xs font-medium text-muted">{stage.stage}</span>
              <div className="flex-1 h-3 rounded-full bg-well overflow-hidden">
                <div
                  className="h-full bg-pine"
                  style={{ width: `${(stage.count / max) * 100}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs tabular-nums font-medium">
                {stage.count} · {money(stage.value, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Quick action grid. Each button navigates to the module it names. */
function QuickActions({ onOpen }: { onOpen: (module: string) => void }) {
  const actions = [
    { label: "Enquiries", icon: <Plus className="size-4" />, module: "leads" },
    { label: "Quotations", icon: <FileText className="size-4" />, module: "quotations" },
    { label: "Bookings", icon: <Ticket className="size-4" />, module: "bookings" },
    { label: "Invoices", icon: <Wallet className="size-4" />, module: "finance" },
  ];
  return (
    <Panel>
      <PanelHead title="Quick Actions" subtitle="Start your day's work" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a, i) => {
          const tones = ["pine", "butter", "pine", "tomato"];
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => onOpen(a.module)}
              className={`flex flex-col items-center gap-1.5 h-20 px-2 rounded-xl border border-line bg-glass-2 hover:bg-glass-3 transition-colors text-left text-[12px] ${i === 0 ? "border-pine bg-pine/5" : ""}`}
            >
              <span className={`size-5 mb-1 ${i === 0 ? "text-pine" : "text-muted"}`}>
                {a.icon}
              </span>
              <span className="font-medium">{a.label}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** Recent activity feed. */
function ActivityFeed({
  rows,
  loading,
}: {
  rows: Array<{ detail: string; title: string; module: string; ref: string }>;
  loading?: boolean;
}) {
  return (
    <Panel>
      <PanelHead title="Recent Activity" subtitle="Latest updates across your workspace" />
      <div className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState
            title={loading ? "Loading recent activity…" : "No recent activity"}
            description={
              loading ? "Reading your workspace." : "Start by adding an enquiry or booking."
            }
          />
        ) : (
          rows.map((item) => (
            <div
              key={item.ref}
              className="flex items-start gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
            >
              <div className="mt-1 w-2 h-2 rounded-full bg-pine" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted">{item.detail}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

export function Dashboard() {
  const { getRows, settings, status, user } = useCRM();
  const navigate = useNavigate();
  const currency = settings.currency;
  const [branch, setBranch] = useState("All branches");
  const [range, setRange] = useState("Last 6 months");

  const { data: overview, error: overviewError } = useApiQuery<DashboardOverviewDto>(
    () => fetchDashboardOverview(branch === "All branches" ? {} : { branch }),
    [branch],
    status === "ready",
  );

  const rows = useMemo(() => {
    const inBranch = (r: { branch: string }) => branch === "All branches" || r.branch === branch;
    const bookings = getRows("bookings").filter(inBranch);
    const leads = getRows("leads").filter(inBranch);
    const finance = getRows("finance").filter(inBranch);
    const live = bookings.filter((r) => r.status !== "Cancelled");
    return {
      bookings,
      leads,
      finance,
      revenue: live.reduce((a, r) => a + r.amount, 0),
      outstanding: finance.filter((r) => r.status !== "Paid").reduce((a, r) => a + r.amount, 0),
      collected: finance.filter((r) => r.status === "Paid").reduce((a, r) => a + r.amount, 0),
      newLeads: leads.filter((r) => ["New", "Contacted", "Qualified"].includes(r.status)).length,
      upcoming: bookings.filter((r) => /^(Pending|On hold|Confirmed)/i.test(r.status)).length,
    };
  }, [getRows, branch]);

  const metrics = overview?.metrics ?? {
    revenue: rows.revenue,
    collected: rows.collected,
    outstanding: rows.outstanding,
    bookings: rows.bookings.length,
    confirmedBookings: rows.bookings.filter((r) => r.status === "Confirmed").length,
    newLeads: rows.newLeads,
    quotationsSent: 0,
    upcomingDepartures: rows.upcoming,
    openTasks: 0,
    conversionRate: 0,
    averageBookingValue: rows.bookings.length ? Math.round(rows.revenue / rows.bookings.length) : 0,
    grossMargin: null,
    grossMarginPercent: null,
  };

  // Only real server series. When the API has no history yet the chart says
  // so instead of inventing a trend.
  const revenueSeries = useMemo(
    () => (overview?.revenueSeries ?? []).map((p) => ({ label: p.month, revenue: p.revenue })),
    [overview],
  );

  const pipelineData = overview?.pipeline ?? [];
  // While the first response is in flight, say "loading" rather than the
  // false claim that there is no revenue. If the request failed, fall back to
  // the honest empty state instead of spinning forever.
  const chartsLoading = overview === null && !overviewError;

  const activityRows = overview?.attention ?? [];
  const recentActivity = activityRows.map((item) => ({
    detail: item.detail,
    title: item.label,
    module: item.moduleId,
    ref: `${item.moduleId}-${item.recordId}`,
  }));

  return (
    <div className="animate-fade-in-up">
      <Page
        identity={
          <PageIdentity
            eyebrow="Business Overview"
            title="How the business is doing"
            purpose={`Real-time revenue, pipeline, departures and attention items for ${settings.orgName}.`}
            actions={
              <>
                <Btn
                  tone="primary"
                  icon={<ArrowRight />}
                  onClick={() => navigate({ to: "/tasks" })}
                >
                  View all tasks
                </Btn>
                <Link
                  to="/insights"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line-2 bg-glass-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-3"
                >
                  <TrendingUp className="size-4" /> Detailed Reports
                </Link>
              </>
            }
          />
        }
        work={
          <>
            {/* KPI Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
              <KpiCard
                icon={<CircleDollarSign className="size-5" />}
                label="Total Revenue"
                value={money(metrics.revenue, currency)}
                subtitle={`${metrics.confirmedBookings} confirmed trips`}
                trend="neutral"
                trendLabel="Confirmed trip value"
                tone="pine"
              />
              <KpiCard
                icon={<Wallet className="size-5" />}
                label="Money Collected"
                value={money(metrics.collected, currency)}
                subtitle="Payments received"
                trend="neutral"
                trendLabel="Recorded receipts"
                tone="pine"
              />
              <KpiCard
                icon={<Clock3 className="size-5" />}
                label="Outstanding"
                value={money(metrics.outstanding, currency)}
                subtitle="Still to be received"
                trend="down"
                trendLabel={`${money(metrics.outstanding, currency)} pending`}
                tone="tomato"
              />
              <KpiCard
                icon={<Ticket className="size-5" />}
                label="Total Bookings"
                value={String(metrics.bookings)}
                subtitle={`${metrics.confirmedBookings} confirmed`}
                trend="neutral"
                trendLabel={`${metrics.confirmedBookings} confirmed`}
                tone="butter"
              />
              <KpiCard
                icon={<Users className="size-5" />}
                label="New Enquiries"
                value={String(metrics.newLeads)}
                subtitle="Waiting for first reply"
                trend="neutral"
                trendLabel="Contact them today"
                tone="ink"
              />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-3 mb-8">
              <div className="lg:col-span-2">
                <RevenueChart data={revenueSeries} loading={chartsLoading} />
              </div>
              <div>
                <PipelineBars data={pipelineData} loading={chartsLoading} currency={currency} />
              </div>
            </div>

            {/* Quick Actions + Activity */}
            <div className="grid gap-4 lg:grid-cols-3 mb-8">
              <div className="lg:col-span-2">
                <QuickActions
                  onOpen={(module) => navigate({ to: "/workspace/$module", params: { module } })}
                />
              </div>
              <div>
                <ActivityFeed rows={recentActivity.slice(0, 6)} loading={chartsLoading} />
              </div>
            </div>

            {/* Upcoming Departures */}
            <Panel>
              <PanelHead
                title="Upcoming Departures"
                subtitle={`${rows.bookings.filter((r) => r.status !== "Cancelled").length} trips in the pipeline`}
                actions={
                  <Link
                    to="/workspace/$module"
                    params={{ module: "bookings" }}
                    className="text-xs font-semibold text-pine hover:underline"
                  >
                    View all →
                  </Link>
                }
              />
              <div className="space-y-2">
                {rows.bookings
                  .filter((r) => r.status !== "Cancelled")
                  .sort((a, b) => (a.date < b.date ? -1 : 1))
                  .slice(0, 6)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-line bg-glass-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                        <p className="text-xs text-muted truncate">
                          {b.destination || "Destination not set"} · {formatDay(b.date)}
                        </p>
                        <p className="text-xs text-muted">Owner: {b.owner || "Unassigned"}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold tabular-nums">
                          {money(b.amount, currency)}
                        </div>
                        <Status value={b.status} />
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
          </>
        }
        footer={
          <>
            <span>{settings.orgName}</span>
            <span>
              Branch:{" "}
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="ml-2 text-xs border-none bg-transparent font-medium text-foreground focus:ring-0"
              >
                <option>All branches</option>
                {settings.branches.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              &nbsp;|&nbsp; Range:{" "}
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="ml-2 text-xs border-none bg-transparent font-medium text-foreground focus:ring-0"
              >
                <option>Last 6 months</option>
                <option>Last 12 months</option>
                <option>This year</option>
              </select>
            </span>
          </>
        }
      />
    </div>
  );
}
