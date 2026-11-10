import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/crm/catalog";
import { useCRM } from "@/lib/crm/store";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  emptyTrash,
  fetchTrash,
  purgeTrashed,
  restoreTrashed,
  type TrashedRecord,
} from "@/lib/api/trash";

/**
 * Recycle bin.
 *
 * A delete in this workspace has always been soft, but until this screen a
 * person who removed the wrong customer by mistake had no way back — the row
 * was still in the database and still invisible. Everything deleted shows up
 * here with its module, the person, and when it went, and can be put back with
 * one click. Permanent removal is deliberately two clicks.
 */

const when = (iso: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function RecycleBin() {
  const { settings } = useCRM();
  const currency = settings.currency || "INR";
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All modules");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApiQuery(
    () =>
      fetchTrash({
        ...(search ? { q: search } : {}),
        ...(moduleFilter === "All modules" ? {} : { module: moduleFilter }),
      }),
    [search, moduleFilter],
  );

  const items = data?.items ?? [];
  const moduleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) map.set(item.moduleId, item.moduleName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const restore = async (item: TrashedRecord) => {
    setBusy(true);
    try {
      await restoreTrashed(item.id);
      toast.success(`${item.reference} restored to ${item.moduleName}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not restore the record"));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const purge = async (item: TrashedRecord) => {
    setBusy(true);
    try {
      await purgeTrashed(item.id);
      toast.success(`${item.reference} deleted for good`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the record"));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const empty = async () => {
    setBusy(true);
    try {
      const result = await emptyTrash();
      toast.success(`${result.purged} record${result.purged === 1 ? "" : "s"} removed for good`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not empty the recycle bin"));
    } finally {
      setBusy(false);
      setConfirmEmpty(false);
    }
  };

  return (
    <div className="settings-workspace">
      <h2>Recycle bin</h2>
      <p>
        Anything deleted in the workspace stays here and can be put back. Nothing is removed from
        your records by accident — emptying the bin is the only permanent delete.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, reference, email or phone"
            className="h-9 w-full rounded-xl border border-rim bg-solid pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-9 rounded-xl border border-rim bg-solid px-3 text-sm"
        >
          <option>All modules</option>
          {moduleOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {confirmEmpty ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-tomato">Delete all {data?.total ?? 0} permanently?</span>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void empty()}>
              Yes, empty it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmEmpty(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          (data?.total ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={() => setConfirmEmpty(true)}>
              <Trash2 className="size-4" /> Empty bin
            </Button>
          )
        )}
      </div>

      {error && <p className="mt-3 text-sm text-tomato">{error}</p>}
      {loading && items.length === 0 && (
        <p className="mt-3 text-sm text-muted">Checking the bin…</p>
      )}

      {!loading && items.length === 0 && (
        <section className="glass-card mt-4 p-6 text-center">
          <RotateCcw className="mx-auto mb-3 size-6 text-muted" />
          <h3 className="text-base font-semibold">Nothing in the bin</h3>
          <p className="mt-1 text-sm text-muted">
            {search || moduleFilter !== "All modules"
              ? "No deleted records match this search."
              : "Every record your team has deleted will appear here, ready to restore."}
          </p>
        </section>
      )}

      {items.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="glass-card p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate text-sm">{item.name}</strong>
                    <span className="rounded-full border border-rim px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                      {item.moduleName}
                    </span>
                    <span className="text-xs text-faint">{item.reference}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[item.destination, item.owner, item.email || item.phone]
                      .filter(Boolean)
                      .join(" · ") ||
                      item.detail ||
                      "No further detail"}
                    {item.amount > 0 ? ` · ${money(item.amount, item.currency || currency)}` : ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
                    <AlertTriangle className="size-3" /> deleted {when(item.deletedAt)}
                    {item.status ? ` · was ${item.status}` : ""}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restore(item)}
                >
                  <RotateCcw className="size-4" /> Restore
                </Button>

                {confirming === item.id ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void purge(item)}
                    >
                      Delete for good
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Delete permanently"
                    onClick={() => setConfirming(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(data?.total ?? 0) > items.length && (
        <p className="mt-3 text-xs text-faint">
          Showing {items.length} of {data?.total} deleted records. Narrow the search to see more.
        </p>
      )}
    </div>
  );
}
