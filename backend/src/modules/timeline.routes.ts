/**
 * Record activity timeline (RecordEvent).
 *
 * Every note, call log, email, status change and payment that happened to a
 * record lives here as a discrete, timestamped event. This is the user-facing
 * story of a record, separate from the AuditLog which is the compliance trail.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { cuid } from "../lib/utils";

const router = Router();
router.use(requireAuth);

const VALID_TYPES = new Set([
  "note",
  "call",
  "email",
  "whatsapp",
  "status_change",
  "field_change",
  "payment",
  "relation_added",
  "relation_removed",
  "created",
  "imported",
]);

const eventSchema = z.object({
  type: z.string().refine((v) => VALID_TYPES.has(v), {
    message: `type must be one of: ${[...VALID_TYPES].join(", ")}`,
  }),
  body: z.string().max(4000).default(""),
  meta: z.record(z.unknown()).optional(),
});

/** All events for a record, newest first (paginated). */
router.get(
  "/:recordId",
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { recordId } = req.params;
    const take = Math.min(Number(req.query.take) || 50, 200);
    const cursor = req.query.cursor as string | undefined;

    const record = await prisma.record.findFirst({
      where: { id: recordId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!record) throw new NotFoundError("Record");

    const events = await prisma.recordEvent.findMany({
      where: { organizationId, recordId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = events.length > take;
    const page = hasMore ? events.slice(0, take) : events;

    return ok(res, {
      events: page.map((e) => ({
        id: e.id,
        type: e.type,
        body: e.body,
        meta: JSON.parse(e.meta || "{}"),
        actorId: e.actorId,
        actorName: e.actorName,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  }),
);

/** Adds a manual event (note, call log, etc.) to a record's timeline. */
router.post(
  "/:recordId",
  validate(eventSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name } = req.auth!;
    const { recordId } = req.params;
    const body = req.body as z.infer<typeof eventSchema>;

    const record = await prisma.record.findFirst({
      where: { id: recordId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!record) throw new NotFoundError("Record");

    const event = await prisma.recordEvent.create({
      data: {
        id: cuid(),
        organizationId,
        recordId,
        actorId: userId,
        actorName: name,
        type: body.type,
        body: body.body,
        meta: JSON.stringify(body.meta ?? {}),
      },
    });

    return created(res, {
      id: event.id,
      type: event.type,
      body: event.body,
      meta: body.meta ?? {},
      actorId: event.actorId,
      actorName: event.actorName,
      createdAt: event.createdAt.toISOString(),
    });
  }),
);

/** Deletes a note-type event (users can only delete their own notes). */
router.delete(
  "/:recordId/:eventId",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const event = await prisma.recordEvent.findFirst({
      where: { id: req.params.eventId, organizationId, recordId: req.params.recordId },
    });
    if (!event) throw new NotFoundError("Event");

    // Only the author can delete a note; system events are permanent.
    if (event.actorId !== userId || event.type !== "note") {
      throw new NotFoundError("Event"); // hide existence from non-authors
    }

    await prisma.recordEvent.delete({ where: { id: event.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
