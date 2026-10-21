import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Clock3,
  Plus,
  TrendingUp,
} from "lucide-react";
import { Btn, EmptyState, Panel } from "./ui";
import { Page, PageIdentity } from "./page";
import { RecordDialog } from "./common";
import { findModule, money } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { fetchDashboardOverview, type DashboardOverviewDto } from "@/lib/api/modules";
import { buildWorklist, greeting, worklistHeadline } from "@/lib/crm/worklist";
import { plainModule } from "@/lib/crm/language";

/* ==========================================================================
   Home.

   The first screen is not a dashboard. It is a short, ordered list of the
   things that need doing — the way a good assistant would tell you.

   A person opening this app for the first time should be able to read the
   top of the screen and know exactly what to press.
   ========================================================================== */

export function Home() {
  const { getRows, tasks, settings, status } = useCRM();
  const navigate = useNavigate();
  const currency = settings.currency;
  const [open, setOpen] = useState<{ module: string; id: string } | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const worklist = useMemo(
    () =>
      buildWorklist({
        tasks,
        leads: getRows("leads"),
        bookings: getRows("bookings"),
        finance: getRows("finance"),
        visa: getRows("visa"),
        currency,
        today,
      }),
    [tasks, getRows, currency, today],
  );

  const { data: overview } = useApiQuery<DashboardOverviewDto>(
    () => fetchDashboardOverview(),
    [],
    status === "ready",
  );

  const metrics = overview?.metrics;
  const userName = settings.employees[0]?.name?.split(" ")[0] ?? "";

  const openModule = findModule(open?.module ?? "");
  const openRow = open?.id ? (getRows(open.module).find((r) => r.id === open.id) ?? null) : null;

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
                <Btn icon={<Plus />} onClick={() => setOpen({ module: "leads", id: "" })}>
                  Add something
                </Btn>
                <Link
                  to="/insights"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line-2 bg-glass-2 px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-glass-3"
                >
                  <TrendingUp className="size-4" /> How the business is doing
                </Link>
              </>
            }
          />
        }
        work={
          <>
            {worklist.length === 0 ? (
              <EmptyState
                icon={<CircleCheck size={22} />}
                title="Nothing is waiting on you"
                description="No overdue work, no unpaid invoices and no enquiries waiting for a reply. Enjoy the quiet."
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
                        {plainModule(item.moduleId)}
                        <ArrowRight className="size-4" />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <section className="mt-6">
              <button
                type="button"
                className="flex items-center gap-2 text-[12.5px] font-semibold text-muted transition-colors hover:text-foreground"
                onClick={() => setShowNumbers((s) => !s)}
                aria-expanded={showNumbers}
              >
                <ChevronDown
                  className="size-4 transition-transform"
                  style={{ transform: showNumbers ? "none" : "rotate(-90deg)" }}
                />
                {showNumbers ? "Hide the numbers" : "Show how the business is doing"}
              </button>

              {showNumbers && (
                <Panel className="mt-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        label: "Money booked",
                        value: metrics ? money(metrics.revenue, currency) : "—",
                        hint: `${metrics?.confirmedBookings ?? 0} confirmed trips`,
                      },
                      {
                        label: "Still to collect",
                        value: metrics ? money(metrics.outstanding, currency) : "—",
                        hint: "Invoices not paid yet",
                      },
                      {
                        label: "New enquiries",
                        value: metrics ? String(metrics.newLeads) : "—",
                        hint: "Waiting for a first reply",
                      },
                      {
                        label: "Open tasks",
                        value: metrics ? String(metrics.openTasks) : "—",
                        hint: "Across the whole team",
                      },
                    ].map((card) => (
                      <div key={card.label} className="rounded-[18px] bg-well p-4">
                        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">
                          {card.label}
                        </p>
                        <p className="mt-1 text-[22px] font-semibold tracking-tight text-foreground tabular-nums">
                          {card.value}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-muted">{card.hint}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      { id: "leads", label: "Enquiries" },
                      { id: "bookings", label: "Trips" },
                      { id: "finance", label: "Money" },
                      { id: "tasks", label: "Tasks" },
                    ].map((item) =>
                      item.id === "tasks" ? (
                        <Link
                          key={item.id}
                          to="/tasks"
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-well px-3.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-glass-3 hover:text-foreground"
                        >
                          {item.label}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      ) : (
                        <Link
                          key={item.id}
                          to="/workspace/$module"
                          params={{ module: item.id }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-well px-3.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-glass-3 hover:text-foreground"
                        >
                          {item.label}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      ),
                    )}
                  </div>
                </Panel>
              )}
            </section>

            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                body="Add the trip, then attach the flights, hotel and visa to it."
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

      {open && openModule && (
        <RecordDialog
          module={openModule}
          row={openRow}
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
