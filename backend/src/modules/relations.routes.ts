/**
 * Record relations — explicit typed links between records across modules.
 *
 * Before this, the journey rail inferred connections by matching names and
 * reference prefixes. That worked for a demo but breaks the moment someone
 * edits a name or creates two records for the same customer. These routes
 * make every link a real database row with an explicit kind, so the journey
 * rail, the customer 360 page, and cross-module reporting are all trustworthy.
 *
 * Kinds:
 *   quoted       lead → quotation
 *   booked       quotation → booking
 *   invoiced     booking → invoice
 *   visa_for     booking → visa application
 *   flight_for   booking → flight/PNR
 *   hotel_for    booking → hotel record
 *   transfer_for booking → transfer
 *   paying_for   invoice → payment record
 *   escalated_to support ticket → booking
 *   related      generic bidirectional link
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { toRecordDto } from "../services/records";
import { MODULES } from "../domain/modules";
import { cuid } from "../lib/utils";

const router = Router();
router.use(requireAuth);

const VALID_KINDS = new Set([
  "quoted",
  "booked",
  "invoiced",
  "visa_for",
  "flight_for",
  "hotel_for",
  "transfer_for",
  "paying_for",
  "escalated_to",
  "related",
]);

const linkSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  kind: z.string().default("related"),
});

/**
 * All relations for a record — both "from" and "to" edges, so the caller gets
 * the full neighbour set in one request regardless of which side of a link the
 * record sits on. The related records are hydrated so the journey rail can
 * render them without a second round trip.
 */
router.get(
  "/:recordId",
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { recordId } = req.params;

    // Verify the record belongs to this tenant.
    const record = await prisma.record.findFirst({
      where: { id: recordId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!record) throw new NotFoundError("Record");

    const [fromEdges, toEdges] = await Promise.all([
      prisma.recordRelation.findMany({
        where: { organizationId, fromId: recordId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.recordRelation.findMany({
        where: { organizationId, toId: recordId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Collect the unique ids of neighbours and hydrate them.
    const neighbourIds = [
      ...new Set([
        ...fromEdges.map((e) => e.toId),
        ...toEdges.map((e) => e.fromId),
      ]),
    ];

    const neighbours = await prisma.record.findMany({
      where: { id: { in: neighbourIds }, organizationId, deletedAt: null },
    });
    const neighbourMap = new Map(neighbours.map((r) => [r.id, toRecordDto(r)]));

    const edges = [
      ...fromEdges.map((e) => ({
        id: e.id,
        kind: e.kind,
        direction: "from" as const,
        relatedId: e.toId,
        related: neighbourMap.get(e.toId) ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      ...toEdges.map((e) => ({
        id: e.id,
        kind: e.kind,
        direction: "to" as const,
        relatedId: e.fromId,
        related: neighbourMap.get(e.fromId) ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    ];

    return ok(res, { edges });
  }),
);

/**
 * Creates a typed link between two records.
 *
 * Both records must belong to the same organisation. A link is unique by
 * (fromId, toId, kind) so double-creating the same link returns the existing
 * one instead of an error — idempotent for the client.
 */
router.post(
  "/",
  validate(linkSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name } = req.auth!;
    const { fromId, toId, kind } = req.body as z.infer<typeof linkSchema>;

    if (fromId === toId) throw new BadRequestError("A record cannot be linked to itself");
    if (!VALID_KINDS.has(kind)) {
      throw new BadRequestError(
        `"${kind}" is not a valid relation kind. Valid: ${[...VALID_KINDS].join(", ")}`,
      );
    }

    // Both records must exist in this tenant.
    const [from, to] = await Promise.all([
      prisma.record.findFirst({ where: { id: fromId, organizationId, deletedAt: null }, select: { id: true, reference: true, moduleId: true } }),
      prisma.record.findFirst({ where: { id: toId, organizationId, deletedAt: null }, select: { id: true, reference: true, moduleId: true } }),
    ]);
    if (!from) throw new NotFoundError("Source record (fromId)");
    if (!to) throw new NotFoundError("Target record (toId)");

    // Upsert: idempotent for the UI (double-click on "Link" doesn't duplicate).
    const relation = await prisma.recordRelation.upsert({
      where: { fromId_toId_kind: { fromId, toId, kind } },
      create: { id: cuid(), organizationId, fromId, toId, kind },
      update: {},
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: MODULES.find((m) => m.id === from.moduleId)?.id ?? from.moduleId,
      recordId: fromId,
      label: `Linked ${from.reference} → ${to.reference} (${kind})`,
      actorId: userId,
      actorName: name,
    });

    return created(res, {
      id: relation.id,
      fromId,
      toId,
      kind,
      createdAt: relation.createdAt.toISOString(),
    });
  }),
);

/** Removes a specific relation by its id. */
router.delete(
  "/:relationId",
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name } = req.auth!;

    const relation = await prisma.recordRelation.findFirst({
      where: { id: req.params.relationId, organizationId },
    });
    if (!relation) throw new NotFoundError("Relation");

    await prisma.recordRelation.delete({ where: { id: relation.id } });

    await recordAudit({
      organizationId,
      action: "Updated",
      recordId: relation.fromId,
      label: `Unlinked relation ${relation.kind} (${relation.fromId} → ${relation.toId})`,
      actorId: userId,
      actorName: name,
    });

    return ok(res, { deleted: true });
  }),
);

export default router;
