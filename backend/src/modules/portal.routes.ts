/**
 * Customer Self-Service Portal.
 *
 * Staff endpoints (JWT required):
 *   POST /portal/token                     Generate a time-limited portal link
 *
 * Public endpoints (portal token only):
 *   GET  /portal/:token                    Booking + its invoices + documents
 *   GET  /portal/:token/documents/:id      Download a voucher/attachment
 *   POST /portal/:token/pay                Create a Razorpay payment link
 *
 * The token is a short-lived JWT scoped to one booking record. It is the only
 * credential a traveller needs, and it can never read another tenant's data:
 * every query is filtered by the organisation id baked into the token.
 */

import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { env } from "../config/env";
import { parseJson } from "../lib/utils";
import { ledgerTotals } from "../services/payment-ledger";
import { createInvoicePaymentLink, razorpayConfigured } from "../services/payments";

const router = Router();

const PORTAL_TTL_DAYS = 7;
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

type PortalClaims = {
  sub: "portal";
  recordId: string;
  organizationId: string;
  exp: number;
};

function signPortalToken(recordId: string, organizationId: string): string {
  // `aud` keeps a portal token from ever being accepted as a staff token.
  const exp = Math.floor(Date.now() / 1000) + PORTAL_TTL_DAYS * 86400;
  return jwt.sign(
    { sub: "portal", recordId, organizationId, exp } satisfies PortalClaims,
    env.JWT_ACCESS_SECRET,
    { audience: "portal" },
  );
}

function verifyPortalToken(token: string): PortalClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: "portal",
  }) as PortalClaims;
  if (payload.sub !== "portal") throw new ForbiddenError("Invalid portal token");
  return payload;
}

function safeJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The public URL of the app the customer opens. */
const portalBase = () =>
  (env.PORTAL_URL || env.FRONTEND_URL || env.APP_URL).replace(/\/+$/, "");

// ── Staff: generate portal token ─────────────────────────────────────────────

router.post(
  "/token",
  requireAuth,
  requireModulePermission("bookings", "view"),
  validate(z.object({ recordId: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const { recordId } = req.body as { recordId: string };
    const { organizationId } = req.auth!;

    const record = await prisma.record.findFirst({
      where: { id: recordId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Booking record");
    // A portal link exposes a customer's trip, so only trip-like records may
    // be shared — never an arbitrary finance or internal record.
    if (!["bookings", "quotations", "leads"].includes(record.moduleId)) {
      throw new ForbiddenError("This record cannot be shared with a customer");
    }

    const token = signPortalToken(recordId, organizationId);
    const expiresAt = new Date(Date.now() + PORTAL_TTL_DAYS * 86400_000).toISOString();
    const url = `${portalBase()}/portal/${token}`;

    return created(res, { token, url, expiresAt });
  }),
);

// ── Public: get booking details ──────────────────────────────────────────────

/** Invoices raised against this booking, by either link shape. */
async function invoicesForBooking(organizationId: string, booking: { id: string; reference: string }) {
  const rows = await prisma.record.findMany({
    where: {
      organizationId,
      moduleId: "finance",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.filter((row) => {
    const extra = safeJson(row.extra);
    return (
      String(extra["bookingReference"] ?? "") === booking.reference ||
      String(extra["bookingId"] ?? "") === booking.id
    );
  });
}

router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    let claims: PortalClaims;
    try {
      claims = verifyPortalToken(req.params.token);
    } catch {
      throw new ForbiddenError("Portal link has expired or is invalid");
    }

    const record = await prisma.record.findFirst({
      where: { id: claims.recordId, organizationId: claims.organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Booking");

    const invoices = await invoicesForBooking(claims.organizationId, record);

    // Live balance from the ledger, not a number typed on the record.
    const invoiceDtos = await Promise.all(
      invoices.map(async (invoice) => {
        const totals = await ledgerTotals({
          organizationId: claims.organizationId,
          moduleId: "finance",
          reference: invoice.reference,
          total: invoice.amount,
        });
        const extra = safeJson(invoice.extra);
        return {
          id: invoice.id,
          reference: invoice.reference,
          amount: invoice.amount,
          paid: totals.net,
          balance: totals.balance,
          status: totals.balance <= 0 ? "Paid" : totals.net > 0 ? "Partially paid" : invoice.status,
          dueDate: invoice.date || null,
          paymentLink: String(extra["checkoutUrl"] ?? "") || null,
        };
      }),
    );

    // How much of the booking itself has actually been received.
    const bookingTotals = await ledgerTotals({
      organizationId: claims.organizationId,
      moduleId: "bookings",
      reference: record.reference,
      total: record.amount,
    });
    const invoicePaid = invoiceDtos.reduce((sum, invoice) => sum + invoice.paid, 0);
    const meta = safeJson(record.meta);

    // Documents the team uploaded against this booking (vouchers, tickets…).
    const vouchers = await prisma.attachment.findMany({
      where: { organizationId: claims.organizationId, recordId: record.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return ok(res, {
      id: record.id,
      reference: record.reference,
      customerName: record.name,
      destination: record.destination,
      departureDate: record.date,
      returnDate: String(meta["returnDate"] ?? ""),
      status: record.status,
      totalAmount: record.amount,
      paidAmount: Math.max(bookingTotals.net, invoicePaid),
      currency: record.currency || "INR",
      invoices: invoiceDtos,
      vouchers: vouchers.map((v) => ({
        id: v.id,
        type: "Document",
        supplierName: "",
        checkIn: null,
        checkOut: null,
        reference: v.filename,
        // Public, token-scoped download — never the staff /uploads route.
        downloadUrl: `/api/v1/portal/${req.params.token}/documents/${v.id}`,
      })),
    });
  }),
);

// ── Public: download a document ──────────────────────────────────────────────

router.get(
  "/:token/documents/:attachmentId",
  asyncHandler(async (req, res) => {
    let claims: PortalClaims;
    try {
      claims = verifyPortalToken(req.params.token);
    } catch {
      throw new ForbiddenError("Portal link has expired or is invalid");
    }

    // The attachment must belong to the booking named by the token.
    const attachment = await prisma.attachment.findFirst({
      where: {
        id: req.params.attachmentId,
        organizationId: claims.organizationId,
        recordId: claims.recordId,
      },
    });
    if (!attachment) throw new NotFoundError("Document");

    const filePath = path.join(uploadDir, attachment.storedName);
    if (!fs.existsSync(filePath)) throw new NotFoundError("File");

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    return fs.createReadStream(filePath).pipe(res);
  }),
);

// ── Public: initiate Razorpay payment ────────────────────────────────────────

const paySchema = z.object({
  /** Invoice record id (preferred) or invoice reference. */
  invoiceId: z.string().min(1).optional(),
  invoiceReference: z.string().min(1).optional(),
});

router.post(
  "/:token/pay",
  validate(paySchema),
  asyncHandler(async (req, res) => {
    let claims: PortalClaims;
    try {
      claims = verifyPortalToken(req.params.token);
    } catch {
      throw new ForbiddenError("Portal link has expired or is invalid");
    }

    const body = req.body as z.infer<typeof paySchema>;
    if (!body.invoiceId && !body.invoiceReference) {
      throw new NotFoundError("Invoice");
    }

    const booking = await prisma.record.findFirst({
      where: { id: claims.recordId, organizationId: claims.organizationId, deletedAt: null },
    });
    if (!booking) throw new NotFoundError("Booking");

    const invoice = await prisma.record.findFirst({
      where: {
        organizationId: claims.organizationId,
        moduleId: "finance",
        deletedAt: null,
        ...(body.invoiceId ? { id: body.invoiceId } : { reference: body.invoiceReference }),
      },
    });
    if (!invoice) throw new NotFoundError("Invoice");

    // The portal token is scoped to one booking. Paying another customer's
    // invoice with it must not be possible even inside the same company.
    const invoiceExtra = safeJson(invoice.extra);
    const linkedToThisBooking =
      String(invoiceExtra["bookingReference"] ?? "") === booking.reference ||
      String(invoiceExtra["bookingId"] ?? "") === booking.id ||
      (booking.email && invoice.email && invoice.email === booking.email);
    if (!linkedToThisBooking) {
      throw new ForbiddenError("This invoice does not belong to this booking");
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: claims.organizationId },
    });

    if (!(await razorpayConfigured(claims.organizationId))) {
      return ok(res, {
        paymentLink: null,
        message: "Online payment is not set up. Please contact your travel company.",
      });
    }

    const totals = await ledgerTotals({
      organizationId: claims.organizationId,
      moduleId: "finance",
      reference: invoice.reference,
      total: invoice.amount,
    });
    if (totals.balance <= 0) {
      return ok(res, { paymentLink: null, message: "This invoice is already fully paid." });
    }

    const link = await createInvoicePaymentLink({
      organizationId: claims.organizationId,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      reference: invoice.reference,
      amount: totals.balance,
      currency: invoice.currency || organization.currency || "INR",
      customerName: invoice.name || booking.name,
      customerEmail: invoice.email || booking.email,
      customerPhone: invoice.phone || booking.phone,
    });

    return ok(res, { paymentLink: link.checkoutUrl, message: null });
  }),
);

export default router;
