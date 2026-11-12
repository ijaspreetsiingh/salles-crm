/**
 * GST e-Invoice routes — IRN generation, QR code, and status.
 *
 * POST /api/v1/einvoice/:invoiceRecordId/generate  — generate IRN and store result
 * GET  /api/v1/einvoice/:invoiceRecordId/status    — current IRN status
 * GET  /api/v1/einvoice/:invoiceRecordId/qr        — QR code data URL
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { generateIRN, irnToQrDataUrl, isEInvoiceConfigured, type EInvoicePayload } from "../services/einvoice";
import { parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

/** Buyer details provided by the user at generate time. */
const generateSchema = z.object({
  buyerGstin: z.string().length(15, "GSTIN must be exactly 15 characters"),
  buyerName: z.string().min(1).max(100),
  buyerAddr: z.string().min(1).max(200),
  buyerState: z.string().length(2, "State code must be 2 digits (e.g. 07 for Delhi)"),
  buyerPincode: z.string().min(6).max(6),
});

/** Checks if e-invoicing is configured and returns the status. */
router.get(
  "/config",
  asyncHandler(async (_req, res) => {
    return ok(res, {
      configured: isEInvoiceConfigured(),
      sandbox: process.env.IRP_SANDBOX === "true",
    });
  }),
);

/** Returns the current IRN status for a finance/invoice record. */
router.get(
  "/:recordId/status",
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const record = await prisma.record.findFirst({
      where: {
        id: req.params.recordId,
        organizationId,
        moduleId: "finance",
        deletedAt: null,
      },
    });
    if (!record) throw new NotFoundError("Invoice");

    const extra = parseJson<Record<string, unknown>>(record.extra as string, {});
    return ok(res, {
      hasIrn: Boolean(extra.irn),
      irn: extra.irn ?? null,
      ackNo: extra.irnAckNo ?? null,
      ackDate: extra.irnAckDate ?? null,
      generatedAt: extra.irnGeneratedAt ?? null,
    });
  }),
);

/** Returns a QR code data URL for the IRN, for embedding in PDF. */
router.get(
  "/:recordId/qr",
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const record = await prisma.record.findFirst({
      where: { id: req.params.recordId, organizationId, moduleId: "finance", deletedAt: null },
    });
    if (!record) throw new NotFoundError("Invoice");

    const extra = parseJson<Record<string, unknown>>(record.extra as string, {});
    if (!extra.irnSignedQr) {
      throw new BadRequestError("No IRN has been generated for this invoice yet");
    }

    const qrDataUrl = await irnToQrDataUrl(String(extra.irnSignedQr));
    return ok(res, { qrDataUrl });
  }),
);

/**
 * Generates an IRN for a finance/invoice record.
 *
 * The invoice must have:
 *   - reference (invoice number)
 *   - date
 *   - amount > 0
 *   - at least one line item in extra.items (or the total is used as a single-line)
 *   - buyerGstin from the request body
 *
 * On success, the IRN, ackNo, ackDate and signedQrCode are stored in the
 * record's `extra` JSON so they survive without a second IRP call.
 */
router.post(
  "/:recordId/generate",
  requirePermission("approve"),
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name } = req.auth!;
    const body = req.body as z.infer<typeof generateSchema>;

    const record = await prisma.record.findFirst({
      where: { id: req.params.recordId, organizationId, moduleId: "finance", deletedAt: null },
    });
    if (!record) throw new NotFoundError("Invoice");

    const extra = parseJson<Record<string, unknown>>(record.extra as string, {});
    if (extra.irn) {
      throw new BadRequestError(
        `This invoice already has IRN ${extra.irn}. Cancel the existing IRN before generating a new one.`,
      );
    }

    if (!record.reference) throw new BadRequestError("Invoice must have a reference number before generating an IRN");
    if (!record.date) throw new BadRequestError("Invoice must have a date");
    if (!record.amount || Number(record.amount) <= 0) {
      throw new BadRequestError("Invoice amount must be greater than zero");
    }

    // Build a single-line payload from the record. For multi-line invoices,
    // the items are stored in extra.items as an array.
    const items = Array.isArray(extra.items) ? extra.items as Array<Record<string, unknown>> : [];
    const totalAmount = Number(record.amount);
    const gstRate = Number(extra.gstRate ?? 18);
    const baseAmount = +(totalAmount / (1 + gstRate / 100)).toFixed(2);
    const taxAmount = +(totalAmount - baseAmount).toFixed(2);

    // For intra-state: split CGST/SGST; for inter-state: IGST.
    // We default to IGST (inter-state) unless the state codes match.
    const orgStateCode = process.env.ORG_STATE_CODE ?? "07";
    const isIntraState = orgStateCode === body.buyerState;
    const cgst = isIntraState ? +(taxAmount / 2).toFixed(2) : 0;
    const sgst = isIntraState ? +(taxAmount / 2).toFixed(2) : 0;
    const igst = isIntraState ? 0 : taxAmount;

    const lineItems =
      items.length > 0
        ? items.map((item, i) => ({
            slNo: String(i + 1),
            prdDesc: String(item.description ?? "Travel Service"),
            isServc: "Y" as const,
            hsnCd: String(item.hsnCode ?? "998555"), // 9985 SAC for travel services
            qty: Number(item.qty ?? 1),
            unit: "NOS",
            unitPrice: Number(item.unitPrice ?? item.amount ?? 0),
            totAmt: Number(item.amount ?? 0),
            assAmt: Number(item.baseAmount ?? item.amount ?? 0),
            gstRt: Number(item.gstRate ?? gstRate),
            igstAmt: isIntraState ? 0 : +(Number(item.taxAmount ?? 0)).toFixed(2),
            cgstAmt: isIntraState ? +(Number(item.taxAmount ?? 0) / 2).toFixed(2) : 0,
            sgstAmt: isIntraState ? +(Number(item.taxAmount ?? 0) / 2).toFixed(2) : 0,
            totItemVal: Number(item.amount ?? 0),
          }))
        : [
            {
              slNo: "1",
              prdDesc: record.name || "Travel Service",
              isServc: "Y" as const,
              hsnCd: "998555",
              qty: 1,
              unit: "NOS",
              unitPrice: baseAmount,
              totAmt: totalAmount,
              assAmt: baseAmount,
              gstRt: gstRate,
              igstAmt: igst,
              cgstAmt: cgst,
              sgstAmt: sgst,
              totItemVal: totalAmount,
            },
          ];

    const eInvoicePayload: EInvoicePayload = {
      invoiceNumber: record.reference,
      invoiceDate: new Date(record.date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      invoiceType: "B2B",
      supplyType: "O",
      buyerGstin: body.buyerGstin,
      buyerName: body.buyerName,
      buyerAddr: body.buyerAddr,
      buyerState: body.buyerState,
      buyerPincode: body.buyerPincode,
      items: lineItems,
      totalAssessableValue: baseAmount,
      totalIgst: igst,
      totalCgst: cgst,
      totalSgst: sgst,
      totalInvoiceValue: totalAmount,
    };

    const result = await generateIRN(eInvoicePayload);

    if (result.status === "not_configured") {
      return ok(res, { status: "not_configured", message: result.reason });
    }

    if (result.status === "error") {
      throw new BadRequestError(`IRP error: ${result.reason}${result.code ? ` (${result.code})` : ""}`);
    }

    // Store the IRN and QR code in the record's extra JSON.
    const updatedExtra = {
      ...extra,
      irn: result.irn,
      irnAckNo: result.ackNo,
      irnAckDate: result.ackDate,
      irnSignedQr: result.signedQrCode,
      irnGeneratedAt: new Date().toISOString(),
      irnBuyerGstin: body.buyerGstin,
    };

    await prisma.record.update({
      where: { id: record.id },
      data: { extra: JSON.stringify(updatedExtra) },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "finance",
      recordId: record.id,
      label: `IRN generated: ${result.irn} for invoice ${record.reference}`,
      actorId: userId,
      actorName: name,
    });

    const qrDataUrl = await irnToQrDataUrl(result.signedQrCode);

    return ok(res, {
      status: "success",
      irn: result.irn,
      ackNo: result.ackNo,
      ackDate: result.ackDate,
      qrDataUrl,
    });
  }),
);

export default router;
