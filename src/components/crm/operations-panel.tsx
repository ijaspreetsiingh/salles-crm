/**
 * OperationsPanel — manifests, incidents, deadlines.
 */
import { useState } from "react";
import { AlertTriangle, CalendarClock, FileText, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { fetchIncidents, fetchDeadlines, createIncident, updateIncident, type Incident, type Deadline } from "@/lib/api/module-extensions";

export function OperationsPanel() {
  const [tab, setTab] = useState<"deadlines" | "incidents">("deadlines");
  const [adding, setAdding] = useState(false);

  const { data: deadlines } = useApiQuery<{ deadlines: Deadline[] }>(() => fetchDeadlines(30), []);
  const { data: incidents, reload: reloadInc } = useApiQuery<Incident[]>(() => fetchIncidents(), []);

  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-xl border border-line bg-glass-2 p-1">
        {(["deadlines", "incidents"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-muted hover:text-foreground"
            }`}>
            {t === "deadlines" ? "Deadlines" : "Incidents"}
          </button>
        ))}
      </div>

      {tab === "deadlines" && (
        <div className="grid gap-2">
          {(deadlines?.deadlines ?? []).length === 0 ? (
            <div className="glass-card p-6 text-center">
              <CalendarClock className="mx-auto mb-2 size-6 text-muted" />
              <p className="text-sm text-muted">No deadlines in the next 30 days.</p>
            </div>
          ) : (
            (deadlines?.deadlines ?? []).map((d) => (
              <div key={`${d.type}-${d.id}`} className="glass-card flex items-center gap-3 p-3">
                <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${
                  d.urgency === "High" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                }`}>
                  {d.daysLeft}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{d.label}</strong>
                  <p className="text-xs text-muted capitalize">{d.type} · {d.date}</p>
                </div>
                <span className={`text-xs font-semibold ${d.daysLeft <= 1 ? "text-red-600" : d.daysLeft <= 3 ? "text-amber-600" : "text-muted"}`}>
                  {d.daysLeft === 0 ? "Today" : d.daysLeft === 1 ? "1 day left" : `${d.daysLeft} days left`}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "incidents" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Log incident</Button>
            <span className="text-xs text-muted">{(incidents ?? []).length} incident{(incidents ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewIncidentForm onSaved={() => { setAdding(false); reloadInc(); }} />}
          <div className="grid gap-2">
            {(incidents ?? []).map((inc) => (
              <IncidentCard key={inc.id} incident={inc} onUpdated={() => reloadInc()} />
            ))}
            {(incidents ?? []).length === 0 && !adding && (
              <div className="glass-card p-6 text-center">
                <AlertTriangle className="mx-auto mb-2 size-6 text-muted" />
                <p className="text-sm text-muted">No incidents logged. Everything running smoothly.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IncidentCard({ incident, onUpdated }: { incident: Incident; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const severityColor = incident.severity === "Critical" ? "text-red-600 bg-red-50" :
    incident.severity === "High" ? "text-orange-600 bg-orange-50" :
    incident.severity === "Medium" ? "text-amber-600 bg-amber-50" : "text-muted bg-glass-2";

  const resolve = async () => {
    setBusy(true);
    try {
      await updateIncident(incident.id, { status: "Resolved", resolution: "Marked resolved from operations panel" });
      toast.success("Incident resolved");
      onUpdated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <strong className="text-sm">{incident.reference} · {incident.title}</strong>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${severityColor}`}>{incident.severity}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{incident.description}</p>
          {incident.resolution && <p className="mt-1 text-xs text-green-600">✓ {incident.resolution}</p>}
        </div>
        <span className={`status ${incident.status === "Resolved" || incident.status === "Closed" ? "status-success" : "status-warning"}`}>
          <span /> {incident.status}
        </span>
        {incident.status !== "Resolved" && incident.status !== "Closed" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve()}>Resolve</Button>
        )}
      </div>
    </div>
  );
}

function NewIncidentForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", severity: "Medium", category: "Other" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4">
      <input placeholder="Incident title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
      <textarea placeholder="What happened?" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
          <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
        </select>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option>Other</option><option>Medical</option><option>Safety</option><option>Service failure</option><option>Weather</option><option>Delay</option><option>Complaint</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !form.title} onClick={async () => {
          setBusy(true); try { await createIncident({ ...form, affectedPassengers: [] }); toast.success("Incident logged"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Log incident</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}
