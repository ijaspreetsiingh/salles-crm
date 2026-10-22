import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { NotFoundError, BadRequestError } from "../lib/errors";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/**
 * Creates a real Razorpay order + checkout link for an invoice record.
 * Without Razorpay keys the payment is still recorded (status "created") so
 * the finance screen can track collections, but no money actually moves.
 */
export async function createInvoicePaymentLink(input: {
  organizationId: string;
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

  if (razorpayConfigured()) {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
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
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { id?: string; short_url?: string; error?: { description?: string } }
      | null;
    if (!response.ok) {
      throw new BadRequestError(payload?.error?.description ?? `Razorpay error (${response.status})`);
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
      method: razorpayConfigured() ? "Razorpay" : "Recorded",
      status: "created",
      provider: "razorpay",
      providerOrderId,
      checkoutUrl,
    },
  });

  return { id: payment.id, status: payment.status, checkoutUrl };
}

/** Verifies a Razorpay webhook signature (HMAC SHA256 of the raw body). */
export async function verifyWebhookSignature(rawBody: string, signature: string | undefined): Promise<boolean> {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const crypto = await import("node:crypto");
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** Marks payments paid from a verified webhook payload. */
export async function applyWebhookEvent(payload: {
  event: string;
  payload?: { payment_link?: { entity?: { id?: string; status?: string } } };
}): Promise<{ updated: number }> {
  const link = payload.payload?.payment_link?.entity;
  if (!link?.id) return { updated: 0 };
  const status = ["paid", "completed"].includes(String(link.status)) ? "paid" : String(link.status);
  const result = await prisma.payment.updateMany({
    where: { providerOrderId: link.id, status: { notIn: ["paid"] } },
    data: { status: status === "paid" ? "paid" : "failed", paidAt: status === "paid" ? new Date() : null },
  });
  // Mark the invoice record Paid when its link settles.
  if (status === "paid") {
    const payment = await prisma.payment.findFirst({ where: { providerOrderId: link.id } });
    if (payment?.recordReference) {
      const invoice = await prisma.record.findFirst({
        where: { organizationId: payment.organizationId, reference: payment.recordReference, deletedAt: null },
      });
      if (invoice) {
        await prisma.record.update({ where: { id: invoice.id }, data: { status: "Paid" } });
      }
    }
  }
  return { updated: result.count };
}
