import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Compass, Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
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
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useCRM();
  if (status === "loading") return <BootScreen />;
  if (status === "unauthenticated") return <LoginScreen />;
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

function LoginScreen() {
  const { login, bootError } = useCRM();
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

          <h1 className="login-title">Welcome back</h1>
          <p className="login-sub">
            Sign in to your travel business workspace. Everything you need — enquiries, trips,
            invoices and travellers — in one place.
          </p>

          {bootError && (
            <div className="login-error" role="alert">
              {bootError}
            </div>
          )}

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

          <p className="login-foot">
            Your data stays inside your own organisation. Nothing is shared.
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
