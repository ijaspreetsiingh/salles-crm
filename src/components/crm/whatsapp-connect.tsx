import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import {
  connectWhatsAppWeb,
  disconnectWhatsAppWeb,
  fetchWhatsAppWeb,
  sendWhatsAppWebTest,
  type WhatsAppWebStatusDto,
} from "@/lib/api/modules";

/* ==========================================================================
   WhatsApp Connect — redesigned for zero-training setup.

   Method A (recommended): Scan a QR code — any WhatsApp number, 30 seconds.
   Method B: Meta Business Cloud API — for high-volume, requires Meta approval.

   The QR method is shown first and largest. Meta API is a secondary option
   with a step-by-step checklist so someone who has never used Meta Business
   Manager can still get through it.
   ========================================================================== */

// ── Meta API checklist steps ─────────────────────────────────────────────────

const META_CHECKLIST = [
  {
    step: 1,
    title: "Create a Meta Business Account",
    detail: "Go to business.facebook.com → Create account. Use your business email.",
    link: "https://business.facebook.com/",
    linkLabel: "Open Meta Business Manager",
  },
  {
    step: 2,
    title: "Add a phone number",
    detail: "In WhatsApp Manager → Add phone number. Must be a number NOT already on WhatsApp.",
    link: "https://business.facebook.com/latest/whatsapp_manager",
    linkLabel: "Open WhatsApp Manager",
  },
  {
    step: 3,
    title: "Get a permanent access token",
    detail: "Meta for Developers → Your App → WhatsApp → API Setup. Copy the access token.",
    link: "https://developers.facebook.com/apps/",
    linkLabel: "Open Meta for Developers",
  },
  {
    step: 4,
    title: "Paste your credentials here",
    detail: "Go to Settings → Email & WhatsApp → WhatsApp Cloud API section.",
    link: null,
    linkLabel: null,
  },
];

export function WhatsAppConnect({ onSkip }: { onSkip?: () => void } = {}) {
  const [status, setStatus] = useState<WhatsAppWebStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [method, setMethod] = useState<"qr" | "meta" | "skip" | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  };

  const refresh = async () => {
    try {
      const next = await fetchWhatsAppWeb();
      setStatus(next);
      if (next.linked) stopPolling();
      return next;
    } catch (err) {
      toast.error(errorMessage(err, "Could not read the WhatsApp connection"));
      return null;
    }
  };

  useEffect(() => {
    void refresh();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const next = await connectWhatsAppWeb();
      setStatus(next);
      if (next.state === "error" && next.error) toast.error(next.error);
      else if (next.linked) toast.success("WhatsApp is already linked");
      stopPolling();
      poll.current = setInterval(() => void refresh(), 3000);
    } catch (err) {
      toast.error(errorMessage(err, "Could not start the WhatsApp pairing"));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const next = await disconnectWhatsAppWeb();
      setStatus(next);
      stopPolling();
      toast.success("WhatsApp unlinked from this workspace");
    } catch (err) {
      toast.error(errorMessage(err, "Could not unlink WhatsApp"));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!testTo.trim()) return;
    setBusy(true);
    try {
      const result = await sendWhatsAppWebTest(testTo.trim());
      if (result.status === "sent") toast.success("✓ Test message sent — check that phone");
      else if (result.status === "failed") toast.error("WhatsApp refused the message");
      else toast.info("Queued — link the number first");
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the test message"));
    } finally {
      setBusy(false);
    }
  };

  const toggleMetaStep = (step: number) => {
    setCheckedSteps((prev) =>
      prev.includes(step) ? prev.filter((s) => s !== step) : [...prev, step],
    );
  };

  const linked = status?.linked ?? false;
  const qr = status?.qr ?? null;

  // ── Already linked ─────────────────────────────────────────────────────────
  if (linked) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-xl bg-green-600 flex items-center justify-center">
            <CheckCircle2 className="size-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-green-900">WhatsApp connected</p>
            <p className="text-xs text-green-700">
              {status?.me?.split(":")[0] ?? "Your number"} is active
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-green-200 p-3 mb-4 text-xs text-green-800">
          <strong>Keep the phone online.</strong> WhatsApp drops a linked device after about two
          weeks of inactivity — just open WhatsApp on that phone once in a while.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="+91 98765 43210"
            className="h-9 w-52 text-sm"
          />
          <Button
            size="sm"
            disabled={busy || !testTo.trim()}
            onClick={() => void test()}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Send className="size-4 mr-1" /> Send test message
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
            <LogOut className="size-4 mr-1" /> Unlink
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* ── Method selector ─────────────────────────────────────────────── */}
      {method === null ? (
        /* First-time: show 3 big cards, let user choose */
        <div className="grid gap-3">
          <p className="text-sm font-semibold">How do you want to connect WhatsApp?</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {/* QR */}
            <button
              onClick={() => setMethod("qr")}
              className="rounded-2xl border-2 border-green-400 bg-green-50 p-4 text-left hover:bg-green-100 transition-colors"
            >
              <div className="size-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
                <QrCode className="size-5 text-green-600" />
              </div>
              <p className="font-semibold text-sm mb-1">Scan QR code</p>
              <p className="text-xs text-muted leading-relaxed">
                Any existing WhatsApp number. Takes 30 seconds. No approvals needed.
              </p>
              <span className="mt-2 inline-block rounded-full bg-green-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                START HERE
              </span>
            </button>

            {/* Meta API */}
            <button
              onClick={() => setMethod("meta")}
              className="rounded-2xl border-2 border-line bg-white p-4 text-left hover:bg-glass-1 transition-colors"
            >
              <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <Zap className="size-5 text-blue-600" />
              </div>
              <p className="font-semibold text-sm mb-1">Meta Cloud API</p>
              <p className="text-xs text-muted leading-relaxed">
                Best for 1,000+ messages/day. Requires Meta Business account &amp; approval (2–7
                days).
              </p>
              <span className="mt-2 inline-block rounded-full bg-gray-200 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600">
                ADVANCED
              </span>
            </button>

            {/* Skip */}
            <button
              onClick={() => {
                setMethod("skip");
                onSkip?.();
              }}
              className="rounded-2xl border-2 border-line bg-white p-4 text-left hover:bg-glass-1 transition-colors"
            >
              <div className="size-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <ArrowRight className="size-5 text-gray-400" />
              </div>
              <p className="font-semibold text-sm mb-1">Set up later</p>
              <p className="text-xs text-muted leading-relaxed">
                Skip for now. You can connect WhatsApp any time from Settings → Channels.
              </p>
            </button>
          </div>
        </div>
      ) : (
        /* After choice: show tab switcher */
        <div className="flex gap-2">
          <button
            onClick={() => setMethod("qr")}
            className={cn(
              "flex-1 rounded-xl border-2 p-3 text-left transition-colors",
              method === "qr"
                ? "border-green-500 bg-green-50"
                : "border-line bg-white hover:bg-glass-1",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <QrCode className={cn("size-4", method === "qr" ? "text-green-600" : "text-muted")} />
              <span className="text-sm font-semibold">Scan QR code</span>
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                RECOMMENDED
              </span>
            </div>
            <p className="text-xs text-muted">
              Any WhatsApp number. 30 seconds. No account needed.
            </p>
          </button>

          <button
            onClick={() => setMethod("meta")}
            className={cn(
              "flex-1 rounded-xl border-2 p-3 text-left transition-colors",
              method === "meta"
                ? "border-blue-500 bg-blue-50"
                : "border-line bg-white hover:bg-glass-1",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className={cn("size-4", method === "meta" ? "text-blue-600" : "text-muted")} />
              <span className="text-sm font-semibold">Meta Cloud API</span>
            </div>
            <p className="text-xs text-muted">High volume. Needs Meta approval (2–7 days).</p>
          </button>

          <button
            onClick={() => setMethod(null)}
            className="rounded-xl border-2 border-line bg-white px-3 text-xs text-muted hover:bg-glass-1 transition-colors"
            title="Back to options"
          >
            ← Back
          </button>
        </div>
      )}

      {/* ── QR Method ───────────────────────────────────────────────────── */}
      {method === "qr" && (
        <div className="rounded-2xl border border-line bg-white p-5">
          {qr ? (
            /* QR visible */
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="rounded-2xl border-2 border-green-200 bg-white p-2 flex items-center justify-center">
                <img src={qr} alt="WhatsApp pairing QR code" className="size-48" />
              </div>
              <div className="grid content-start gap-3">
                <div>
                  <p className="font-semibold text-foreground mb-2">Scan this with your phone</p>
                  <ol className="space-y-2">
                    {[
                      "Open WhatsApp on your business phone",
                      "Tap ⋮ Settings → Linked devices",
                      "Tap Link a device",
                      "Point the camera at this QR",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted">
                        <span className="size-5 rounded-full bg-green-100 text-green-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
                <p className="text-xs text-muted bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  QR refreshes every 60 seconds. If it expires, click "New QR code".
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    New QR code
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void refresh()}>
                    <Check className="size-4 mr-1" /> I've scanned it
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Not started yet */
            <div className="text-center py-4">
              <div className="size-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Smartphone className="size-8 text-green-600" />
              </div>
              <p className="font-semibold mb-1">Connect your WhatsApp in 30 seconds</p>
              <p className="text-sm text-muted mb-4">
                No new account needed. Works with any existing WhatsApp number.
              </p>
              {status?.error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 mb-3 text-xs text-red-700">
                  <AlertCircle className="size-4 shrink-0" />
                  {status.error}
                </div>
              )}
              <Button
                disabled={busy}
                onClick={() => void start()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <QrCode className="size-4 mr-2" />
                )}
                {busy ? "Opening WhatsApp…" : "Generate QR code"}
              </Button>
              <p className="text-[11px] text-muted mt-3 flex items-center justify-center gap-1">
                <Link2 className="size-3" />
                Session stored on this server only — unlink any time from your phone
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Meta Cloud API Method ────────────────────────────────────────── */}
      {method === "meta" && (
        <div className="rounded-2xl border border-line bg-white p-5 grid gap-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Zap className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold">Meta WhatsApp Business Cloud API</p>
              <p className="text-sm text-muted">
                Best for sending 1,000+ messages/day. Requires Meta verification which takes 2–7
                business days.
              </p>
            </div>
          </div>

          {/* Step-by-step checklist */}
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Step-by-step setup
            </p>
            {META_CHECKLIST.map(({ step, title, detail, link, linkLabel }) => {
              const done = checkedSteps.includes(step);
              return (
                <div
                  key={step}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    done ? "border-green-200 bg-green-50" : "border-line bg-glass-1",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleMetaStep(step)}
                      className={cn(
                        "size-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        done
                          ? "border-green-500 bg-green-500"
                          : "border-gray-300 hover:border-green-400",
                      )}
                    >
                      {done && <Check className="size-3.5 text-white" />}
                    </button>
                    <div className="flex-1">
                      <p className={cn("text-sm font-semibold", done && "line-through text-muted")}>
                        {step}. {title}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{detail}</p>
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:underline"
                        >
                          {linkLabel} <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          {checkedSteps.length > 0 && (
            <div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(checkedSteps.length / 4) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {checkedSteps.length} of 4 steps done
                {checkedSteps.length === 4 &&
                  " — paste your credentials in Settings → Email & WhatsApp"}
              </p>
            </div>
          )}

          {checkedSteps.length === 4 && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-blue-600 shrink-0" />
              All steps done! Go to{" "}
              <a href="/workspace/settings" className="underline font-semibold">
                Settings → Email & WhatsApp
              </a>{" "}
              and paste your Token + Phone Number ID.
            </div>
          )}
        </div>
      )}
      {/* ── Skipped ─────────────────────────────────────────────────────── */}
      {method === "skip" && (
        <div className="rounded-2xl border border-line bg-glass-1 p-5 text-center">
          <p className="text-sm text-muted mb-2">WhatsApp setup skipped for now.</p>
          <p className="text-xs text-muted">
            You can connect any time from{" "}
            <a href="/workspace/settings" className="underline text-foreground">
              Settings → Channels
            </a>
            .
          </p>
          <button
            onClick={() => setMethod(null)}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            ← Choose a connection method
          </button>
        </div>
      )}
    </div>
  );
}
