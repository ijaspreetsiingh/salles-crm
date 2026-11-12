import { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Module } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";

/* ==========================================================================
   Bulk actions.

   Ticking twenty rows and changing them one by one is the single most common
   way an afternoon disappears, so this does it in one call — and then says
   what actually happened, including when the number is smaller than the
   selection (a branch-scoped role can only change its own branch's records).
   ========================================================================== */

/** Picking this hands the records back to nobody, so anyone can claim them. */
const UNCLAIMED = "The unclaimed queue";

function StripMenu({
  label,
  icon,
  options,
  emptyHint,
  onPick,
}: {
  label: string;
  icon?: React.ReactNode;
  options: string[];
  emptyHint?: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-on-ink/15 px-3 text-[12.5px] font-semibold text-on-ink transition-colors hover:bg-on-ink/25"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div className="filter__menu left-0 top-full z-50" role="listbox">
          <div className="filter__label">{label}</div>
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-[12px] text-muted">{emptyHint ?? "Nothing to pick"}</p>
          ) : (
            options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={false}
                className="filter__option"
                onClick={() => {
                  setOpen(false);
                  onPick(option);
                }}
              >
                {option}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function BulkBar({
  module,
  selected,
  owners,
  statuses,
  onClear,
}: {
  module: Module;
  selected: string[];
  owners: string[];
  statuses: string[];
  onClear: () => void;
}) {
  const { bulkUpdate } = useCRM();
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const count = selected.length;
  const noun = count === 1 ? module.noun : `${module.noun}s`;

  const apply = async (action: "assign" | "status" | "delete", value?: string): Promise<void> => {
    setBusy(true);
    try {
      const { affected, skipped = [] } = await bulkUpdate(module.id, selected, action, value);
      const verb =
        action === "delete"
          ? "deleted"
          : action === "status"
            ? `moved to ${value}`
            : `assigned to ${value || "the unclaimed queue"}`;
      if (skipped.length) {
        // Say why a ticked row was left alone — "the departure is full" is a
        // different thing from "it belongs to another branch".
        toast.warning(
          `${affected} of ${count} ${noun} ${verb}. Left alone: ${skipped
            .slice(0, 3)
            .map((row) => `${row.reference} (${row.reason})`)
            .join("; ")}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ""}`,
        );
      } else if (affected < count) {
        // Say it plainly: silently editing fewer rows than were ticked is how
        // people lose trust in a bulk button.
        toast.warning(`${affected} of ${count} ${noun} ${verb} — the rest are outside your branch`);
      } else {
        toast.success(`${affected} ${noun} ${verb}`);
      }
      onClear();
    } catch (error) {
      toast.error(errorMessage(error, `Could not update those ${noun}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StripMenu
        label="Assign to"
        icon={<UserCheck className="size-3.5" />}
        options={[...owners, UNCLAIMED]}
        emptyHint="Invite a teammate first"
        onPick={(value) => void apply("assign", value === UNCLAIMED ? "" : value)}
      />
      <StripMenu
        label="Set status"
        options={statuses}
        emptyHint="This module has no statuses"
        onPick={(value) => void apply("status", value)}
      />
      {confirmingDelete ? (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-tomato px-3 text-[12.5px] font-semibold text-on-tomato transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={() => {
              setConfirmingDelete(false);
              void apply("delete");
            }}
          >
            <Trash2 className="size-3.5" />
            Yes, delete {count} {noun}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-full bg-on-ink/15 px-3 text-[12.5px] font-semibold text-on-ink transition-colors hover:bg-on-ink/25"
            onClick={() => setConfirmingDelete(false)}
          >
            Keep them
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full bg-on-ink/15 px-3 text-[12.5px] font-semibold text-on-ink transition-colors hover:bg-on-ink/25",
            busy && "opacity-60",
          )}
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      )}
    </div>
  );
}
