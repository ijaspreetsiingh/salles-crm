import { useMemo, useState } from "react";
import { ChevronRight, Lightbulb, Mail, Phone } from "lucide-react";
import { money, formatDay, type RecordRow } from "@/lib/crm/catalog";
import { WORK_GROUPS, statusBucket, statusGuide, type StatusBucket } from "@/lib/crm/language";
import { Avatar, EmptyState } from "../ui";
import { Status } from "../common";
import { cn } from "@/lib/utils";

/* ==========================================================================
   A0 — Work.

   The first thing a module shows. Not a grid of columns: a short, ordered
   list of records in the words the status already carries.

   1. Every row is one sentence: the name, then what the status means you
      should do about it ("Chase the supplier.", "Call them and find out
      what they want.").
   2. The list is split into three honest groups — needs you, waiting on
      someone else, nothing to do — so the page opens on the work instead
      of on two hundred rows of history.
   3. The details that used to need seven columns (destination, date,
      amount, owner, office) sit on the same row as small, quiet text.

   The table is still there, one click away under Layout → Table, for the
   person who wants to scan or sort the same records.
   ========================================================================== */

/** Records shown per group before "show all". */
const GROUP_LIMIT = 10;

const GROUP_ORDER: StatusBucket[] = ["yours", "waiting", "done"];

const GROUP_DOT: Record<StatusBucket, string> = {
  yours: "bg-tomato",
  waiting: "bg-butter",
  done: "bg-pine",
};

export type WorkProps = {
  rows: RecordRow[];
  currency: string;
  onOpen: (row: RecordRow) => void;
  onCreate?: () => void;
  createLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptySteps?: string[];
};

export function Work({
  rows,
  currency,
  onOpen,
  onCreate,
  createLabel = "Create record",
  emptyTitle,
  emptyDescription,
  emptySteps,
}: WorkProps) {
  const grouped = useMemo(() => {
    const buckets: Record<StatusBucket, RecordRow[]> = { yours: [], waiting: [], done: [] };
    for (const row of rows) buckets[statusBucket(row.status)].push(row);
    return GROUP_ORDER.map((key) => ({ key, rows: buckets[key] })).filter(
      (group) => group.rows.length > 0,
    );
  }, [rows]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Lightbulb size={22} />}
        title={emptyTitle ?? "Nothing here yet"}
        description={emptyDescription}
        steps={emptySteps}
        actions={
          onCreate ? (
            <button
              type="button"
              className="h-10 rounded-full bg-ink px-5 text-[13px] font-semibold text-on-ink transition-opacity hover:opacity-90"
              onClick={onCreate}
            >
              {createLabel}
            </button>
          ) : null
        }
      />
    );
  }

  // Finished records are history, not work. When there is something open,
  // the page closes that group down to a single line instead of letting a
  // hundred paid invoices bury the two that need chasing.
  const hasOpenWork = grouped.some((group) => group.key !== "done");

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <WorkGroup
          key={group.key}
          bucket={group.key}
          rows={group.rows}
          currency={currency}
          onOpen={onOpen}
          startCollapsed={group.key === "done" && hasOpenWork}
        />
      ))}
    </div>
  );
}

function WorkGroup({
  bucket,
  rows,
  currency,
  onOpen,
  startCollapsed = false,
}: {
  bucket: StatusBucket;
  rows: RecordRow[];
  currency: string;
  onOpen: (row: RecordRow) => void;
  startCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!startCollapsed);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, GROUP_LIMIT);
  const hidden = rows.length - shown.length;
  const meta = WORK_GROUPS[bucket];

  return (
    <section className="overflow-hidden rounded-[var(--r-card)] border border-line bg-glass shadow-xs backdrop-blur-xl">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0">
        <span className={cn("size-2 rounded-full", GROUP_DOT[bucket])} aria-hidden />
        <h2 className="text-[13px] font-semibold text-foreground">{meta.label}</h2>
        <span className="rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">
          {rows.length}
        </span>
        <span className="ml-auto text-[11.5px] text-faint">{meta.hint}</span>
      </header>

      {open && (
        <ul>
          {shown.map((row) => (
            <WorkRow
              key={row.id}
              row={row}
              bucket={bucket}
              currency={currency}
              onOpen={() => onOpen(row)}
            />
          ))}
        </ul>
      )}

      {(rows.length > GROUP_LIMIT || startCollapsed) && (
        <button
          type="button"
          className="w-full border-t border-line px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:bg-well hover:text-foreground"
          onClick={() => {
            if (!open) {
              setOpen(true);
              return;
            }
            setExpanded((on) => !on);
          }}
        >
          {!open
            ? `Show ${rows.length}`
            : expanded
              ? "Show less"
              : `Show all ${rows.length}${hidden > 0 ? ` · ${hidden} more` : ""}`}
        </button>
      )}
    </section>
  );
}

function WorkRow({
  row,
  bucket,
  currency,
  onOpen,
}: {
  row: RecordRow;
  bucket: StatusBucket;
  currency: string;
  onOpen: () => void;
}) {
  const guide = statusGuide(row.status);
  // "Needs you" says what to do; "waiting" says what is being waited on.
  // A finished record needs no instruction.
  const sentence =
    bucket === "yours" ? guide.next : bucket === "waiting" ? guide.meaning : undefined;

  const facts = [row.destination, row.date ? formatDay(row.date) : "", row.branch].filter(Boolean);
  const contactPhone = row.phone.replace(/[^\d+]/g, "");

  return (
    <li className="flex items-start gap-2 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-well/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-label={`Open ${row.id} — ${row.name || row.id}`}
      >
        <Avatar name={row.name || row.id} size={36} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <b className="truncate text-[14px] font-semibold text-foreground">
              {row.name || row.id}
            </b>
            <span className="text-[11px] tabular-nums text-faint">{row.id}</span>
          </span>

          {sentence && (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{sentence}</span>
          )}

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
            <Status value={row.status} />
            {facts.length > 0 && <span className="truncate">{facts.join(" · ")}</span>}
            {row.owner ? <span>· {row.owner}</span> : <span>· Nobody owns this yet</span>}
          </span>
        </span>

        <ChevronRight className="mt-1.5 size-4 shrink-0 text-faint" aria-hidden />
      </button>

      {/* The amount and the two ways to reach the person live outside the row
          button, so neither is a link inside a button. */}
      <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        {row.amount > 0 && (
          <b className="text-[13px] tabular-nums text-foreground">
            {money(row.amount, row.currency || currency)}
          </b>
        )}
        <span className="flex items-center gap-2">
          {row.email && (
            <a
              href={`mailto:${row.email}`}
              className="text-muted hover:text-foreground"
              title={`Email ${row.email}`}
            >
              <Mail className="size-3.5" />
            </a>
          )}
          {contactPhone && (
            <a
              href={`tel:${contactPhone}`}
              className="text-muted hover:text-foreground"
              title={`Call ${contactPhone}`}
            >
              <Phone className="size-3.5" />
            </a>
          )}
        </span>
      </span>
    </li>
  );
}
