import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { recordAudit } from "../services/audit";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { refundRazorpayPayment } from "../services/payments";
import {
  createLedgerPayment,
  deleteLedgerPayment,
  generateReceiptPdf,
  ledgerTotals,
  mapPayment,
  syncRecordMoney,
} from "../services/payment-ledger";
import { eventPayment } from "../services/timeline";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  module: z.enum(["finance", "bookings"]),
  reference: z.string().min(1).max(40),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().max(8).optional(),
  method: z.string().max(40).optional(),
  kind: z.enum(["payment", "refund"]).optional(),
  referenceNo: z.string().max(120).optional(),
  note: z.string().max(400).optional(),
  paidOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** The ledger for one document, plus its totals. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const moduleId = String(req.query.module ?? "finance");
    const reference = String(req.query.reference ?? "");
    if (!reference) return ok(res, { items: [], totals: null });

    const record = await prisma.record.findFirst({
      where: {
        organizationId: req.auth!.organizationId,
        moduleId,
        reference,
        deletedAt: null,
      },
      select: { amount: true, extra: true },
    });

    let rows = await prisma.payment.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        moduleId,
        recordReference: reference,
      },
      orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    });

    // A record created before the ledger still carries one "received" number.
    // Move it into a real opening payment the first time anyone looks at it.
    if (rows.length === 0 && record) {
      const extra = JSON.parse(record.extra || "{}");
      if (Number(extra.received) > 0 || extra.ledgerMigrated) {
        await syncRecordMoney({
          organizationId: req.auth!.organizationId,
          moduleId,
          reference,
        });
        rows = await prisma.payment.findMany({
          where: {
            organizationId: req.auth!.organizationId,
            moduleId,
            recordReference: reference,
          },
          orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
        });
      }
    }

    const totals = await ledgerTotals({
      organizationId: req.auth!.organizationId,
      moduleId,
      reference,
      total: record?.amount ?? 0,
    });

    return ok(res, { items: rows.map(mapPayment), totals });
  }),
);

/** Record money that arrived (or was refunded). */
router.post(
  "/",
  requirePermission("edit"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const result = await createLedgerPayment({
      organizationId: req.auth!.organizationId,
      moduleId: body.module,
      reference: body.reference,
      amount: body.amount,
      currency: body.currency,
      method: body.method,
      kind: body.kind,
      referenceNo: body.referenceNo,
      note: body.note,
      paidOn: body.paidOn,
      createdById: req.auth!.userId,
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: body.module,
      label: `${body.kind === "refund" ? "Refund" : "Payment"} of ${
        result.payment.currency
      } ${body.amount.toLocaleString("en-IN")} on ${body.reference}`,
      meta: { paymentId: result.payment.id, receiptNo: result.payment.receiptNo },
      req,
    });

    // Timeline: write a "payment received" event on the linked record so the
    // agent can see the full payment history without opening the ledger.
    if (result.recordId) {
      void eventPayment(
        req.auth!.organizationId,
        result.recordId,
        body.amount,
        result.payment.currency || "INR",
        result.payment.method || "Cash",
        result.payment.receiptNo,
        req.auth!.userId,
        req.auth!.name,
      );
    }

    return created(res, result);
  }),
);

/**
 * Sends money back through Razorpay for a payment that arrived through
 * Razorpay, then records the refund in the ledger. A cash/bank refund uses
 * `POST /payments` with `kind: "refund"` instead.
 */
router.post(
  "/:id/refund",
  requirePermission("edit"),
  validate(
    z.object({
      amount: z.number().positive().max(1_000_000_000).optional(),
      reason: z.string().max(120).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as { amount?: number; reason?: string };
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!payment) throw new NotFoundError("Payment");
    if (payment.kind === "refund") throw new BadRequestError("This entry is already a refund");
    if (payment.status !== "paid") {
      throw new BadRequestError("Only a received payment can be refunded");
    }
    if (!payment.providerPaymentId) {
      throw new BadRequestError(
        "This payment has no Razorpay reference. Record a manual refund instead.",
      );
    }
    if (body.amount && body.amount > payment.amount) {
      throw new BadRequestError("A refund cannot be more than the amount received");
    }

    const refund = await refundRazorpayPayment({
      organizationId: req.auth!.organizationId,
      providerPaymentId: payment.providerPaymentId,
      amount: body.amount,
      reason: body.reason,
    });

    const entries = await createLedgerPayment({
      organizationId: req.auth!.organizationId,
      moduleId: payment.moduleId,
      reference: payment.recordReference,
      amount: body.amount ?? payment.amount,
      currency: payment.currency,
      method: "Razorpay",
      kind: "refund",
      referenceNo: refund.refundId,
      note: body.reason?.slice(0, 400) ?? "Refunded through Razorpay",
      createdById: req.auth!.userId,
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Refunded",
      moduleId: payment.moduleId,
      label: `Refund of ${payment.currency} ${(body.amount ?? payment.amount).toLocaleString(
        "en-IN",
      )} on ${payment.recordReference}`,
      meta: { paymentId: payment.id, refundId: refund.refundId },
      req,
    });

    return created(res, { refund, ...entries });
  }),
);

router.delete(
  "/:id",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const result = await deleteLedgerPayment({
      organizationId: req.auth!.organizationId,
      paymentId: req.params.id,
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "finance",
      label: `Payment ${req.params.id} removed`,
      req,
    });
    return ok(res, result);
  }),
);

/** Printable receipt for one payment. */
router.get(
  "/:id/receipt",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { filename, stream } = await generateReceiptPdf({
      organizationId: req.auth!.organizationId,
      paymentId: req.params.id,
    });
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
      stream.end();
    });
    const pdf = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  }),
);

export default router;
