import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Compass, Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingPage } from "@/components/crm/landing-page";
import { PlatformPortal } from "@/components/crm/platform-portal";
import { errorMessage } from "@/lib/api/client";
import { fetchPlans, type PlanDto } from "@/lib/api/modules";
import { useCRM } from "@/lib/crm/store";
import { toast } from "sonner";

const DEMO_EMAIL = "owner@horizontravel.in";
const DEMO_PASSWORD = "Traveldesk@123";

/**
 * The sign-in screen.
 *
 * One card, one job. Everything is pre-filled for the demo, and the copy
 * says what the product does in a sentence rather than a paragraph.
 */
/**
 * The public marketing page for guests. The full component lives in
 * `landing-page.tsx` — it is shared with the "/landing" route.
 */
export function LandingGuest() {
  return <LandingPage />;
}

function RedirectHome() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return <BootScreen />;
}

/**
 * Decides what visitors see:
 *  - signed out: marketing on "/" (and "/landing"), the sign-in card on
 *    "/login", sign-up on "/signup", and the sign-in card anywhere else.
 *  - signed in: the workspace, except "/admin" — that opens the standalone
 *    platform portal, its own dashboard next to the travel CRM.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useCRM();
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  if (status === "loading") return <BootScreen />;

  if (status === "unauthenticated") {
    if (path === "/" || path === "/landing") return <LandingGuest />;
    // The hosted lead form is public — customers never see a sign-in card.
    if (path.startsWith("/lead/")) return <>{children}</>;
    if (path === "/signup") return <LoginScreen initialMode="signup" />;
    return <LoginScreen />;
  }

  // Signed in: never show the sign-up / sign-in cards again.
  if (path === "/login" || path === "/signup") return <RedirectHome />;
  // "/platform" also opens the portal, so old bookmarks keep working.
  if (path === "/admin" || path === "/platform") return <PlatformPortal />;
  return <>{children}</>;
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <span className="boot-mark">
        <Compass size={26} className="animate-spin [animation-duration:3s]" />
      </span>
      <p>Getting your workspace ready…</p>
    </div>
  );
}

export function LoginScreen({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const { login, register, bootError } = useCRM();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [plans, setPlans] = useState<PlanDto[]>([]);

  // Sign-up state
  const [orgName, setOrgName] = useState("");
  const [personName, setPersonName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [plan, setPlan] = useState("growth");

  useEffect(() => {
    if (mode !== "signup") return;
    fetchPlans().then((data) => {
      setPlans(data);
      if (data.length && !data.some((p) => p.key === plan)) setPlan(data[0]?.key ?? plan);
    }).catch(() => setPlans([]));
  }, [mode]);
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const message = errorMessage(
        err,
        "We could not sign you in. Check your details and try again.",
      );
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(orgName.trim(), personName.trim(), signupEmail.trim(), signupPassword, undefined, plan);
    } catch (err) {
      const message = errorMessage(err, "We could not create your workspace. Check your details and try again.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <div className="login-screen">
      <div className="mesh" aria-hidden="true">
        <i className="mesh__a" />
        <i className="mesh__b" />
        <i className="mesh__c" />
      </div>

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

          <div className="login-tabs">
            <button type="button" className={mode === "signin" ? "is-active" : ""} onClick={() => setMode("signin")}>
              Sign in
            </button>
            <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
              Create workspace
            </button>
          </div>

          <h1 className="login-title">{mode === "signin" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="login-sub">
            Sign in to your travel business workspace. Everything you need — enquiries, trips,
            invoices and travellers — in one place.
          </p>

          {bootError && (
            <div className="login-error" role="alert">
              {bootError}
            </div>
          )}

          {mode === "signin" && (
          <form onSubmit={submit} className="login-form">
            <label className="login-field">
              <span>Work email</span>
              <div className="login-input">
                <Mail size={16} className="login-input__icon" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-input">
                <LockKeyhole size={16} className="login-input__icon" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
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
                  <Loader2 className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight />
                </>
              )}
            </Button>
          </form>
          )}

          {mode === "signup" && (
            <form onSubmit={submitSignup} className="login-form">
              <label className="login-field">
                <span>Organisation name</span>
                <div className="login-input">
                  <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Horizon Travel" />
                </div>
              </label>
              <label className="login-field">
                <span>Your name</span>
                <div className="login-input">
                  <input required value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Jane Doe" />
                </div>
              </label>
              <label className="login-field">
                <span>Work email</span>
                <div className="login-input">
                  <Mail size={16} className="login-input__icon" />
                  <input type="email" required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@company.com" />
                </div>
              </label>
              <label className="login-field">
                <span>Password</span>
                <div className="login-input">
                  <LockKeyhole size={16} className="login-input__icon" />
                  <input type="password" required minLength={8} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="At least 8 characters" />
                </div>
              </label>
              <label className="login-field">
                <span>Plan</span>
                <div className="login-input">
                  <select value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {(plans.length ? plans : ([
                      { key: "starter", name: "Starter" },
                      { key: "growth", name: "Growth" },
                      { key: "enterprise", name: "Enterprise" },
                    ] as PlanDto[])).map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              {error && <p className="login-error-text" role="alert">{error}</p>}
              <Button type="submit" size="lg" className="login-submit" disabled={busy}>
                {busy ? (<><Loader2 className="animate-spin" /> Creating...</>) : (<>Create workspace <ArrowRight /></>)}
              </Button>
            </form>
          )}

          {mode === "signin" && (
          <button type="button" className="login-demo" onClick={useDemo}>
            <span className="login-demo__icon">
              <Sparkles size={15} />
            </span>
            <span className="login-demo__text">
              <b>Just looking around?</b>
              <small>Fill in the demo account and press Sign in.</small>
            </span>
            <span className="login-demo__cta">Use demo</span>
          </button>
          )}

          <p className="login-foot">
            Your data stays inside your own organisation. Nothing is shared.
          </p>

          <p className="login-foot login-foot--link">
            <Link to="/">Back to home</Link>
          </p>
        </div>

        <ul className="login-points">
          {[
            "One list of everything that needs you today",
            "Every enquiry linked to its quote, trip and invoice",
            "Your numbers are real — never a guess",
          ].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </main>
    </div>
  );
}
