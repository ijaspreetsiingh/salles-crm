import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Compass,
  ExternalLink,
  LayoutDashboard,
  Lock,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import {
  createPlatformPlan,
  deletePlatformPlan,
  fetchPlatformOrganizations,
  fetchPlatformPlans,
  fetchPlans,
  setOrganizationPlan,
  type PlatformOrgDto,
  type PlatformPlanDto,
  type PlanDto,
} from "@/lib/api/modules";

type Tab = "overview" | "companies" | "plans";

/**
 * The platform super admin portal — a separate dashboard, not part of any
 * travel company's workspace. Companies, plans and revenue live here.
 */
export function PlatformPortal() {
  const { user, logout } = useCRM();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [orgs, setOrgs] = useState<PlatformOrgDto[]>([]);
  const [plans, setPlans] = useState<PlatformPlanDto[]>([]);
  const [buyPlans, setBuyPlans] = useState<PlanDto[]>([]);
  const [draftPlan, setDraftPlan] = useState({ key: "", name: "", price: "", features: "" });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [orgList, planList] = await Promise.all([fetchPlatformOrganizations(), fetchPlatformPlans()]);
      setOrgs(orgList);
      setPlans(planList);
      setDenied(false);
      setLoadError(null);
    } catch (error) {
      const message = errorMessage(error, "The platform portal could not load.");
      if (message.includes("403") || message.toLowerCase().includes("forbidden")) {
        setDenied(true);
      } else {
        setLoadError(message);
      }
    }
  }, []);

  useEffect(() => {
    if (!user?.isPlatformAdmin) return;
    void refresh();
    fetchPlans().then(setBuyPlans).catch(() => setBuyPlans([]));
    document.title = "Platform admin — Traveldesk";
  }, [user?.isPlatformAdmin, refresh]);

  if (!user) return null;

  if (!user.isPlatformAdmin) {
    return (
      <div className="portal-denied">
        <span className="portal-denied__icon">
          <Lock size={22} />
        </span>
        <h1>Platform admin access only</h1>
        <p>
          This portal belongs to whoever runs the Traveldesk platform. Your travel workspace is one
          click away.
        </p>
        <Link to="/">
          <Button>
            Back to your workspace <ExternalLink />
          </Button>
        </Link>
      </div>
    );
  }

  const priceByKey = new Map(buyPlans.map((p) => [p.key, p.priceMonthly]));
  const monthlyRevenue = orgs.reduce((sum, org) => sum + (priceByKey.get(org.planKey ?? "") ?? 0), 0);
  const teamTotal = orgs.reduce((sum, org) => sum + org.members, 0);
  const byPlan = orgs.reduce<Record<string, number>>((acc, org) => {
    const key = org.planKey ?? "no plan";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const createPlan = async () => {
    const key = draftPlan.key.trim().toLowerCase();
    const name = draftPlan.name.trim();
    const price = Number(draftPlan.price || 0);
    if (key.length < 2 || name.length < 2 || Number.isNaN(price) || price < 0) {
      toast.error("Give the plan a key (no spaces), a name and a price.");
      return;
    }
    setBusy(true);
    try {
      await createPlatformPlan({
        key,
        name,
        priceMonthly: price,
        priceYearly: Math.round(price * 10),
        currency: "INR",
        features: draftPlan.features.split(",").map((f) => f.trim()).filter(Boolean),
        popular: false,
        position: plans.length + 1,
      });
      setDraftPlan({ key: "", name: "", price: "", features: "" });
      await refresh();
      toast.success(`Plan "${name}" created.`);
    } catch (error) {
      toast.error(errorMessage(error, "Plan could not be created."));
    } finally {
      setBusy(false);
    }
  };

  const retirePlan = async (plan: PlatformPlanDto) => {
    setBusy(true);
    try {
      await deletePlatformPlan(plan.key);
      await refresh();
      toast.success(`Plan "${plan.name}" deleted.`);
    } catch (error) {
      toast.error(errorMessage(error, "Plan could not be deleted."));
    } finally {
      setBusy(false);
    }
  };

  const applyPlan = async (org: PlatformOrgDto) => {
    const planKey = draft[org.id];
    if (!planKey) return;
    setBusy(true);
    try {
      await setOrganizationPlan(org.id, { planKey, status: "active" });
      await refresh();
      toast.success(`${org.name} is now on the "${planKey}" plan.`);
    } catch (error) {
      toast.error(errorMessage(error, "Plan could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { id: "companies", label: "Companies", icon: <Building2 size={16} /> },
    { id: "plans", label: "Plans", icon: <Wallet size={16} /> },
  ];

  return (
    <div className="portal">
      <aside className="portal-side">
        <div>
          <div className="login-brand portal-brand">
            <span className="login-brand__mark">
              <Compass size={20} />
            </span>
            <span className="login-brand__word">
              travel<span>desk</span>
            </span>
          </div>
          <p className="portal-side__eyebrow">Platform admin</p>

          <nav className="portal-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? "is-active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="portal-side__foot">
          <p className="portal-side__mail">{user.email}</p>
          <div className="portal-side__foot-row">
            <Link to="/">
              <Button size="sm" variant="ghost">
                Open workspace <ExternalLink />
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="portal-main">
        {tab === "overview" && (
          <>
            <header className="portal-head">
              <h1>Overview</h1>
              <p>How the Traveldesk platform is doing right now.</p>
            </header>

            <div className="portal-kpis">
              <div className="portal-kpi">
                <span className="portal-kpi__icon">
                  <Building2 size={16} />
                </span>
                <p className="portal-kpi__label">Companies</p>
                <p className="portal-kpi__value">{orgs.length}</p>
              </div>
              <div className="portal-kpi">
                <span className="portal-kpi__icon">
                  <Users size={16} />
                </span>
                <p className="portal-kpi__label">Team members</p>
                <p className="portal-kpi__value">{teamTotal}</p>
              </div>
              <div className="portal-kpi">
                <span className="portal-kpi__icon">
                  <Wallet size={16} />
                </span>
                <p className="portal-kpi__label">Est. monthly revenue</p>
                <p className="portal-kpi__value">₹{monthlyRevenue.toLocaleString("en-IN")}</p>
              </div>
              <div className="portal-kpi">
                <span className="portal-kpi__icon">
                  <Compass size={16} />
                </span>
                <p className="portal-kpi__label">Plans for sale</p>
                <p className="portal-kpi__value">{buyPlans.length}</p>
              </div>
            </div>

            <div className="portal-cols">
              <section className="portal-card">
                <h2>Companies by plan</h2>
                {Object.entries(byPlan).length === 0 && <p className="portal-empty">No companies yet.</p>}
                {Object.entries(byPlan).map(([planKey, count]) => {
                  const plan = plans.find((p) => p.key === planKey);
                  return (
                    <div key={planKey} className="portal-row">
                      <span>{plan?.name ?? planKey}</span>
                      <b>{count}</b>
                    </div>
                  );
                })}
              </section>

              <section className="portal-card">
                <h2>Newest companies</h2>
                {orgs.slice(0, 5).map((org) => (
                  <div key={org.id} className="portal-row">
                    <span>
                      <b>{org.name}</b>
                      <small style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>
                        {org.members} members · {new Date(org.createdAt).toLocaleDateString("en-IN")}
                      </small>
                    </span>
                    <span className={`badge ${org.planKey ? "badge-sun" : ""}`}>{org.planKey ?? "no plan"}</span>
                  </div>
                ))}
              </section>
            </div>

            {loadError && <p className="landing-pricing__note" role="alert">{loadError}</p>}
          </>
        )}

        {tab === "companies" && (
          <>
            <header className="portal-head">
              <h1>Companies</h1>
              <p>Every travel business using Traveldesk. Move a company onto any plan.</p>
            </header>

            <section className="portal-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Members</th>
                      <th>Joined</th>
                      <th>Plan</th>
                      <th>Change plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org) => (
                      <tr key={org.id}>
                        <td>
                          <b>{org.name}</b>
                          <small style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{org.slug}</small>
                        </td>
                        <td>{org.members}</td>
                        <td>{new Date(org.createdAt).toLocaleDateString("en-IN")}</td>
                        <td>
                          <span className={`badge ${org.planKey ? "badge-sun" : ""}`}>{org.planKey ?? "no plan"}</span>
                        </td>
                        <td>
                          <div className="portal-plan-row">
                            <select
                              value={draft[org.id] ?? org.planKey ?? ""}
                              onChange={(e) => setDraft((prev) => ({ ...prev, [org.id]: e.target.value }))}
                            >
                              <option value="" disabled>
                                Choose…
                              </option>
                              {buyPlans.map((p) => (
                                <option key={p.key} value={p.key}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" disabled={busy || !draft[org.id]} onClick={() => void applyPlan(org)}>
                              Save
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orgs.length === 0 && <p className="portal-empty">No companies yet — the list fills as people sign up.</p>}
              </div>
            </section>
          </>
        )}

        {tab === "plans" && (
          <>
            <header className="portal-head">
              <h1>Plans</h1>
              <p>What companies can buy. These plans appear at sign-up and in company settings.</p>
            </header>

            <section className="portal-card">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Key</th>
                      <th>Monthly</th>
                      <th>Yearly</th>
                      <th>Perks</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.key}>
                        <td>
                          <b>{plan.name}</b>
                          {plan.popular && <span className="badge badge-sun">popular</span>}
                        </td>
                        <td>{plan.key}</td>
                        <td>{plan.currency} {plan.priceMonthly.toLocaleString("en-IN")}</td>
                        <td>{plan.currency} {plan.priceYearly.toLocaleString("en-IN")}</td>
                        <td>{(plan.features ?? []).length}</td>
                        <td>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void retirePlan(plan)}>
                            <Trash2 size={14} /> Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="portal-create">
                <div>
                  <h3>Create a new plan</h3>
                  <div className="portal-create__fields">
                    <label>
                      <span>Key (no spaces)</span>
                      <input value={draftPlan.key} onChange={(e) => setDraftPlan({ ...draftPlan, key: e.target.value })} placeholder="premium" />
                    </label>
                    <label>
                      <span>Plan name</span>
                      <input value={draftPlan.name} onChange={(e) => setDraftPlan({ ...draftPlan, name: e.target.value })} placeholder="Premium" />
                    </label>
                    <label>
                      <span>Monthly price (₹)</span>
                      <input type="number" min={0} value={draftPlan.price} onChange={(e) => setDraftPlan({ ...draftPlan, price: e.target.value })} placeholder="2999" />
                    </label>
                    <label className="portal-create__wide">
                      <span>Perks (comma separated)</span>
                      <input value={draftPlan.features} onChange={(e) => setDraftPlan({ ...draftPlan, features: e.target.value })} placeholder="25 seats, 5 branches, AI assistant" />
                    </label>
                    <Button disabled={busy} onClick={() => void createPlan()}>
                      <Plus size={15} /> Create plan
                    </Button>
                  </div>
                  <p className="portal-hint">
                    Yearly price defaults to 10× the monthly price. Companies pick these plans at
                    sign-up and in their own settings.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
