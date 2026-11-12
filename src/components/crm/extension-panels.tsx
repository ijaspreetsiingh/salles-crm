/**
 * Extension panels for all remaining placeholder tabs (Tasks 3-12).
 *
 * Each export is a self-contained panel that renders in the workspace when
 * the user navigates to the corresponding module tab.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle, Calendar, FileText, Plus, Search, Tag, Ticket, Trash2,
  TrendingUp, Upload, User, Wallet, CheckCircle2, XCircle, Loader2, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { money } from "@/lib/crm/catalog";
import * as ext from "@/lib/api/module-extensions";

// ════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS — Segments, Coupons, Attribution
// ════════════════════════════════════════════════════════════════════════════

export function CampaignSegments() {
  const { data, reload } = useApiQuery(() => ext.fetchSegments(), []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New segment</Button>
        <span className="text-xs text-muted">{list.length} segment{list.length === 1 ? "" : "s"}</span>
      </div>
      {adding && (
        <div className="glass-card flex gap-2 p-3">
          <input placeholder="Segment name (e.g. Repeat customers)" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="flex-1" />
          <Button size="sm" disabled={!name.trim()} onClick={async () => {
            try { await ext.createSegment({ name, moduleId: "leads", rules: {} }); toast.success("Segment created"); setAdding(false); setName(""); reload(); } catch (e2) { toast.error(errorMessage(e2)); }
          }}>Save</Button>
        </div>
      )}
      {list.length === 0 && !adding ? (
        <div className="glass-card p-6 text-center"><Tag className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No segments yet. Create one to group your audience.</p></div>
      ) : (
        <div className="grid gap-2">{list.map((s) => (
          <div key={s["id"] as string} className="glass-card flex items-center gap-3 p-3">
            <Tag className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{s["name"] as string}</strong></div>
            <button aria-label="Delete" className="text-muted hover:text-destructive" onClick={async () => { try { await ext.deleteSegment(s["id"] as string); toast.success("Deleted"); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}><Trash2 className="size-3.5" /></button>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function CampaignCoupons() {
  const { data, reload } = useApiQuery(() => ext.fetchCoupons(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code: "", discountType: "percentage", discountValue: 10 });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New coupon</Button>
        <span className="text-xs text-muted">{list.length} coupon{list.length === 1 ? "" : "s"}</span>
      </div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-3">
          <input placeholder="Coupon code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} autoFocus />
          <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>
          <input type="number" placeholder={form.discountType === "percentage" ? "10 (%)" : "500 (₹)"} value={form.discountValue || ""} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
          <div className="sm:col-span-3 flex gap-2"><Button size="sm" disabled={!form.code} onClick={async () => { try { await ext.createCoupon(form); toast.success("Coupon created"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? (
        <div className="glass-card p-6 text-center"><Ticket className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No coupons yet.</p></div>
      ) : (
        <div className="grid gap-2">{list.map((c) => (
          <div key={c["id"] as string} className="glass-card flex items-center gap-3 p-3">
            <Ticket className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{c["code"] as string ?? c["reference"] as string}</strong><p className="text-xs text-muted">{c["discountType"] === "percentage" ? `${c["discountValue"]}% off` : `${money(Number(c["discountValue"] ?? 0))} off`}</p></div>
            <span className={`status ${c["status"] === "Active" ? "status-success" : "status-warning"}`}><span /> {c["status"] as string}</span>
            <button aria-label="Delete" className="text-muted hover:text-destructive" onClick={async () => { try { await ext.deleteCoupon(c["id"] as string); toast.success("Deleted"); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}><Trash2 className="size-3.5" /></button>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function CampaignAttribution() {
  const { data } = useApiQuery(() => ext.fetchAttribution(), []);
  const attr = data as { bookingsBySource?: Array<{ source: string; bookings: number; revenue: number }>; leadsBySource?: Array<{ source: string; leads: number }> } | null;
  return (
    <div className="grid gap-4">
      <div className="glass-card p-4"><h3 className="text-sm font-semibold mb-2">Bookings by Source</h3>
        {(attr?.bookingsBySource ?? []).length === 0 ? <p className="text-xs text-muted">No bookings yet.</p> : (
          <div className="grid gap-2">{(attr?.bookingsBySource ?? []).map((s) => (
            <div key={s.source} className="flex items-center gap-3 text-sm"><span className="w-32 truncate font-medium">{s.source}</span><span className="text-muted">{s.bookings} bookings</span><span className="font-semibold">{money(s.revenue)}</span></div>
          ))}</div>
        )}
      </div>
      <div className="glass-card p-4"><h3 className="text-sm font-semibold mb-2">Leads by Source</h3>
        {(attr?.leadsBySource ?? []).length === 0 ? <p className="text-xs text-muted">No leads yet.</p> : (
          <div className="grid gap-2">{(attr?.leadsBySource ?? []).map((s) => (
            <div key={s.source} className="flex items-center gap-3 text-sm"><span className="w-32 truncate font-medium">{s.source}</span><span className="text-muted">{s.leads} leads</span></div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FLIGHTS — Ancillaries, Reissues & Refunds
// ════════════════════════════════════════════════════════════════════════════

export function FlightAncillaries({ recordId }: { recordId?: string }) {
  const { data, reload } = useApiQuery(() => recordId ? ext.fetchAncillaries(recordId) : Promise.resolve([]), [recordId]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: "Extra baggage", description: "", amount: 0 });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!recordId} onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Add ancillary</Button>
      </div>
      {adding && recordId && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-3">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Extra baggage</option><option>Meal preference</option><option>Seat selection</option><option>Wheelchair</option><option>Infant bassinet</option><option>Lounge access</option><option>Travel insurance</option></select>
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input type="number" placeholder="Amount" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          <div className="sm:col-span-3 flex gap-2"><Button size="sm" onClick={async () => { try { await ext.createAncillary({ recordId, ...form }); toast.success("Added"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <p className="text-sm text-muted">No ancillaries for this flight.</p> : (
        <div className="grid gap-2">{list.map((a) => (<div key={a["id"] as string} className="glass-card flex items-center gap-3 p-3"><span className="text-sm font-medium">{a["type"] as string}</span><span className="text-xs text-muted">{a["status"] as string}</span>{Number(a["amount"] ?? 0) > 0 && <span className="text-sm">{money(Number(a["amount"]))}</span>}</div>))}</div>
      )}
    </div>
  );
}

export function FlightReissuesRefunds() {
  const { data } = useApiQuery(() => Promise.resolve([]), []); // Uses workspace records
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Reissue and refund requests are created from a flight record's action menu. Approved requests show here.</p>
      <div className="glass-card p-4"><p className="text-xs text-muted">Use the Flights list and open a record to raise a reissue or refund. The approval chain routes through operations and finance.</p></div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PACKAGES — Fixed Departures, Seasonal Rates
// ════════════════════════════════════════════════════════════════════════════

export function PackageDepartures() {
  const { data, reload } = useApiQuery(() => ext.fetchDepartures(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ packageId: "", departureDate: "", capacity: 20, price: 0 });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New departure</Button><span className="text-xs text-muted">{list.length} departure{list.length === 1 ? "" : "s"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-4">
          <input placeholder="Package ID" value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })} autoFocus />
          <input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
          <input type="number" placeholder="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          <input type="number" placeholder="Price (₹)" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          <div className="sm:col-span-4 flex gap-2"><Button size="sm" disabled={!form.packageId || !form.departureDate} onClick={async () => { try { await ext.createDeparture(form); toast.success("Departure created"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><Calendar className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No departures scheduled.</p></div> : (
        <div className="grid gap-2">{list.map((d) => (
          <div key={d["id"] as string} className="glass-card flex items-center gap-3 p-3">
            <Calendar className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{d["packageName"] as string ?? d["reference"] as string}</strong><p className="text-xs text-muted">{d["departureDate"] as string} · {d["booked"] as number ?? 0}/{d["capacity"] as number ?? 0} booked · {Number(d["available"] ?? 0)} available</p></div>
            <span className={`status ${d["status"] === "Open" ? "status-success" : d["status"] === "Closed" ? "status-danger" : "status-warning"}`}><span /> {d["status"] as string}</span>
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function PackageSeasonalRates() {
  const { data, reload } = useApiQuery(() => ext.fetchSeasonalRates(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ packageId: "", seasonName: "", validFrom: "", validTo: "", price: 0, markup: 0 });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New seasonal rate</Button><span className="text-xs text-muted">{list.length} rate{list.length === 1 ? "" : "s"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-3">
          <input placeholder="Package ID" value={form.packageId} onChange={(e) => setForm({ ...form, packageId: e.target.value })} autoFocus />
          <input placeholder="Season name (e.g. Summer 2026)" value={form.seasonName} onChange={(e) => setForm({ ...form, seasonName: e.target.value })} />
          <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          <input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          <input type="number" placeholder="Price (₹)" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          <input type="number" placeholder="Markup %" value={form.markup || ""} onChange={(e) => setForm({ ...form, markup: Number(e.target.value) })} />
          <div className="sm:col-span-3 flex gap-2"><Button size="sm" disabled={!form.packageId || !form.seasonName} onClick={async () => { try { await ext.createSeasonalRate(form); toast.success("Seasonal rate created"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><TrendingUp className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No seasonal rates yet.</p></div> : (
        <div className="grid gap-2">{list.map((r) => (<div key={r["id"] as string} className="glass-card flex items-center gap-3 p-3"><TrendingUp className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{r["seasonName"] as string ?? r["name"] as string}</strong><p className="text-xs text-muted">{r["validFrom"] as string} to {r["validTo"] as string} · {money(Number(r["price"] ?? r["amount"] ?? 0))} · {r["markup"] as number ?? 0}% markup</p></div></div>))}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VISA — Insurance, Appointments, Advisories
// ════════════════════════════════════════════════════════════════════════════

export function VisaInsurance() {
  const { data, reload } = useApiQuery(() => ext.fetchInsurance(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ insurer: "", coverageType: "Comprehensive", premium: 0, validFrom: "", validTo: "" });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Add insurance</Button><span className="text-xs text-muted">{list.length} polic{list.length === 1 ? "y" : "ies"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-2">
          <input placeholder="Insurer name" value={form.insurer} onChange={(e) => setForm({ ...form, insurer: e.target.value })} autoFocus />
          <select value={form.coverageType} onChange={(e) => setForm({ ...form, coverageType: e.target.value })}><option>Medical only</option><option>Comprehensive</option><option>Trip cancellation</option><option>Baggage</option><option>Multi-trip</option></select>
          <input type="number" placeholder="Premium (₹)" value={form.premium || ""} onChange={(e) => setForm({ ...form, premium: Number(e.target.value) })} />
          <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          <input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          <div className="sm:col-span-2 flex gap-2"><Button size="sm" disabled={!form.insurer} onClick={async () => { try { await ext.createInsurance(form); toast.success("Insurance added"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><FileText className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No insurance policies yet.</p></div> : (
        <div className="grid gap-2">{list.map((i) => (<div key={i["id"] as string} className="glass-card flex items-center gap-3 p-3"><FileText className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{i["insurer"] as string ?? i["name"] as string}</strong><p className="text-xs text-muted">{i["coverageType"] as string} · {money(Number(i["premium"] ?? i["amount"] ?? 0))}</p></div><span className="status status-success"><span /> {i["status"] as string}</span></div>))}</div>
      )}
    </div>
  );
}

export function VisaAppointments() {
  const { data, reload } = useApiQuery(() => ext.fetchAppointments(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ embassy: "", appointmentDate: "", appointmentTime: "", purpose: "Visa interview" });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New appointment</Button><span className="text-xs text-muted">{list.length} appointment{list.length === 1 ? "" : "s"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-2">
          <input placeholder="Embassy / VFS centre" value={form.embassy} onChange={(e) => setForm({ ...form, embassy: e.target.value })} autoFocus />
          <input type="date" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} />
          <input type="time" value={form.appointmentTime} onChange={(e) => setForm({ ...form, appointmentTime: e.target.value })} />
          <input placeholder="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          <div className="sm:col-span-2 flex gap-2"><Button size="sm" disabled={!form.embassy || !form.appointmentDate} onClick={async () => { try { await ext.createAppointment(form); toast.success("Appointment booked"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><Calendar className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No appointments scheduled.</p></div> : (
        <div className="grid gap-2">{list.map((a) => (<div key={a["id"] as string} className="glass-card flex items-center gap-3 p-3"><Calendar className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{a["embassy"] as string ?? a["name"] as string}</strong><p className="text-xs text-muted">{a["date"] as string} {a["appointmentTime"] as string ?? ""} · {a["purpose"] as string}</p></div><span className={`status ${a["status"] === "Completed" ? "status-success" : a["status"] === "Cancelled" ? "status-danger" : "status-warning"}`}><span /> {a["status"] as string}</span></div>))}</div>
      )}
    </div>
  );
}

export function VisaAdvisories() {
  const { data, reload } = useApiQuery(() => ext.fetchAdvisories(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ country: "", title: "", advisory: "", severity: "Info" });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New advisory</Button><span className="text-xs text-muted">{list.length} advisory{list.length === 1 ? "" : "ies"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3">
          <div className="grid sm:grid-cols-2 gap-2"><input placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} autoFocus /><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option>Info</option><option>Warning</option><option>Critical</option></select></div>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="Advisory content" rows={3} value={form.advisory} onChange={(e) => setForm({ ...form, advisory: e.target.value })} />
          <div className="flex gap-2"><Button size="sm" disabled={!form.country || !form.title} onClick={async () => { try { await ext.createAdvisory(form); toast.success("Advisory published"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Publish</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><AlertTriangle className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No travel advisories published.</p></div> : (
        <div className="grid gap-2">{list.map((a) => {
          const sev = a["severity"] as string; const sevColor = sev === "Critical" ? "text-red-600 bg-red-50" : sev === "Warning" ? "text-amber-600 bg-amber-50" : "text-muted bg-glass-2";
          return (<div key={a["id"] as string} className="glass-card p-3"><div className="flex items-center gap-2"><strong className="text-sm">{a["title"] as string ?? a["name"] as string}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevColor}`}>{sev}</span></div><p className="text-xs text-muted mt-1">{a["advisory"] as string ?? a["notes"] as string}</p><p className="text-[11px] text-faint mt-1">{a["country"] as string ?? a["destination"] as string}</p></div>);
        })}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUPPORT — Refunds, Knowledge Base, Feedback
// ════════════════════════════════════════════════════════════════════════════

export function SupportRefunds() {
  const { data, reload } = useApiQuery(() => ext.fetchRefunds(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ customerName: "", reason: "", refundAmount: 0 });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New refund request</Button><span className="text-xs text-muted">{list.length} request{list.length === 1 ? "" : "s"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-3">
          <input placeholder="Customer name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} autoFocus />
          <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <input type="number" placeholder="Amount (₹)" value={form.refundAmount || ""} onChange={(e) => setForm({ ...form, refundAmount: Number(e.target.value) })} />
          <div className="sm:col-span-3 flex gap-2"><Button size="sm" disabled={!form.customerName || !form.reason} onClick={async () => { try { await ext.createRefund(form); toast.success("Refund request created"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Submit</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><Wallet className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No refund requests.</p></div> : (
        <div className="grid gap-2">{list.map((r) => (
          <div key={r["id"] as string} className="glass-card p-3">
            <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><strong className="text-sm">{r["reference"] as string} · {r["customerName"] as string ?? r["name"] as string}</strong><p className="text-xs text-muted">{r["reason"] as string ?? r["notes"] as string} · {money(Number(r["amount"] ?? 0))}</p></div></div>
            <span className={`status ${r["status"] === "Processed" ? "status-success" : r["status"] === "Rejected" ? "status-danger" : "status-warning"}`}><span /> {r["status"] as string}</span>
            {r["status"] !== "Processed" && r["status"] !== "Rejected" && (
              <div className="flex gap-1"><Button size="sm" variant="outline" onClick={async () => { try { await ext.decideRefund(r["id"] as string, "approve"); toast.success("Approved"); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}><CheckCircle2 className="size-3.5" /></Button><Button size="sm" variant="ghost" onClick={async () => { try { await ext.decideRefund(r["id"] as string, "reject"); toast.success("Rejected"); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}><XCircle className="size-3.5" /></Button></div>
            )}
          </div>
        ))}</div>
      )}
    </div>
  );
}

export function SupportKB() {
  const { data, reload } = useApiQuery(() => ext.fetchKB(), []);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", category: "General", content: "" });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New article</Button><span className="text-xs text-muted">{list.length} article{list.length === 1 ? "" : "s"}</span></div>
      {adding && (
        <div className="glass-card grid gap-2 p-3">
          <div className="grid sm:grid-cols-2 gap-2"><input placeholder="Article title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /><input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <textarea placeholder="Article content" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <div className="flex gap-2"><Button size="sm" disabled={!form.title || !form.content} onClick={async () => { try { await ext.createKB(form); toast.success("Article published"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Publish</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><FileText className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No knowledge base articles yet.</p></div> : (
        <div className="grid gap-2">{list.map((a) => (<div key={a["id"] as string} className="glass-card p-3"><strong className="text-sm">{a["title"] as string ?? a["name"] as string}</strong><p className="text-xs text-muted mt-0.5">{a["category"] as string ?? a["detail"] as string}</p><p className="text-xs text-muted mt-1 line-clamp-2">{(a["content"] as string ?? a["notes"] as string ?? "").slice(0, 150)}…</p></div>))}</div>
      )}
    </div>
  );
}

export function SupportFeedback() {
  const { data } = useApiQuery(() => ext.fetchFeedback(), []);
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      {list.length === 0 ? <div className="glass-card p-6 text-center"><p className="text-sm text-muted">No feedback received yet.</p></div> : (
        <div className="grid gap-2">{list.map((f) => {
          const rating = Number(f["rating"] ?? 0); const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
          return (<div key={f["id"] as string} className="glass-card p-3"><div className="flex items-center gap-2"><strong className="text-sm">{f["customerName"] as string ?? f["name"] as string}</strong><span className="text-amber-400">{stars}</span></div><p className="text-xs text-muted mt-1">{f["category"] as string}</p>{(f["comments"] as string || f["notes"] as string) && <p className="text-sm mt-1">{f["comments"] as string ?? f["notes"] as string}</p>}</div>);
        })}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AGENTS — KYC, Credit, Sub-agents (basic views)
// ════════════════════════════════════════════════════════════════════════════

export function AgentKYC({ agentId }: { agentId?: string }) {
  const { data, reload } = useApiQuery(() => agentId ? ext.fetchKYC(agentId) : Promise.resolve([]), [agentId]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ documentType: "PAN card", documentNumber: "" });
  const list = (data ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><Button size="sm" disabled={!agentId} onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Upload KYC document</Button><span className="text-xs text-muted">{list.length} document{list.length === 1 ? "" : "s"}</span></div>
      {adding && agentId && (
        <div className="glass-card grid gap-2 p-3 sm:grid-cols-2">
          <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}><option>PAN card</option><option>GST certificate</option><option>Business registration</option><option>ID proof</option><option>Address proof</option><option>Bank statement</option><option>Other</option></select>
          <input placeholder="Document number" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
          <div className="sm:col-span-2 flex gap-2"><Button size="sm" onClick={async () => { try { await ext.createKYC({ agentId, ...form }); toast.success("KYC document submitted"); setAdding(false); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Submit</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </div>
      )}
      {list.length === 0 && !adding ? <div className="glass-card p-6 text-center"><FileText className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No KYC documents uploaded.</p></div> : (
        <div className="grid gap-2">{list.map((d) => (<div key={d["id"] as string} className="glass-card flex items-center gap-3 p-3"><FileText className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm">{d["documentType"] as string}</strong>{typeof d["documentNumber"] === "string" && <p className="text-xs text-muted">{d["documentNumber"]}</p>}</div><span className={`status ${d["status"] === "Verified" ? "status-success" : d["status"] === "Rejected" ? "status-danger" : "status-warning"}`}><span /> {d["status"] as string}</span>{d["status"] === "Submitted" && <Button size="sm" variant="outline" onClick={async () => { try { await ext.updateKYC(d["id"] as string, { status: "Verified" }); toast.success("Verified"); reload(); } catch (e2) { toast.error(errorMessage(e2)); } }}>Verify</Button>}</div>))}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FINANCE — Ledger, Receivables Aging
// ════════════════════════════════════════════════════════════════════════════

export function FinanceLedger() {
  const { data } = useApiQuery(() => ext.fetchLedger({ take: 50 }), []);
  const ledger = data as { rows?: Array<{ date: string; account: string; debit: number; credit: number; narration: string; reference: string }>; summary?: { totalDebit: number; totalCredit: number; balanced: boolean } } | null;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3"><p className="text-xs text-muted">Total Debit</p><p className="text-lg font-bold">{money(ledger?.summary?.totalDebit ?? 0)}</p></div>
        <div className="glass-card p-3"><p className="text-xs text-muted">Total Credit</p><p className="text-lg font-bold">{money(ledger?.summary?.totalCredit ?? 0)}</p></div>
        <div className="glass-card p-3"><p className="text-xs text-muted">Balanced</p><p className={`text-lg font-bold ${(ledger?.summary?.balanced ?? false) ? "text-green-600" : "text-red-600"}`}>{(ledger?.summary?.balanced ?? false) ? "✓ Yes" : "✗ No"}</p></div>
      </div>
      {(ledger?.rows ?? []).length === 0 ? <div className="glass-card p-6 text-center"><p className="text-sm text-muted">No ledger entries yet.</p></div> : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm"><thead className="border-b border-line bg-glass-2 text-left text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Debit</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Narration</th></tr></thead>
            <tbody>{(ledger?.rows ?? []).map((r, i) => (<tr key={i} className="border-b border-line last:border-0"><td className="px-3 py-2 text-xs">{r.date}</td><td className="px-3 py-2 text-xs font-medium">{r.account}</td><td className="px-3 py-2 text-xs">{r.debit > 0 ? money(r.debit) : "—"}</td><td className="px-3 py-2 text-xs">{r.credit > 0 ? money(r.credit) : "—"}</td><td className="px-3 py-2 text-xs text-muted">{r.narration}</td></tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinanceReceivablesAging() {
  const { data } = useApiQuery(() => ext.fetchReceivablesAging(), []);
  const aging = data as { buckets?: Array<{ label: string; count: number; amount: number }>; totalOutstanding?: number } | null;
  return (
    <div className="grid gap-3">
      <div className="glass-card p-4"><p className="text-xs text-muted">Total Outstanding</p><p className="text-2xl font-bold">{money(aging?.totalOutstanding ?? 0)}</p></div>
      <div className="grid gap-2">{(aging?.buckets ?? []).map((b) => (
        <div key={b.label} className={`glass-card flex items-center gap-3 p-3 ${b.label.includes("90+") ? "border-red-200" : b.label.includes("60") ? "border-orange-200" : ""}`}>
          <div className="min-w-0 flex-1"><strong className="text-sm">{b.label}</strong><p className="text-xs text-muted">{b.count} invoice{b.count === 1 ? "" : "s"}</p></div>
          <span className="text-lg font-bold">{money(b.amount)}</span>
        </div>
      ))}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AI ASSISTANT — Sales Intelligence + Operations Insights
// ════════════════════════════════════════════════════════════════════════════

export function SalesIntelligence() {
  const { data, loading } = useApiQuery(() => ext.fetchSalesIntelligence(), []);
  const si = data as { kpis?: Record<string, number>; insights?: Array<{ type: string; title: string; body: string; urgency: string }>; staleLeads?: Array<Record<string, unknown>>; topDestinations?: Array<Record<string, unknown>> } | null;
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted" /></div>;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Win Rate" value={`${si?.kpis?.['winRate'] ?? 0}%`} />
        <Stat label="Pipeline Value" value={money(si?.kpis?.['pipelineValue'] ?? 0)} />
        <Stat label="Forecast Revenue" value={money(si?.kpis?.['forecastRevenue'] ?? 0)} />
        <Stat label="Confirmed Bookings" value={String(si?.kpis?.['confirmedBookings'] ?? 0)} />
      </div>
      {(si?.insights ?? []).length > 0 && (
        <div className="grid gap-2">{(si?.insights ?? []).map((ins, i) => {
          const color = ins.urgency === "critical" || ins.urgency === "high" ? "border-red-200 bg-red-50" : ins.urgency === "medium" ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50";
          return <div key={i} className={`rounded-xl border p-3 ${color}`}><strong className="text-sm">{ins.title}</strong><p className="text-xs text-muted mt-0.5">{ins.body}</p></div>;
        })}</div>
      )}
      {(si?.staleLeads ?? []).length > 0 && (
        <div className="glass-card p-4"><h4 className="text-sm font-semibold mb-2">Stale Leads (14+ days)</h4>
          <div className="grid gap-1">{(si?.staleLeads ?? []).slice(0, 5).map((l) => (<div key={l["id"] as string} className="flex items-center gap-2 text-xs"><span className="font-medium">{l["name"] as string}</span><span className="text-muted">{l["status"] as string}</span><span className="text-faint">· {l["ownerName"] as string}</span></div>))}</div>
        </div>
      )}
    </div>
  );
}

export function OperationsInsights() {
  const { data, loading } = useApiQuery(() => ext.fetchOpsInsights(), []);
  const oi = data as { kpis?: Record<string, number>; insights?: Array<{ type: string; title: string; body: string; urgency: string }> } | null;
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted" /></div>;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Upcoming Departures" value={String(oi?.kpis?.['upcomingDepartures'] ?? 0)} />
        <Stat label="Active Trips" value={String(oi?.kpis?.['activeTrips'] ?? 0)} />
        <Stat label="Open Incidents" value={String(oi?.kpis?.['openIncidents'] ?? 0)} />
        <Stat label="PNR at Risk" value={String(oi?.kpis?.['pnrAtRisk'] ?? 0)} />
      </div>
      {(oi?.insights ?? []).length > 0 && (
        <div className="grid gap-2">{(oi?.insights ?? []).map((ins, i) => {
          const color = ins.urgency === "critical" ? "border-red-200 bg-red-50" : ins.urgency === "high" ? "border-orange-200 bg-orange-50" : ins.urgency === "medium" ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50";
          return <div key={i} className={`rounded-xl border p-3 ${color}`}><strong className="text-sm">{ins.title}</strong><p className="text-xs text-muted mt-0.5">{ins.body}</p></div>;
        })}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TEAM CHAT — Search + Files
// ════════════════════════════════════════════════════════════════════════════

export function TeamChatSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const [searching, setSearching] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input placeholder="Search messages…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim().length >= 2) { setSearching(true); ext.searchMessages(q.trim()).then((r) => setResults((r as { results?: Array<Record<string, unknown>> })?.results ?? [])).catch(() => {}).finally(() => setSearching(false)); } }} className="w-full rounded-xl border border-line bg-solid pl-10 pr-3 py-2 text-sm" /></div>
        <Button size="sm" disabled={searching || q.trim().length < 2} onClick={() => { setSearching(true); ext.searchMessages(q.trim()).then((r) => setResults((r as { results?: Array<Record<string, unknown>> })?.results ?? [])).catch(() => {}).finally(() => setSearching(false)); }}>Search</Button>
      </div>
      {results.length === 0 && q.trim().length >= 2 && !searching && <p className="text-xs text-muted">No results. Press Enter to search.</p>}
      <div className="grid gap-2">{results.map((r, i) => (<div key={i} className="glass-card p-3"><div className="flex items-center gap-2"><span className="text-xs font-semibold">{r["senderName"] as string}</span><span className="text-[11px] text-faint">#{r["channelName"] as string} · {new Date(r["createdAt"] as string).toLocaleString("en-IN")}</span></div><p className="text-sm mt-1">{r["body"] as string}</p></div>))}</div>
    </div>
  );
}

export function TeamChatFiles() {
  const { data } = useApiQuery(() => ext.fetchChatFiles(), []);
  const files = (data as { files?: Array<Record<string, unknown>> } | null)?.files ?? [];
  return (
    <div className="grid gap-3">
      {files.length === 0 ? <div className="glass-card p-6 text-center"><Upload className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No files shared yet.</p></div> : (
        <div className="grid gap-2">{files.map((f, i) => (<div key={i} className="glass-card flex items-center gap-3 p-3"><FileText className="size-4 text-muted" /><div className="min-w-0 flex-1"><strong className="text-sm truncate">{f["fileName"] as string}</strong><p className="text-xs text-muted">{f["senderName"] as string} · #{f["channelName"] as string} · {new Date(f["createdAt"] as string).toLocaleDateString("en-IN")}</p></div></div>))}</div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helper component
// ════════════════════════════════════════════════════════════════════════════

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="glass-card p-3"><p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div>;
}
