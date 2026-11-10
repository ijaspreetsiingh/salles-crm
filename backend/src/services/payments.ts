import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { resolveRazorpayAccount } from "./channels";
import { syncRecordMoney } from "./payment-ledger";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export async function razorpayConfigured(organizationId?: string): Promise<boolean> {
  if (organizationId) {
    const account = await resolveRazorpayAccount(organizationId);
    return Boolean(account?.keyId && account?.keySecret);
  }
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/**
 * Creates a real Razorpay order + checkout link for an invoice record.
 * Per-company: uses organisation's own Razorpay credentials if configured,
 * falls back to platform env vars.
 * Without credentials the payment is still recorded (status "created") so
 * the finance screen can track collections, but no money actually moves.
 */
export async function createInvoicePaymentLink(input: {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  reference: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}): Promise<{ id: string; status: string; checkoutUrl: string | null }> {
  if (input.amount <= 0) throw new BadRequestError("Invoice amount must be greater than zero");

  const record = await prisma.record.findFirst({
    where: { organizationId: input.organizationId, reference: input.reference, deletedAt: null },
  });
  if (!record) throw new NotFoundError("Invoice record");

  let providerOrderId: string | null = null;
  let checkoutUrl: string | null = null;

  const account = await resolveRazorpayAccount(input.organizationId);
  if (account?.keyId && account?.keySecret) {
    const auth = Buffer.from(`${account.keyId}:${account.keySecret}`).toString("base64");
    const response = await fetch(`${RAZORPAY_BASE}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100), // paise
        currency: input.currency,
        accept_partial: false,
        customer: {
          name: input.customerName,
          email: input.customerEmail || undefined,
          contact: input.customerPhone ? input.customerPhone.replace(/[^\d]/g, "") : undefined,
        },
        reference_id: input.reference,
        description: `${input.organizationName} invoice ${input.reference}`,
        /*
         * Org identity travels with the payment so the webhook can find the
         * right tenant before it verifies the signature. `org_id` is the key
         * the webhook reads first; the slug is kept for older links that are
         * still live in the wild.
         */
        notes: {
          org_id: input.organizationId,
          org_slug: input.organizationSlug,
          record_reference: input.reference,
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      short_url?: string;
      error?: { description?: string };
    } | null;
    if (!response.ok) {
      throw new BadRequestError(
        payload?.error?.description ?? `Razorpay error (${response.status})`,
      );
    }
    providerOrderId = payload?.id ?? null;
    checkoutUrl = payload?.short_url ?? null;
  }

  const payment = await prisma.payment.create({
    data: {
      organizationId: input.organizationId,
      recordReference: input.reference,
      amount: input.amount,
      currency: input.currency,
      method: account?.keyId ? "Razorpay" : "Recorded",
      status: "created",
      provider: "razorpay",
      providerOrderId,
      checkoutUrl,
    },
  });

  return { id: payment.id, status: payment.status, checkoutUrl };
}

/**
 * Initiates a refund at Razorpay and returns what the provider actually
 * accepted. The caller records the ledger entry only after this succeeds, so
 * a failed provider call never makes the books claim money came back.
 *
 * Cash or bank-transfer refunds skip this and use a normal ledger entry.
 */
export async function refundRazorpayPayment(input: {
  organizationId: string;
  providerPaymentId: string;
  amount?: number;
  reason?: string;
}): Promise<{ refundId: string; status: string; amount: number }> {
  const account = await resolveRazorpayAccount(input.organizationId);
  if (!account?.keyId || !account.keySecret) {
    throw new BadRequestError("Razorpay is not configured for this workspace");
  }

  const auth = Buffer.from(`${account.keyId}:${account.keySecret}`).toString("base64");
  const response = await fetch(
    `${RAZORPAY_BASE}/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        ...(input.amount ? { amount: Math.round(input.amount * 100) } : {}),
        speed: "normal",
        ...(input.reason ? { notes: { reason: input.reason.slice(0, 120) } } : {}),
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    status?: string;
    amount?: number;
    error?: { description?: string };
  } | null;

  if (!response.ok) {
    throw new BadRequestError(payload?.error?.description ?? `Razorpay error (${response.status})`);
  }

  return {
    refundId: payload?.id ?? "",
    status: payload?.status ?? "created",
    amount: (payload?.amount ?? 0) / 100,
  };
}

/**
 * Verifies a Razorpay webhook signature (HMAC SHA256 of the raw body).
 *
 * The secret is per organisation when the workspace stores one, so the caller
 * can pass it in; otherwise the platform env secret is used. A missing secret
 * always fails closed.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret?: string | null,
): Promise<boolean> {
  const key = secret || env.RAZORPAY_WEBHOOK_SECRET;
  if (!key || !signature) return false;
  const crypto = await import("node:crypto");
  const expected = crypto.createHmac("sha256", key).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  // timingSafeEqual throws on length mismatch, which would be a 500 instead of
  // a clean 400. Compare lengths first.
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Finds the organisation that a webhook payload belongs to, without trusting
 * it: the id is only used to pick which secret to verify against.
 */
export async function resolveWebhookOrganization(payload: {
  payload?: { payment?: { entity?: { notes?: Record<string, string> } } };
}): Promise<{ id: string; slug: string; webhookSecret: string } | null> {
  const notes = payload.payload?.payment?.entity?.notes ?? {};
  const organizationId = notes["org_id"];
  const organizationSlug = notes["org_slug"];

  const organization = organizationId
    ? await prisma.organization.findUnique({ where: { id: organizationId } })
    : organizationSlug
      ? await prisma.organization.findUnique({ where: { slug: organizationSlug } })
      : null;
  if (!organization) return null;

  // Per-org secret lives in the channel settings, same place as the key.
  const { resolveRazorpayAccount } = await import("./channels");
  const account = await resolveRazorpayAccount(organization.id);
  return {
    id: organization.id,
    slug: organization.slug,
    webhookSecret: account?.webhookSecret ?? "",
  };
}

import { runSingleReconciliation } from "./reconciliation";

/** Marks payments paid from a verified webhook payload. */
export async function applyWebhookEvent(payload: {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        contact?: string;
        created_at?: number;
        notes?: Record<string, string>;
      };
    };
    payment_link?: { entity?: { id?: string; status?: string } };
  };
  organizationId?: string;
}): Promise<{ updated: number }> {
  const link = payload.payload?.payment_link?.entity;
  const paymentEntity = payload.payload?.payment?.entity;

  // ── payment.captured → auto-reconcile ────────────────────────────────────
  if (
    (payload.event === "payment.captured" || payload.event === "payment.authorized") &&
    paymentEntity?.id &&
    payload.organizationId
  ) {
    const amountRupees = (paymentEntity.amount ?? 0) / 100;
    const paidAt = paymentEntity.created_at
      ? new Date(paymentEntity.created_at * 1000)
      : new Date();

    await runSingleReconciliation({
      organizationId: payload.organizationId,
      razorpayPaymentId: paymentEntity.id,
      razorpayOrderId: paymentEntity.order_id ?? null,
      amount: amountRupees,
      currency: paymentEntity.currency ?? "INR",
      paidAt,
      contact: paymentEntity.contact ?? null,
      notes: paymentEntity.notes ?? {},
    }).catch(() => undefined); // reconciliation is best-effort — never block the webhook response
  }

  // ── payment_link.paid → mark the linked payment row ──────────────────────
  if (!link?.id) return { updated: 0 };
  const status = ["paid", "completed"].includes(String(link.status)) ? "paid" : String(link.status);
  const settled = status === "paid";
  const result = await prisma.payment.updateMany({
    where: {
      providerOrderId: link.id,
      status: { notIn: ["paid"] },
      ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
    },
    data: {
      status: settled ? "paid" : "failed",
      paidAt: settled ? new Date() : null,
    },
  });

  // The ledger owns the invoice status. Setting "Paid" here would mark a
  // ₹5,000 part payment as settling a ₹92,000 invoice, and `extra.received`
  // would still say zero. Re-derive the document from the receipt instead.
  if (settled) {
    const payments = await prisma.payment.findMany({
      where: {
        providerOrderId: link.id,
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
      },
      select: { organizationId: true, moduleId: true, recordReference: true },
      distinct: ["organizationId", "moduleId", "recordReference"],
    });
    for (const row of payments) {
      if (!row.recordReference) continue;
      await syncRecordMoney({
        organizationId: row.organizationId,
        moduleId: row.moduleId,
        reference: row.recordReference,
      }).catch(() => undefined); // a resync failure must not fail the webhook
    }
  }

  return { updated: result.count };
}
