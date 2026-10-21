import { useMemo, useState } from "react";
import { Calendar, MoreHorizontal, Plus, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "./common";
import { formatDay, money, type RecordRow } from "@/lib/crm/catalog";
import type { ModuleSchema } from "@/lib/crm/schema";
import { cn } from "@/lib/utils";

/** Rapport-style stage tones mapped onto CRM statuses. */
const TONES = ["butter", "pine", "tomato", "ink"] as const;
type Tone = (typeof TONES)[number];

const isTerminal = (status: string) =>
  /^(won|lost|cancelled|completed|closed|rejected|expired|paid|resolved|departed)/i.test(status);

const terminalTone = (status: string): Tone =>
  /^(won|completed|paid|approved|resolved|departed)/i.test(status) ? "pine" : "ink";

const toneFor = (status: string, index: number, boardStatuses: string[]): Tone => {
  if (isTerminal(status)) return terminalTone(status);
  const i = boardStatuses.indexOf(status);
  return TONES[(i >= 0 ? i : index) % TONES.length] ?? "ink";
};

const toneBg: Record<Tone, string> = {
  butter: "bg-butter text-on-butter",
  pine: "bg-pine text-on-pine",
  tomato: "bg-tomato text-on-tomato",
  ink: "bg-ink text-on-ink",
};

const toneBar: Record<Tone, string> = {
  butter: "bg-butter",
  pine: "bg-pine",
  tomato: "bg-tomato",
  ink: "bg-ink",
};

const toneDot: Record<Tone, string> = {
  butter: "bg-butter",
  pine: "bg-pine",
  tomato: "bg-tomato",
  ink: "bg-ink",
};

type Props = {
  rows: RecordRow[];
  schema: ModuleSchema;
  currency: string;
  owners: string[];
  noun: string;
  onUpdate: (row: RecordRow) => void;
  onCreate: () => void;
};

/**
 * Rapport-style deal pipeline: colored stage columns, tonal deal cards,
 * drag & drop with Won/Lost drop zones and a right slide-over drawer
 * for quick stage + field edits without leaving the board.
 */
export function PipelineBoard({ rows, schema, currency, owners, noun, onUpdate, onCreate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState("");

  const allColumns = useMemo(
    () =>
      schema.boardStatuses?.length
        ? schema.boardStatuses
        : Array.from(new Set(rows.map((r) => r.status))),
    [schema, rows],
  );
  const stageColumns = allColumns.filter((s) => !isTerminal(s));
  const terminalColumns = allColumns.filter(isTerminal);
  const progressStages = [
    ...stageColumns,
    ...terminalColumns.filter((s) => /^(won|completed|paid|approved)/i.test(s)).slice(0, 1),
  ];

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const move = (record: RecordRow, next: string) => {
    if (record.status === next) return;
    onUpdate({ ...record, status: next });
    if (/^won/i.test(next)) toast.success(`🎉 ${record.id} marked ${next}!`);
    else toast.success(`${record.id} moved to ${next}`);
  };

  const drop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOver("");
    const id = e.dataTransfer.getData("text/plain");
    const record = rows.find((r) => r.id === id);
    if (record) move(record, status);
  };

  const patch = (fields: Partial<RecordRow>) => {
    if (!selected) return;
    onUpdate({ ...selected, ...fields });
  };

  const selectedTone = selected ? toneFor(selected.status, 0, allColumns) : "ink";

  return (
    <>
      <div className="scrollbar-thin -mx-1 overflow-x-auto pb-4">
        <div className="grid min-w-[1080px] grid-cols-[repeat(auto-fit,minmax(230px,1fr))_120px] gap-3.5">
          {stageColumns.map((s, idx) => {
            const colRows = rows.filter((r) => r.status === s);
            const colSum = colRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
            const tone = toneFor(s, idx, allColumns);
            const over = dragOver === s;
            return (
              <section
                key={s}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOver !== s) setDragOver(s);
                }}
                onDragLeave={() => setDragOver("")}
                onDrop={(e) => drop(e, s)}
                className={cn(
                  "glass-card flex min-h-64 flex-col p-2.5 transition-all duration-300",
                  over && "scale-[1.01] bg-well shadow-pop ring-2 ring-primary",
                )}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <i className={cn("size-2.5 rounded-full", toneDot[tone])} />
                  <h2 className="text-sm font-bold">{s}</h2>
                  <span className="rounded-full bg-well px-2 py-0.5 text-xs font-semibold text-muted">
                    {colRows.length}
                  </span>
                  <span className="ml-auto text-xs font-semibold text-muted">
                    {money(colSum, currency)}
                  </span>
                  <button
                    onClick={onCreate}
                    className="grid size-6 place-items-center rounded-full border border-line transition-colors hover:bg-well"
                    title={`Add ${noun} in ${s}`}
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <div className="mt-2 space-y-3">
                  {colRows.map((r) => (
                    <article
                      key={r.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      onClick={() => setSelectedId(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(r.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${r.id} ${r.name}`}
                      className={cn(
                        "group cursor-pointer rounded-3xl p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-95",
                        toneBg[tone],
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-medium opacity-75">
                          {r.date ? formatDay(r.date) : r.id}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(r.id);
                          }}
                          className="grid size-7 place-items-center rounded-full border border-current/25 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={`Options for ${r.id}`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </div>
                      <h3 className="mt-2 text-base font-bold leading-tight tracking-tight">
                        {r.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs opacity-75">
                        {r.destination || r.detail || r.id}
                      </p>
                      <div className="mt-4 flex items-end justify-between pt-2">
                        <div className="text-xl font-bold tracking-tight">
                          {money(r.amount, currency)}
                        </div>
                        <Avatar name={r.owner || "?"} size="tiny" />
                      </div>
                    </article>
                  ))}
                  {!colRows.length && (
                    <div className="my-6 rounded-2xl border-2 border-dashed border-line py-8 text-center text-xs text-muted">
                      Drop {noun}s here
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {/* Won / Lost drop zones */}
          <div className="flex flex-col gap-3">
            {(terminalColumns.length ? terminalColumns : ["Won", "Lost"]).map((o) => {
              const won = /^(won|completed|paid|approved|resolved|departed)/i.test(o);
              const count = rows.filter((r) => r.status === o).length;
              const sum = rows
                .filter((r) => r.status === o)
                .reduce((a, r) => a + (Number(r.amount) || 0), 0);
              return (
                <section
                  key={o}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, o)}
                  className={cn(
                    "glass-card flex min-h-40 flex-1 flex-col items-center justify-center border-2 border-dashed p-3 text-center transition-all duration-200 hover:scale-[1.02]",
                    won ? "border-pine/30 hover:bg-pine/10" : "border-line hover:bg-well",
                  )}
                >
                  <span
                    className={cn(
                      "mb-3 grid size-12 place-items-center rounded-full shadow-sm",
                      won ? "bg-pine text-on-pine" : "bg-well text-muted",
                    )}
                  >
                    {won ? <Trophy className="size-5" /> : <X className="size-5" />}
                  </span>
                  <h2 className="text-sm font-bold">{o}</h2>
                  <p className="mt-1 text-xs text-muted">{count} records</p>
                  {sum > 0 && (
                    <p className={cn("mt-0.5 text-xs font-bold", won ? "text-pine" : "text-muted")}>
                      {money(sum, currency)}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-muted">Drop to close</p>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right slide-over drawer */}
      {selected && (
        <>
          <div className="app-scrim" onClick={() => setSelectedId(null)} />
          <aside
            className="app-drawer fixed inset-y-3 right-3 z-[60] w-full max-w-[500px] overflow-y-auto rounded-3xl border border-rim bg-solid p-6 shadow-pop"
            role="dialog"
            aria-label={`${noun} ${selected.id}`}
          >
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-semibold capitalize text-muted">
                {noun} · {selected.id}
              </span>
              <button
                onClick={() => setSelectedId(null)}
                className="grid size-9 place-items-center rounded-full border border-line-2 bg-glass-2 transition-transform hover:scale-105 active:scale-95"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Hero card */}
            <div className={cn("rounded-3xl p-5 shadow-sm", toneBg[selectedTone])}>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {selected.date ? formatDay(selected.date) : "No date"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1">
                  <i className="size-2 rounded-full bg-current" />
                  {selected.status}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight">{selected.name}</h2>
              <p className="mt-0.5 text-xs font-medium opacity-80">
                {selected.destination || selected.detail || selected.id}
              </p>
              <div className="mt-6 flex items-end justify-between">
                <span className="text-3xl font-extrabold tracking-tight">
                  {money(selected.amount, currency)}
                </span>
                <Avatar name={selected.owner || "?"} size="small" />
              </div>
            </div>

            {/* Stage progress */}
            {progressStages.length > 1 && (
              <div className="mt-6">
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${progressStages.length}, minmax(0,1fr))` }}
                >
                  {progressStages.map((st) => {
                    const stTone = toneFor(st, 0, allColumns);
                    const current = selected.status === st;
                    const passed =
                      progressStages.indexOf(selected.status) >= progressStages.indexOf(st) &&
                      !isTerminal(selected.status)
                        ? progressStages.indexOf(st) <= progressStages.indexOf(selected.status)
                        : current;
                    return (
                      <button
                        key={st}
                        onClick={() => move(selected, st)}
                        className="group flex flex-col gap-1.5 text-left focus:outline-none"
                        title={`Move to ${st}`}
                      >
                        <div
                          className={cn(
                            "h-1.5 w-full rounded-full transition-all duration-300",
                            passed ? toneBar[stTone] : "bg-line",
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-[11px] transition-colors",
                            current ? "font-bold" : "text-muted group-hover:text-foreground",
                          )}
                        >
                          {st}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inline fields */}
            <div className="mt-6 space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted" htmlFor={`amt-${selected.id}`}>
                    Amount ({currency})
                  </label>
                  <input
                    id={`amt-${selected.id}`}
                    type="number"
                    value={selected.amount}
                    onChange={(e) => patch({ amount: Number(e.target.value) })}
                    className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="text-muted" htmlFor={`date-${selected.id}`}>
                    Expected close
                  </label>
                  <input
                    id={`date-${selected.id}`}
                    type="date"
                    value={selected.date}
                    onChange={(e) => patch({ date: e.target.value })}
                    className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted" htmlFor={`owner-${selected.id}`}>
                  Owner
                </label>
                <select
                  id={`owner-${selected.id}`}
                  value={selected.owner}
                  onChange={(e) => patch({ owner: e.target.value })}
                  className="mt-1 w-full rounded-2xl border border-line bg-glass-2 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-foreground"
                >
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-muted" htmlFor={`notes-${selected.id}`}>
                  Notes
                </label>
                <textarea
                  id={`notes-${selected.id}`}
                  rows={4}
                  value={selected.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Next steps, promises, context…"
                  className="mt-1 w-full resize-y rounded-2xl border border-line bg-glass-2 p-3.5 text-xs outline-none focus:border-foreground"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                onClick={() => {
                  toast.success(`${selected.id} saved`);
                  setSelectedId(null);
                }}
              >
                Save & close
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setSelectedId(null)}
              >
                Back to board
              </Button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
