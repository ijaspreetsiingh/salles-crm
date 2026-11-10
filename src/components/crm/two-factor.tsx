import { useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from "@/lib/api/crm";
import { useApiQuery } from "@/lib/api/hooks";
import { toast } from "sonner";

/**
 * Two-factor authentication, on the Profile tab.
 *
 * Three states, and the screen always shows which one you are in:
 *   - off and not required → an offer;
 *   - off and required by the role → a blocking instruction (the API refuses
 *     every other route until it is done);
 *   - on → the date, how many recovery codes are left, and the way to turn it
 *     off or reissue them.
 *
 * The secret is shown as text as well as a link, because an authenticator app
 * can be set up by typing it in when a camera is not available.
 */
export function TwoFactorPanel({
  enabled: accountReady,
  onEnabled,
}: {
  enabled: boolean;
  /** Called once enrolment succeeds, so a blocking screen can unlock. */
  onEnabled?: () => void;
}) {
  const { data: status, reload } = useApiQuery(fetchTwoFactorStatus, [], accountReady);

  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    setBusy(true);
    try {
      const next = await startTwoFactorSetup();
      setSetup(next);
      setRecoveryCodes(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await enableTwoFactor(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode("");
      toast.success("Two-factor authentication is on");
      reload();
      // Only reached when the server accepted the code.
      onEnabled?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Recovery codes copied");
    } catch {
      toast.error("Could not copy — write them down instead");
    }
  };

  const enabled = status?.enabled ?? false;
  const required = status?.required ?? false;
  const recommended = status?.recommended ?? false;

  return (
    <div className="two-factor">
      <h3>
        <ShieldCheck size={16} /> Two-factor authentication
      </h3>

      {!status ? (
        <p className="setting-hint">Checking the current setting…</p>
      ) : enabled ? (
        <p className="setting-hint">
          On since{" "}
          {status.enabledAt
            ? new Date(status.enabledAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "today"}
          . {status.recoveryCodesRemaining} recovery code
          {status.recoveryCodesRemaining === 1 ? "" : "s"} left.
        </p>
      ) : required ? (
        <p className="setting-hint setting-hint--warn">
          Your role can move money and change access, so a second factor is required. Set it up now
          — the rest of the workspace stays locked until you do.
        </p>
      ) : recommended ? (
        <p className="setting-hint">Recommended for your role. Not switched on yet.</p>
      ) : (
        <p className="setting-hint">
          Off. A code from your phone, on top of your password, stops a stolen password from being
          enough.
        </p>
      )}

      {!enabled && !setup && (
        <Button type="button" variant="outline" onClick={() => void begin()} disabled={busy}>
          <ShieldCheck /> {required ? "Set up now" : "Set up authenticator"}
        </Button>
      )}

      {!enabled && setup && (
        <div className="two-factor__setup">
          <ol className="two-factor__steps">
            <li>Open your authenticator app and add an account by typing this key:</li>
          </ol>
          <code className="two-factor__secret">{setup.secret}</code>
          <a className="two-factor__link" href={setup.otpauthUrl}>
            Or tap here on the device with the app
          </a>
          <label>
            Enter the 6-digit code the app shows
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          <div className="dialog-actions">
            <Button type="button" onClick={() => void confirm()} disabled={busy || code.length < 6}>
              <Check /> Turn on
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSetup(null);
                setCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {recoveryCodes && (
        <div className="two-factor__recovery">
          <h4>
            <KeyRound size={15} /> Save these recovery codes
          </h4>
          <p className="setting-hint">
            Each one signs you in once if you lose your phone. They are shown only now — we store
            hashes, not the codes.
          </p>
          <ul className="two-factor__codes">
            {recoveryCodes.map((recovery) => (
              <li key={recovery}>
                <code>{recovery}</code>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" onClick={() => void copyCodes()}>
            <Copy /> Copy all
          </Button>
        </div>
      )}

      {enabled && (
        <div className="two-factor__manage">
          <label>
            Confirm with your password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !password}
              onClick={() =>
                void run(async () => {
                  const result = await regenerateRecoveryCodes(password);
                  setRecoveryCodes(result.recoveryCodes);
                  setPassword("");
                }, "New recovery codes created")
              }
            >
              <KeyRound /> New recovery codes
            </Button>
            {!required && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || !password}
                onClick={() =>
                  void run(async () => {
                    await disableTwoFactor(password);
                    setPassword("");
                  }, "Two-factor authentication is off")
                }
              >
                <ShieldOff /> Turn off
              </Button>
            )}
          </div>
          {required && (
            <p className="setting-hint">
              Your role must keep this on. A company admin can change your role first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
