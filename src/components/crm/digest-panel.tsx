import { useEffect, useState } from "react";
import { Check, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useApiQuery } from "@/lib/api/hooks";
import { useCRM } from "@/lib/crm/store";
import {
  fetchDigestSettings,
  saveDigestSettings,
  sendDigestNow,
  type DigestSettingsDto,
} from "@/lib/api/modules";

/* ==========================================================================
   The daily email.

   Two facts decide how this reads: when it should arrive, and what the person
   receiving it is allowed to see. Both are shown as sentences rather than
   settings keys, because a company admin has to be able to predict who gets
   an email about whose money.
   ========================================================================== */

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const label = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const parseRecipients = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

export function DigestPanel({ canEdit }: { canEdit: boolean }) {
  const { roleLabel, status: authStatus } = useCRM();
  const { data, loading, error, reload } = useApiQuery(
    () => fetchDigestSettings(),
    [],
    authStatus === "ready",
  );

  const [draft, setDraft] = useState<DigestSettingsDto | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!data?.settings) return;
    setDraft(data.settings);
    setRecipientsText(data.settings.recipients.join(", "));
  }, [data]);

  const save = async () => {
    if (!draft) return;
    const recipients = parseRecipients(recipientsText);
    const invalid = recipients.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalid.length) {
      toast.error(
        `${invalid.join(", ")} ${invalid.length === 1 ? "is not" : "are not"} a valid email address`,
      );
      return;
    }
    setSaving(true);
    try {
      const result = await saveDigestSettings({ ...draft, recipients });
      setDraft(result.settings);
      toast.success(
        result.settings.enabled
          ? `Daily email on — ${label(result.settings.hour)} ${data?.timezone ?? "local"} time`
          : "Daily email off",
      );
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the daily email settings"));
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const result = await sendDigestNow();
      if (result.status === "sent") {
        toast.success(`Sent to ${result.to} — ${result.total} things on today's list`);
      } else if (result.status === "failed") {
        toast.error("The email failed — check the account above");
      } else {
        toast.warning("Queued, not delivered — connect an email account above to send it for real");
      }
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the digest"));
    } finally {
      setSending(false);
    }
  };

  if (authStatus !== "ready" || (loading && !draft)) {
    return (
      <div className="branch-list" style={{ marginBottom: 16 }}>
        <div className="security-row">
          <div>
            <h3>Daily email</h3>
            <p>
              {authStatus === "ready"
                ? "Checking what is switched on…"
                : "This one sends real email, so it switches on once you sign in to your own workspace."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="branch-list" style={{ marginBottom: 16 }}>
        <div className="security-row">
          <div>
            <h3>Daily email</h3>
            <p>{error ?? "Could not read the daily email settings."}</p>
          </div>
          <Button variant="outline" onClick={() => reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const team = draft.scope === "team";
  const who = recipientsText.trim()
    ? "the addresses below"
    : "every active teammate, each with their own list";

  return (
    <>
      <h3 style={{ marginTop: 28 }}>Daily email</h3>
      <p>
        {draft.enabled
          ? `Every morning at ${label(draft.hour)}, ${who} gets one email with what needs doing — the same list as the home page.`
          : "One email each morning with the work that needs a person that day. Off until you switch it on."}
        {draft.lastSentDate ? ` Last sent ${draft.lastSentDate}.` : ""}
      </p>

      <div className="branch-list" style={{ marginBottom: 16 }}>
        <div className="security-row">
          <div>
            <h3>{draft.enabled ? `On — ${label(draft.hour)} daily` : "Off"}</h3>
            <p>
              {team
                ? "Recipients see the whole company's work, not only their own."
                : "Each person sees only the records they own plus the unclaimed queue."}
              {canEdit ? "" : ` Only an admin can change this — you are signed in as ${roleLabel}.`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={!canEdit}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            />
            Send it
          </label>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Time of day
          <select
            value={draft.hour}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, hour: Number(event.target.value) })}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {label(hour)}
              </option>
            ))}
          </select>
        </label>
        <label>
          What it contains
          <select
            value={draft.scope}
            disabled={!canEdit}
            onChange={(event) =>
              setDraft({ ...draft, scope: event.target.value === "team" ? "team" : "mine" })
            }
          >
            <option value="mine">Each person's own work</option>
            <option value="team">The whole company's work</option>
          </select>
        </label>
        <label>
          Send to specific addresses instead of everyone
          <input
            placeholder="ops@yourcompany.com, director@yourcompany.com"
            value={recipientsText}
            disabled={!canEdit}
            onChange={(event) => setRecipientsText(event.target.value)}
          />
        </label>
      </div>
      <p className="field-hint">
        Leave that empty to email every active teammate. A shared mailbox has nobody behind it, so
        it always gets the company-wide list.
      </p>

      <div className="dialog-actions">
        <Button disabled={!canEdit || saving} onClick={() => void save()}>
          <Check /> Save daily email
        </Button>
        <Button variant="outline" disabled={sending} onClick={() => void sendNow()}>
          <Send /> Send it to me now
        </Button>
      </div>

      <p className="field-hint">
        <Mail className="size-3.5" /> Without an email account above, the message is written to the
        outbox and queued rather than delivered.
      </p>
    </>
  );
}
