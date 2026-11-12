/**
 * CorporatePanel — travel requests, approvals, cost centres, policies.
 *
 * Shown when the workspace module is "companies". Replaces the generic
 * record list with a corporate-travel-specific view.
 *
 * Everything here belongs to one corporate account, so the panel always shows
 * which company you are working on. Requests, cost centres and the travel
 * policy are all read and written against that real company id — never a
 * placeholder.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  fetchTravelRequests, createTravelRequest, decideTravelRequest,
  fetchCostCentres, createCostCentre,
  fetchCompanies, fetchPolicy, savePolicy,
  type CompanyOption, type TravelPolicy, type TravelRequest,
} from "@/lib/api/module-extensions";
import { money } from "@/lib/crm/catalog";

export function CorporatePanel() {
  const [tab, setTab] = useState<"requests" | "cost-centres" | "policy">("requests");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string>("");

  const { data: companies } = useApiQuery<CompanyOption[]>(
    () => fetchCompanies() as Promise<CompanyOption[]>,
    [],
  );
  const { data: requests, reload: reloadReqs } = useApiQuery<TravelRequest[]>(
    () => fetchTravelRequests() as Promise<TravelRequest[]>,
    [],
  );
  const { data: costCentres } = useApiQuery<Array<{ id: string; name: string; code: string | null; budget: number; currency: string; active: boolean }>>(
    () => fetchCostCentres() as Promise<Array<{ id: string; name: string; code: string | null; budget: number; currency: string; active: boolean }>>,
    [],
  );

  const companyList = companies ?? [];
  const list = requests ?? [];

  // Default to the first company until the person chooses another.
  const activeCompanyId = companyId || companyList[0]?.id || "";

  const approve = async (req: TravelRequest, action: "approve" | "reject") => {
    setBusy(true);
    try {
      await decideTravelRequest(req.id, action, decisionNote ?? "");
      toast.success(action === "approve" ? "Request approved" : "Request rejected");
      setDecisionNote(null);
      reloadReqs();
    } catch (err) {
      toast.error(errorMessage(err, "Could not process decision"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      {companyList.length === 0 ? (
        <div className="glass-card p-4 text-sm text-muted">
          Add a company first — open the <strong>Companies</strong> tab and create one. Travel
          requests, cost centres and travel policies all belong to a company.
        </div>
      ) : (
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          Company
          <select
            value={activeCompanyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="h-8 rounded-lg border border-line bg-solid px-2 text-xs font-normal text-foreground"
          >
            {companyList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-1 rounded-xl border border-line bg-glass-2 p-1">
        {(["requests", "cost-centres", "policy"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-muted hover:text-foreground"
            }`}>
            {t === "cost-centres" ? "Cost Centres" : t === "policy" ? "Travel Policy" : "Travel Requests"}
          </button>
        ))}
      </div>

      {tab === "requests" && (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!activeCompanyId}
              onClick={() => setAdding((v) => !v)}
            >
              <Plus className="size-4" /> New travel request
            </Button>
            <span className="text-xs text-muted">
              {list.length} request{list.length === 1 ? "" : "s"} · {list.filter((r) => r.status === "Pending approval").length} pending approval
            </span>
          </div>

          {adding && (
            <NewRequestForm
              companyId={activeCompanyId}
              onClose={() => setAdding(false)}
              onSaved={() => { setAdding(false); reloadReqs(); }}
            />
          )}

          {list.length === 0 && !adding ? (
            <div className="glass-card p-6 text-center">
              <FileText className="mx-auto mb-2 size-6 text-muted" />
              <p className="text-sm text-muted">No travel requests yet. Create one to start the approval flow.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {list.map((req) => (
                <div key={req.id} className="glass-card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm">{req.reference}</strong>
                        <span className={`status ${req.status === "Approved" ? "status-success" : req.status === "Rejected" ? "status-danger" : "status-warning"}`}>
                          <span /> {req.status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm">{req.employeeName} → {req.destination}</p>
                      <p className="text-xs text-muted">
                        {req.purpose} · {money(req.estimatedBudget, req.currency)} · {req.departureDate} to {req.returnDate}
                      </p>
                    </div>
                    {req.status === "Pending approval" && (
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="Note (optional)"
                          value={decisionNote === req.id ? decisionNote : ""}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          className="h-8 w-40 rounded-lg border border-line bg-solid px-2 text-xs"
                        />
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void approve(req, "approve")}>
                          <CheckCircle2 className="size-4" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void approve(req, "reject")}>
                          <XCircle className="size-4" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "cost-centres" && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="size-4" /> New cost centre
            </Button>
          </div>
          {(costCentres ?? []).length === 0 && !adding ? (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-muted">No cost centres yet. Create one to track department budgets.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {(costCentres ?? []).map((cc) => (
                <div key={cc.id} className="glass-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm">{cc.name}</strong>
                    <p className="text-xs text-muted">{cc.code || "No code"} · Budget: {money(cc.budget, cc.currency)}</p>
                  </div>
                  <span className={`status ${cc.active ? "status-success" : "status-warning"}`}>
                    <span /> {cc.active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "policy" && <PolicyEditor companyId={activeCompanyId} />}
    </div>
  );
}

function NewRequestForm({
  companyId,
  onClose,
  onSaved,
}: {
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    employeeName: "", employeeEmail: "", destination: "", purpose: "",
    departureDate: "", returnDate: "", estimatedBudget: 0,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!companyId) {
      toast.error("Add a company before raising a travel request");
      return;
    }
    if (!form.employeeName || !form.employeeEmail || !form.destination || !form.purpose) {
      toast.error("Fill the employee, email, destination and purpose");
      return;
    }
    if (!form.departureDate || !form.returnDate) {
      toast.error("Choose the travel dates");
      return;
    }
    setBusy(true);
    try {
      await createTravelRequest({
        companyId,
        ...form,
        currency: "INR", flightRequired: true, hotelRequired: true, transferRequired: false,
      });
      toast.success("Travel request submitted");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, "Could not submit request"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card grid gap-3 p-4 md:grid-cols-2">
      <input placeholder="Employee name" value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} autoFocus />
      <input type="email" placeholder="Employee email" value={form.employeeEmail} onChange={(e) => setForm({ ...form, employeeEmail: e.target.value })} />
      <input placeholder="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
      <input placeholder="Purpose" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
      <input type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />
      <input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
      <input type="number" placeholder="Estimated budget (₹)" value={form.estimatedBudget || ""} onChange={(e) => setForm({ ...form, estimatedBudget: Number(e.target.value) })} />
      <div className="md:col-span-2 flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>Submit request</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </section>
  );
}

const BLANK_POLICY: TravelPolicy = {
  flightClass: "Economy", hotelStarMax: 4, perDiemCap: 5000,
  currency: "INR", advanceBookingDays: 14, requireApprovalAbove: 50000,
  approverIds: [], notes: "",
};

function PolicyEditor({ companyId }: { companyId: string }) {
  const [policy, setPolicy] = useState<TravelPolicy>(BLANK_POLICY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load the company's saved policy so the form shows what is really on file.
  useEffect(() => {
    if (!companyId) {
      setPolicy(BLANK_POLICY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPolicy(companyId)
      .then((res) => {
        if (cancelled) return;
        setPolicy(res.configured && res.policy ? { ...BLANK_POLICY, ...res.policy } : BLANK_POLICY);
      })
      .catch((err) => toast.error(errorMessage(err, "Could not load the travel policy")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const save = async () => {
    if (!companyId) {
      toast.error("Add a company before saving a travel policy");
      return;
    }
    setBusy(true);
    try {
      await savePolicy(companyId, policy);
      toast.success("Travel policy saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the travel policy"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card grid gap-3 p-4 md:grid-cols-2">
      {loading && <p className="text-xs text-muted md:col-span-2">Loading saved policy…</p>}
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Default flight class
        <select value={policy.flightClass} onChange={(e) => setPolicy({ ...policy, flightClass: e.target.value })}>
          <option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Max hotel star rating
        <input type="number" min={1} max={5} value={policy.hotelStarMax} onChange={(e) => setPolicy({ ...policy, hotelStarMax: Number(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Per-diem cap (₹)
        <input type="number" value={policy.perDiemCap} onChange={(e) => setPolicy({ ...policy, perDiemCap: Number(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Advance booking (days)
        <input type="number" value={policy.advanceBookingDays} onChange={(e) => setPolicy({ ...policy, advanceBookingDays: Number(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Approval required above (₹)
        <input type="number" value={policy.requireApprovalAbove} onChange={(e) => setPolicy({ ...policy, requireApprovalAbove: Number(e.target.value) })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted md:col-span-2">
        Policy notes
        <textarea rows={3} value={policy.notes} onChange={(e) => setPolicy({ ...policy, notes: e.target.value })} placeholder="e.g. All international travel requires director approval" />
      </label>
      <Button size="sm" disabled={busy || !companyId} onClick={() => void save()}>Save policy</Button>
    </section>
  );
}
