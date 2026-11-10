import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { resolveAmadeusAccount } from "../services/channels";
import {
  amadeusConfigured,
  searchFlightOffers,
  createFlightOrder,
  type AmadeusCredentials,
} from "../services/amadeus";
import { BadRequestError } from "../lib/errors";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("flights", "view"));

/**
 * Search results are not persisted. Instead the whole Amadeus offer is signed
 * into the id the browser holds, so booking works on any server instance and
 * a tampered offer cannot be booked. 30 minutes is the Amadeus fare-hold
 * window; after that the traveller searches again.
 */
type OfferClaims = { org: string; offer: Record<string, unknown> };

function signOffer(organizationId: string, offer: Record<string, unknown>): string {
  return jwt.sign({ org: organizationId, offer } satisfies OfferClaims, env.JWT_ACCESS_SECRET, {
    audience: "flight-offer",
    expiresIn: "30m",
  });
}

function readOffer(organizationId: string, token: string): Record<string, unknown> {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      audience: "flight-offer",
    }) as OfferClaims;
    if (claims.org !== organizationId) throw new Error("wrong organisation");
    return claims.offer;
  } catch {
    throw new BadRequestError(
      "This fare has expired. Search again to get a fresh price before booking.",
    );
  }
}

const searchSchema = z.object({
  from: z.string().regex(/^[A-Za-z]{3}$/, "Use the 3-letter airport code (DEL)"),
  to: z.string().regex(/^[A-Za-z]{3}$/, "Use the 3-letter airport code (DPS)"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(9).default(1),
});

/** Real flight search through Amadeus when keys are configured (per-company). */
router.get(
  "/search",
  requireModulePermission("flights", "view"),
  validate(searchSchema, "query"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const account = await resolveAmadeusAccount(organizationId);
    const creds: AmadeusCredentials | null = account
      ? { apiKey: account.apiKey, apiSecret: account.apiSecret, host: account.host }
      : null;

    if (!amadeusConfigured(creds)) {
      return ok(res, {
        configured: false,
        offers: [],
        message:
          "Live flight search needs Amadeus credentials. Configure them in Workspace → Integrations.",
      });
    }
    const query = req.query as unknown as z.infer<typeof searchSchema>;
    try {
      const { offers, currency } = await searchFlightOffers(
        {
          origin: query.from.toUpperCase(),
          destination: query.to.toUpperCase(),
          date: query.date,
          adults: query.adults,
        },
        creds,
      );
      return ok(res, {
        configured: true,
        currency,
        // `id` is the signed booking token; `searchId` is Amadeus' own id, kept
        // for support conversations. The raw offer never leaves the server.
        offers: offers.map((offer) => ({
          id: signOffer(organizationId, offer.raw),
          searchId: offer.id,
          airline: offer.airline,
          price: offer.price,
          currency: offer.currency,
          departure: offer.departure,
          arrival: offer.arrival,
          seatsLeft: offer.seatsLeft,
        })),
      });
    } catch (err) {
      return ok(res, {
        configured: true,
        offers: [],
        message: (err as Error).message,
      });
    }
  }),
);

/** Create a flight order (PNR) through Amadeus API with per-company credentials. */
const bookSchema = z.object({
  /** The signed offer id returned by /flights/search. */
  flightOfferId: z.string().min(1),
  passengers: z.array(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      gender: z.enum(["MALE", "FEMALE"]).default("MALE"),
    }),
  ),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(5),
  recordId: z.string().optional(),
});

router.post(
  "/book",
  requireModulePermission("flights", "create"),
  validate(bookSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const account = await resolveAmadeusAccount(organizationId);
    const creds = account
      ? { apiKey: account.apiKey, apiSecret: account.apiSecret, host: account.host }
      : null;

    if (!amadeusConfigured(creds)) {
      throw new BadRequestError(
        "Amadeus is not configured. Connect it in Workspace → Integrations.",
      );
    }

    const body = req.body as z.infer<typeof bookSchema>;
    const offer = readOffer(organizationId, body.flightOfferId);

    // Never attach a PNR to another tenant's booking record.
    if (body.recordId) {
      const target = await prisma.record.findFirst({
        where: { id: body.recordId, organizationId },
        select: { id: true },
      });
      if (!target) throw new BadRequestError("Booking record not found");
    }

    const result = await createFlightOrder(
      {
        flightOffer: offer,
        passengers: body.passengers,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone,
      },
      creds,
    );

    const itinerary = (offer["itineraries"] as Array<{ segments?: unknown[] }> | undefined)?.[0];
    const segment = (itinerary?.segments?.[0] ?? {}) as {
      carrierCode?: string;
      departure?: { iataCode?: string; at?: string };
      arrival?: { iataCode?: string; at?: string };
    };

    const pnr = await prisma.flightPNR.create({
      data: {
        organizationId,
        recordId: body.recordId ?? null,
        pnr: result.pnr,
        gds: "Amadeus",
        airline: segment.carrierCode ?? "",
        route: `${segment.departure?.iataCode ?? ""}-${segment.arrival?.iataCode ?? ""}`,
        departure: segment.departure?.at ?? "",
        passengers: JSON.stringify(body.passengers),
        fareType: "Economy",
        status: "Active",
        ticketNumbers: JSON.stringify([]),
        notes: `Amadeus Order ID: ${result.orderId}`,
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "pnr",
      recordId: body.recordId ?? pnr.id,
      label: `Flight booked on Amadeus — PNR ${result.pnr}`,
      meta: { orderId: result.orderId },
      req,
    });

    return ok(res, { ...result, pnrId: pnr.id });
  }),
);

export default router;
