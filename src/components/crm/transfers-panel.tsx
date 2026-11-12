/**
 * TransfersPanel — vehicle fleet, driver roster, assignment.
 */
import { useState } from "react";
import { Car, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { fetchVehicles, fetchDrivers, createVehicle, createDriver, deleteVehicle, deleteDriver } from "@/lib/api/module-extensions";

type Vehicle = { id: string; registrationNo: string; type: string; capacity: number; fuel: string; active: boolean };
type Driver = { id: string; name: string; phone: string; licenseNo: string | null; languages: string[]; active: boolean };

export function TransfersPanel() {
  const [tab, setTab] = useState<"vehicles" | "drivers">("vehicles");
  const [adding, setAdding] = useState(false);
  const { data: vehicles, reload: reloadV } = useApiQuery<Vehicle[]>(() => fetchVehicles() as Promise<Vehicle[]>, []);
  const { data: drivers, reload: reloadD } = useApiQuery<Driver[]>(() => fetchDrivers() as Promise<Driver[]>, []);

  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-xl border border-line bg-glass-2 p-1">
        {(["vehicles", "drivers"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-muted hover:text-foreground"
            }`}>
            {t === "vehicles" ? "Vehicles" : "Drivers"}
          </button>
        ))}
      </div>

      {tab === "vehicles" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> Add vehicle
            </Button>
            <span className="text-xs text-muted">{(vehicles ?? []).length} vehicle{(vehicles ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewVehicleForm onSaved={() => { setAdding(false); reloadV(); }} />}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(vehicles ?? []).map((v) => (
              <div key={v.id} className="glass-card flex items-center gap-3 p-3">
                <Car className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{v.registrationNo}</strong>
                  <p className="text-xs text-muted">{v.type} · {v.capacity} seats · {v.fuel}</p>
                </div>
                <span className={`status ${v.active ? "status-success" : "status-warning"}`}><span /> {v.active ? "Active" : "Off"}</span>
                <button aria-label="Delete vehicle" className="text-muted hover:text-destructive"
                  onClick={async () => { try { await deleteVehicle(v.id); toast.success("Vehicle removed"); reloadV(); } catch (err) { toast.error(errorMessage(err)); } }}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {(vehicles ?? []).length === 0 && !adding && (
              <div className="glass-card col-span-full p-6 text-center">
                <Car className="mx-auto mb-2 size-6 text-muted" />
                <p className="text-sm text-muted">No vehicles yet. Add your fleet to assign transfers.</p>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "drivers" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> Add driver
            </Button>
            <span className="text-xs text-muted">{(drivers ?? []).length} driver{(drivers ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewDriverForm onSaved={() => { setAdding(false); reloadD(); }} />}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(drivers ?? []).map((d) => (
              <div key={d.id} className="glass-card flex items-center gap-3 p-3">
                <User className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{d.name}</strong>
                  <p className="text-xs text-muted">{d.phone} {d.licenseNo ? `· ${d.licenseNo}` : ""}</p>
                  {d.languages?.length > 0 && <p className="text-[11px] text-faint">{d.languages.join(", ")}</p>}
                </div>
                <span className={`status ${d.active ? "status-success" : "status-warning"}`}><span /> {d.active ? "Active" : "Off"}</span>
                <button aria-label="Delete driver" className="text-muted hover:text-destructive"
                  onClick={async () => { try { await deleteDriver(d.id); toast.success("Driver removed"); reloadD(); } catch (err) { toast.error(errorMessage(err)); } }}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {(drivers ?? []).length === 0 && !adding && (
              <div className="glass-card col-span-full p-6 text-center">
                <User className="mx-auto mb-2 size-6 text-muted" />
                <p className="text-sm text-muted">No drivers yet. Add your roster to assign transfers.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NewVehicleForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ registrationNo: "", type: "Sedan", capacity: 4, fuel: "Petrol" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input placeholder="Registration no" value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value.toUpperCase() })} autoFocus />
      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
        <option>Sedan</option><option>SUV</option><option>Minivan</option><option>Coach</option><option>Bus</option><option>Tempo traveller</option><option>Luxury</option>
      </select>
      <input type="number" placeholder="Seats" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
      <select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
        <option>Petrol</option><option>Diesel</option><option>CNG</option><option>Electric</option>
      </select>
      <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
        <Button size="sm" disabled={busy || !form.registrationNo} onClick={async () => {
          setBusy(true); try { await createVehicle(form); toast.success("Vehicle added"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}

function NewDriverForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", licenseNo: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-3">
      <input placeholder="Driver name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <input placeholder="License no (optional)" value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} />
      <div className="sm:col-span-3 flex gap-2">
        <Button size="sm" disabled={busy || !form.name} onClick={async () => {
          setBusy(true); try { await createDriver({ ...form, languages: [], active: true }); toast.success("Driver added"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}
