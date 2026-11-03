import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";

/**
 * Visa document checklists.
 *
 * A visa desk loses money in two ways: a traveller who booked but never sent a
 * document, and an application submitted with one page missing. Both are
 * solved by the same thing — a per-application checklist with a status per
 * document, seeded from a standard template and editable per country.
 */
const router = Router();
router.use(requireAuth);

/**
 * The standard set. Countries differ, so this is a starting point the desk
 * prunes, not a law: every item can be removed or added.
 */
const DEFAULT_CHECKLIST = [
  "Passport (6+ months validity)",
  "Recent passport-size photographs",
  "Completed visa application form",
  "Confirmed flight itinerary",
  "Hotel booking confirmation",
  "Bank statement (last 6 months)",
  "Income tax return / Form 16",
  "Travel insurance policy",
  "Covering letter from employer",
  "Invitation letter (if visiting family)",
];

const itemDto = (row: {
  id: string;
  label: string;
  required: boolean;
  status: string;
  note: string;
  receivedAt: Date | null;
  position: number;
}) => ({
  id: row.id,
  label: row.label,
  required: row.required,
  status: row.status,
  note: row.note,
  receivedAt: row.receivedAt?.toISOString() ?? null,
  position: row.position,
});

async function assertApplication(organizationId: string, recordId: string) {
  const record = await prisma.record.findFirst({
    where: { id: recordId, organizationId, moduleId: "visa", deletedAt: null },
  });
  if (!record) throw new NotFoundError("Visa application");
  return record;
}

/** Ensures an application has a checklist, seeding the template on first open. */
async function loadOrSeed(organizationId: string, recordId: string) {
  let items = await prisma.visaChecklistItem.findMany({
    where: { organizationId, recordId },
    orderBy: { position: "asc" },
  });
  if (items.length === 0) {
    await prisma.visaChecklistItem.createMany({
      data: DEFAULT_CHECKLIST.map((label, index) => ({
        organizationId,
        recordId,
        label,
        position: index,
      })),
    });
    items = await prisma.visaChecklistItem.findMany({
      where: { organizationId, recordId },
      orderBy: { position: "asc" },
    });
  }
  return items;
}

router.get(
  "/:recordId/checklist",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const record = await assertApplication(req.auth!.organizationId, req.params.recordId);
    const items = await loadOrSeed(req.auth!.organizationId, record.id);
    const active = items.filter((item) => item.status !== "rejected");
    return ok(res, {
      application: {
        id: record.id,
        reference: record.reference,
        name: record.name,
        destination: record.destination,
        status: record.status,
        date: record.date,
      },
      items: items.map(itemDto),
      summary: {
        total: items.length,
        verified: items.filter((item) => item.status === "verified").length,
        received: items.filter((item) => item.status === "received").length,
        pending: items.filter((item) => item.status === "pending").length,
        requiredPending: active.filter((item) => item.required && item.status === "pending").length,
        ready: items.every((item) => !item.required || item.status === "verified"),
      },
    });
  }),
);

router.post(
  "/:recordId/checklist",
  requirePermission("create"),
  validate(z.object({ label: z.string().min(2).max(160), required: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const record = await assertApplication(req.auth!.organizationId, req.params.recordId);
    const body = req.body as { label: string; required?: boolean };
    const count = await prisma.visaChecklistItem.count({
      where: { organizationId: req.auth!.organizationId, recordId: record.id },
    });
    const item = await prisma.visaChecklistItem.create({
      data: {
        organizationId: req.auth!.organizationId,
        recordId: record.id,
        label: body.label,
        required: body.required ?? true,
        position: count,
      },
    });
    return created(res, itemDto(item));
  }),
);

router.patch(
  "/items/:id",
  requirePermission("edit"),
  validate(
    z.object({
      status: z.enum(["pending", "received", "verified", "rejected"]).optional(),
      note: z.string().max(1000).optional(),
      required: z.boolean().optional(),
      label: z.string().min(2).max(160).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await prisma.visaChecklistItem.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Checklist item");
    const body = req.body as { status?: string; note?: string; required?: boolean; label?: string };
    const item = await prisma.visaChecklistItem.update({
      where: { id: existing.id },
      data: {
        ...body,
        receivedAt:
          body.status === "received" || body.status === "verified"
            ? existing.receivedAt ?? new Date()
            : body.status === "pending"
              ? null
              : undefined,
      },
    });
    return ok(res, itemDto(item));
  }),
);

router.delete(
  "/items/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.visaChecklistItem.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Checklist item");
    await prisma.visaChecklistItem.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

/**
 * Chases the traveller: a task for the desk and a notification, naming exactly
 * which documents are still missing so the message can be copied to WhatsApp.
 */
router.post(
  "/:recordId/remind",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const record = await assertApplication(organizationId, req.params.recordId);
    const items = await loadOrSeed(organizationId, record.id);
    const missing = items.filter((item) => item.status === "pending" && item.required);

    const task = await prisma.task.create({
      data: {
        organizationId,
        title: `Visa documents: ${record.name} (${missing.length} pending)`,
        type: "Visa",
        ownerName: req.auth!.name,
        ownerId: req.auth!.userId,
        date: new Date().toISOString().slice(0, 10),
        priority: missing.length > 0 ? "High" : "Normal",
        relatedModule: "visa",
        relatedRecordId: record.id,
      },
    });
    await createNotification({
      organizationId,
      title: `Visa reminder — ${record.name}`,
      body:
        missing.length > 0
          ? `Still pending: ${missing.map((item) => item.label).join(", ")}`
          : "Every required document is verified.",
      moduleId: "visa",
      recordId: record.id,
      level: missing.length > 0 ? "warning" : "success",
    });
    await recordAudit({
      organizationId,
      action: "ReminderSent",
      moduleId: "visa",
      recordId: record.id,
      label: `Visa reminder for ${record.name}`,
      req,
    });

    return ok(res, {
      taskId: task.id,
      missing: missing.map((item) => item.label),
      message:
        missing.length > 0
          ? `Hi ${record.name}, we are still waiting on: ${missing
              .map((item) => item.label)
              .join(", ")}. Please share them so we can submit your application on time.`
          : "All documents are in.",
    });
  }),
);

/** Which applications are still short of documents — the visa desk's queue. */
router.get(
  "/pending",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const applications = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "visa",
        deletedAt: null,
        status: { in: ["Documents pending", "Submitted", "In review"] },
      },
      orderBy: { date: "asc" },
      take: 100,
    });
    const items = await prisma.visaChecklistItem.findMany({
      where: { organizationId, recordId: { in: applications.map((a) => a.id) } },
    });
    const byRecord = new Map<string, typeof items>();
    for (const item of items) {
      byRecord.set(item.recordId, [...(byRecord.get(item.recordId) ?? []), item]);
    }
    return ok(
      res,
      applications.map((application) => {
        const list = byRecord.get(application.id) ?? [];
        const pending = list.filter((item) => item.status === "pending");
        return {
          id: application.id,
          reference: application.reference,
          name: application.name,
          destination: application.destination,
          date: application.date,
          status: application.status,
          tracked: list.length,
          pending: pending.length,
          missing: pending.slice(0, 6).map((item) => item.label),
        };
      }),
    );
  }),
);

export default router;
