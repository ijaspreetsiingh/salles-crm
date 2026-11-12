/**
 * SuppliersPanel — contracts, purchase orders, settlements.
 */
import { useState } from "react";
import { CheckCircle2, FileText, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { money } from "@/lib/crm/catalog";
import {
  fetchContracts, fetchPurchaseOrders, fetchSettlements,
  createContract, createPurchaseOrder, settlePurchaseOrder,
  type Contract, type PurchaseOrder, type Settlement,
} from "@/lib/api/module-extensions";

export function SuppliersPanel() {
  const [tab, setTab] = useState<"contracts" | "purchase-orders" | "settlements">("contracts");
  const [adding, setAdding] = useState(false);

  const { data: contracts, reload: reloadC } = useApiQuery<Contract[]>(() => fetchContracts() as Promise<Contract[]>, []);
  const { data: pos, reload: reloadPO } = useApiQuery<PurchaseOrder[]>(() => fetchPurchaseOrders() as Promise<PurchaseOrder[]>, []);
  const { data: settlements } = useApiQuery<Settlement[]>(() => fetchSettlements() as Promise<Settlement[]>, []);

  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-xl border border-line bg-glass-2 p-1">
        {(["contracts", "purchase-orders", "settlements"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-muted hover:text-foreground"
            }`}>
            {t === "purchase-orders" ? "Purchase Orders" : t === "settlements" ? "Settlements" : "Contracts"}
          </button>
        ))}
      </div>

      {tab === "contracts" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New contract</Button>
            <span className="text-xs text-muted">{(contracts ?? []).length} contract{(contracts ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewContractForm onSaved={() => { setAdding(false); reloadC(); }} />}
          <div className="grid gap-2">
            {(contracts ?? []).map((c) => (
              <div key={c.id} className="glass-card flex items-center gap-3 p-3">
                <FileText className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{c.reference} · {c.supplierName}</strong>
                  <p className="text-xs text-muted">{c.contractType} · {c.validFrom} to {c.validTo} · {money(c.value, c.currency)}</p>
                </div>
                <span className={`status ${c.status === "Active" ? "status-success" : c.status === "Expired" ? "status-danger" : "status-warning"}`}><span /> {c.status}</span>
              </div>
            ))}
            {(contracts ?? []).length === 0 && !adding && (
              <div className="glass-card p-6 text-center"><p className="text-sm text-muted">No contracts yet.</p></div>
            )}
          </div>
        </>
      )}

      {tab === "purchase-orders" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Raise PO</Button>
            <span className="text-xs text-muted">{(pos ?? []).length} purchase order{(pos ?? []).length === 1 ? "" : "s"}</span>
          </div>
          {adding && <NewPOForm onSaved={() => { setAdding(false); reloadPO(); }} />}
          <div className="grid gap-2">
            {(pos ?? []).map((po) => (
              <div key={po.id} className="glass-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm">{po.reference} · {po.supplierName}</strong>
                    <p className="text-xs text-muted">{po.description} · {money(po.amount, po.currency)}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p>Settled: {money(po.settled, po.currency)}</p>
                    <p className="font-semibold">Balance: {money(po.balance, po.currency)}</p>
                  </div>
                  <span className={`status ${po.status === "Settled" ? "status-success" : po.status === "Partial" ? "status-warning" : "status-warning"}`}><span /> {po.status}</span>
                  {po.balance > 0 && <SettleButton po={po} onSettled={() => reloadPO()} />}
                </div>
              </div>
            ))}
            {(pos ?? []).length === 0 && !adding && (
              <div className="glass-card p-6 text-center"><p className="text-sm text-muted">No purchase orders yet.</p></div>
            )}
          </div>
        </>
      )}

      {tab === "settlements" && (
        <div className="grid gap-2">
          {(settlements ?? []).length === 0 ? (
            <div className="glass-card p-6 text-center"><Wallet className="mx-auto mb-2 size-6 text-muted" /><p className="text-sm text-muted">No settlements recorded yet.</p></div>
          ) : (
            (settlements ?? []).map((s, i) => (
              <div key={i} className="glass-card flex items-center gap-3 p-3">
                <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                <div className="min-w-0 flex-1">
                  <strong className="text-sm">{s.poReference} · {s.supplierName}</strong>
                  <p className="text-xs text-muted">{s.method} · {s.paidOn} · by {s.by}</p>
                </div>
                <span className="text-sm font-semibold">{money(s.amount, "INR")}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NewContractForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ supplierName: "", contractType: "Hotel", validFrom: "", validTo: "", value: 0, terms: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <input placeholder="Supplier name" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} autoFocus />
      <select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
        <option>Hotel</option><option>DMC</option><option>Airline</option><option>Transport</option><option>Activity</option><option>Insurance</option><option>Other</option>
      </select>
      <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
      <input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
      <input type="number" placeholder="Contract value (₹)" value={form.value || ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
      <input placeholder="Supplier ID" value="auto" readOnly className="opacity-50" />
      <textarea placeholder="Terms & conditions" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} className="sm:col-span-2 lg:col-span-3" rows={2} />
      <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
        <Button size="sm" disabled={busy || !form.supplierName} onClick={async () => {
          setBusy(true); try { await createContract({ ...form, supplierId: "auto", currency: "INR", status: "Draft" }); toast.success("Contract created"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Save contract</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}

function NewPOForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ supplierName: "", description: "", amount: 0, dueDate: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass-card grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <input placeholder="Supplier name" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} autoFocus />
      <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input type="number" placeholder="Amount (₹)" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
      <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
        <Button size="sm" disabled={busy || !form.supplierName || !form.amount} onClick={async () => {
          setBusy(true); try { await createPurchaseOrder({ ...form, supplierId: "auto", currency: "INR", gstRate: 0 }); toast.success("Purchase order raised"); onSaved(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
        }}>Raise PO</Button>
        <Button size="sm" variant="ghost" onClick={onSaved}>Cancel</Button>
      </div>
    </section>
  );
}

function SettleButton({ po, onSettled }: { po: PurchaseOrder; onSettled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  return (
    <div className="flex items-center gap-1">
      <input type="number" placeholder={`Max ${po.balance}`} value={amount} onChange={(e) => setAmount(e.target.value)}
        className="h-8 w-28 rounded-lg border border-line bg-solid px-2 text-xs" />
      <Button size="sm" variant="outline" disabled={busy || !amount} onClick={async () => {
        setBusy(true); try {
          await settlePurchaseOrder(po.id, { amount: Number(amount), method: "Bank transfer" });
          toast.success("Settlement recorded"); setAmount(""); onSettled();
        } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
      }}>Settle</Button>
    </div>
  );
}
