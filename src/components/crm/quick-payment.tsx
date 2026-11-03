import { useState } from "react";
import { Ban, Check, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { createPayment } from "@/lib/api/payments";
import { PAYMENT_METHODS } from "./document-builder";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record money where the money is shown.
 *
 * An accountant should not have to open the edit form, hunt for a ledger row
 * and retype the invoice total to take a part payment. This form sits inside
 * the payments section: amount (pre-filled with the balance), mode, date,
 * reference and note, and the same fields again for a refund.
 */
export function QuickPaymentForm({
  moduleId,
  reference,
  currency,
  balance,
  onSaved,
}: {
  moduleId: "finance" | "bookings";
  reference: string;
  currency: string;
  /** Outstanding amount — offered as the default so collecting is one click. */
  balance?: number | undefined;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"payment" | "refund">("payment");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("UPI");
  const [paidOn, setPaidOn] = useState(today());
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const start = (next: "payment" | "refund") => {
    setKind(next);
    setAmount(next === "payment" && (balance ?? 0) > 0 ? String(balance) : "");
    setPaidOn(today());
    setReferenceNo("");
    setNote("");
    setOpen(true);
  };

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    setBusy(true);
    try {
      const result = await createPayment({
        module: moduleId,
        reference,
        amount: value,
        currency,
        method,
        kind,
        paidOn,
        ...(referenceNo.trim() ? { referenceNo: referenceNo.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(
        `${kind === "refund" ? "Refund" : "Payment"} recorded · ${
          result.payment.receiptNo ?? ""
        }`.trim(),
      );
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, "Could not record the payment"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="quick-pay__actions">
        <Button variant="outline" size="sm" onClick={() => start("payment")}>
          <Plus size={14} /> Record payment
        </Button>
        <Button variant="ghost" size="sm" onClick={() => start("refund")}>
          <Ban size={14} /> Refund
        </Button>
      </div>
    );
  }

  return (
    <div className="quick-pay" role="group" aria-label="Record a payment">
      <header className="quick-pay__head">
        <Wallet size={14} />
        <strong>{kind === "refund" ? "Refund to customer" : "Payment received"}</strong>
        <button type="button" className="quick-pay__cancel" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </header>
      <div className="quick-pay__grid">
        <label>
          <span>Amount ({currency})</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </label>
        <label>
          <span>Mode</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label>
          <span>Reference / UTR</span>
          <input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="e.g. 402913884512"
          />
        </label>
      </div>
      <label className="quick-pay__note">
        <span>Note</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Advance for Dubai package"
        />
      </label>
      <div className="quick-pay__foot">
        {kind === "payment" && (balance ?? 0) > 0 && (
          <button
            type="button"
            className="quick-pay__balance"
            onClick={() => setAmount(String(balance))}
          >
            Full balance {currency} {Number(balance).toLocaleString("en-IN")}
          </button>
        )}
        <Button size="sm" disabled={busy} onClick={() => void submit()}>
          <Check size={14} /> {busy ? "Saving…" : kind === "refund" ? "Refund" : "Record"}
        </Button>
      </div>
    </div>
  );
}
