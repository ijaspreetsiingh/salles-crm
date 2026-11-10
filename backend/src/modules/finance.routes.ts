import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import {
  createInvoicePaymentLink,
  razorpayConfigured,
  verifyWebhookSignature,
  resolveWebhookOrganization,
  applyWebhookEvent,
} from "../services/payments";
import { generateInvoicePdf } from "../services/invoice-pdf";
import { generateQuotationPdf } from "../services/quotation-pdf";
import { ledgerTotals } from "../services/payment-ledger";
import { resolveInvoiceTax } from "../services/tax";
import { computeInvoiceGst } from "../services/gst";
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
  validate(paymentLinkSchema),
  asyncHandler(async (req, res) => {
    const reference = req.params.reference;
    const record = await prisma.record.findFirst({
      where: { organizationId: req.auth!.organizationId, reference, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Invoice record");
    if (record.amount <= 0) throw new BadRequestError("This invoice has no amount to collect");

    // Collect only what is still owed: a part-paid invoice must not be charged twice.
    const totals = await ledgerTotals({
      organizationId: req.auth!.organizationId,
      moduleId: "finance",
      reference,
      total: record.amount,
    });
    if (totals.balance <= 0) {
      throw new BadRequestError("This invoice is already fully paid");
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });

    const link = await createInvoicePaymentLink({
      organizationId: req.auth!.organizationId,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      reference,
      amount: totals.balance,
      currency: record.currency || organization.currency || "INR",
      customerName: (req.body as z.infer<typeof paymentLinkSchema>).customerName || record.name,
      customerEmail: (req.body as z.infer<typeof paymentLinkSchema>).customerEmail || record.email,
      customerPhone: (req.body as z.infer<typeof paymentLinkSchema>).customerPhone || record.phone,
    });

    const configured = await razorpayConfigured(req.auth!.organizationId);

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "finance",
      recordId: record.id,
      label: `Payment link for ${reference}`,
      meta: { provider: "razorpay", configured },
      req,
    });

    return created(res, { ...link, configured });
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

/**
 * GST working paper for a period.
 *
 * Amounts on invoices and supplier bills are tax-inclusive (the form adds GST
 * on top of the line items), so tax is carved back out: tax = amount − amount/(1+rate).
 * Output tax comes from invoices raised, input credit from supplier bills.
 */
const taxQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

router.get(
  "/tax-summary",
  requirePermission("view"),
  validate(taxQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const now = new Date();
    const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    const from = (req.query.from as string | undefined) ?? `${fyStartYear}-04-01`;
    const to = (req.query.to as string | undefined) ?? `${fyStartYear + 1}-03-31`;
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T23:59:59`);

    const split = (amount: number, rate: number) => {
      if (rate <= 0) return { taxable: amount, tax: 0 };
      const taxable = amount / (1 + rate / 100);
      return { taxable, tax: amount - taxable };
    };
    const monthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const [invoices, bills, organization] = await Promise.all([
      prisma.record.findMany({
        where: {
          organizationId: req.auth!.organizationId,
          moduleId: "finance",
          deletedAt: null,
          date: { gte: from, lte: to },
        },
        select: {
          reference: true,
          name: true,
          amount: true,
          status: true,
          date: true,
          currency: true,
          extra: true,
        },
      }),
      prisma.payable.findMany({
        where: { organizationId: req.auth!.organizationId },
      }),
      prisma.organization.findUniqueOrThrow({ where: { id: req.auth!.organizationId } }),
    ]);

    type Bucket = { taxable: number; tax: number; count: number };
    const out: Bucket = { taxable: 0, tax: 0, count: 0 };
    // Split the output tax the way GSTR-3B asks for it.
    const outSplit = { igst: 0, cgst: 0, sgst: 0, zeroRated: 0, exports: 0 };
    const inp: Bucket = { taxable: 0, tax: 0, count: 0 };
    const months = new Map<string, { output: number; input: number }>();
    const rates = new Map<number, { output: number; input: number }>();
    const invoiceLines: Array<{
      reference: string;
      name: string;
      date: string;
      rate: number;
      taxable: number;
      tax: number;
      tcs: number;
      tcsRate: number;
      total: number;
    }> = [];
    /** TCS is money held for the government, so it is reported apart from GST. */
    const orgSettings = JSON.parse(organization.settings || "{}") as Record<string, unknown>;
    const defaultTcsPercent = Number(orgSettings["tcsPercent"] ?? 0) || 0;
    const defaultGstRate = Number(orgSettings["taxRate"] ?? 0) || 0;
    const tcsTotals = { collected: 0, count: 0 };
    const tcsByRate = new Map<number, number>();

    const sellerState = (
      String(orgSettings["stateCode"] ?? "") ||
      (String(orgSettings["gstin"] ?? organization.gstin ?? "")).slice(0, 2) ||
      ""
    ).trim();
    const zeroRatedExports = orgSettings["exportUnderLut"] !== false;

    for (const invoice of invoices) {
      const status = (invoice.status || "").toLowerCase();
      if (status === "draft" || status === "cancelled") continue;
      const extra = JSON.parse(invoice.extra || "{}") as Record<string, unknown>;
      // The same GST engine the invoice PDF and the GSTR exports use, so the
      // working paper can never disagree with a filed return.
      const gst = computeInvoiceGst({
        reference: invoice.reference,
        name: invoice.name,
        date: invoice.date,
        currency: invoice.currency || organization.currency || "INR",
        amount: invoice.amount,
        extra,
        defaultRate: defaultGstRate,
        sellerState,
        zeroRatedExports,
        defaultTcsPercent,
      });
      const { rate, taxable, tax } = gst;
      if (gst.treatment.zeroRated) {
        outSplit.zeroRated += taxable;
        outSplit.exports += 1;
      } else {
        outSplit.igst += gst.igst;
        outSplit.cgst += gst.cgst;
        outSplit.sgst += gst.sgst;
      }
      // TCS is charged on the billed value of the service, so the invoice total is the base.
      const tcsRate = Number(extra["tcsRate"] ?? defaultTcsPercent) || 0;
      const tcs = tcsRate > 0 ? Math.round(invoice.amount * tcsRate) / 100 : 0;
      if (tcs > 0) {
        tcsTotals.collected += tcs;
        tcsTotals.count += 1;
        tcsByRate.set(tcsRate, (tcsByRate.get(tcsRate) ?? 0) + tcs);
      }
      out.taxable += taxable;
      out.tax += tax;
      out.count += 1;
      const key = invoice.date.slice(0, 7);
      const month = months.get(key) ?? { output: 0, input: 0 };
      month.output += tax;
      months.set(key, month);
      const rateRow = rates.get(rate) ?? { output: 0, input: 0 };
      rateRow.output += tax;
      rates.set(rate, rateRow);
      invoiceLines.push({
        reference: invoice.reference,
        name: invoice.name,
        date: invoice.date,
        rate,
        taxable,
        tax,
        tcs,
        tcsRate,
        total: invoice.amount,
      });
    }

    for (const bill of bills) {
      const when = bill.dueDate ?? bill.createdAt;
      if (when < fromDate || when > toDate) continue;
      const { taxable, tax } = split(bill.amount, bill.gstRate);
      inp.taxable += taxable;
      inp.tax += tax;
      inp.count += 1;
      const key = monthKey(when);
      const month = months.get(key) ?? { output: 0, input: 0 };
      month.input += tax;
      months.set(key, month);
      const rateRow = rates.get(bill.gstRate) ?? { output: 0, input: 0 };
      rateRow.input += tax;
      rates.set(bill.gstRate, rateRow);
    }

    const round = (value: number) => Math.round(value * 100) / 100;

    return ok(res, {
      period: { from, to, financialYear: organization.financialYear },
      output: {
        taxable: round(out.taxable),
        tax: round(out.tax),
        count: out.count,
        igst: round(outSplit.igst),
        cgst: round(outSplit.cgst),
        sgst: round(outSplit.sgst),
        zeroRated: round(outSplit.zeroRated),
        exports: outSplit.exports,
      },
      input: { taxable: round(inp.taxable), tax: round(inp.tax), count: inp.count },
      net: round(out.tax - inp.tax),
      tcs: {
        rate: defaultTcsPercent,
        collected: round(tcsTotals.collected),
        count: tcsTotals.count,
        byRate: [...tcsByRate.entries()]
          .sort(([a], [b]) => a - b)
          .map(([rate, collected]) => ({ rate, collected: round(collected) })),
      },
      months: [...months.entries()]
        .filter(([, value]) => value.output > 0.5 || value.input > 0.5)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          output: round(value.output),
          input: round(value.input),
          net: round(value.output - value.input),
        })),
      rates: [...rates.entries()]
        .filter(([, value]) => value.output > 0.5 || value.input > 0.5)
        .sort(([a], [b]) => a - b)
        .map(([rate, value]) => ({ rate, output: round(value.output), input: round(value.input) })),
      invoices: invoiceLines.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100),
    });
  }),
);

/** Razorpay webhook — public, signature-verified against the raw body. */
const webhookRouter = Router();
webhookRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const signature = req.header("x-razorpay-signature");
    // app.ts captures the exact bytes; never re-serialise a signed payload.
    const raw =
      (req as unknown as { rawBody?: string }).rawBody ??
      (typeof req.body === "string" ? req.body : "");

    const body = req.body as {
      event: string;
      payload?: {
        payment?: { entity?: { notes?: Record<string, string> } };
        payment_link?: { entity?: { id?: string; status?: string } };
      };
    };

    // Pick the tenant from the payload, then verify with *that* tenant's
    // secret (falling back to the platform secret).
    const organization = await resolveWebhookOrganization(body);
    const valid = await verifyWebhookSignature(
      raw,
      signature,
      organization?.webhookSecret || null,
    );
    if (!valid) throw new BadRequestError("Invalid webhook signature");

    const result = await applyWebhookEvent({
      ...body,
      organizationId: organization?.id,
    });
    return ok(res, result);
  }),
);

export default router;
export { webhookRouter };
