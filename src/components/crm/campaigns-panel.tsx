import { useEffect, useMemo, useState } from "react";
import { Check, Megaphone, Plus, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { modules } from "@/lib/crm/catalog";
import { getSchema } from "@/lib/crm/schema";
import { useApiQuery } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import {
  createCampaign,
  deleteCampaign,
  fetchCampaignAudience,
  fetchCampaignDeliveries,
  fetchCampaigns,
  sendCampaignNow,
  type CampaignDto,
} from "@/lib/api/campaigns";

/**
 * Campaigns.
 *
 * Three questions the screen answers without a manual: who is in the audience,
 * what will they receive, and what happened after I pressed send. Opt-outs are
 * counted out loud rather than hidden, so nobody discovers the gap later.
 */
export function Campaigns() {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    channel: "email" as "email" | "whatsapp",
    subject: "",
    body: "Hi {{name}},\n\nSummer fares to Bali are open — 6 nights with breakfast from ₹62,000 per person.\n\nReply to this message and I will hold the rooms for you.\n",
    audienceModule: "customers",
    statuses: [] as string[],
    scheduledFor: "" as string, // empty = send immediately; ISO local datetime otherwise
  });

  const { data: campaigns, loading, error, reload } = useApiQuery(() => fetchCampaigns(), []);
  const list = campaigns ?? [];

  // A send runs in the background; refresh while anything is still going.
  const sending = list.some((campaign) => campaign.status === "sending");
  useEffect(() => {
    if (!sending) return;
    const timer = setInterval(reload, 2500);
    return () => clearInterval(timer);
  }, [sending, reload]);

  const audienceModules = useMemo(
    () =>
      modules.filter((module) =>
        ["leads", "customers", "bookings", "quotations"].includes(module.id),
      ),
    [],
  );
  const statusOptions = useMemo(
    () => getSchema(draft.audienceModule)?.statuses ?? [],
    [draft.audienceModule],
  );

  const totalSent = list.reduce((sum, campaign) => sum + campaign.sent, 0);
  const totalFailed = list.reduce((sum, campaign) => sum + campaign.failed, 0);

  const save = async () => {
    if (draft.name.trim().length < 2) {
      toast.error("Give the campaign a name you will recognise later");
      return;
    }
    if (!draft.body.trim()) {
      toast.error("Write the message first");
      return;
    }
    setBusy(true);
    try {
      const campaign = await createCampaign({
        name: draft.name.trim(),
        channel: draft.channel,
        ...(draft.channel === "email" ? { subject: draft.subject.trim() } : {}),
        body: draft.body,
        audienceModule: draft.audienceModule,
        statuses: draft.statuses,
        // Convert local datetime-local value to ISO string; empty = send immediately.
        ...(draft.scheduledFor ? { scheduledFor: new Date(draft.scheduledFor).toISOString() } : {}),
      });
      toast.success(
        draft.scheduledFor
          ? `Campaign scheduled for ${new Date(draft.scheduledFor).toLocaleString("en-IN")}`
          : "Campaign saved as a draft — check the audience, then send",
      );
      setAdding(false);
      setOpen(campaign.id);
      setDraft({ ...draft, name: "", subject: "" });
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the campaign"));
    } finally {
      setBusy(false);
    }
  };

  const send = async (campaign: CampaignDto) => {
    setBusy(true);
    try {
      const result = await sendCampaignNow(campaign.id);
      toast.success(`Sending to ${result.queued} ${result.queued === 1 ? "person" : "people"}…`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the send"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (campaign: CampaignDto) => {
    try {
      await deleteCampaign(campaign.id);
      toast.success("Campaign deleted");
      if (open === campaign.id) setOpen(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the campaign"));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Campaigns" value={String(list.length)} hint="Drafts and sends" tone="pine" />
        <Stat label="Messages sent" value={String(totalSent)} hint="Across every campaign" />
        <Stat
          label="Failed"
          value={String(totalFailed)}
          hint={totalFailed > 0 ? "Open the campaign to see why" : "Nothing bounced"}
          tone={totalFailed > 0 ? "tomato" : "ink"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAdding((value) => !value)}>
          <Plus className="size-4" /> New campaign
        </Button>
        <span className="text-xs text-muted">
          Audience comes from your own records. Anyone who opted out of a channel is left out
          automatically — the preview shows how many.
        </span>
      </div>

      {adding && (
        <section className="glass-card grid gap-3 p-4 md:grid-cols-2">
          <Field label="Campaign name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Bali summer offer — repeat customers"
              autoFocus
            />
          </Field>
          <Field label="Channel">
            <select
              value={draft.channel}
              onChange={(e) =>
                setDraft({ ...draft, channel: e.target.value as "email" | "whatsapp" })
              }
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </Field>
          <Field label="Audience">
            <select
              value={draft.audienceModule}
              onChange={(e) => setDraft({ ...draft, audienceModule: e.target.value, statuses: [] })}
            >
              {audienceModules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Only these statuses (optional)">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {statusOptions.length === 0 && <span className="text-xs text-muted">Any status</span>}
              {statusOptions.map((status) => {
                const active = draft.statuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        statuses: active
                          ? draft.statuses.filter((value) => value !== status)
                          : [...draft.statuses, status],
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      active
                        ? "border-pine bg-pine/10 text-pine"
                        : "border-rim text-muted hover:border-pine/40"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </Field>
          {draft.channel === "email" && (
            <Field label="Subject">
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="e.g. 6 nights in Bali, from ₹62,000"
              />
            </Field>
          )}
          <div className="md:col-span-2">
            <Field label="Message · {{name}}, {{reference}} and {{destination}} fill themselves in">
              <textarea
                rows={6}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full rounded-xl border border-rim bg-solid p-3 text-sm"
              />
            </Field>
          </div>
          <Field label="Schedule send (optional — leave empty to send immediately)">
            <input
              type="datetime-local"
              value={draft.scheduledFor}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })}
              aria-label="Schedule send date and time"
            />
          </Field>
          {draft.scheduledFor && (
            <div className="flex items-center gap-2 rounded-xl border border-butter/40 bg-butter/10 px-3 py-2 text-xs text-butter md:col-span-2">
              <span className="font-semibold">Scheduled:</span>
              {new Date(draft.scheduledFor).toLocaleString("en-IN", {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
              <button
                type="button"
                className="ml-auto text-muted hover:text-foreground"
                onClick={() => setDraft({ ...draft, scheduledFor: "" })}
              >
                Clear
              </button>
            </div>
          )}
          <div className="md:col-span-2 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              <Check className="size-4" /> {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-tomato">{error}</p>}
      {loading && list.length === 0 && <p className="text-sm text-muted">Loading campaigns…</p>}

      {!loading && list.length === 0 && !adding && (
        <section className="glass-card p-6 text-center">
          <Megaphone className="mx-auto mb-3 size-6 text-muted" />
          <h3 className="text-base font-semibold">No campaigns yet</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
            Write one message, pick who should get it, and the CRM sends it with a record of every
            delivery. Opt-outs are respected without you checking a list.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Create the first campaign
          </Button>
        </section>
      )}

      {list.map((campaign) => (
        <section key={campaign.id} className="glass-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{campaign.name}</strong>
                <span className="rounded-full border border-rim px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  {campaign.channel === "whatsapp" ? "WhatsApp" : "Email"}
                </span>
                <CampaignStatus status={campaign.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {modules.find((module) => module.id === campaign.audienceModule)?.name ??
                  campaign.audienceModule}
                {campaign.statuses.length ? ` · ${campaign.statuses.join(", ")}` : " · any status"}
                {campaign.lastSentAt
                  ? ` · last sent ${new Date(campaign.lastSentAt).toLocaleString("en-IN")}`
                  : campaign.scheduledFor
                    ? ` · scheduled for ${new Date(campaign.scheduledFor).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : " · never sent"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-pine">
                <strong className="text-sm">{campaign.sent}</strong> sent
              </span>
              {campaign.failed > 0 && (
                <span className="text-tomato">
                  <strong className="text-sm">{campaign.failed}</strong> failed
                </span>
              )}
              {campaign.skipped > 0 && (
                <span className="text-muted">
                  <strong className="text-sm">{campaign.skipped}</strong> skipped
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(open === campaign.id ? null : campaign.id)}
            >
              <Users className="size-4" /> {open === campaign.id ? "Hide" : "Audience"}
            </Button>
            <Button
              size="sm"
              disabled={busy || campaign.status === "sending" || !campaign.body.trim()}
              onClick={() => void send(campaign)}
            >
              <Send className="size-4" /> {campaign.status === "sending" ? "Sending…" : "Send now"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Delete campaign"
              onClick={() => void remove(campaign)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {campaign.status === "sending" && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-well">
                <div
                  className="h-full rounded-full bg-pine transition-all"
                  style={{
                    width: `${Math.round(
                      ((campaign.sent + campaign.failed) / Math.max(1, campaign.total)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {campaign.sent + campaign.failed} of {campaign.total} done — safe to leave this
                page.
              </p>
            </div>
          )}

          {open === campaign.id && <CampaignDetail campaign={campaign} />}
        </section>
      ))}
    </div>
  );
}

function CampaignDetail({ campaign }: { campaign: CampaignDto }) {
  const { data: audience, loading: loadingAudience } = useApiQuery(
    () => fetchCampaignAudience(campaign.id),
    [campaign.id],
  );
  const { data: deliveries } = useApiQuery(
    () => fetchCampaignDeliveries(campaign.id),
    [campaign.id],
  );

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-rim bg-solid/60 p-3 md:grid-cols-2">
      <div>
        <h4 className="text-sm font-semibold">Who gets this</h4>
        {loadingAudience && !audience ? (
          <p className="mt-1 text-xs text-muted">Counting the audience…</p>
        ) : (
          <>
            <p className="mt-1 text-sm">
              <strong>{audience?.eligible ?? 0}</strong> will receive it
              {audience?.skippedOptedOut ? `, ${audience.skippedOptedOut} opted out` : ""}
              {audience?.skippedNoAddress
                ? `, ${audience.skippedNoAddress} without an address`
                : ""}
              .
            </p>
            <ul className="mt-2 grid gap-1 text-xs text-muted">
              {(audience?.sample ?? []).map((person) => (
                <li key={person.reference} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {person.name} · {person.reference}
                  </span>
                  <span className="truncate text-faint">{person.address}</span>
                </li>
              ))}
              {(audience?.sample.length ?? 0) === 0 && <li>Nobody matches this audience yet.</li>}
            </ul>
          </>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold">Delivery log</h4>
        {(deliveries?.length ?? 0) === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Nothing sent yet. After a send, every message and its outcome shows here.
          </p>
        ) : (
          <ul className="mt-2 grid max-h-56 gap-1 overflow-auto text-xs">
            {deliveries!.slice(0, 50).map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <span
                  className={`inline-flex size-2 shrink-0 rounded-full ${
                    row.status === "sent"
                      ? "bg-pine"
                      : row.status === "failed"
                        ? "bg-tomato"
                        : "bg-muted"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">{row.to}</span>
                <span className="shrink-0 text-faint">
                  {row.status === "sent" ? "sent" : row.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CampaignStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    draft: { label: "Draft", tone: "status-warning" },
    scheduled: { label: "Scheduled", tone: "status-warning" },
    sending: { label: "Sending", tone: "status-warning" },
    sent: { label: "Sent", tone: "status-success" },
    failed: { label: "Failed", tone: "status-danger" },
  };
  const entry = map[status] ?? { label: status, tone: "status-warning" };
  return (
    <span className={`status ${entry.tone}`}>
      <span /> {entry.label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "pine" | "tomato";
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === "pine" ? "text-pine" : tone === "tomato" ? "text-tomato" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</span>
      <span className="[&>input]:h-9 [&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-rim [&>input]:bg-solid [&>input]:px-3 [&>input]:text-sm [&>select]:h-9 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:border-rim [&>select]:bg-solid [&>select]:px-3 [&>select]:text-sm">
        {children}
      </span>
    </label>
  );
}
