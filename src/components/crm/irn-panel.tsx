/**
 * IRNPanel — GST e-Invoice IRN status and generation for finance records.
 *
 * Shows in the RecordSheet when module = "finance" (invoice records).
 * - If no IRN: shows a "Generate IRN" form with buyer GSTIN input
 * - If IRN exists: shows the IRN number, Ack No, date, and QR code
 * - If not configured: shows a friendly setup message
 */
import { useEffect, useState } from "react";
import { CheckCircle2, QrCode, AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkEInvoiceConfig,
  fetchIRNStatus,
  generateIRN,
  fetchIRNQrCode,
  type IRNStatus,
} from "@/lib/api/einvoice";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";

type Props = {
  invoiceRecordId: string;
  invoiceReference: string;
};

export function IRNPanel({ invoiceRecordId, invoiceReference }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [status, setStatus] = useState<IRNStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [buyerGstin, setBuyerGstin] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddr, setBuyerAddr] = useState("");
  const [buyerState, setBuyerState] = useState("07");
  const [buyerPincode, setBuyerPincode] = useState("");

  useEffect(() => {
    let cancelled = false;
    checkEInvoiceConfig()
      .then(({ configured: c, sandbox: s }) => {
        if (cancelled) return;
        setConfigured(c);
        setSandbox(s);
        if (c) {
          fetchIRNStatus(invoiceRecordId)
            .then((s) => { if (!cancelled) setStatus(s); })
            .catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; };
  }, [invoiceRecordId]);

  const handleGenerate = async () => {
    if (!buyerGstin.trim() || buyerGstin.length !== 15) {
      toast.error("GSTIN must be exactly 15 characters");
      return;
    }
    if (!buyerName.trim()) {
      toast.error("Buyer name is required");
      return;
    }
    if (!buyerPincode.trim() || buyerPincode.length !== 6) {
      toast.error("Pincode must be 6 digits");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateIRN(invoiceRecordId, {
        buyerGstin: buyerGstin.toUpperCase(),
        buyerName: buyerName.trim(),
        buyerAddr: buyerAddr.trim() || buyerName.trim(),
        buyerState: buyerState,
        buyerPincode: buyerPincode.trim(),
      });
      if (result.status === "not_configured") {
        toast.error(result.message);
        return;
      }
      setStatus({ hasIrn: true, irn: result.irn, ackNo: result.ackNo, ackDate: result.ackDate, generatedAt: new Date().toISOString() });
      setQrDataUrl(result.qrDataUrl);
      toast.success(`IRN generated: ${result.irn}`);
    } catch (err) {
      toast.error(errorMessage(err, "IRN generation failed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleShowQr = async () => {
    if (qrDataUrl) {
      setShowQr(!showQr);
      return;
    }
    try {
      const { qrDataUrl: url } = await fetchIRNQrCode(invoiceRecordId);
      setQrDataUrl(url);
      setShowQr(true);
    } catch (err) {
      toast.error(errorMessage(err, "Could not load QR code"));
    }
  };

  if (configured === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-line bg-glass-2 px-3 py-2">
        <Loader2 className="size-4 animate-spin text-muted" />
        <span className="text-xs text-muted">Checking e-invoice status…</span>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-line bg-glass-2 px-3 py-3">
        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-semibold">GST e-Invoicing not configured</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Set GSP_USERNAME, GSP_PASSWORD, GSP_CLIENT_ID, GSP_CLIENT_SECRET and GSTIN in the server
            environment to enable IRN generation on B2B invoices.
          </p>
        </div>
      </div>
    );
  }

  if (status?.hasIrn) {
    return (
      <div className="grid gap-2 rounded-xl border border-line bg-glass-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-green-500" aria-hidden />
          <span className="text-xs font-semibold">IRN Generated{sandbox ? " (Sandbox)" : ""}</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted">IRN</dt>
          <dd className="font-mono break-all">{status.irn}</dd>
          <dt className="text-muted">Ack No</dt>
          <dd className="font-mono">{status.ackNo}</dd>
          <dt className="text-muted">Ack Date</dt>
          <dd>{status.ackDate}</dd>
        </dl>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleShowQr()}
        >
          <QrCode className="size-3.5" /> {showQr ? "Hide QR" : "Show QR code"}
        </Button>
        {showQr && qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="GST e-Invoice QR code"
            className="mx-auto h-40 w-40 rounded-lg border border-line"
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-glass-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="text-xs font-semibold">Generate IRN for {invoiceReference}</span>
        {sandbox && <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">Sandbox</span>}
      </div>
      <p className="text-[11px] text-muted">
        Required for B2B invoices above the GSTIN threshold. The IRN and QR code will be stored and
        embedded in the invoice PDF.
      </p>
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Buyer GSTIN (15 chars)
          <input
            value={buyerGstin}
            onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
            className="rounded-lg border border-line bg-background px-2 py-1 text-xs font-mono"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Buyer name
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Buyer company name"
            className="rounded-lg border border-line bg-background px-2 py-1 text-xs"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Buyer address
          <input
            value={buyerAddr}
            onChange={(e) => setBuyerAddr(e.target.value)}
            placeholder="Buyer address"
            className="rounded-lg border border-line bg-background px-2 py-1 text-xs"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            State code (2 digits)
            <input
              value={buyerState}
              onChange={(e) => setBuyerState(e.target.value)}
              placeholder="07"
              maxLength={2}
              className="rounded-lg border border-line bg-background px-2 py-1 text-xs font-mono"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Pincode (6 digits)
            <input
              value={buyerPincode}
              onChange={(e) => setBuyerPincode(e.target.value)}
              placeholder="110001"
              maxLength={6}
              className="rounded-lg border border-line bg-background px-2 py-1 text-xs font-mono"
            />
          </label>
        </div>
      </div>
      <Button
        size="sm"
        disabled={generating || !buyerGstin.trim()}
        onClick={() => void handleGenerate()}
      >
        {generating ? (
          <><Loader2 className="size-3.5 animate-spin" /> Generating…</>
        ) : (
          <><ShieldCheck className="size-3.5" /> Generate IRN</>
        )}
      </Button>
    </div>
  );
}
