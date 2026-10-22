import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

/* ------------------------------------------------------------------ *
 * Call logs — every call your team makes, with the outcome.
 * ------------------------------------------------------------------ */

const callSchema = z.object({
  contactName: z.string().min(1).max(120),
  contactPhone: z.string().max(40).optional(),
  /** Inbound means the customer called you. */
  direction: z.enum(["Inbound", "Outbound"]).default("Outbound"),
  /** What came out of the call. */
  outcome: z
    .enum(["Connected", "No answer", "Busy", "Callback requested", "Not interested", "Converted"])
    .default("Connected"),
  /** Talk time in minutes. */
  durationMinutes: z.coerce.number().min(0).max(1440).default(0),
  notes: z.string().max(2000).optional(),
  /** The record the call was about (a lead, a customer…). */
  recordId: z.string().max(60).optional(),
  /** The agent who made the call. */
  owner: z.string().max(120).optional(),
});

const callDto = (row: {
  id: string;
  contactName: string;
  contactPhone: string;
  direction: string;
  outcome: string;
  durationMinutes: number;
  notes: string;
  recordId: string | null;
  ownerName: string;
  calledAt: Date;
}) => ({
  id: row.id,
  contactName: row.contactName,
  contactPhone: row.contactPhone,
  direction: row.direction,
  outcome: row.outcome,
  durationMinutes: row.durationMinutes,
  notes: row.notes,
  recordId: row.recordId,
  owner: row.ownerName,
  calledAt: row.calledAt.toISOString(),
});

/** Every logged call, newest first. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.callLog.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { calledAt: "desc" },
      take: Math.min(Number(req.query.take ?? 100), 200),
    });
    return ok(res, rows.map(callDto));
  }),
);

/** Logs a call. */
router.post(
  "/",
  requirePermission("edit"),
  validate(callSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof callSchema>;
    const row = await prisma.callLog.create({
      data: {
        organizationId: req.auth!.organizationId,
        contactName: body.contactName,
        contactPhone: body.contactPhone ?? "",
        direction: body.direction,
        outcome: body.outcome,
        durationMinutes: body.durationMinutes,
        notes: body.notes ?? "",
        recordId: body.recordId ?? null,
        ownerName: body.owner ?? "",
        calledById: req.auth!.userId,
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "inbox",
      label: `Call logged — ${row.contactName} (${row.outcome})`,
      req,
    });
    return created(res, callDto(row));
  }),
);

/** Removes a logged call. */
router.delete(
  "/:callId",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const row = await prisma.callLog.findFirst({
      where: { id: req.params.callId, organizationId: req.auth!.organizationId },
    });
    if (!row) throw new NotFoundError("Call log");
    await prisma.callLog.delete({ where: { id: row.id } });
    return ok(res, { deleted: true });
  }),
);

/* ------------------------------------------------------------------ *
 * Consent — what each customer agreed to be contacted on.
 * ------------------------------------------------------------------ */

const consentSchema = z.object({
  contactEmail: z.string().max(160),
  contactPhone: z.string().max(40).optional(),
  contactName: z.string().max(120).optional(),
  email: z.boolean().default(false),
  whatsapp: z.boolean().default(false),
  calls: z.boolean().default(false),
  /** When the customer agreed — recorded for audit. */
  capturedAt: z.string().max(40).optional(),
  source: z.string().max(60).optional(),
});

const consentDto = (row: {
  id: string;
  contactEmail: string;
  contactPhone: string;
  contactName: string;
  email: boolean;
  whatsapp: boolean;
  calls: boolean;
  source: string;
  capturedAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  contactEmail: row.contactEmail,
  contactPhone: row.contactPhone,
  contactName: row.contactName,
  email: row.email,
  whatsapp: row.whatsapp,
  calls: row.calls,
  source: row.source,
  capturedAt: row.capturedAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Every consent record for the organisation. */
router.get(
  "/consents",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.consentRecord.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { updatedAt: "desc" },
    });
    return ok(res, rows.map(consentDto));
  }),
);

/** Records (or updates) what a customer agreed to. */
router.put(
  "/consents",
  requirePermission("edit"),
  validate(consentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof consentSchema>;
    if (!body.contactEmail.trim()) {
      return ok(res, { saved: false });
    }
    const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
    const row = await prisma.consentRecord.upsert({
      where: {
        organizationId_contactEmail: {
          organizationId: req.auth!.organizationId,
          contactEmail: body.contactEmail,
        },
      },
      create: {
        organizationId: req.auth!.organizationId,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone ?? "",
        contactName: body.contactName ?? "",
        email: body.email,
        whatsapp: body.whatsapp,
        calls: body.calls,
        source: body.source ?? "Direct",
        capturedAt,
      },
      update: {
        contactPhone: body.contactPhone ?? "",
        contactName: body.contactName ?? "",
        email: body.email,
        whatsapp: body.whatsapp,
        calls: body.calls,
        source: body.source ?? "Direct",
        capturedAt,
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "inbox",
      label: `Consent updated for ${row.contactEmail}`,
      req,
    });
    return ok(res, consentDto(row));
  }),
);

export default router;
