import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Compass, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCRM } from "@/lib/crm/store";
import { errorMessage } from "@/lib/api/client";
import { fetchPlans, type PlanDto } from "@/lib/api/modules";
import { useEffect } from "react";

function SignupPage() {
  const { register } = useCRM();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [personName, setPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState("growth");
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans()
      .then((data) => {
        setPlans(data);
        if (data.length && !data.some((p) => p.key === plan)) setPlan(data[0]?.key ?? plan);
      })
      .catch(() => setPlans([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(orgName.trim(), personName.trim(), email.trim(), password, undefined, plan);
      navigate({ to: "/" });
    } catch (err) {
      const message = errorMessage(err, "Could not create your workspace.");
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <main className="login-main">
        <div className="login-card">
          <div className="login-brand">
            <span className="login-brand__mark">
              <Compass size={20} />
            </span>
            <span className="login-brand__word">
              travel<span>desk</span>
            </span>
          </div>
          <h1 className="login-title">Create your workspace</h1>
          <p className="login-sub">Set up your travel business in one step.</p>
          <form onSubmit={submit} className="login-form">
            <label className="login-field">
              <span>Organisation name</span>
              <div className="login-input">
                <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </div>
            </label>
            <label className="login-field">
              <span>Your name</span>
              <div className="login-input">
                <input
                  required
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              </div>
            </label>
            <label className="login-field">
              <span>Work email</span>
              <div className="login-input">
                <Mail size={16} className="login-input__icon" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <LockKeyhole size={16} className="login-input__icon" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </label>
            <label className="login-field">
              <span>Plan</span>
              <div className="login-input">
                <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                  {(plans.length
                    ? plans
                    : ([
                        { key: "starter", name: "Starter" },
                        { key: "growth", name: "Growth" },
                        { key: "enterprise", name: "Enterprise" },
                      ] as PlanDto[])
                  ).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            {error && (
              <p className="login-error-text" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="login-submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="animate-spin" /> Creating...
                </>
              ) : (
                <>
                  Create workspace <ArrowRight />
                </>
              )}
            </Button>
          </form>
          <p className="login-foot">
            <Link to="/">Already have an account? Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});
