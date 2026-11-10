/**
 * Payment Reconciliation Service.
 *
 * Matches Razorpay payments to open invoices (Payment rows) automatically.
 *
 * Matching priority:
 *  1. providerPaymentId already stored     → 100% (already reconciled)
 *  2. providerOrderId match                → 100%
 *  3. recordReference match from notes     → 95%
 *  4. Unique amount match                  → 80%
 *
 * Results are written to Payment:
 *   status  → "paid"
 *   paidAt  → timestamp from Razorpay
 *   checkoutUrl → stores razorpayPaymentId for audit trail (re-using existing field)
 */

import { prisma } from "../lib/prisma";
import { recordAudit } from "./audit";
import { logger } from "../lib/logger";

export type ReconciliationItem = {
  paymentId: string;
  amount: number;
  currency: string;
  provider: string;
  status: "matched" | "unmatched" | "partial";
  invoiceId: string | null;
  invoiceRef: string | null;
  matchedAt: string | null;
  notes: string;
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** All "open / unpaid" statuses we consider reconcilable */
const OPEN_STATUSES = [
  "pending",
  "Pending",
  "due",
  "Due",
  "created",
  "Created",
  "partial",
  "Partial",
];

async function markPaid(
  paymentId: string,
  razorpayPaymentId: string,
  paidAt: Date,
  confidence: number,
  matchMethod: string,
): Promise<void> {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "paid",
      paidAt,
      // Store reconciliation info in providerPaymentId (existing column)
      providerPaymentId: razorpayPaymentId,
      // Store match metadata in signature field (existing column, not used post-payment)
      signature: JSON.stringify({
        reconciled: true,
        matchMethod,
        confidence,
        reconciledAt: new Date().toISOString(),
      }),
    },
  });
}

/**
 * Try to reconcile a single Razorpay payment event.
 * Called from the webhook handler on payment.captured.
 */
export async function runSingleReconciliation(opts: {
  organizationId: string;
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  amount: number;
  currency: string;
  paidAt: Date;
  contact: string | null;
  notes: Record<string, string>;
}): Promise<{ matched: boolean; invoiceId: string | null; confidence: number }> {
  const { organizationId, razorpayPaymentId, razorpayOrderId, amount, currency, paidAt, notes } =
    opts;

  // Step 1: already reconciled?
  const alreadyDone = await prisma.payment.findFirst({
    where: { organizationId, providerPaymentId: razorpayPaymentId },
  });
  if (alreadyDone) return { matched: true, invoiceId: alreadyDone.id, confidence: 100 };

  // Step 2: match by Razorpay order ID
  if (razorpayOrderId) {
    const byOrder = await prisma.payment.findFirst({
      where: { organizationId, providerOrderId: razorpayOrderId, status: { in: OPEN_STATUSES } },
    });
    if (byOrder) {
      await markPaid(byOrder.id, razorpayPaymentId, paidAt, 100, "razorpay_order_id");
      await recordAudit({
        organizationId,
        action: "PaymentReconciled",
        moduleId: "finance",
        recordId: byOrder.id,
        label: `Auto-reconciled via Razorpay order ${razorpayOrderId}`,
      });
      return { matched: true, invoiceId: byOrder.id, confidence: 100 };
    }
  }

  // Step 3: match by reference from payment notes
  const refFromNotes = notes["invoice_ref"] ?? notes["reference"] ?? notes["booking_ref"] ?? null;
  if (refFromNotes) {
    const byRef = await prisma.payment.findFirst({
      where: { organizationId, recordReference: refFromNotes, status: { in: OPEN_STATUSES } },
    });
    if (byRef) {
      await markPaid(byRef.id, razorpayPaymentId, paidAt, 95, "reference_match");
      await recordAudit({
        organizationId,
        action: "PaymentReconciled",
        moduleId: "finance",
        recordId: byRef.id,
        label: `Auto-reconciled by reference "${refFromNotes}"`,
      });
      return { matched: true, invoiceId: byRef.id, confidence: 95 };
    }
  }

  // Step 4: unique amount match
  const byAmount = await prisma.payment.findMany({
    where: {
      organizationId,
      amount: { gte: amount - 1, lte: amount + 1 },
      currency,
      status: { in: OPEN_STATUSES },
    },
  });
  if (byAmount.length === 1) {
    await markPaid(byAmount[0].id, razorpayPaymentId, paidAt, 80, "amount_match");
    await recordAudit({
      organizationId,
      action: "PaymentReconciled",
      moduleId: "finance",
      recordId: byAmount[0].id,
      label: `Auto-reconciled by amount ${currency} ${amount}`,
    });
    return { matched: true, invoiceId: byAmount[0].id, confidence: 80 };
  }

  logger.info(
    { organizationId, razorpayPaymentId, amount, currency },
    "Razorpay payment unmatched — needs manual review",
  );
  return { matched: false, invoiceId: null, confidence: 0 };
}

/**
 * Batch reconciliation — scans pending payments against Razorpay records
 * stored via providerOrderId. Safe to run any time.
 */
export async function runBatchReconciliation(
  organizationId: string,
): Promise<{ matched: number; unmatched: number }> {
  const openPayments = await prisma.payment.findMany({
    where: { organizationId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  // EmailOutbox rows tagged channel=razorpay carry the providerRef (Razorpay payment ID)
  const rzpEntries = await prisma.emailOutbox.findMany({
    where: { organizationId, channel: "razorpay", status: "sent", providerRef: { not: null } },
    take: 500,
  });

  let matched = 0;
  let unmatched = 0;

  for (const entry of rzpEntries) {
    if (!entry.providerRef) {
      unmatched++;
      continue;
    }

    // Reference match
    const byRef = entry.relatedReference
      ? openPayments.find((p) => p.recordReference === entry.relatedReference)
      : undefined;
    if (byRef) {
      await markPaid(
        byRef.id,
        entry.providerRef,
        entry.sentAt ?? new Date(),
        95,
        "batch_reference",
      );
      matched++;
      continue;
    }

    unmatched++;
  }

  return { matched, unmatched };
}

/** Summary for the finance reconciliation panel. */
export async function getReconciliationSummary(
  organizationId: string,
  from?: Date,
  to?: Date,
): Promise<{
  total: number;
  matched: number;
  unmatched: number;
  partial: number;
  items: ReconciliationItem[];
}> {
  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items: ReconciliationItem[] = payments.map((p) => {
    // Reconciliation info is stored in the signature field as JSON
    const sigMeta = (() => {
      try {
        return p.signature ? (JSON.parse(p.signature) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();
    const reconciled = Boolean(sigMeta["reconciled"]);
    const isPaid = p.status === "paid" || p.status === "Paid";
    const status: "matched" | "unmatched" | "partial" = reconciled
      ? "matched"
      : p.status === "partial" || p.status === "Partial"
        ? "partial"
        : "unmatched";

    return {
      paymentId: p.id,
      amount: p.amount,
      currency: p.currency ?? "INR",
      provider: reconciled ? "razorpay" : "manual",
      status,
      invoiceId: p.id,
      invoiceRef: p.referenceNo ?? p.recordReference ?? null,
      matchedAt: reconciled ? ((sigMeta["reconciledAt"] as string | null) ?? null) : null,
      notes: reconciled
        ? `Matched via ${sigMeta["matchMethod"] ?? "auto"} (${sigMeta["confidence"] ?? "?"}% confidence)`
        : isPaid
          ? "Manually marked paid"
          : "Awaiting payment",
    };
  });

  return {
    total: items.length,
    matched: items.filter((i) => i.status === "matched").length,
    unmatched: items.filter((i) => i.status === "unmatched").length,
    partial: items.filter((i) => i.status === "partial").length,
    items,
  };
}
