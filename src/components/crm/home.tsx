import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock3,
  CircleDollarSign,
  Plane,
  Plus,
  PlaneTakeoff,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  Clock,
} from "lucide-react";
import { Btn, EmptyState, Panel } from "./ui";
import { Page, PageIdentity } from "./page";
import { RecordDialog } from "./common";
import { findModule, money, formatDay } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { fetchAttention, toRecordRow, toTask, type AttentionDto } from "@/lib/api/crm";
import { fetchDashboardOverview, type DashboardOverviewDto } from "@/lib/api/modules";
import { buildWorklist, greeting, worklistHeadline } from "@/lib/crm/worklist";

/* ==========================================================================
   Home — Travo CRM style.

   One screen: what needs you today, plus key business numbers at a glance.
   Open the app, read the list, press the first item. Done.
   ========================================================================== */

const fromAttention = (attention: AttentionDto) => ({
  tasks: attention.tasks.map(toTask),
  leads: attention.leads.map(toRecordRow),
  bookings: attention.bookings.map(toRecordRow),
  finance: attention.finance.map(toRecordRow),
  visa: attention.visa.map(toRecordRow),
  groups: attention.groups.map(toRecordRow),
  today: attention.today,
});

type KpiCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  subtitle: string;
  tone?: "pine" | "butter" | "tomato" | "ink";
};

function KpiCard({ icon, label, value, subtitle, tone = "pine" }: KpiCardProps) {
  return (
    <Panel className="kpi-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-xl bg-pine/10 text-pine">
          {icon}
        </div>
      </div>
    </Panel>
  );
}

function DepartureStatus({ status }: { status: string }) {
  const isConfirmed = status === "Confirmed";
  const cls = isConfirmed ? "bg-pine/10 text-pine" : "bg-butter/10 text-on-butter";
  return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{status}</span>;
}

export function Home() {
  const { getRows, tasks, settings, status, attention, user } = useCRM();
  const [customerTypeFilter, setCustomerTypeFilter] = useState<
    "" | "Corporate" | "VIP" | "Leisure"
  >("");
  const customerTypeWhere = customerTypeFilter ? { customerType: customerTypeFilter } : {};

  const navigate = useNavigate();
  const currency = settings.currency;
  const [open, setOpen] = useState<{ module: string; id: string } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const userName = (user?.name ?? "").split(" ")[0] ?? "";

  const live = useApiQuery(() => fetchAttention("mine", undefined), [], status === "ready");
  const { data: overview } = useApiQuery<DashboardOverviewDto>(
    () => fetchDashboardOverview(),
    [],
    status === "ready",
  );

  const worklist = useMemo(() => {
    const source = live.data
      ? fromAttention(live.data)
      : {
          tasks,
          leads: customerTypeFilter
            ? getRows("leads").filter((r) => r.customerType === customerTypeFilter)
            : getRows("leads"),
          bookings: customerTypeFilter
            ? getRows("bookings").filter((r) => r.customerType === customerTypeFilter)
            : getRows("bookings"),
          finance: customerTypeFilter
            ? getRows("finance").filter((r) => r.customerType === customerTypeFilter)
            : getRows("finance"),
          visa: customerTypeFilter
            ? getRows("visa").filter((r) => r.customerType === customerTypeFilter)
            : getRows("visa"),
          groups: customerTypeFilter
            ? getRows("groups").filter((r) => r.customerType === customerTypeFilter)
            : getRows("groups"),
          today,
        };
    return buildWorklist({ ...source, currency });
  }, [live.data, tasks, getRows, currency, today, customerTypeFilter]);

  const m = overview?.metrics;
  const revenue = m?.revenue ?? 0;
  const collected = m?.collected ?? 0;
  const outstanding = m?.outstanding ?? 0;
  const bookingsCount = m?.bookings ?? getRows("bookings").length;
  const confirmedBookings = m?.confirmedBookings ?? 0;
  const newLeads = m?.newLeads ?? 0;
  const openTasks = m?.openTasks ?? 0;

  const goTo = (moduleId: string, recordId?: string) => {
    if (!recordId) {
      void navigate({ to: "/workspace/$module", params: { module: moduleId } });
      return;
    }
    setOpen({ module: moduleId, id: recordId });
  };

  return (
    <>
      <Page
        identity={
          <PageIdentity
            eyebrow="Today"
            title={
              <>
                {greeting()}
                {userName ? `, ${userName}` : ""}
              </>
            }
            purpose={worklistHeadline(worklist)}
            actions={
              <>
                <Btn
                  tone="primary"
                  icon={<Plus />}
                  size="lg"
                  onClick={() => setOpen({ module: "leads", id: "" })}
                >
                  New Enquiry
                </Btn>
                <Link
                  to="/insights"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line-2 bg-glass-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-3"
                >
                  <TrendingUp className="size-4" /> Business Numbers
                </Link>
              </>
            }
          />
        }
        work={
          <>
            {/* Customer Type Filter */}
            <div className="grid gap-2 mb-3 sm:grid-cols-4">
              <Btn
                size="sm"
                onClick={() => setCustomerTypeFilter("")}
                className={customerTypeFilter === "" ? "bg-primary/10 text-primary" : ""}
              >
                All
              </Btn>
              <Btn
                size="sm"
                onClick={() => setCustomerTypeFilter("Corporate")}
                className={customerTypeFilter === "Corporate" ? "bg-primary/10 text-primary" : ""}
              >
                Corporate
              </Btn>
              <Btn
                size="sm"
                onClick={() => setCustomerTypeFilter("VIP")}
                className={customerTypeFilter === "VIP" ? "bg-primary/10 text-primary" : ""}
              >
                VIP
              </Btn>
              <Btn
                size="sm"
                onClick={() => setCustomerTypeFilter("Leisure")}
                className={customerTypeFilter === "Leisure" ? "bg-primary/10 text-primary" : ""}
              >
                Leisure
              </Btn>
            </div>
            {/* KPI Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
              <KpiCard
                icon={<CircleDollarSign className="size-5" />}
                label="Revenue"
                value={money(revenue, currency)}
                subtitle={`${confirmedBookings} confirmed trips`}
                tone="pine"
              />
              <KpiCard
                icon={<Wallet className="size-5" />}
                label="Collected"
                value={money(collected, currency)}
                subtitle="Payments received"
                tone="pine"
              />
              <KpiCard
                icon={<Clock className="size-5" />}
                label="Outstanding"
                value={money(outstanding, currency)}
                subtitle="Still to be received"
                tone="tomato"
              />
              <KpiCard
                icon={<Ticket className="size-5" />}
                label="Bookings"
                value={String(bookingsCount)}
                subtitle={`${confirmedBookings} confirmed`}
                tone="butter"
              />
              <KpiCard
                icon={<Users className="size-5" />}
                label="New Enquiries"
                value={String(newLeads)}
                subtitle="Waiting for first reply"
                tone="ink"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3 mb-6">
              {/* Worklist */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[15px] font-medium text-foreground">What needs you today</h2>
                  <Link to="/tasks" className="text-xs font-semibold text-pine hover:underline">
                    View all tasks →
                  </Link>
                </div>
                {worklist.length === 0 ? (
                  <EmptyState
                    icon={<CircleCheck size={22} />}
                    title="Nothing is waiting on you right now."
                    description="No overdue work, no unpaid invoices and no enquiries waiting for a reply."
                    actions={
                      <Btn
                        tone="primary"
                        icon={<Plus />}
                        onClick={() => setOpen({ module: "leads", id: "" })}
                      >
                        Add an enquiry
                      </Btn>
                    }
                  />
                ) : (
                  <ol className="worklist" aria-label="What needs you today">
                    {worklist.map((item, index) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`worklist__row worklist__row--${item.tone}`}
                          onClick={() => goTo(item.moduleId, item.recordId)}
                        >
                          <span className="worklist__number">{index + 1}</span>
                          <span className="worklist__body">
                            <span className="worklist__title">{item.title}</span>
                            <span className="worklist__detail">{item.detail}</span>
                          </span>
                          <span className="worklist__where">
                            {findModule(item.moduleId)?.name ?? item.moduleId}
                            <ArrowRight className="size-4" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Upcoming Departures */}
              <div className="lg:col-span-1">
                <Panel>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[15px] font-medium text-foreground">Upcoming Departures</h2>
                    <Link
                      to="/workspace/$module"
                      params={{ module: "bookings" }}
                      className="text-xs font-semibold text-pine hover:underline"
                    >
                      View all →
                    </Link>
                  </div>
                  {overview?.upcomingDepartures?.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No upcoming departures.</p>
                  ) : (
                    <div className="space-y-2">
                      {overview?.upcomingDepartures?.slice(0, 5).map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-glass-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {d.name}
                            </p>
                            <p className="text-xs text-muted truncate">
                              {d.destination} · {formatDay(d.date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold tabular-nums">
                              {money(d.amount, currency)}
                            </div>
                            <DepartureStatus status={d.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            </div>

            {/* Quick Start */}
            <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickStart
                icon={<Plus className="size-4" />}
                title="A customer asked about a trip"
                body="Add an enquiry, and it becomes a quote and then a trip."
                cta="Add an enquiry"
                onClick={() => setOpen({ module: "leads", id: "" })}
              />
              <QuickStart
                icon={<CalendarDays className="size-4" />}
                title="Someone is travelling soon"
                body="Add the trip, then attach flights, hotel and visa to it."
                cta="Add a trip"
                onClick={() => setOpen({ module: "bookings", id: "" })}
              />
              <QuickStart
                icon={<Clock3 className="size-4" />}
                title="You need to remember something"
                body="Add a task and it shows up here every morning until it is done."
                cta="Add a task"
                onClick={() => void navigate({ to: "/tasks" })}
              />
            </section>
          </>
        }
        footer={
          <>
            <span>{settings.orgName}</span>
            <span>
              Press <kbd>/</kbd> to search · <kbd>n</kbd> to create · <kbd>?</kbd> for shortcuts
            </span>
          </>
        }
      />

      {open && (
        <RecordDialog
          module={findModule(open.module)!}
          row={null}
          create={!open.id}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function QuickStart({
  icon,
  title,
  body,
  cta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[var(--r-card)] border border-line bg-glass p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-well text-muted">{icon}</span>
      <h3 className="mt-3 text-[14px] font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground underline-offset-4 hover:underline"
      >
        {cta}
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
