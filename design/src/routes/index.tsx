import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Check, PieChart, Plus, Trophy, X, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Badge, PageHeader } from "@/components/crm/shell";
import { Avatar, IconBtn, MoreBtn, OpenBtn, Panel, PanelHead, Segmented, smoothPath } from "@/components/crm/ui";
import { DealCard } from "@/components/crm/deal-card";
import { activity, events, hotDeals, kmoney, leaderboard, money, reps, type Deal } from "@/lib/crm-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Overview — Rapport CRM" },
      { name: "description", content: "Revenue, hot deals, team quota and today's work at a glance." },
      { property: "og:title", content: "Sales Overview — Rapport CRM" },
      { property: "og:description", content: "Revenue, hot deals, team quota and today's work at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

const months = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const rev12 = [96, 52, 70, 88, 100, 62, 98, 72, 84, 108, 90, 112];

function RevenueChart({ range }: { range: "6M" | "12M" }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const labels = range === "12M" ? months : months.slice(6);
  const data = range === "12M" ? rev12 : rev12.slice(6);
  const W = 900, H = 200, max = 200;
  const x = (i: number) => 40 + (i * (W - 50)) / (labels.length - 1);
  const y = (v: number) => 10 + (H - 20) * (1 - v / max);
  const pts = data.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  const first = pts[0];
  const last = pts.at(-1);

  const activePoint = hoverIndex !== null ? pts[hoverIndex] : null;
  const activeValue = hoverIndex !== null ? data[hoverIndex] : null;
  const activeMonth = hoverIndex !== null ? labels[hoverIndex] : null;

  return (
    <div className="relative">
      {/* Dynamic Floating Tooltip */}
      {activePoint && activeValue !== null && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-14 rounded-xl border border-line bg-float px-3 py-1.5 shadow-pop backdrop-blur-md transition-all duration-150"
          style={{ left: `${(activePoint[0] / W) * 100}%`, top: `${activePoint[1]}px` }}
        >
          <div className="text-center text-xs">
            <span className="font-semibold text-muted">{activeMonth} Won</span>
            <div className="font-bold text-foreground text-sm">${activeValue}K</div>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H + 24}`}
        className="h-56 w-full cursor-crosshair select-none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="rev" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--tomato)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--tomato)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 100, 200].map((v) => (
          <g key={v}>
            <line x1={40} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={0} y={y(v) + 4} fontSize="11" fill="var(--muted)">
              ${v === 0 ? 0 : v + "K"}
            </text>
          </g>
        ))}

        {/* Target dashed line */}
        <line
          x1={40}
          x2={W}
          y1={y(156.7)}
          y2={y(156.7)}
          stroke="var(--text)"
          strokeWidth="1.8"
          strokeDasharray="6 6"
          strokeOpacity="0.8"
        />

        {first && last && (
          <path
            d={`${line} L${last[0]},${y(0)} L${first[0]},${y(0)} Z`}
            fill="url(#rev)"
            className="transition-all duration-500"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--tomato)"
          strokeWidth="2.5"
          className="transition-all duration-500"
        />

        {/* Hover Crosshair Guideline & Dot */}
        {activePoint && (
          <g>
            <line
              x1={activePoint[0]}
              x2={activePoint[0]}
              y1={10}
              y2={y(0)}
              stroke="var(--tomato)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeOpacity="0.75"
            />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="6" fill="var(--tomato)" fillOpacity="0.3" />
            <circle cx={activePoint[0]} cy={activePoint[1]} r="4" fill="var(--tomato)" stroke="white" strokeWidth="2" />
          </g>
        )}

        {/* Invisible hit targets */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r="16"
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {labels.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={H + 18}
            fontSize="11"
            textAnchor="middle"
            fill={hoverIndex === i ? "var(--text)" : "var(--muted)"}
            fontWeight={hoverIndex === i ? "700" : "500"}
          >
            {m}
          </text>
        ))}
      </svg>
    </div>
  );
}

const stageMix = [
  { name: "Qualification", n: 10, v: 277.6, pct: 24, cls: "bg-butter text-on-butter" },
  { name: "Proposal", n: 9, v: 117, pct: 10, cls: "bg-pine text-on-pine" },
  { name: "Negotiation", n: 12, v: 325.3, pct: 29, cls: "bg-tomato text-on-tomato" },
  { name: "Closing", n: 16, v: 419.2, pct: 37, cls: "bg-ink text-on-ink" },
];

function Overview() {
  const [range, setRange] = useState<"6M" | "12M">("12M");
  const today = events.filter((e) => e.day === 17 && e.month === 0);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const doneCount = Object.values(done).filter(Boolean).length;
  const [focusedCard, setFocusedCard] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  const toggleDone = (index: number, title: string) => {
    const nextState = !done[index];
    setDone((prev) => {
      const updated = { ...prev, [index]: nextState };
      const count = Object.values(updated).filter(Boolean).length;
      if (count === today.length) {
        toast.success("🎉 Done — nice! All priorities complete.");
      } else if (nextState) {
        toast.success(`Completed "${title}"`);
      }
      return updated;
    });
  };

  return (
    <>
      {/* Top Header */}
      <PageHeader
        title={["Sales", "Overview"]}
        stats={[
          {
            icon: <Trophy className="text-pine" />,
            value: "$111,511",
            label: "Won this month",
            badge: <Badge tone="forest">+5% vs last month</Badge>,
          },
          { icon: <BarChart3 className="text-ink" />, value: "$1,121,298", label: "Open pipeline" },
          { icon: <PieChart className="text-tomato" />, value: "73%", label: "Win rate, closed deals" },
        ]}
      />

      {/* Main Grid Layout */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="grid gap-4">
          {/* Revenue Panel */}
          <Panel className="glass-card">
            <PanelHead title="Revenue">
              <Segmented options={["6M", "12M"]} value={range} onChange={setRange} />
              <MoreBtn onClick={() => toast.info("Revenue options: Export CSV, Forecast model")} />
              <button
                type="button"
                onClick={() => setFocusedCard("revenue")}
                title="Focus Revenue"
                className="grid size-9 place-items-center rounded-full border border-line-2 bg-glass-2 transition-transform hover:scale-105 active:scale-95"
              >
                <ArrowUpRight className="size-4" />
              </button>
            </PanelHead>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-[40px] font-semibold tracking-tight text-foreground">$982,368</span>
              <span className="text-sm text-muted">
                won in 12 months · <b className="font-semibold text-foreground">0</b> of 12 at target
              </span>
            </div>
            <div className="mt-1 flex gap-5 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <i className="size-2 rounded-full bg-tomato" />
                Won revenue
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-0.5 w-4 border-t-2 border-dashed border-foreground" />
                Monthly target · $156.7K
              </span>
            </div>
            <RevenueChart range={range} />
          </Panel>

          {/* Quota & Stage Mix */}
          <div className="grid gap-4 md:grid-cols-[1fr_1.35fr]">
            {/* Team Quota Card */}
            <section className="relative overflow-hidden rounded-3xl bg-pine p-5 text-on-pine shadow-sm transition-transform duration-300 hover:scale-[1.01]">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">Team quota</h2>
                <IconBtn
                  label="More"
                  tone="ghost-dark"
                  className="size-9"
                  onClick={() => toast.info("Team quota target: $470,000 for Q4")}
                >
                  •••
                </IconBtn>
              </div>
              <div className="my-6 grid place-items-center">
                <div className="relative size-40">
                  <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.18"
                      strokeWidth="7"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="44"
                      fill="none"
                      stroke="var(--butter)"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={276.5}
                      strokeDashoffset={276.5 * 0.76}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-content-center text-center">
                    <span className="text-4xl font-bold tracking-tight">24%</span>
                    <span className="text-xs opacity-75 font-medium">of Q4 quota</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 text-center text-xs">
                {[
                  ["Won", "$112.6K"],
                  ["Quota", "$470K"],
                  ["Days left", "76"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div className="opacity-70 font-medium">{l}</div>
                    <div className="font-bold text-sm">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-white/10 py-2.5 text-center text-xs font-semibold">
                Needs <b className="font-bold underline">$4.7K</b> a day to land it
              </div>
            </section>

            {/* Stage Mix Card */}
            <Panel className="glass-card">
              <PanelHead title="Stage mix">
                <button
                  type="button"
                  onClick={() => setFocusedCard("stagemix")}
                  title="Focus Stage Mix"
                  className="grid size-9 place-items-center rounded-full border border-line-2 bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                >
                  <ArrowUpRight className="size-4" />
                </button>
              </PanelHead>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-foreground">$1,139,100</span>
                <span className="text-sm text-muted">open across 47 deals</span>
              </div>
              <div className="my-6 flex h-11 gap-1">
                {stageMix.map((s) => (
                  <div
                    key={s.name}
                    className={cn("rounded-lg transition-all duration-200 hover:scale-y-105", s.cls)}
                    style={{ flex: s.pct }}
                    title={`${s.name}: ${s.pct}%`}
                  />
                ))}
              </div>
              <ul className="divide-y divide-line text-sm">
                {stageMix.map((s) => (
                  <li key={s.name} className="grid grid-cols-[1fr_3rem_4.5rem_3rem] items-center py-2.5">
                    <span className="flex items-center gap-2">
                      <i className={cn("size-2.5 rounded-full", s.cls)} />
                      <span className="font-medium text-foreground">{s.name}</span>
                    </span>
                    <span className="text-right text-muted">{s.n}</span>
                    <span className="text-right font-semibold text-foreground">${s.v}K</span>
                    <span className="text-right text-muted">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>

        {/* Hot Deals Panel */}
        <Panel className="glass-card">
          <PanelHead title="Hot deals">
            <span className="text-xs font-semibold text-muted">by weighted value</span>
            <IconBtn
              label="Add deal"
              className="size-9"
              onClick={() => {
                toast.info("Add deal opened", { description: "Navigate to Pipeline to add custom deals." });
              }}
            >
              <Plus className="size-4" />
            </IconBtn>
            <Link to="/pipeline">
              <OpenBtn />
            </Link>
          </PanelHead>
          <div className="grid gap-3 sm:grid-cols-2">
            {hotDeals.map((d) => (
              <DealCard
                key={d.id}
                deal={d}
                tall
                showStage
                onOpenDetails={(item) => setSelectedDeal(item)}
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* Bottom Row */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Team Leaderboard */}
        <Panel className="glass-card">
          <PanelHead title="Team leaderboard">
            <span className="text-xs font-semibold text-muted">Won this month</span>
            <MoreBtn />
            <Link to="/growth">
              <OpenBtn />
            </Link>
          </PanelHead>
          <ol className="space-y-2">
            {leaderboard.map((l, i) => (
              <li
                key={l.rep}
                className={cn(
                  "flex items-center gap-3 rounded-2xl p-3 transition-transform hover:-translate-y-0.5",
                  i === 0 ? "bg-ink text-on-ink shadow-sm" : "bg-solid",
                )}
              >
                <span className="w-4 text-sm opacity-60 font-semibold">{i + 1}</span>
                <Avatar person={reps[l.rep]} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{reps[l.rep].name}</div>
                  <div className="text-xs opacity-65 font-medium">
                    {l.pct}% of monthly quota · {l.deals} deals
                  </div>
                </div>
                <span className="font-bold text-sm">{money(l.won)}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* Today's Tasks */}
        <Panel className="glass-card">
          <PanelHead title="Today">
            <button
              onClick={() => {
                toast.info("New task modal", { description: "Use dock 'Today' or Schedule page." });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pill px-4 text-xs font-bold text-on-pill transition-transform hover:scale-105 active:scale-95"
            >
              <Plus className="size-4" /> Add
            </button>
          </PanelHead>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <span>
              <b className="font-bold text-foreground">{doneCount}</b> of {today.length} done
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-track">
              <div
                className="h-full rounded-full bg-pine transition-all duration-300"
                style={{ width: `${(doneCount / today.length) * 100}%` }}
              />
            </div>
          </div>
          <ul className="space-y-2">
            {today.map((t, i) => (
              <li
                key={i}
                onClick={() => toggleDone(i, t.title)}
                className="flex cursor-pointer items-center gap-3 rounded-2xl bg-solid p-3 transition-colors hover:bg-well"
              >
                <button
                  aria-label="Toggle done"
                  className={cn(
                    "grid size-6 place-items-center rounded-md border border-line-2 transition-all",
                    done[i] && "border-pine bg-pine text-on-pine",
                  )}
                >
                  {done[i] && <Check className="size-3.5 stroke-[2.5]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn("font-semibold text-sm", done[i] && "text-muted line-through")}>
                    {t.title}
                  </div>
                  <div className="text-xs text-muted">
                    {t.time.replace("a", " AM").replace("p", " PM")} · {t.company}
                  </div>
                </div>
                <Avatar person={reps[t.rep]} size={28} />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-xs font-semibold">
            <span className="text-muted">Coming up</span>
            <Link to="/schedule" className="text-muted hover:text-foreground">
              Open schedule
            </Link>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            {events
              .filter((e) => e.day === 18 && e.month === 0)
              .map((e, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid w-10 place-items-center rounded-lg bg-solid py-1 text-xs leading-tight">
                    <span className="text-muted">Sun</span>
                    <b className="font-semibold text-foreground">18</b>
                  </span>
                  <span>
                    <b className="font-semibold text-foreground">{e.title}</b>{" "}
                    <span className="text-muted">{e.time} · {e.company}</span>
                  </span>
                </li>
              ))}
          </ul>
        </Panel>

        {/* Recent Activity */}
        <Panel className="glass-card">
          <PanelHead title="Recent activity">
            <MoreBtn />
            <Link to="/customers">
              <OpenBtn />
            </Link>
          </PanelHead>
          <ol className="relative space-y-4 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-line">
            {activity.map((a, i) => (
              <li key={i} className="relative flex gap-3">
                <Avatar person={reps[a.rep]} size={32} className="ring-4 ring-bg" />
                <div className="text-xs sm:text-sm">
                  <p>
                    <b className="font-semibold text-foreground">{reps[a.rep].name.split(" ")[0]}</b> {a.text} ·{" "}
                    <Link to="/customers" className="underline decoration-line underline-offset-2">
                      {a.company}
                    </Link>
                  </p>
                  <p className="text-xs text-muted">{a.ago}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs font-medium text-muted">Total won to date: {kmoney(982368)}</p>
        </Panel>
      </div>

      {/* Card Focus Mode Modal (Rapport signature .card.is-focus) */}
      {focusedCard && (
        <>
          <div className="scrim" onClick={() => setFocusedCard(null)} />
          <div className="fixed inset-6 z-60 mx-auto max-w-4xl overflow-auto rounded-3xl bg-solid p-6 shadow-pop sm:inset-16">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <h2 className="text-xl font-bold">
                {focusedCard === "revenue" ? "Revenue Analytics" : "Stage Mix Breakdown"}
              </h2>
              <button
                onClick={() => setFocusedCard(null)}
                className="grid size-9 place-items-center rounded-full border border-line-2 bg-glass-2 transition-transform hover:scale-105"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="pt-6">
              {focusedCard === "revenue" ? (
                <div>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-4xl font-bold">$982,368</span>
                    <span className="text-sm text-muted">won in 12 months</span>
                  </div>
                  <RevenueChart range={range} />
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-bold">$1,139,100</span>
                    <span className="text-sm text-muted">open across 47 deals</span>
                  </div>
                  <div className="flex h-12 gap-1 mb-6">
                    {stageMix.map((s) => (
                      <div key={s.name} className={cn("rounded-lg", s.cls)} style={{ flex: s.pct }} />
                    ))}
                  </div>
                  <ul className="divide-y divide-line text-sm">
                    {stageMix.map((s) => (
                      <li key={s.name} className="flex justify-between py-3">
                        <span className="font-semibold">{s.name}</span>
                        <span>{s.n} deals · ${s.v}K ({s.pct}%)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Deal Details Modal */}
      {selectedDeal && (
        <>
          <div className="scrim" onClick={() => setSelectedDeal(null)} />
          <div className="fixed inset-x-4 top-1/2 z-60 mx-auto max-w-md -translate-y-1/2 rounded-3xl bg-solid p-6 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <span className="rounded-full bg-butter px-2.5 py-0.5 text-xs font-bold text-on-butter">
                {selectedDeal.stage}
              </span>
              <button
                onClick={() => setSelectedDeal(null)}
                className="grid size-8 place-items-center rounded-full border border-line-2 bg-glass-2"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="pt-4 space-y-3">
              <h2 className="text-2xl font-bold">{selectedDeal.title}</h2>
              <p className="text-sm text-muted">{selectedDeal.company}</p>
              <div className="text-3xl font-bold text-foreground">{money(selectedDeal.value)}</div>
              <p className="text-xs text-muted">Closes {selectedDeal.closes}</p>
              <button
                onClick={() => {
                  toast.success(`🎉 ${selectedDeal.title} marked as Won!`);
                  setSelectedDeal(null);
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-pine py-2.5 text-xs font-bold text-on-pine shadow-sm"
              >
                Mark as Won
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
