/**
 * Flight PNR Queue — holds, ticketing, voids and refunds.
 *
 * GET  /pnr                       List PNRs (filterable by status/deadline)
 * POST /pnr                       Create a new PNR hold
 * GET  /pnr/:id                   Single PNR detail
 * PATCH /pnr/:id                  Update (status, notes, passengers)
 * POST /pnr/:id/ticket            Issue e-tickets (moves status → Ticketed)
 * POST /pnr/:id/void              Void tickets (moves status → Voided)
 * POST /pnr/:id/refund            Mark refund requested (status → Refunded)
 * DELETE /pnr/:id                 Soft-delete (sets status → Expired)
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { sendPushToUser } from "./push.routes";
import { resolveAmadeusAccount } from "../services/channels";
import { amadeusConfigured } from "../services/amadeus";
import { issueAmadeusTickets } from "../services/amadeus";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("flights", "view"));

// ── helpers ──────────────────────────────────────────────────────────────────

const passengerSchema = z.object({
  name: z.string().min(1).max(120),
  passport: z.string().max(30).default(""),
  dob: z.string().max(20).default(""),
  nationality: z.string().max(60).default(""),
  ticketNumber: z.string().max(30).default(""),
});

const pnrCreateSchema = z.object({
  recordId: z.string().max(60).optional(),
  pnr: z.string().max(20).default(""),
  gds: z.enum(["Amadeus", "Sabre", "Galileo", "Manual"]).default("Amadeus"),
  airline: z.string().max(80).default(""),
  route: z.string().max(120).default(""),
  departure: z.string().max(40).default(""),
  passengers: z.array(passengerSchema).default([]),
  fareType: z.enum(["Economy", "Business", "First", "Premium Economy"]).default("Economy"),
  ticketDeadline: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).default(""),
});

const pnrUpdateSchema = pnrCreateSchema.partial().extend({
  status: z.enum(["Active", "Ticketed", "Voided", "Expired", "Refunded"]).optional(),
});

/** Hours remaining until ticketing deadline — null when no deadline set. */
function hoursUntilDeadline(deadline: Date | null): number | null {
  if (!deadline) return null;
  return Math.round((deadline.getTime() - Date.now()) / 3_600_000);
}

function pnrDto(pnr: {
  id: string;
  recordId: string | null;
  pnr: string;
  gds: string;
  airline: string;
  route: string;
  departure: string;
  passengers: string;
  fareType: string;
  ticketDeadline: Date | null;
  status: string;
  ticketNumbers: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const hours = hoursUntilDeadline(pnr.ticketDeadline);
  return {
    id: pnr.id,
    recordId: pnr.recordId,
    pnr: pnr.pnr,
    gds: pnr.gds,
    airline: pnr.airline,
    route: pnr.route,
    departure: pnr.departure,
    passengers: (() => {
      try {
        return JSON.parse(pnr.passengers);
      } catch {
        return [];
      }
    })(),
    fareType: pnr.fareType,
    ticketDeadline: pnr.ticketDeadline?.toISOString() ?? null,
    hoursUntilDeadline: hours,
    deadlineUrgency:
      hours === null
        ? "none"
        : hours < 0
          ? "expired"
          : hours < 4
            ? "critical"
            : hours < 24
              ? "warning"
              : "ok",
    status: pnr.status,
    ticketNumbers: (() => {
      try {
        return JSON.parse(pnr.ticketNumbers);
      } catch {
        return [];
      }
    })(),
    notes: pnr.notes,
    createdAt: pnr.createdAt.toISOString(),
    updatedAt: pnr.updatedAt.toISOString(),
  };
}

// ── routes ────────────────────────────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, deadlineHours } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { organizationId: req.auth!.organizationId };

    if (status) {
      where["status"] = status;
    } else {
      // Default: show only actionable PNRs
      where["status"] = { in: ["Active", "Ticketed"] };
    }

    if (deadlineHours) {
      const hours = Number(deadlineHours);
      where["ticketDeadline"] = {
        lte: new Date(Date.now() + hours * 3_600_000),
        gte: new Date(),
      };
    }

    const pnrs = await prisma.flightPNR.findMany({
      where,
      orderBy: [{ ticketDeadline: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    return ok(res, pnrs.map(pnrDto));
  }),
);

router.post(
  "/",
  validate(pnrCreateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof pnrCreateSchema>;
    const pnr = await prisma.flightPNR.create({
      data: {
        organizationId: req.auth!.organizationId,
        createdById: req.auth!.userId,
        recordId: body.recordId ?? null,
        pnr: body.pnr,
        gds: body.gds,
        airline: body.airline,
        route: body.route,
        departure: body.departure,
        passengers: JSON.stringify(body.passengers),
        fareType: body.fareType,
        ticketDeadline: body.ticketDeadline ? new Date(body.ticketDeadline) : null,
        notes: body.notes,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "PNRCreated",
      moduleId: "flights",
      recordId: pnr.id,
      label: `PNR ${pnr.pnr || pnr.id} created for ${pnr.route}`,
      req,
    });

    return created(res, pnrDto(pnr));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const pnr = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!pnr) throw new NotFoundError("PNR");
    return ok(res, pnrDto(pnr));
  }),
);

router.patch(
  "/:id",
  validate(pnrUpdateSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("PNR");

    const body = req.body as z.infer<typeof pnrUpdateSchema>;
    const updated = await prisma.flightPNR.update({
      where: { id: existing.id },
      data: {
        ...(body.pnr !== undefined && { pnr: body.pnr }),
        ...(body.gds !== undefined && { gds: body.gds }),
        ...(body.airline !== undefined && { airline: body.airline }),
        ...(body.route !== undefined && { route: body.route }),
        ...(body.departure !== undefined && { departure: body.departure }),
        ...(body.passengers !== undefined && { passengers: JSON.stringify(body.passengers) }),
        ...(body.fareType !== undefined && { fareType: body.fareType }),
        ...(body.ticketDeadline !== undefined && {
          ticketDeadline: body.ticketDeadline ? new Date(body.ticketDeadline) : null,
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return ok(res, pnrDto(updated));
  }),
);

/**
 * Issues e-tickets.
 *
 * When the PNR was created through POST /flights/book (Amadeus order id
 * stored in notes) and Amadeus credentials are configured, the system
 * attempts to issue tickets through the Amadeus API. On any failure — or
 * when the PNR was created manually — it falls back to recording the ticket
 * numbers the agent supplies, which is how most Indian agencies work.
 *
 * The response always says which path was taken (`method: "amadeus"` or
 * `method: "manual"`) so nobody mistakes a recorded number for a live call.
 */
router.post(
  "/:id/ticket",
  validate(z.object({ ticketNumbers: z.array(z.string().min(1)).min(1).optional() })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("PNR");

    const { ticketNumbers: manualNumbers } = req.body as { ticketNumbers?: string[] };

    // Try Amadeus if the PNR has an order id and credentials exist.
    const orderIdMatch = existing.notes?.match(/Amadeus Order ID: (\S+)/);
    const orderId = orderIdMatch?.[1];
    if (orderId && existing.gds === "Amadeus") {
      const account = await resolveAmadeusAccount(req.auth!.organizationId);
      const creds = account
        ? { apiKey: account.apiKey, apiSecret: account.apiSecret, host: account.host }
        : null;
      if (amadeusConfigured(creds)) {
        try {
          const result = await issueAmadeusTickets({ orderId }, creds);
          const updated = await prisma.flightPNR.update({
            where: { id: existing.id },
            data: {
              status: "Ticketed",
              ticketNumbers: JSON.stringify(result.ticketNumbers),
            },
          });
          await recordAudit({
            organizationId: req.auth!.organizationId,
            action: "PNRTicketed",
            moduleId: "flights",
            recordId: existing.id,
            label: `Tickets issued via Amadeus for PNR ${existing.pnr}: ${result.ticketNumbers.join(", ")}`,
            req,
          });
          void sendPushToUser(req.auth!.userId, {
            title: "Tickets issued",
            body: `PNR ${existing.pnr} — ${result.ticketNumbers.length} ticket(s) issued via Amadeus`,
            tag: `pnr-ticketed-${existing.id}`,
            url: "/workspace/flights",
          }).catch(() => undefined);
          return ok(res, { ...pnrDto(updated), method: "amadeus", ticketNumbers: result.ticketNumbers });
        } catch (err) {
          // Fall through to manual recording.
          logger.warn({ err, pnrId: existing.id }, "Amadeus ticketing failed — falling back to manual");
        }
      }
    }

    // Manual recording (default path).
    const numbers = manualNumbers && manualNumbers.length > 0
      ? manualNumbers
      : [];
    if (numbers.length === 0) {
      throw new BadRequestError("Provide ticketNumbers, or configure Amadeus to issue tickets automatically.");
    }

    const updated = await prisma.flightPNR.update({
      where: { id: existing.id },
      data: {
        status: "Ticketed",
        ticketNumbers: JSON.stringify(numbers),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "PNRTicketed",
      moduleId: "flights",
      recordId: existing.id,
      label: `Ticket numbers recorded for PNR ${existing.pnr}: ${numbers.join(", ")}`,
      req,
    });

    void sendPushToUser(req.auth!.userId, {
      title: "Tickets recorded",
      body: `PNR ${existing.pnr} — ${numbers.length} ticket(s) recorded for ${existing.route}`,
      tag: `pnr-ticketed-${existing.id}`,
      url: "/workspace/flights",
    }).catch(() => undefined);

    return ok(res, { ...pnrDto(updated), method: "manual", recording: "manual" });
  }),
);

/** Void tickets: GDS void confirmed, moves to Voided. */
router.post(
  "/:id/void",
  validate(z.object({ reason: z.string().max(200).default("") })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("PNR");

    const updated = await prisma.flightPNR.update({
      where: { id: existing.id },
      data: {
        status: "Voided",
        notes: [existing.notes, `Voided: ${req.body.reason}`].filter(Boolean).join("\n"),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "PNRVoided",
      moduleId: "flights",
      recordId: existing.id,
      label: `PNR ${existing.pnr} voided`,
      meta: { reason: req.body.reason },
      req,
    });

    return ok(res, pnrDto(updated));
  }),
);

/** Refund: move status → Refunded and log the action. */
router.post(
  "/:id/refund",
  validate(
    z.object({ amount: z.number().min(0).optional(), reason: z.string().max(200).default("") }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("PNR");

    const updated = await prisma.flightPNR.update({
      where: { id: existing.id },
      data: {
        status: "Refunded",
        notes: [existing.notes, `Refund: ${req.body.reason || "requested"}`]
          .filter(Boolean)
          .join("\n"),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "PNRRefunded",
      moduleId: "flights",
      recordId: existing.id,
      label: `PNR ${existing.pnr} refund requested`,
      meta: { amount: req.body.amount, reason: req.body.reason },
      req,
    });

    return ok(res, pnrDto(updated));
  }),
);

/** Expire: soft-delete */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.flightPNR.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("PNR");
    await prisma.flightPNR.update({ where: { id: existing.id }, data: { status: "Expired" } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "PNRExpired",
      moduleId: "flights",
      recordId: existing.id,
      label: `PNR ${existing.pnr} marked expired`,
      req,
    });
    return ok(res, { expired: true });
  }),
);

export default router;
