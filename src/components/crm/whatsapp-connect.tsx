import { useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, LogOut, QrCode, RefreshCw, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import {
  connectWhatsAppWeb,
  disconnectWhatsAppWeb,
  fetchWhatsAppWeb,
  sendWhatsAppWebTest,
  type WhatsAppWebStatusDto,
} from "@/lib/api/modules";

/**
 * Link the agency's own WhatsApp by scanning a QR — the same multi-device
 * pairing WhatsApp Web uses. The socket lives on the server, so once paired
 * every quotation, invoice and reminder can go out from the number customers
 * already know.
 */
export function WhatsAppConnect() {
  const [status, setStatus] = useState<WhatsAppWebStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
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
      poll.current = setInterval(() => {
        void refresh();
      }, 3000);
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
      if (result.status === "sent") toast.success("Sent — check that phone");
      else if (result.status === "failed")
        toast.error("WhatsApp refused the message — open the server log for the reason");
      else toast.info("Queued — link the number first");
    } catch (err) {
      toast.error(errorMessage(err, "Could not send the test message"));
    } finally {
      setBusy(false);
    }
  };

  const linked = status?.linked ?? false;
  const qr = status?.qr ?? null;

  return (
    <section className="glass-card mb-5 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-pine/10 text-pine">
          <Smartphone className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Your WhatsApp number (scan to link)</h3>
          <p className="text-xs text-muted">
            Link the number your team already answers on. Messages then go out from this
            workspace — no Meta developer account needed.
          </p>
        </div>
        <span
          className={`status ${
            linked ? "status-success" : status?.state === "error" ? "status-danger" : "status-warning"
          }`}
        >
          <span />
          {linked ? "Linked" : status?.state === "qr" ? "Waiting for scan" : "Not linked"}
        </span>
      </header>

      {linked ? (
        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-rim bg-solid/60 p-3 text-sm">
            <p className="font-semibold">{status?.me?.split(":")[0] ?? "WhatsApp"}</p>
            <p className="text-xs text-muted">
              This device sends quotations, invoices and reminders automatically. Keep the phone
              online — WhatsApp drops a linked device after about two weeks of silence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="+91 98765 43210"
              className="h-9 w-56 rounded-xl border border-rim bg-solid px-3 text-sm"
            />
            <Button size="sm" disabled={busy || !testTo.trim()} onClick={() => void test()}>
              <Send className="size-4" /> Send test message
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
              <LogOut className="size-4" /> Unlink
            </Button>
          </div>
        </div>
      ) : qr ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="rounded-xl border border-rim bg-white p-2">
            <img src={qr} alt="WhatsApp pairing QR code" className="size-48" />
          </div>
          <div className="grid content-start gap-2 text-sm">
            <p className="font-semibold">Scan this with your phone</p>
            <ol className="grid gap-1 text-xs text-muted">
              <li>1. Open WhatsApp on the business phone.</li>
              <li>2. Tap Settings → Linked devices → Link a device.</li>
              <li>3. Point the camera at this QR.</li>
            </ol>
            <p className="text-xs text-muted">
              The code refreshes on its own; if it says expired, press a new code.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                New QR code
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  stopPolling();
                  void refresh();
                }}
              >
                <Check className="size-4" /> I have scanned it
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {status?.error && <p className="text-xs text-tomato">{status.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void start()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
              {busy ? "Opening WhatsApp…" : "Generate QR code"}
            </Button>
            {status?.state === "connecting" && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" /> Talking to WhatsApp…
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Link2 className="size-3.5" /> The session is stored on this server only; unlink any time
            from the phone.
          </p>
        </div>
      )}
    </section>
  );
}
