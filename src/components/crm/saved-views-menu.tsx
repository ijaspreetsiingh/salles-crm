/**
 * SavedViewsMenu — save and load filter/sort/column configurations per module.
 *
 * Lives in the workspace switchboard zone, next to the filter chips.
 * Personal views show a lock icon; shared views show a globe icon.
 * The default view loads automatically when the module opens.
 */
import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Globe2, Lock, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "./ui";
import {
  fetchSavedViews,
  createSavedView,
  deleteSavedView,
  updateSavedView,
  type SavedView,
} from "@/lib/api/saved-views";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";

type Props = {
  moduleId: string;
  currentFilters: Record<string, unknown>;
  currentSort: Record<string, unknown>;
  currentColumns: string[];
  currentLayout: "table" | "board" | "cards";
  onApply: (view: SavedView) => void;
};

export function SavedViewsMenu({
  moduleId,
  currentFilters,
  currentSort,
  currentColumns,
  currentLayout,
  onApply,
}: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);

  // Stable reference — moduleId is the only external dep, and it's captured
  // correctly. Without useCallback, the function recreates every render,
  // which puts it in useEffect's dep array and triggers an infinite loop
  // in React Strict Mode (double-invoke).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSavedViews(moduleId);
      setViews(data);
    } catch {
      // non-critical — views just won't show
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  // Now safe: `load` is stable per moduleId, so this only re-runs when
  // the module actually changes — no eslint-disable needed.
  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await createSavedView({
        moduleId,
        title: title.trim(),
        filters: currentFilters,
        sort: currentSort,
        columns: currentColumns,
        layout: currentLayout,
        isDefault,
        isShared,
      });
      setViews((prev) => [...prev, created]);
      setTitle("");
      setIsShared(false);
      setIsDefault(false);
      toast.success(`"${created.title}" saved`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save view"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (view: SavedView) => {
    try {
      await deleteSavedView(view.id);
      setViews((prev) => prev.filter((v) => v.id !== view.id));
      toast.success(`"${view.title}" deleted`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete view"));
    }
  };

  const handleSetDefault = async (view: SavedView) => {
    try {
      await updateSavedView(view.id, { isDefault: !view.isDefault });
      setViews((prev) =>
        prev.map((v) =>
          v.id === view.id ? { ...v, isDefault: !v.isDefault } : { ...v, isDefault: false },
        ),
      );
      toast.success(view.isDefault ? "Default cleared" : `"${view.title}" set as default`);
    } catch (err) {
      toast.error(errorMessage(err, "Could not update view"));
    }
  };

  return (
    <>
      <button
        type="button"
        className="switchboard__btn"
        title="Saved views"
        aria-label="Saved views"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <Bookmark className="size-4" />
        <span className="hidden sm:inline">Views</span>
        {views.filter((v) => v.isDefault).length > 0 && (
          <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Saved views"
        description="Save your current filter and sort as a named view. Load any saved view with one click."
        width={400}
        footer={null}
      >
        <div className="grid gap-4">
          {/* Save current filters */}
          <fieldset className="grid gap-2 rounded-xl border border-line p-4">
            <legend className="px-1 text-xs font-semibold text-muted">Save current view</legend>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              View name
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New leads this month"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
              />
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                />
                Share with team
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Set as my default
              </label>
            </div>
            <Button
              disabled={saving || !title.trim()}
              onClick={() => void handleSave()}
              size="sm"
            >
              <Plus className="size-3.5" /> Save view
            </Button>
          </fieldset>

          {/* Existing views */}
          {loading ? (
            <p className="text-xs text-muted">Loading views…</p>
          ) : views.length === 0 ? (
            <p className="text-xs text-muted">
              No saved views yet. Use the filters above and save your setup.
            </p>
          ) : (
            <ul className="grid gap-2" role="list">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex items-center gap-2 rounded-xl border border-line bg-glass-2 px-3 py-2"
                >
                  <span
                    className={`inline-flex shrink-0 ${view.isShared ? "text-primary" : "text-muted"}`}
                    title={view.isShared ? "Shared with team" : "Personal"}
                    aria-label={view.isShared ? "Shared with team" : "Personal view"}
                  >
                    {view.isShared ? <Globe2 className="size-3.5" /> : <Lock className="size-3.5" />}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      onApply(view);
                      setOpen(false);
                      toast.success(`"${view.title}" loaded`);
                    }}
                  >
                    <span className="block truncate text-sm font-semibold">{view.title}</span>
                    <span className="block text-[11px] text-muted">{view.layout}</span>
                  </button>
                  {view.isOwn && (
                    <>
                      <button
                        type="button"
                        title={view.isDefault ? "Clear default" : "Set as default"}
                        aria-label={view.isDefault ? "Clear default" : "Set as default"}
                        className={`shrink-0 ${view.isDefault ? "text-primary" : "text-muted hover:text-foreground"}`}
                        onClick={() => void handleSetDefault(view)}
                      >
                        {view.isDefault ? (
                          <BookmarkCheck className="size-4" />
                        ) : (
                          <Star className="size-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete "${view.title}"`}
                        className="shrink-0 text-muted hover:text-destructive"
                        onClick={() => void handleDelete(view)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
