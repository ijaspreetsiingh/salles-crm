import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge } from "lucide-react";
import { toast } from "sonner";
import { Btn, Sheet } from "./ui";
import { money, type Module } from "@/lib/crm/catalog";
import { plainModule } from "@/lib/crm/language";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { fetchModuleDuplicates, type DuplicateGroupDto } from "@/lib/api/crm";

/* ==========================================================================
   Looks like the same thing twice.

   The pair is only shown when the two records really do share an email, a
   phone number or a name — and the card says which, so a person can tell a
   genuine duplicate from a family sharing one phone line. A human always
   chooses which one survives; nothing is merged on its own.
   ========================================================================== */

export function DuplicatesSheet({
  module,
  open,
  onClose,
  onDone,
}: {
  module: Module;
  open: boolean;
  onClose: () => void;
  /** Called after a merge so the list behind the sheet can be re-read. */
  onDone: () => void;
}) {
  const { status, mergeInto, settings } = useCRM();
  const { data, loading, error, reload } = useApiQuery(
    () => fetchModuleDuplicates(module.id),
    [module.id],
    open && status === "ready",
  );
  /** Which record survives, per group. Defaults to the oldest. */
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [merged, setMerged] = useState<string[]>([]);

  const groups = useMemo(
    () => (data?.groups ?? []).filter((group) => !merged.includes(group.key)),
    [data, merged],
  );

  useEffect(() => {
    if (!data) return;
    setKeep((previous) => {
      const next = { ...previous };
      for (const group of data.groups) {
        if (!next[group.key]) next[group.key] = group.records[0]?.reference ?? "";
      }
      return next;
    });
    setMerged([]);
  }, [data]);

  const survivorOf = (group: DuplicateGroupDto) =>
    keep[group.key] ?? group.records[0]?.reference ?? "";

  const doMerge = async (group: DuplicateGroupDto) => {
    const survivor = survivorOf(group);
    const others = group.records
      .map((record) => record.reference)
      .filter((reference) => reference !== survivor);
    if (!survivor || others.length === 0) return;

    setBusy(group.key);
    try {
      const result = await mergeInto(module.id, survivor, others);
      setMerged((previous) => [...previous, group.key]);
      onDone();
      if (result) {
        const moved = Object.entries(result.moved)
          .filter(([, count]) => count > 0)
          .map(([kind, count]) => `${count} ${kind}`)
          .join(", ");
        toast.success(
          `${others.join(", ")} merged into ${survivor}${moved ? ` — ${moved} moved across` : ""}`,
        );
      } else {
        toast.success(`${others.join(", ")} merged into ${survivor}`);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not merge those records"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Possible duplicates in ${plainModule(module)}`}
      description="Two records that share an email, a phone number or a name. Choose which one keeps the history — the other is closed, never erased."
      width={620}
    >
      {loading ? (
        <p className="text-[13px] text-muted">Looking through your records…</p>
      ) : error ? (
        <p className="text-[13px] text-tomato">{error}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-glass-2 px-4 py-6 text-center">
          <Check className="mx-auto size-5 text-pine" />
          <p className="mt-2 text-[13px] font-semibold text-foreground">
            Nothing looks duplicated here
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Checked {data?.scanned ?? 0} {module.noun}
            {(data?.scanned ?? 0) === 1 ? "" : "s"} — no two share an email, a phone number or a
            name.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl bg-well px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            Found {groups.length} group{groups.length === 1 ? "" : "s"} in {data?.scanned ?? 0}{" "}
            {module.noun}
            {(data?.scanned ?? 0) === 1 ? "" : "s"} checked. Merging keeps every document, task and
            conversation — they move to the record you keep.
          </p>

          {groups.map((group) => {
            const survivor = survivorOf(group);
            return (
              <section key={group.key} className="rounded-2xl border border-line bg-glass-2 p-3">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-semibold text-on-butter">
                    <AlertTriangle className="size-3" />
                    {group.reasons.join(" · ")}
                  </span>
                </header>

                <ul className="mt-2 space-y-1.5">
                  {group.records.map((record) => {
                    const chosen = record.reference === survivor;
                    const total = record.amount ? money(record.amount, record.currency) : "";
                    return (
                      <li key={record.reference}>
                        <label
                          className={
                            chosen
                              ? "flex cursor-pointer items-start gap-2.5 rounded-xl border border-pine bg-pine/8 px-3 py-2"
                              : "flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2 hover:bg-well"
                          }
                        >
                          <input
                            type="radio"
                            name={`keep-${group.key}`}
                            className="mt-1"
                            checked={chosen}
                            onChange={() =>
                              setKeep((previous) => ({
                                ...previous,
                                [group.key]: record.reference,
                              }))
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <b className="text-[13px] font-semibold text-foreground">
                                {record.name || record.reference}
                              </b>
                              <span className="text-[11px] tabular-nums text-faint">
                                {record.reference}
                              </span>
                              {chosen && (
                                <span className="text-[11px] font-semibold text-pine">
                                  keeping this one
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                              {[
                                record.email,
                                record.phone,
                                record.destination,
                                record.date,
                                record.owner,
                                record.branch,
                                record.status,
                                total,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "No contact details on this one"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-faint">
                    {group.records.map((r) => r.filled).join(" / ")} fields on record
                  </span>
                  <Btn
                    size="sm"
                    tone="primary"
                    icon={<GitMerge />}
                    loading={busy === group.key}
                    onClick={() => void doMerge(group)}
                  >
                    Merge {group.records.length - 1} into {survivor}
                  </Btn>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {groups.length > 0 && (
        <p className="mt-4 text-[11.5px] text-muted">
          {settings.currency} amounts are only copied across when the record you keep has none.
          Nothing already filled in is ever overwritten.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Btn size="sm" onClick={() => reload()}>
          Look again
        </Btn>
        <Btn size="sm" tone="primary" onClick={onClose}>
          Done
        </Btn>
      </div>
    </Sheet>
  );
}
