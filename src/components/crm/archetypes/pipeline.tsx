import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, GripVertical, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, type RecordRow } from "@/lib/crm/catalog";
import { Avatar, EmptyState, IconBtn } from "../ui";

/* ==========================================================================
   A1 — Pipeline.

   A stage board where every card is a record you can move with the mouse
   or the keyboard.

   Fixes over the previous board:
     · the "+" button in a column actually creates the record *in that stage*
     · stage colour comes from what the stage means, not from its position
     · a record can be moved from the keyboard via the stage bar in the sheet
     · every column shows its count and its value, so the board is a chart
   ========================================================================== */

/** Semantics per stage — first match wins, so order matters. */
const STAGE_RULES: Array<{ match: RegExp; tone: "pine" | "butter" | "tomato" | "ink" }> = [
  {
    match: /^(won|accepted|approved|paid|completed|confirmed|resolved|departed|active|published)/i,
    tone: "pine",
  },
  {
    match:
      /^(new|open|prospect|inbox|trial|pending|in review|submitted|documents|on hold|queued|held)/i,
    tone: "butter",
  },
  {
    match: /^(lost|cancelled|rejected|expired|overdue|escalated|delayed|no show)/i,
    tone: "tomato",
  },
];

const TERMINAL = /^(won|lost|cancelled|completed|closed|rejected|expired|paid|resolved|departed)/i;

export function stageTone(stage: string): "pine" | "butter" | "tomato" | "ink" {
  for (const rule of STAGE_RULES) if (rule.match.test(stage)) return rule.tone;
  return "ink";
}

export type PipelineProps = {
  rows: RecordRow[];
  /** Ordered stage names. */
  stages: string[];
  currency: string;
  onOpen: (row: RecordRow) => void;
  /** Move a record to a stage. */
  onMove: (row: RecordRow, stage: string) => void;
  /** Create a record pre-set to a stage. */
  onCreate?: (stage: string) => void;
  noun?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptySteps?: string[];
  emptyIcon?: ReactNode;
  /** Rendered under the board — e.g. a funnel summary. */
  footer?: ReactNode;
};

export function Pipeline({
  rows,
  stages,
  currency,
  onOpen,
  onMove,
  onCreate,
  noun = "record",
  emptyTitle,
  emptyDescription,
  emptySteps,
  emptyIcon,
  footer,
}: PipelineProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [focused, setFocused] = useState<RecordRow | null>(null);

  const byStage = useMemo(() => {
    const map: Record<string, RecordRow[]> = {};
    for (const stage of stages) map[stage] = [];
    for (const row of rows) {
      const key = map[row.status] ? row.status : (stages[0] ?? "");
      if (!map[key]) map[key] = [];
      map[key].push(row);
    }
    return map;
  }, [rows, stages]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const stage of stages) {
      map[stage] = (byStage[stage] ?? []).reduce((a, r) => a + (r.amount || 0), 0);
    }
    return map;
  }, [byStage, stages]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? "Nothing in this pipeline yet"}
        description={emptyDescription}
        steps={emptySteps}
        actions={
          onCreate ? (
            <button
              type="button"
              className="h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-on-ink transition-opacity hover:opacity-90"
              onClick={() => onCreate(stages[0] ?? "")}
            >
              Create {noun}
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: "thin" }}>
        {stages.map((stage) => {
          const cards = byStage[stage] ?? [];
          const tone = stageTone(stage);
          const isOver = overStage === stage;
          return (
            <section
              key={stage}
              className={cn(
                "flex w-[286px] shrink-0 flex-col rounded-[var(--r-card)] border p-3 transition-all duration-150",
                isOver ? "border-pine bg-glass-3 shadow-pop" : "border-line bg-glass",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const id = e.dataTransfer.getData("text/plain");
                const row = rows.find((r) => r.id === id);
                if (row && row.status !== stage) onMove(row, stage);
                setDragging(null);
              }}
            >
              <header className="mb-2.5 flex items-center gap-2 px-1">
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    tone === "pine" && "bg-pine",
                    tone === "butter" && "bg-butter",
                    tone === "tomato" && "bg-tomato",
                    tone === "ink" && "bg-ink",
                  )}
                />
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                  {stage}
                </h3>
                <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-bold text-muted tabular-nums">
                  {cards.length}
                </span>
                {onCreate && (
                  <IconBtn
                    label={`Add ${noun} in ${stage}`}
                    className="size-6"
                    onClick={() => onCreate(stage)}
                  >
                    <Plus className="size-3.5" />
                  </IconBtn>
                )}
              </header>

              {(totals[stage] ?? 0) > 0 && (
                <div className="mb-2 px-1 text-[11.5px] font-semibold text-muted tabular-nums">
                  {money(totals[stage] ?? 0, currency)}
                </div>
              )}

              <div className="flex min-h-[120px] flex-col gap-2">
                {cards.map((row) => (
                  <article
                    key={row.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", row.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(row.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOverStage(null);
                    }}
                    onClick={() => {
                      setFocused(row);
                      onOpen(row);
                    }}
                    className={cn(
                      "group cursor-pointer rounded-[18px] border border-line bg-glass-3 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop",
                      dragging === row.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
                          {row.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {row.destination || row.detail || row.id}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <span className="text-[15px] font-bold tracking-tight text-foreground tabular-nums">
                        {money(row.amount, currency)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {row.date && (
                          <span className="flex items-center gap-1 text-[10.5px] text-faint">
                            <CalendarDays className="size-3" />
                            {row.date.slice(5)}
                          </span>
                        )}
                        <Avatar name={row.owner || "?"} size={20} />
                      </span>
                    </div>
                  </article>
                ))}
                {cards.length === 0 && (
                  <p className="rounded-[16px] border border-dashed border-line-2 px-3 py-6 text-center text-[11.5px] text-faint">
                    Drop a {noun} here
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {footer}
    </div>
  );
}

/**
 * A stage bar that doubles as the keyboard-accessible way to move a record.
 * Every step is a real button, so the board is usable without a mouse.
 */
export function StageBar({
  stages,
  current,
  onMove,
}: {
  stages: string[];
  current: string;
  onMove: (stage: string) => void;
}) {
  const index = stages.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stages.map((stage, i) => {
        const tone = stageTone(stage);
        const done = index >= 0 && i < index;
        const active = stage === current;
        return (
          <button
            key={stage}
            type="button"
            onClick={() => onMove(stage)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "h-7 rounded-full px-3 text-[11.5px] font-semibold transition-all duration-150",
              active
                ? "bg-ink text-on-ink"
                : done
                  ? "bg-pine/15 text-pine"
                  : "bg-well text-muted hover:text-foreground",
            )}
            title={`Move to ${stage}`}
          >
            {stage}
          </button>
        );
      })}
    </div>
  );
}

export { X };
