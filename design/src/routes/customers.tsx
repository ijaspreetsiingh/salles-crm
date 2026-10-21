import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Phone,
  BarChart3,
  Star,
  Mail,
  ArrowLeft,
  Share2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Copy,
  Edit2,
  CalendarCheck,
  Plus,
  MoreHorizontal,
  ArrowUpRight,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Badge } from "@/components/crm/shell";
import { Avatar, AvatarStack, Chip, IconBtn, Segmented } from "@/components/crm/ui";
import { Toolbar, SearchField, FilterSelect, AddEntry, ExportButton, EmptyResults } from "@/components/crm/page-tools";
import { customers, money, reps, type Customer, type Segment } from "@/lib/crm-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customer Directory — Rapport CRM" },
      { name: "description", content: "Browse customer relationships, account health and open pipeline in Rapport CRM." },
      { property: "og:title", content: "Customer Directory — Rapport CRM" },
      { property: "og:description", content: "Browse customer relationships, account health and open pipeline in Rapport CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const [rows, setRows] = useState<Customer[]>(customers);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("All");
  const [view, setView] = useState<"Grid" | "Table">("Grid");
  const [sort, setSort] = useState("Last contacted");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [funnelMode, setFunnelMode] = useState<"Weighted" | "Total">("Weighted");
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({ "grace-liu": true });

  const visible = rows
    .filter(
      (c) =>
        (segment === "All" || c.segment === segment) &&
        `${c.name} ${c.company} ${c.role}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Name"
        ? a.name.localeCompare(b.name)
        : sort === "Pipeline"
          ? (b.pipeline ?? 0) - (a.pipeline ?? 0)
          : sort === "Health"
            ? b.health - a.health
            : 0,
    );

  // If a customer is selected, render the EXACT Customer Information page from Images 3 & 4
  if (selected) {
    const isStarred = starredMap[selected.slug] ?? selected.starred;

    return (
      <div className="animate-in fade-in duration-300">
        {/* Customer Information Header (Exact match to Image 3) */}
        <div className="mb-7 flex flex-wrap items-center gap-x-10 gap-y-4">
          <button
            onClick={() => setSelected(null)}
            className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs transition-transform hover:scale-105 active:scale-95"
            title="Back to customers"
          >
            <ArrowLeft className="size-5" />
          </button>

          <div>
            <h1 className="text-[38px] font-semibold leading-[1.04] tracking-tight sm:text-[42px] text-foreground">
              Customer
              <br />
              Information
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-x-10 gap-y-4 ml-auto lg:ml-8">
            {/* Stat 1: Won */}
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <BarChart3 className="size-5 text-muted" />
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                  $0
                  <span className="rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-bold text-on-butter">
                    None this month
                  </span>
                </div>
                <div className="text-xs text-muted">Won from 0 deals, all time</div>
              </div>
            </div>

            {/* Stat 2: Pipeline */}
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <User className="size-5 text-pine" />
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                  $30,460
                  <span className="rounded-full bg-pine px-2.5 py-0.5 text-[11px] font-bold text-on-pine">
                    $10.6K weighted
                  </span>
                </div>
                <div className="text-xs text-muted">Open across 2 deals</div>
              </div>
            </div>

            {/* Stat 3: Tasks */}
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 place-items-center rounded-full border border-rim bg-glass-2 shadow-xs">
                <Calendar className="size-5 text-muted" />
              </span>
              <div>
                <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                  3
                  <span className="rounded-full bg-glass-2 border border-line px-2.5 py-0.5 text-[11px] font-bold text-muted">
                    None today
                  </span>
                </div>
                <div className="text-xs text-muted">Upcoming tasks, next 30 days</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Row: Interaction History (Left) + Profile Card (Right) */}
        <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
          {/* Interaction History (Image 3 replica) */}
          <section className="glass-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Interaction History</h2>
              <div className="flex items-center gap-2">
                <IconBtn label="Options" className="size-8">
                  <MoreHorizontal className="size-4" />
                </IconBtn>
                <IconBtn label="Open" className="size-8">
                  <ArrowUpRight className="size-4" />
                </IconBtn>
              </div>
            </div>

            <div className="space-y-3">
              {/* Deal Card 1: Annual renewal (Yellow) */}
              <article className="rounded-3xl bg-butter p-4.5 text-on-butter shadow-sm transition-transform hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <span className="text-xs opacity-75 font-medium">Oct 3</span>
                  <button className="grid size-7 place-items-center rounded-full border border-current/25 hover:bg-current/10">
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </div>
                <h3 className="mt-2 text-lg font-bold">Annual renewal</h3>
                <div className="mt-6 flex items-end justify-between">
                  <span className="text-2xl font-extrabold tracking-tight">$12,250</span>
                  <AvatarStack team={["sofia", "theo"]} size={26} ring="ring-transparent" />
                </div>
              </article>

              {/* Deal Card 2: Fleet licence expansion (Pine Green) */}
              <article className="rounded-3xl bg-pine p-4.5 text-on-pine shadow-sm transition-transform hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <span className="text-xs opacity-75 font-medium">Sep 26</span>
                  <button className="grid size-7 place-items-center rounded-full border border-current/25 hover:bg-current/10">
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </div>
                <h3 className="mt-2 text-lg font-bold">Fleet licence expansion</h3>
                <div className="mt-6 flex items-end justify-between">
                  <span className="text-2xl font-extrabold tracking-tight">$18,210</span>
                  <AvatarStack team={["sofia", "amara", "theo"]} size={26} ring="ring-transparent" />
                </div>
              </article>
            </div>
          </section>

          {/* Customer Profile Card (Image 3 replica) */}
          <section className="glass-card flex flex-col items-center p-6 text-center">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setStarredMap((prev) => ({ ...prev, [selected.slug]: !isStarred }));
                    toast.success(isStarred ? "Unstarred customer" : "Starred as VIP customer");
                  }}
                  className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                  title="Star"
                >
                  <Star className={cn("size-4", isStarred ? "fill-butter text-butter" : "text-muted")} />
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    toast.success("Profile link copied");
                  }}
                  className="grid size-8 place-items-center rounded-full border border-line hover:bg-well"
                  title="Share"
                >
                  <Share2 className="size-4 text-muted" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <MoreHorizontal className="size-4 text-muted" />
                </button>
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <ArrowUpRight className="size-4 text-muted" />
                </button>
              </div>
            </div>

            {/* Circular Health Gauge & Initials Avatar */}
            <div className="relative my-4 size-28">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="6" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--tomato)"
                  strokeWidth="6"
                  strokeDasharray="276.5"
                  strokeDashoffset={276.5 * (1 - selected.health / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-2 grid place-items-center rounded-full bg-well text-2xl font-bold text-foreground">
                {selected.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <span className="absolute bottom-1 right-2 grid size-6 place-items-center rounded-full bg-ink text-[10px] font-bold text-on-ink shadow-sm">
                {selected.health}
              </span>
            </div>

            <h2 className="text-xl font-bold tracking-tight text-foreground">{selected.name}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {selected.role}, {selected.company}
            </p>

            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full border border-line bg-glass-2 px-3 py-1 text-xs font-semibold text-foreground">
                {selected.segment}
              </span>
              <span className="rounded-full border border-line bg-glass-2 px-3 py-1 text-xs font-semibold text-foreground">
                Vancouver
              </span>
            </div>

            {/* Row of Action Buttons (Image 3 replica) */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => toast.info("Edit customer")}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Edit"
              >
                <Edit2 className="size-4 text-foreground" />
              </button>
              <button
                onClick={() => toast.info(`Emailing ${selected.name}`)}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Email"
              >
                <Mail className="size-4 text-foreground" />
              </button>
              <button
                onClick={() => toast.success(`Connecting call with ${selected.name}...`)}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Call"
              >
                <Phone className="size-4 text-foreground" />
              </button>
              <button
                onClick={() => toast.info("Add note or interaction")}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Add"
              >
                <Plus className="size-4 text-foreground" />
              </button>
              <button
                onClick={() => toast.info("Schedule meeting")}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Meeting"
              >
                <Calendar className="size-4 text-foreground" />
              </button>
              <button
                onClick={() => toast.info("View tasks schedule")}
                className="grid size-10 place-items-center rounded-full border border-line bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Schedule"
              >
                <CalendarCheck className="size-4 text-foreground" />
              </button>
            </div>
          </section>
        </div>

        {/* Bottom Row: Tasks Schedule, Stage Funnel, Detailed Information (Image 4 replica) */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Tasks Schedule Calendar Card (Image 4 replica) */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Tasks Schedule</h2>
              <div className="flex items-center gap-1.5">
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <MoreHorizontal className="size-4 text-muted" />
                </button>
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <ArrowUpRight className="size-4 text-muted" />
                </button>
              </div>
            </div>

            {/* Month Header Switcher */}
            <div className="my-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button className="grid size-7 place-items-center rounded-full border border-line hover:bg-well">
                  <ChevronLeft className="size-3.5 text-muted" />
                </button>
                <button className="grid size-7 place-items-center rounded-full border border-line hover:bg-well">
                  <ChevronRight className="size-3.5 text-muted" />
                </button>
              </div>
              <span className="font-bold text-sm text-foreground">October</span>
              <button
                onClick={() => toast.info("Refreshed schedule")}
                className="grid size-7 place-items-center rounded-full border border-line hover:bg-well"
              >
                <RotateCcw className="size-3.5 text-muted" />
              </button>
            </div>

            {/* Calendar Month Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                <span key={d} className="pb-1 text-[11px] font-medium text-muted">
                  {d}
                </span>
              ))}
              {/* Days: October 2026 */}
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const hasRep18 = day === 18;
                const hasRep21 = day === 21;
                const hasRep28 = day === 28;
                const isSelectedDay = day === 19;

                return (
                  <div
                    key={day}
                    className={cn(
                      "relative grid min-h-10 place-items-center rounded-xl p-1 text-xs transition-colors",
                      isSelectedDay && "border border-ink bg-well font-bold",
                      hasRep21 && "bg-pine text-on-pine font-bold",
                      hasRep28 && "bg-butter text-on-butter font-bold",
                      hasRep18 && "bg-well/80",
                    )}
                  >
                    <span>{day}</span>
                    {hasRep18 && (
                      <div className="absolute inset-0 grid place-items-center">
                        <Avatar person={reps.sofia} size={22} className="ring-1 ring-background" />
                      </div>
                    )}
                    {hasRep21 && (
                      <div className="absolute inset-0 grid place-items-center">
                        <Avatar person={reps.theo} size={22} className="ring-1 ring-pine" />
                      </div>
                    )}
                    {hasRep28 && (
                      <div className="absolute inset-0 grid place-items-center">
                        <Avatar person={reps.rohan} size={22} className="ring-1 ring-butter" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Stage Funnel Card (Image 4 replica) */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Stage Funnel</h2>
              <div className="flex items-center gap-1.5">
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <MoreHorizontal className="size-4 text-muted" />
                </button>
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <ArrowUpRight className="size-4 text-muted" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold tracking-tight text-foreground">$10,645</span>
                <p className="text-xs text-muted">Total in pipeline</p>
              </div>
              <div className="inline-flex rounded-full bg-well p-1">
                <button
                  onClick={() => setFunnelMode("Weighted")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                    funnelMode === "Weighted" ? "bg-float shadow-xs text-foreground" : "text-muted",
                  )}
                >
                  Weighted
                </button>
                <button
                  onClick={() => setFunnelMode("Total")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                    funnelMode === "Total" ? "bg-float shadow-xs text-foreground" : "text-muted",
                  )}
                >
                  Total
                </button>
              </div>
            </div>

            {/* Funnel Stage Bars */}
            <div className="mt-5 space-y-2.5">
              {[
                { name: "Qualification · 1", val: "$2,450", dot: "bg-butter" },
                { name: "Proposal · 1", val: "$8,195", dot: "bg-pine" },
                { name: "Negotiation", val: "$0", dot: "bg-tomato" },
                { name: "Closing", val: "$0", dot: "bg-ink" },
              ].map((st) => (
                <div
                  key={st.name}
                  className="flex items-center justify-between rounded-2xl bg-float p-3 shadow-xs transition-colors hover:bg-well"
                >
                  <div className="flex items-center gap-2">
                    <i className={cn("size-2 rounded-full", st.dot)} />
                    <span className="text-xs font-medium text-foreground">{st.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-foreground">{st.val}</span>
                    <RotateCcw className="size-3.5 text-muted opacity-70" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Detailed Information Card (Image 4 replica) */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Detailed Information</h2>
              <div className="flex items-center gap-1.5">
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <Edit2 className="size-3.5 text-muted" />
                </button>
                <button className="grid size-8 place-items-center rounded-full border border-line hover:bg-well">
                  <ArrowUpRight className="size-4 text-muted" />
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3 divide-y divide-line text-xs font-medium">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">First name</span>
                  <span className="font-semibold text-foreground text-sm">Grace</span>
                </div>
                <Edit2 className="size-3 text-muted opacity-60" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Last name</span>
                  <span className="font-semibold text-foreground text-sm">Liu</span>
                </div>
                <Edit2 className="size-3 text-muted opacity-60" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Company</span>
                  <span className="font-semibold text-foreground text-sm">{selected.company}</span>
                </div>
                <Edit2 className="size-3 text-muted opacity-60" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Email</span>
                  <span className="font-semibold text-foreground text-sm">grace@peakline.dev</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText("grace@peakline.dev");
                    toast.success("Email copied to clipboard");
                  }}
                  className="grid size-6 place-items-center rounded-md hover:bg-well"
                  title="Copy email"
                >
                  <Copy className="size-3 text-muted" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Phone number</span>
                  <span className="font-semibold text-foreground text-sm">+1 604 729 3643</span>
                </div>
                <button
                  onClick={() => toast.success("Connecting voice call to +1 604 729 3643...")}
                  className="grid size-6 place-items-center rounded-md hover:bg-well"
                  title="Call phone"
                >
                  <Phone className="size-3 text-muted" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Sources</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="grid size-6 place-items-center rounded-full bg-forest/20 text-[10px] font-bold text-forest">
                      WA
                    </span>
                    <span className="grid size-6 place-items-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-600">
                      in
                    </span>
                    <span className="grid size-6 place-items-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-600">
                      dc
                    </span>
                  </div>
                </div>
                <Share2 className="size-3 text-muted opacity-60" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-muted block text-[11px]">Last contacted · in 2 h</span>
                  <span className="font-semibold text-foreground text-sm">10/19/2026 at 5:45 PM</span>
                </div>
                <Calendar className="size-3 text-muted opacity-60" />
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // Customer Directory List / Grid
  return (
    <>
      <PageHeader
        title={["Customer", "Directory"]}
        stats={[
          {
            icon: <Users className="text-pine" />,
            value: rows.length,
            label: "Customers in your book",
            badge: <Badge tone="sun">+4 this week</Badge>,
          },
          {
            icon: <Phone className="text-tomato" />,
            value: "18",
            label: "Contacted in the last 7 days",
            badge: <Badge tone="light">75%</Badge>,
          },
          { icon: <BarChart3 className="text-ink" />, value: "$1,139,100", label: "Open pipeline across the book" },
        ]}
      />

      <Toolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Search name, company, city…" />
        {["All", "Enterprise", "Mid-market", "SMB"].map((s) => (
          <Chip key={s} active={segment === s} onClick={() => setSegment(s)}>
            {s}
          </Chip>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Sort customers"
            options={["Last contacted", "Name", "Pipeline", "Health"]}
            value={sort}
            onChange={setSort}
          />
          <Segmented options={["Grid", "Table"]} value={view} onChange={setView} />
          <ExportButton rows={visible} name="customers" />
          <AddEntry
            title="New customer"
            label="New customer"
            fields={[
              { name: "name", label: "Full name" },
              { name: "company", label: "Company" },
              { name: "role", label: "Role" },
              { name: "segment", label: "Segment", options: ["Enterprise", "Mid-market", "SMB"] },
            ]}
            onSave={(v) => {
              const newC: Customer = {
                slug: (v["name"] ?? "Customer").toLowerCase().replace(/[^a-z]+/g, "-"),
                name: v["name"] ?? "New Customer",
                company: v["company"] ?? "Acme",
                role: v["role"] ?? "Director",
                segment: (v["segment"] ?? "SMB") as Segment,
                pipeline: null,
                lastContact: "Just added",
                health: 75,
              };
              setRows((r) => [newC, ...r]);
              setSelected(newC);
              toast.success(`Added customer "${newC.name}"`);
            }}
          />
        </div>
      </Toolbar>

      {view === "Grid" ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <article
              key={c.slug}
              onClick={() => setSelected(c)}
              className="glass-card cursor-pointer p-4.5 transition-transform hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <Avatar person={c} size={42} />
                <IconBtn
                  label={`Star ${c.name}`}
                  className={cn("size-8", c.starred && "border-butter bg-butter text-on-butter")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRows((r) =>
                      r.map((a) => (a.slug === c.slug ? { ...a, starred: !a.starred } : a)),
                    );
                    toast.success(c.starred ? `Unstarred ${c.name}` : `Starred ${c.name}`);
                  }}
                >
                  <Star className="size-3.5" fill={c.starred ? "currentColor" : "none"} />
                </IconBtn>
              </div>

              <h2 className="font-bold text-base text-foreground">{c.name}</h2>
              <p className="mt-0.5 truncate text-xs text-muted" title={`${c.role} · ${c.company}`}>
                {c.role} · {c.company}
              </p>

              <div className="my-3 grid grid-cols-2 gap-2 rounded-2xl bg-solid p-2.5 text-xs">
                <div>
                  <p className="text-muted">Open pipeline</p>
                  <p className="mt-0.5 font-bold text-foreground">
                    {c.pipeline === null ? "—" : money(c.pipeline)}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Last contact</p>
                  <p className="mt-0.5 font-bold text-foreground">{c.lastContact}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-track">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      c.health >= 80 ? "bg-pine" : c.health >= 65 ? "bg-butter" : "bg-tomato",
                    )}
                    style={{ width: `${c.health}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-muted">{c.health}</span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="rounded-full bg-well px-2.5 py-0.5 text-xs font-semibold text-foreground">
                  {c.segment}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.info(`Emailing ${c.name}`);
                    }}
                    className="grid size-7 place-items-center rounded-full border border-line hover:bg-well"
                    title={`Email ${c.name}`}
                  >
                    <Mail className="size-3 text-muted" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.success(`Calling ${c.name}...`);
                    }}
                    className="grid size-7 place-items-center rounded-full border border-line hover:bg-well"
                    title={`Call ${c.name}`}
                  >
                    <Phone className="size-3 text-muted" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="glass-card overflow-x-auto p-5">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {["Customer", "Company", "Segment", "Open pipeline", "Last contact", "Health"].map((h) => (
                  <th className="py-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={c.slug}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer border-t border-line hover:bg-well transition-colors"
                >
                  <td className="flex items-center gap-3 py-3 font-semibold text-foreground">
                    <Avatar person={c} size={32} />
                    {c.name}
                  </td>
                  <td className="text-muted">{c.company}</td>
                  <td>
                    <span className="rounded-full bg-well px-2.5 py-0.5 text-xs font-semibold">
                      {c.segment}
                    </span>
                  </td>
                  <td className="font-semibold text-foreground">
                    {c.pipeline === null ? "—" : money(c.pipeline)}
                  </td>
                  <td className="text-xs text-muted">{c.lastContact}</td>
                  <td>
                    <span className="font-bold text-xs">{c.health}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!visible.length && <EmptyResults />}
    </>
  );
}
