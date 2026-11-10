import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Compass,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingPage } from "@/components/crm/landing-page";
import { PlatformPortal } from "@/components/crm/platform-portal";
import { ApiError, errorMessage } from "@/lib/api/client";
import { fetchPlans, type PlanDto } from "@/lib/api/modules";
import { TwoFactorPanel } from "@/components/crm/two-factor";
import { useCRM } from "@/lib/crm/store";
import { toast } from "sonner";

const DEMO_EMAIL = "owner@horizontravel.in";
const DEMO_PASSWORD = "Traveldesk@123";

/**
 * Demo sign-in is a development aid, never a production default. It only
 * appears in a dev build or when VITE_DEMO_LOGIN=true is set explicitly, so a
 * real customer never sees a password pre-filled in the form.
 */
const DEMO_ENABLED = import.meta.env.DEV || import.meta.env["VITE_DEMO_LOGIN"] === "true";

/** The vendor's internal workspace slug — see backend `domain/tenancy.ts`. */
const INTERNAL_ORG_SLUG = "traveldesk-hq";

/**
 * The sign-in screen.
 *
 * One card, one job. In a development build the demo account is pre-filled;
 * a production build ships empty fields. The copy says what the product does
 * in a sentence rather than a paragraph.
 */
/**
 * The public marketing page for guests. The full component lives in
 * `landing-page.tsx` — it is shared with the "/landing" route.
 */
export function LandingGuest() {
  return <LandingPage />;
}

function RedirectToPlatform() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/admin", replace: true });
  }, [navigate]);
  return <BootScreen />;
}

function RedirectHome() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return <BootScreen />;
}

/**
 * The wall an admin or finance user meets until they enrol an authenticator.
 *
 * They are signed in, so sending them back to the sign-in card would loop:
 * passwords do not satisfy this check. The way forward is one screen, and the
 * panel on it is the same one Settings → Profile uses.
 */
function TwoFactorSetupScreen() {
  const { reload, logout, user } = useCRM();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } catch {
      // The local session is cleared either way; a failed API call must not
      // trap the person on this screen.
    } finally {
      setBusy(false);
    }
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
          <h1 className="login-title">One more step</h1>
          <p className="login-sub">
            {user ? `${user.name}, your` : "Your"} role can move money and change who has access, so
            a code from your phone is required on top of your password. It takes a minute.
          </p>
          <TwoFactorPanel enabled onEnabled={() => void reload()} />
          <p className="login-foot">
            <button
              type="button"
              className="login-alt"
              onClick={() => void signOut()}
              disabled={busy}
            >
              Sign out instead
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * Decides what visitors see:
 *  - signed out: marketing on "/" (and "/landing"), the sign-in card on
 *    "/login", sign-up on "/signup", and the sign-in card anywhere else.
 *  - signed in: the workspace, except "/admin" — that opens the standalone
 *    platform portal, its own dashboard next to the travel CRM.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, organizationSlug, twoFactorSetupRequired } = useCRM();
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
  // The vendor's own workspace is a console, not a CRM.
  if (
    user?.isPlatformAdmin &&
    organizationSlug === INTERNAL_ORG_SLUG &&
    (path === "/" || path === "")
  ) {
    return <RedirectToPlatform />;
  }
  // "/platform" also opens the portal, so old bookmarks keep working.
  if (path === "/admin" || path === "/platform") return <PlatformPortal />;
  // Signed in but not yet enrolled: nothing else in the app will answer, so
  // say so once, here, instead of letting every screen show a 403.
  if (twoFactorSetupRequired) return <TwoFactorSetupScreen />;
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
    fetchPlans()
      .then((data) => {
        setPlans(data);
        if (data.length && !data.some((p) => p.key === plan)) setPlan(data[0]?.key ?? plan);
      })
      .catch(() => setPlans([]));
  }, [mode]);
  const [email, setEmail] = useState(DEMO_ENABLED ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(DEMO_ENABLED ? DEMO_PASSWORD : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * The server answers `two_factor_required` only after the password is known
   * to be correct, so the code field appears exactly when the account has an
   * authenticator app — never before, and never as a hint to an attacker.
   */
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const trimmed = code.trim();
      await login(email.trim(), password, {
        ...(needsCode && trimmed
          ? recoveryMode
            ? { recoveryCode: trimmed }
            : { totp: trimmed }
          : {}),
      });
      /*
       * Nothing else to do here. If the role must enrol a second factor, the
       * shell swaps this screen for the enrolment wall on the next render;
       * if it is merely recommended (enforcement off in development), the
       * Profile tab says so.
       */
    } catch (err) {
      if (err instanceof ApiError && err.code === "two_factor_required") {
        setNeedsCode(true);
        setCode("");
        setError(
          recoveryMode
            ? "That recovery code did not work. Each code works once — try another."
            : "Enter the 6-digit code from your authenticator app.",
        );
        return;
      }
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
      await register(
        orgName.trim(),
        personName.trim(),
        signupEmail.trim(),
        signupPassword,
        undefined,
        plan,
      );
    } catch (err) {
      const message = errorMessage(
        err,
        "We could not create your workspace. Check your details and try again.",
      );
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
            <button
              type="button"
              className={mode === "signin" ? "is-active" : ""}
              onClick={() => setMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => setMode("signup")}
            >
              Create workspace
            </button>
          </div>

          <h1 className="login-title">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </h1>
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

              {needsCode && (
                <label className="login-field">
                  <span>{recoveryMode ? "Recovery code" : "Authentication code"}</span>
                  <div className="login-input">
                    <ShieldCheck size={16} className="login-input__icon" />
                    <input
                      inputMode={recoveryMode ? "text" : "numeric"}
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      maxLength={recoveryMode ? 24 : 6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder={recoveryMode ? "XXXX-XXXX" : "123456"}
                    />
                  </div>
                  <button
                    type="button"
                    className="login-alt"
                    onClick={() => {
                      setRecoveryMode((prev) => !prev);
                      setCode("");
                      setError(null);
                    }}
                  >
                    {recoveryMode
                      ? "Use my authenticator app instead"
                      : "Lost your phone? Use a recovery code"}
                  </button>
                </label>
              )}

              {error && (
                <p className="login-error-text" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="login-submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="animate-spin" />{" "}
                    {needsCode ? "Checking code…" : "Signing in…"}
                  </>
                ) : (
                  <>
                    {needsCode ? "Verify and sign in" : "Sign in"} <ArrowRight />
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
                  <input
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Horizon Travel"
                  />
                </div>
              </label>
              <label className="login-field">
                <span>Your name</span>
                <div className="login-input">
                  <input
                    required
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="Jane Doe"
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
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
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
                    required
                    minLength={8}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="At least 8 characters"
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
          )}

          {mode === "signin" && DEMO_ENABLED && (
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
