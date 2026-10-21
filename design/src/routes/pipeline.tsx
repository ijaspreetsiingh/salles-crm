import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trophy, TrendingUp, Calendar, Plus, X, MoreHorizontal, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Badge } from "@/components/crm/shell";
import { Avatar, AvatarStack, Chip, IconBtn, Segmented } from "@/components/crm/ui";
import { AddEntry, SearchField, Toolbar, ExportButton, EmptyResults } from "@/components/crm/page-tools";
import { deals, repList, reps, stageMeta, money, type Deal, type Stage, type RepKey } from "@/lib/crm-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Deal Pipeline — Rapport CRM" },
      { name: "description", content: "Track deals, stages and weighted sales forecasts in Rapport CRM." },
      { property: "og:title", content: "Deal Pipeline — Rapport CRM" },
      { property: "og:description", content: "Track deals, stages and weighted sales forecasts in Rapport CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const stages: Stage[] = ["Qualification", "Proposal", "Negotiation", "Closing"];
const stageColors: Record<Stage | "Won", { bar: string; text: string; bg: string; tone: string }> = {
  Qualification: { bar: "bg-butter", text: "text-on-butter", bg: "bg-butter", tone: "sun" },
  Proposal: { bar: "bg-pine", text: "text-on-pine", bg: "bg-pine", tone: "forest" },
  Negotiation: { bar: "bg-tomato", text: "text-on-tomato", bg: "bg-tomato", tone: "ember" },
  Closing: { bar: "bg-ink", text: "text-on-ink", bg: "bg-ink", tone: "ink" },
  Won: { bar: "bg-pine", text: "text-on-pine", bg: "bg-pine", tone: "forest" },
};

function Page() {
  const [rows, setRows] = useState<Deal[]>(deals);
  const [search, setSearch] = useState("");
  const [rep, setRep] = useState("");
  const [view, setView] = useState<"Board" | "List">("Board");
  const [selected, setSelected] = useState<Deal | null>(null);
  const [outcomes, setOutcomes] = useState({ won: 4, lost: 15 });
  const [activeDragOverStage, setActiveDragOverStage] = useState<string | null>(null);

  const visible = rows.filter(
    (d) =>
      `${d.title} ${d.company}`.toLowerCase().includes(search.toLowerCase()) &&
      (!rep || d.team.some((k) => k === rep)),
  );
  const total = rows.reduce((s, d) => s + d.value, 0);

  const drop = (e: React.DragEvent, stage: Stage) => {
    e.preventDefault();
    setActiveDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain");
    const target = rows.find((d) => d.id === id);
    if (target && target.stage !== stage) {
      setRows((r) => r.map((d) => (d.id === id ? { ...d, stage } : d)));
      toast.success(`Moved "${target.title}" to ${stage}`);
    }
  };

  const updateSelectedField = <K extends keyof Deal>(field: K, value: Deal[K]) => {
    if (!selected) return;
    const updated = { ...selected, [field]: value };
    setSelected(updated);
    setRows((r) => r.map((d) => (d.id === selected.id ? updated : d)));
  };

  return (
    <>
      <PageHeader
        title={["Deal", "Pipeline"]}
        stats={[
          { icon: <Trophy className="text-pine" />, value: "$1,139,100", label: "Open pipeline" },
          { icon: <TrendingUp className="text-foreground" />, value: "$713,157", label: "Weighted forecast" },
          {
            icon: <Calendar className="text-tomato" />,
            value: "5",
            label: "Deals closing this month",
            badge: <Badge tone="sun">$197.7K</Badge>,
          },
        ]}
      />

      <Toolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Search deals…" />
        {repList.map((r) => (
          <Chip key={r.key} active={rep === r.key} onClick={() => setRep(rep === r.key ? "" : r.key)}>
            <Avatar person={r} size={21} />
            {r.name.split(" ")[0]}
          </Chip>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Segmented options={["Board", "List"]} value={view} onChange={setView} />
          <ExportButton rows={visible} name="deals" />
          <AddEntry
            title="New deal"
            label="New deal"
            fields={[
              { name: "title", label: "Deal name" },
              { name: "company", label: "Company" },
              { name: "value", label: "Value ($)", type: "number" },
              { name: "stage", label: "Stage", options: stages },
              { name: "closes", label: "Closing date", type: "date" },
            ]}
            onSave={(v) => {
              const newD: Deal = {
                id: `d-${Date.now()}`,
                title: v["title"] ?? "Untitled Deal",
                company: v["company"] ?? "Acme",
                value: Number(v["value"]) || 25000,
                stage: (v["stage"] ?? "Qualification") as Stage,
                closes: v["closes"] ?? "Dec 30",
                team: ["sofia"],
              };
              setRows((prev) => [newD, ...prev]);
              toast.success(`Created deal "${newD.title}"`);
            }}
          />
        </div>
      </Toolbar>

      {/* Board View */}
      {view === "Board" ? (
        <div className="scrollbar-thin overflow-x-auto pb-4">
          <div className="grid min-w-[1080px] grid-cols-[repeat(4,minmax(0,1fr))_110px] gap-3.5">
            {stages.map((stage) => {
              const stageDeals = visible.filter((d) => d.stage === stage);
              const stageSum = stageDeals.reduce((s, d) => s + d.value, 0);
              const isOver = activeDragOverStage === stage;
              const meta = stageMeta[stage];

              const dotColor =
                meta.tone === "sun"
                  ? "bg-butter"
                  : meta.tone === "forest"
                    ? "bg-pine"
                    : meta.tone === "ember"
                      ? "bg-tomato"
                      : "bg-ink";

              return (
                <section
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (activeDragOverStage !== stage) setActiveDragOverStage(stage);
                  }}
                  onDragLeave={() => setActiveDragOverStage(null)}
                  onDrop={(e) => drop(e, stage)}
                  className={cn(
                    "glass-card flex flex-col p-2.5 transition-all duration-300",
                    isOver && "ring-2 ring-primary scale-[1.01] bg-well shadow-2xl",
                  )}
                >
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <i className={cn("size-2.5 rounded-full ring-2 ring-black/10", dotColor)} />
                    <h2 className="text-sm font-bold text-foreground">{stage}</h2>
                    <span className="rounded-full bg-well px-2 py-0.5 text-xs font-semibold text-muted">
                      {stageDeals.length}
                    </span>
                    <span className="ml-auto text-xs font-semibold text-muted">{money(stageSum)}</span>
                    <button
                      onClick={() => {
                        const newD: Deal = {
                          id: `d-${Date.now()}`,
                          title: "New opportunity",
                          company: "Tidewater Freight",
                          value: 12000,
                          stage,
                          closes: "Dec 30",
                          team: ["sofia", "theo"],
                        };
                        setRows((r) => [newD, ...r]);
                        setSelected(newD);
                        toast.success(`Added new deal to ${stage}`);
                      }}
                      className="grid size-6 place-items-center rounded-full border border-line hover:bg-well"
                      title={`Add ${stage} deal`}
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>

                  <div className="space-y-3 mt-2">
                    {stageDeals.map((d) => {
                      const toneBg =
                        meta.tone === "sun"
                          ? "bg-butter text-on-butter"
                          : meta.tone === "forest"
                            ? "bg-pine text-on-pine"
                            : meta.tone === "ember"
                              ? "bg-tomato text-on-tomato"
                              : "bg-ink text-on-ink";

                      return (
                        <article
                          key={d.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                          onClick={() => setSelected(d)}
                          className={cn(
                            "group cursor-pointer rounded-3xl p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-98",
                            toneBg,
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-xs opacity-75 font-medium">Closes {d.closes}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(d);
                              }}
                              className="grid size-7 place-items-center rounded-full border border-current/25 hover:bg-current/10"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </div>
                          <h3 className="mt-2 text-base font-bold leading-tight tracking-tight">{d.title}</h3>
                          <p className="mt-0.5 text-xs opacity-75">{d.company}</p>
                          <div className="mt-4 flex items-end justify-between pt-2">
                            <div className="text-xl font-bold tracking-tight">{money(d.value)}</div>
                            <AvatarStack team={d.team} size={24} ring="ring-transparent" />
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {!stageDeals.length && (
                    <div className="my-auto rounded-2xl border-2 border-dashed border-line py-8 text-center text-xs text-muted">
                      No deals
                    </div>
                  )}
                </section>
              );
            })}

            {/* Won & Lost Outcome Columns */}
            <div className="flex flex-col gap-3">
              {(["won", "lost"] as const).map((o) => (
                <section
                  key={o}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    const found = rows.find((d) => d.id === id);
                    if (found) {
                      setRows((r) => r.filter((d) => d.id !== id));
                      setOutcomes((prev) => ({ ...prev, [o]: prev[o] + 1 }));
                      if (o === "won") {
                        toast.success(`🎉 ${found.title} WON!`, {
                          description: `Closed ${money(found.value)} revenue!`,
                        });
                      } else {
                        toast.info(`Closed ${found.title} as lost`);
                      }
                    }
                  }}
                  className={cn(
                    "glass-card flex min-h-64 flex-1 flex-col items-center justify-center border-2 border-dashed p-3 text-center transition-all duration-200 hover:scale-[1.02]",
                    o === "won" ? "border-pine/30 hover:bg-pine/10" : "border-line hover:bg-well",
                  )}
                >
                  <span
                    className={cn(
                      "mb-3 grid size-12 place-items-center rounded-full shadow-sm",
                      o === "won" ? "bg-pine text-on-pine" : "bg-well text-muted",
                    )}
                  >
                    {o === "won" ? <Trophy className="size-5" /> : <X className="size-5" />}
                  </span>
                  <h2 className="text-sm font-bold text-foreground">{o === "won" ? "Won" : "Lost"}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {outcomes[o]} {o === "won" ? "this month" : "closed lost"}
                  </p>
                  {o === "won" && <p className="mt-0.5 text-xs font-bold text-pine">$112.6K</p>}
                  <p className="mt-2 text-[10px] text-muted">Drop to {o}</p>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                {["Deal", "Company", "Value", "Stage", "Closes"].map((h) => (
                  <th key={h} className="pb-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className="cursor-pointer border-t border-line hover:bg-well transition-colors"
                >
                  <td className="py-3 font-semibold text-foreground">{d.title}</td>
                  <td className="text-muted">{d.company}</td>
                  <td className="font-bold text-foreground">{money(d.value)}</td>
                  <td>
                    <span className="rounded-full bg-well px-2.5 py-0.5 text-xs font-semibold">
                      {d.stage}
                    </span>
                  </td>
                  <td className="text-xs text-muted">{d.closes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <EmptyResults />}
          <p className="mt-4 text-xs font-medium text-muted">
            {visible.length} deals · {money(total)}
          </p>
        </div>
      )}

      {/* EXACT DEAL DRAWER (Image 1 replica) */}
      {selected && (
        <>
          {/* Backdrop Blur Scrim */}
          <div className="scrim" onClick={() => setSelected(null)} />

          {/* Right Slide-over Drawer */}
          <div className="drawer fixed inset-y-3 right-3 z-60 w-full max-w-[500px] overflow-y-auto rounded-3xl border border-rim bg-solid p-6 shadow-pop animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-semibold text-muted">Deal · {selected.company}</span>
              <button
                onClick={() => setSelected(null)}
                className="grid size-9 place-items-center rounded-full border border-line-2 bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Hero Deal Card inside Drawer (Exact match to Image 1) */}
            <div
              className={cn(
                "rounded-3xl p-5 shadow-sm transition-all duration-300",
                stageColors[selected.stage].bg,
                stageColors[selected.stage].text,
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Closes {selected.closes}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-xs">
                  <i className="size-2 rounded-full bg-current" />
                  {selected.stage}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">{selected.title}</h2>
              <p className="mt-0.5 text-xs font-medium opacity-80">{selected.company}</p>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-3xl font-extrabold tracking-tight">{money(selected.value)}</span>
                <AvatarStack team={selected.team} size={28} ring="ring-transparent" />
              </div>
            </div>

            {/* 5-Stage Interactive Progress Bar (Image 1 replica) */}
            <div className="mt-6">
              <div className="grid grid-cols-5 gap-1.5">
                {(["Qualification", "Proposal", "Negotiation", "Closing", "Won"] as const).map((st, i) => {
                  const stageIndex = ["Qualification", "Proposal", "Negotiation", "Closing", "Won"].indexOf(
                    selected.stage,
                  );
                  const isCurrent = selected.stage === st;
                  const isPassed = i <= stageIndex;

                  return (
                    <button
                      key={st}
                      onClick={() => {
                        const nextStage = st === "Won" ? "Closing" : st;
                        updateSelectedField("stage", nextStage as Stage);
                        if (st === "Won") {
                          toast.success(`🎉 ${selected.title} marked as Won!`);
                        } else {
                          toast.success(`Stage moved to ${st}`);
                        }
                      }}
                      className="group flex flex-col gap-1.5 text-left focus:outline-none"
                    >
                      {/* Top Horizontal Bar */}
                      <div
                        className={cn(
                          "h-1.5 w-full rounded-full transition-all duration-300",
                          isPassed ? stageColors[st].bar : "bg-line",
                        )}
                      />
                      {/* Stage Name */}
                      <span
                        className={cn(
                          "truncate text-[11px] transition-colors",
                          isCurrent ? "font-bold text-foreground" : "text-muted group-hover:text-foreground",
                        )}
                      >
                        {st}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Fields (Image 1 replica) */}
            <div className="mt-6 space-y-4 text-xs font-medium">
              {/* Row 1: Amount and Expected Close */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted">Amount (USD)</label>
                  <input
                    type="number"
                    value={selected.value}
                    onChange={(e) => updateSelectedField("value", Number(e.target.value))}
                    className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-muted">Expected close</label>
                  <input
                    type="text"
                    value={selected.closes}
                    onChange={(e) => updateSelectedField("closes", e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-foreground"
                  />
                </div>
              </div>

              {/* Row 2: Owner */}
              <div>
                <label className="text-muted">Owner</label>
                <select
                  value={selected.team[0] ?? "sofia"}
                  onChange={(e) => {
                    const newOwner = e.target.value as RepKey;
                    const others = selected.team.filter((k) => k !== newOwner);
                    updateSelectedField("team", [newOwner, ...others]);
                  }}
                  className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-foreground"
                >
                  {repList.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 3: Notes */}
              <div>
                <label className="text-muted">Notes</label>
                <textarea
                  rows={4}
                  defaultValue="Champion is the ops lead; finance signs off above $20k."
                  className="mt-1 w-full rounded-2xl border border-line bg-glass-2 p-3.5 text-xs text-foreground outline-none focus:border-foreground"
                />
              </div>

              {/* Row 4: Team */}
              <div>
                <label className="text-muted">Team</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {repList.map((r) => {
                    const isInTeam = selected.team.includes(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          const nextTeam = isInTeam
                            ? selected.team.filter((k) => k !== r.key)
                            : [...selected.team, r.key];
                          if (nextTeam.length > 0) updateSelectedField("team", nextTeam);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                          isInTeam ? "bg-ink text-on-ink shadow-xs" : "bg-glass-2 border border-line text-muted hover:text-foreground",
                        )}
                      >
                        <Avatar person={r} size={20} />
                        <span>{r.name.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
