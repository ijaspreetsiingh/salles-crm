import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission, requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import {
  createInvoicePaymentLink,
  razorpayConfigured,
  verifyWebhookSignature,
  applyWebhookEvent,
} from "../services/payments";
import { generateInvoicePdf } from "../services/invoice-pdf";
import { generateQuotationPdf } from "../services/quotation-pdf";
import { sendEmail } from "../services/email";

const router = Router();

/** Invoice actions (download PDF, request money, reminders). */
router.use(requireAuth);

/** Real, printable tax-invoice PDF for a finance record. */
router.get(
  "/invoices/:reference/invoice.pdf",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { filename, stream } = await generateInvoicePdf({
      organizationId: req.auth!.organizationId,
      reference: req.params.reference,
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
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  }),
);

/** Real, printable quotation PDF for a quotations record. */
router.get(
  "/quotations/:reference/quote.pdf",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { filename, stream } = await generateQuotationPdf({
      organizationId: req.auth!.organizationId,
      reference: req.params.reference,
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

/** Email the quotation PDF link… handled like invoices: real SMTP or queued. */
router.post(
  "/quotations/:reference/send",
  requirePermission("edit"),
  validate(z.object({ to: z.string().email(), note: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    const record = await prisma.record.findFirst({
      where: { organizationId: req.auth!.organizationId, reference, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Quotation record");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });
    const body = req.body as { to: string; note?: string };
    const outbox = await sendEmail({
      organizationId: req.auth!.organizationId,
      to: body.to,
      subject: `Quotation ${reference} from ${organization.name}`,
      body: [
        `Hi ${record.name},`,
        "",
        `Thank you for planning with ${organization.name}. Your quotation ${reference} for ${
          record.destination || "your trip"
        } is ready: ${record.currency || organization.currency} ${record.amount.toLocaleString("en-IN")} (taxes included as applicable).`,
        "The quotation is valid for 15 days — download the PDF from your Traveldesk workspace or reply to this email to proceed.",
        ...(body.note ? ["", body.note] : []),
        "",
        `${organization.name}`,
        organization.supportEmail ?? "",
      ].join("\n"),
      template: "quotation_send",
      userId: req.auth!.userId,
      relatedModule: "quotations",
      relatedReference: reference,
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "quotations",
      recordId: record.id,
      label: `Quote ${reference} emailed to ${body.to}`,
      req,
    });
    return ok(res, outbox);
  }),
);

const paymentLinkSchema = z.object({
  /** Overrides come from the client only when the record lacks contact fields. */
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().max(30).optional(),
  customerName: z.string().max(120).optional(),
});

/** Creates a real Razorpay payment link for an invoice. */
router.post(
  "/invoices/:reference/payment-link",
  requirePermission("edit"),
  requireRole("company_admin"),
  validate(paymentLinkSchema),
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    const record = await prisma.record.findFirst({
      where: { organizationId: req.auth!.organizationId, reference, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Invoice record");
    if (record.amount <= 0) throw new BadRequestError("This invoice has no amount to collect");

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });

    const link = await createInvoicePaymentLink({
      organizationId: req.auth!.organizationId,
      organizationName: organization.name,
      reference,
      amount: record.amount,
      currency: record.currency || organization.currency || "INR",
      customerName: (req.body as z.infer<typeof paymentLinkSchema>).customerName || record.name,
      customerEmail: (req.body as z.infer<typeof paymentLinkSchema>).customerEmail || record.email,
      customerPhone: (req.body as z.infer<typeof paymentLinkSchema>).customerPhone || record.phone,
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "finance",
      recordId: record.id,
      label: `Payment link for ${reference}`,
      meta: { provider: "razorpay", configured: razorpayConfigured() },
      req,
    });

    return created(res, { ...link, configured: razorpayConfigured() });
  }),
);

/** Email the invoice to the customer (real SMTP if configured, else queued). */
const reminderSchema = z.object({
  to: z.string().email(),
  note: z.string().max(1000).optional(),
});

router.post(
  "/invoices/:reference/send",
  requirePermission("edit"),
  validate(reminderSchema),
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    const record = await prisma.record.findFirst({
      where: { organizationId: req.auth!.organizationId, reference, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Invoice record");
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });
    const body = req.body as z.infer<typeof reminderSchema>;
    const outbox = await sendEmail({
      organizationId: req.auth!.organizationId,
      to: body.to,
      subject: `Invoice ${reference} from ${organization.name}`,
      body: [
        `Hi ${record.name},`,
        "",
        `Here is your invoice ${reference} for ${record.currency || organization.currency} ${record.amount.toLocaleString("en-IN")}.`,
        ...(body.note ? ["", body.note] : []),
        "",
        "Download the PDF from your Traveldesk workspace, or reply to this email for anything unclear.",
        "",
        `${organization.name}`,
        organization.supportEmail ?? "",
      ].join("\n"),
      template: "invoice_reminder",
      userId: req.auth!.userId,
      relatedModule: "finance",
      relatedReference: reference,
    });
    return ok(res, outbox);
  }),
);

/** The organisation's outbound email/WhatsApp history with delivery status. */
router.get(
  "/outbox",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 50), 200);
    const rows = await prisma.emailOutbox.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return ok(
      res,
      rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        to: row.to,
        subject: row.subject,
        body: row.body,
        template: row.template,
        status: row.status,
        error: row.error,
        relatedModule: row.relatedModule,
        relatedReference: row.relatedReference,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
    );
  }),
);

/** Razorpay webhook — public, signature-verified. */
const webhookRouter = Router();
webhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const signature = req.header("x-razorpay-signature");
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const valid = await verifyWebhookSignature(raw, signature);
    if (!valid) throw new BadRequestError("Invalid webhook signature");
    const result = await applyWebhookEvent(req.body as { event: string });
    return ok(res, result);
  }),
);

export default router;
export { webhookRouter };
