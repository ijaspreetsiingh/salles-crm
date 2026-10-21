import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Trophy, Clock, Download, ArrowUpRight, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/crm/shell";
import { Panel, PanelHead, Segmented, Avatar } from "@/components/crm/ui";
import { BarPlot, LinePlot } from "@/components/crm/charts";
import { customers, reps, money } from "@/lib/crm-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/growth")({
  head: () => ({
    meta: [
      { title: "Growth Reports — Rapport CRM" },
      { name: "description", content: "Analyze revenue by segment, lead sources, customer growth and rep performance in Rapport CRM." },
      { property: "og:title", content: "Growth Reports — Rapport CRM" },
      { property: "og:description", content: "Analyze revenue by segment, lead sources, customer growth and rep performance in Rapport CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const periods = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const performance = [
  { key: "sofia", won: 193510, deals: 6, rate: 86, quota: 92 },
  { key: "hanna", won: 100250, deals: 4, rate: 80, quota: 77 },
  { key: "rohan", won: 100020, deals: 4, rate: 67, quota: 38 },
  { key: "amara", won: 79760, deals: 5, rate: 63, quota: 53 },
  { key: "theo", won: 27390, deals: 3, rate: 75, quota: 14 },
] as const;

function Page() {
  const [range, setRange] = useState<"3M" | "6M" | "12M">("6M");
  const [unit, setUnit] = useState<"$" | "%">("$");

  const count = range === "3M" ? 3 : range === "6M" ? 6 : 12;
  const labels = periods.slice(-count);
  const mult = count / 6;

  // Segment values matching Rapport Growth report (Image 5)
  const enterprise = [21, 18, 32, 40, 46, 24, 32, 23, 65, 30, 62, 72].slice(-count);
  const mid = [13, 14, 24, 22, 37, 34, 17, 10, 46, 37, 40, 41].slice(-count);
  const smb = [6, 5, 5, 5, 6, 5, 8, 5, 6, 0, 6, 0].slice(-count);

  // Stacked bar chart series [enterprise, mid, smb]
  const series = [enterprise, mid, smb].map((s) =>
    unit === "$"
      ? s
      : s.map((v, i) => Math.round((v / ((enterprise[i] ?? 0) + (mid[i] ?? 0) + (smb[i] ?? 0) || 1)) * 100)),
  );

  const exportCSV = () => {
    const csv = [
      "Rep,Won,Deals,Win Rate,Quota %",
      ...performance.map(
        (p) => `${reps[p.key].name},${p.won * mult},${p.deals},${p.rate}%,${p.quota}%`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growth-report-${range}.csv`;
    a.click();
    toast.success("Exported Growth Report as CSV");
  };

  return (
    <>
      {/* Page Header (Exact match to Image 5) */}
      <PageHeader
        title={["Growth", "Reports"]}
        stats={[
          {
            icon: <Users className="text-pine" />,
            value: Math.round(14 * mult),
            label: `New customers, last ${count} months`,
          },
          {
            icon: <Trophy className="text-foreground" />,
            value: "$22,765",
            label: "Average won deal",
          },
          {
            icon: <Clock className="text-tomato" />,
            value: "26",
            label: "Average sales cycle, days",
          },
        ]}
        right={
          <div className="flex items-center gap-2">
            <Segmented options={["3M", "6M", "12M"]} value={range} onChange={setRange} />
            <button
              onClick={exportCSV}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-pill px-4.5 text-xs font-bold text-on-pill shadow-xs transition-transform hover:scale-105 active:scale-95"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* Main Grid: Revenue by Segment & Lead Sources (Image 5 replica) */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Revenue by segment */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[15px] font-semibold text-foreground">Revenue by segment</h2>
            <div className="flex items-center gap-2">
              <Segmented options={["$", "%"]} value={unit} onChange={setUnit} />
              <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                <ArrowUpRight className="size-4 text-muted" />
              </button>
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-foreground">
              {money(500840 * mult)}
            </span>
            <span className="text-xs text-muted font-medium">won, last {count} months</span>
          </div>

          {/* Segment Pills (Image 5 replica) */}
          <div className="my-4 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-semibold text-on-ink">
              <i className="size-2 rounded-full bg-pine" />
              Enterprise {money(283700 * mult)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-semibold text-on-ink">
              <i className="size-2 rounded-full bg-tomato" />
              Mid-market {money(186700 * mult)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-semibold text-on-ink">
              <i className="size-2 rounded-full bg-butter" />
              SMB {money(30400 * mult)}
            </span>
          </div>

          {/* Stacked Bar Chart with exact colors: pine (bottom), tomato (mid), butter (top) */}
          <div className="mt-6">
            <BarPlot
              labels={labels}
              series={series}
              max={unit === "$" ? 200 : 100}
              money={unit === "$"}
              percent={unit === "%"}
            />
          </div>
        </section>

        {/* Lead sources (Image 5 replica) */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-semibold text-foreground">Lead sources</h2>
            <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
              <ArrowUpRight className="size-4 text-muted" />
            </button>
          </div>

          <p className="text-xs text-muted">
            How the {Math.round(14 * mult)} customers who joined in the last {count} months reached us. One
            customer can come through several channels.
          </p>

          {/* Multi-segment Donut Chart in Center */}
          <div className="my-6 flex justify-center">
            <div className="relative size-44">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                {[
                  { n: 8, color: "var(--pine)" }, // WhatsApp
                  { n: 8, color: "oklch(0.35 0.08 170)" }, // Website
                  { n: 7, color: "oklch(0.5 0.18 310)" }, // Slack
                  { n: 7, color: "oklch(0.55 0.2 265)" }, // Discord
                  { n: 6, color: "oklch(0.6 0.18 240)" }, // LinkedIn
                  { n: 2, color: "var(--tomato)" }, // Email
                ].map((s, i, arr) => {
                  const totalCount = arr.reduce((acc, curr) => acc + curr.n, 0);
                  const prev = arr.slice(0, i).reduce((acc, curr) => acc + curr.n, 0);
                  const circumference = 251.3;
                  const strokeLength = (s.n / totalCount) * circumference - 2;
                  const offset = -(prev / totalCount) * circumference;

                  return (
                    <circle
                      key={i}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={s.color}
                      strokeWidth="11"
                      strokeDasharray={`${strokeLength} ${circumference}`}
                      strokeDashoffset={offset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 grid place-content-center text-center">
                <span className="text-3xl font-extrabold tracking-tight text-foreground">
                  {Math.round(14 * mult)}
                </span>
                <span className="text-[11px] font-semibold text-muted">new customers</span>
              </div>
            </div>
          </div>

          {/* 2-Column Legend Grid (Exact match to Image 5) */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs font-semibold">
            {/* Left Column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full bg-pine" />
                  <span className="text-foreground">WhatsApp</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">8</span>
                  <span className="text-muted font-normal">21%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full" style={{ background: "oklch(0.5 0.18 310)" }} />
                  <span className="text-foreground">Slack</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">7</span>
                  <span className="text-muted font-normal">18%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full" style={{ background: "oklch(0.6 0.18 240)" }} />
                  <span className="text-foreground">LinkedIn</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">6</span>
                  <span className="text-muted font-normal">16%</span>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full" style={{ background: "oklch(0.35 0.08 170)" }} />
                  <span className="text-foreground">Website</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">8</span>
                  <span className="text-muted font-normal">21%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full" style={{ background: "oklch(0.55 0.2 265)" }} />
                  <span className="text-foreground">Discord</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">7</span>
                  <span className="text-muted font-normal">18%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="size-2.5 rounded-full bg-tomato" />
                  <span className="text-foreground">Email</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-foreground">2</span>
                  <span className="text-muted font-normal">5%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom Grid: New customers per month & Win rate trend */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel className="glass-card">
          <PanelHead title="New customers per month">
            <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
              <ArrowUpRight className="size-4 text-muted" />
            </button>
          </PanelHead>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">{Math.round(14 * mult)}</span>
            <span className="text-xs text-muted font-medium">joined in the last {count} months</span>
          </div>
          <BarPlot labels={labels} series={[[2, 1, 3, 2, 4, 2, 3, 2, 2, 1, 2, 4].slice(-count)]} max={6} />
        </Panel>

        <Panel className="glass-card">
          <PanelHead title="Win rate trend">
            <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
              <ArrowUpRight className="size-4 text-muted" />
            </button>
          </PanelHead>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-foreground">76%</span>
            <span className="text-xs text-muted font-medium">22 won of 29 closed, last {count} months</span>
          </div>
          <p className="my-3 text-xs text-muted font-medium">● Win rate per month　 -- Period average</p>
          <LinePlot labels={labels} values={[60, 66, 73, 62, 70, 68, 86, 60, 58, 74, 74, 86].slice(-count)} />
        </Panel>
      </div>
    </>
  );
}
