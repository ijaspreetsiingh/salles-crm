/**
 * DistributionPanel — CMS pages, destinations, B2B portal stats.
 */
import { useState } from "react";
import { Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { fetchPages, createPage, deletePage, fetchDestinationsList, fetchB2BStats, createDestination } from "@/lib/api/module-extensions";

type Page = { id: string; title: string; slug: string; pageType: string; metaTitle: string | null; status: string };
type Destination = { name: string; country: string; status: string };

export function DistributionPanel() {
  const [tab, setTab] = useState<"pages" | "destinations" | "b2b">("pages");
  const [adding, setAdding] = useState(false);

  const { data: pages, reload: reloadP } = useApiQuery<Page[]>(() => fetchPages() as Promise<Page[]>, []);
  const { data: destinations, reload: reloadD } = useApiQuery<Destination[]>(() => fetchDestinationsList() as Promise<Destination[]>, []);
  const { data: b2bStats } = useApiQuery<{ confirmedBookings?: number; totalRevenue?: number }>(() => fetchB2BStats() as Promise<{ confirmedBookings?: number; totalRevenue?: number }>, []);

  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-xl border border-line bg-glass-2 p-1">
        {(["pages", "destinations", "b2b"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-muted hover:text-foreground"
            }`}>
            {t === "pages" ? "Pages" : t === "destinations" ? "Destinations" : "B2B Portal"}
          </button>
        ))}
      </div>

      {tab === "pages" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New page</Button>
            <span className="text-xs text-muted">{(pages ?? []).length} page{(pages ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewPageForm onSaved={() => { setAdding(false); reloadP(); }} />}
          <div className="grid gap-2">
            {(pages ?? []).map((p) => (
              <div key={p.id} className="glass-card flex items-center gap-3 p-3">
                <Globe className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{p.title}</strong>
                  <p className="text-xs text-muted">/{p.slug} · {p.pageType} · {p.metaTitle || "No meta title"}</p>
                </div>
                <span className={`status ${p.status === "Published" ? "status-success" : "status-warning"}`}><span /> {p.status}</span>
                <button aria-label="Delete page" className="text-muted hover:text-destructive"
                  onClick={async () => { try { await deletePage(p.id); toast.success("Page deleted"); reloadP(); } catch (err) { toast.error(errorMessage(err)); } }}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {(pages ?? []).length === 0 && !adding && (
              <div className="glass-card p-6 text-center"><Globe className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No pages yet. Create your first website page.</p></div>
            )}
          </div>
        </>
      )}

      {tab === "destinations" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Add destination</Button>
            <span className="text-xs text-muted">{(destinations ?? []).length} destination{(destinations ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewDestinationForm onSaved={() => { setAdding(false); reloadD(); }} />}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(destinations ?? []).map((d, i) => (
              <div key={i} className="glass-card p-3">
                <strong className="text-sm">{String(d["name"] ?? "")}</strong>
                <p className="text-xs text-muted">{String(d["country"] ?? "")}</p>
                <span className={`status ${d["status"] === "Published" ? "status-success" : "status-warning"}`}><span /> {String(d["status"] ?? "Draft")}</span>
              </div>
            ))}
            {(destinations ?? []).length === 0 && !adding && (
              <div className="glass-card col-span-full p-6 text-center"><Globe className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No destinations yet.</p></div>
            )}
          </div>
        </>
      )}

      {tab === "b2b" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Confirmed Bookings</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{b2bStats?.confirmedBookings ?? 0}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Total Revenue</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">₹{(b2bStats?.totalRevenue ?? 0).toLocaleString("en-IN")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPageForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ title: "", slug: "", pageType: "general", content: "", status: "Draft" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-2">
      <input placeholder="Page title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
      <input placeholder="slug (lowercase-with-hyphens)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s/g, "-") })} />
      <select value={form.pageType} onChange={(e) => setForm({ ...form, pageType: e.target.value })}>
        <option value="general">General</option><option value="destination">Destination</option><option value="package">Package</option><option value="landing">Landing page</option>
      </select>
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option>Draft</option><option>Published</option>
      </select>
      <textarea placeholder="Page content (HTML or plain text)" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="sm:col-span-2" />
      <div className="sm:col-span-2 flex gap-2">
        <Button size="sm" disabled={busy || !form.title || !form.slug} onClick={async () => {
          setBusy(true); try { await createPage(form); toast.success("Page created"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Save page</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}

function NewDestinationForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", country: "", description: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-3">
      <input placeholder="Destination name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <input placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
      <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="sm:col-span-3 flex gap-2">
        <Button size="sm" disabled={busy || !form.name} onClick={async () => {
          setBusy(true); try { await createDestination({ ...form, status: "Published" }); toast.success("Destination added"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}
