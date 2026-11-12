/**
 * Hotels — live search (Hotelbeds API) + manual contract rates CRUD.
 *
 * GET  /hotels/search              Live search via Hotelbeds when configured (per-company),
 *                                  falls back to manual contract rates gracefully.
 * GET  /hotels/contract-rates      List contract rates (filterable)
 * POST /hotels/contract-rates      Create a contract rate
 * PATCH /hotels/contract-rates/:id Update (soft) a contract rate
 * DELETE /hotels/contract-rates/:id Delete (soft) a contract rate
 */

import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { requireModulePermission } from "../middlewares/rbac";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { resolveHotelbedsAccount } from "../services/channels";
import { nextReference } from "../services/records";
import { MODULES } from "../domain/modules";
import { recordAudit } from "../services/audit";
import { generateVoucherPdf } from "../services/voucher-pdf";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("hotels", "view"));

// ── Hotelbeds helpers (per-company credentials) ─────────────────────────────

export type HotelbedsCreds = {
  apiKey: string;
  secret: string;
  env: "sandbox" | "production";
};

export function hotelbedsConfigured(creds?: HotelbedsCreds | null): boolean {
  if (creds) return Boolean(creds.apiKey && creds.secret);
  return Boolean(env.HOTELBEDS_API_KEY && env.HOTELBEDS_SECRET);
}

export function hotelbedsHeaders(creds: HotelbedsCreds) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const raw = `${creds.apiKey}${creds.secret}${ts}`;
  const sig = crypto.createHash("sha256").update(raw).digest("hex");
  return {
    "Api-key": creds.apiKey,
    "X-Signature": sig,
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json",
  };
}

export function hotelbedsBase(env: "sandbox" | "production"): string {
  return env === "production" ? "https://api.hotelbeds.com" : "https://api.test.hotelbeds.com";
}

interface HbRoom {
  code: string;
  name: string;
  rates: Array<{
    rateKey: string;
    boardCode: string;
    boardName: string;
    net: number;
    currency: string;
    allotment: number;
    cancellationPolicies?: Array<{ amount: string; from: string }>;
  }>;
}

interface HbHotel {
  code: number;
  name: { content: string };
  categoryName: { content: string };
  destinationName: { content: string };
  latitude: number;
  longitude: number;
  rooms: HbRoom[];
}

async function searchHotelbeds(
  query: { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number },
  creds: HotelbedsCreds,
) {
  const body = {
    stay: { checkIn: query.checkIn, checkOut: query.checkOut },
    occupancies: [{ rooms: query.rooms, adults: query.adults, children: 0 }],
    destination: { code: query.destination.toUpperCase().slice(0, 3) },
    filter: { maxHotels: 20, maxRooms: 5 },
  };

  const base = hotelbedsBase(creds.env);
  const res = await fetch(`${base}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: hotelbedsHeaders(creds),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: text }, "Hotelbeds API error");
    throw new Error(`Hotelbeds responded with ${res.status}`);
  }

  const data = (await res.json()) as { hotels?: { hotels: HbHotel[]; currency: string } };
  return data.hotels ?? { hotels: [], currency: "EUR" };
}

// ── routes ────────────────────────────────────────────────────────────────────

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { destination, checkIn, checkOut } = req.query as Record<string, string>;
    const rooms = Number(req.query["rooms"] ?? 1);
    const adults = Number(req.query["adults"] ?? 2);
    const organizationId = req.auth!.organizationId;

    if (!destination || !checkIn || !checkOut) {
      return ok(res, {
        configured: false,
        message: "Provide destination, checkIn, checkOut",
        hotels: [],
        currency: "INR",
      });
    }

    // Resolve per-company Hotelbeds credentials
    const hbAccount = await resolveHotelbedsAccount(organizationId);
    const creds = hbAccount
      ? { apiKey: hbAccount.apiKey, secret: hbAccount.secret, env: hbAccount.env }
      : null;

    // ── Live Hotelbeds search (per-company) ────────────────────────────────
    if (hotelbedsConfigured(creds)) {
      try {
        const result = await searchHotelbeds(
          { destination, checkIn, checkOut, rooms, adults },
          creds!,
        );
        return ok(res, {
          configured: true,
          currency: result.currency,
          hotels: result.hotels.map((h) => ({
            code: String(h.code),
            name: h.name?.content ?? `Hotel ${h.code}`,
            categoryName: h.categoryName?.content ?? "",
            destinationName: h.destinationName?.content ?? destination,
            latitude: h.latitude ?? null,
            longitude: h.longitude ?? null,
            rooms:
              h.rooms?.flatMap((r) =>
                r.rates.map((rate) => ({
                  code: r.code,
                  name: r.name,
                  boardName: rate.boardName,
                  // rateKey is the only handle Hotelbeds accepts when booking.
                  rateKey: rate.rateKey,
                  net: rate.net,
                  currency: result.currency,
                  allotment: rate.allotment,
                  cancellationPolicies: rate.cancellationPolicies
                    ? rate.cancellationPolicies.map((c) => `${c.amount} from ${c.from}`).join("; ")
                    : "Non-refundable",
                })),
              ) ?? [],
          })),
        });
      } catch (err) {
        logger.warn({ err }, "Hotelbeds search failed — falling back to contract rates");
        // fall through to contract-rate fallback below
      }
    }

    // ── Fallback: return matching contract rates as "hotels" ──────────────
    const rates = await prisma.hotelRate.findMany({
      where: {
        organizationId,
        active: true,
        city: { contains: destination },
        deletedAt: null,
      },
      take: 40,
    });

    // Group by hotelName to build a hotel card per property
    const byHotel: Record<string, typeof rates> = {};
    for (const r of rates) {
      if (!byHotel[r.hotelName]) byHotel[r.hotelName] = [];
      byHotel[r.hotelName].push(r);
    }

    return ok(res, {
      configured: hotelbedsConfigured(creds),
      message: hotelbedsConfigured(creds)
        ? undefined
        : "Live Hotelbeds search is not configured — showing contract rates. Connect Hotelbeds in Workspace → Integrations.",
      currency: "INR",
      hotels: Object.entries(byHotel).map(([name, rs]) => ({
        code: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        categoryName: "",
        destinationName: rs[0].city,
        latitude: null,
        longitude: null,
        rooms: rs.map((r) => ({
          code: r.id,
          name: r.roomType,
          boardName: r.mealPlan,
          // Contract rates are booked manually; there is no supplier rateKey.
          rateKey: null,
          net: r.sellingPrice,
          currency: r.currency,
          allotment: 1,
          cancellationPolicies: r.cancellation || "Contact supplier",
        })),
      })),
    });
  }),
);

// ── Live hotel booking ───────────────────────────────────────────────────────

const bookSchema = z.object({
  /** Hotelbeds rateKey from /hotels/search. */
  rateKey: z.string().min(10),
  hotelName: z.string().min(1).max(160),
  roomName: z.string().max(120).default(""),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().min(0),
  currency: z.string().max(10).default("INR"),
  holder: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email(),
    phone: z.string().min(5).max(30),
  }),
  /** Optional existing hotel/booking record to attach the confirmation to. */
  recordId: z.string().optional(),
  notes: z.string().max(500).default(""),
});

/**
 * Books a hotel room through Hotelbeds.
 *
 * Search returns a `rateKey` that is only valid for a short window; the
 * booking call is what actually creates the reservation. Without Hotelbeds
 * credentials there is no honest way to "confirm" a hotel, so the route fails
 * clearly instead of writing a fake confirmation number.
 */
router.post(
  "/book",
  requireModulePermission("hotels", "create"),
  validate(bookSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof bookSchema>;

    const account = await resolveHotelbedsAccount(organizationId);
    const creds = account
      ? { apiKey: account.apiKey, secret: account.secret, env: account.env }
      : null;

    if (!hotelbedsConfigured(creds)) {
      throw new BadRequestError(
        "Hotelbeds is not configured. Connect it in Workspace → Integrations before booking a hotel.",
      );
    }

    const base = hotelbedsBase(creds!.env);
    const response = await fetch(`${base}/hotel-api/1.0/bookings`, {
      method: "POST",
      headers: hotelbedsHeaders(creds!),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        holder: {
          name: body.holder.firstName,
          surname: body.holder.lastName,
          email: body.holder.email,
          phone: body.holder.phone,
        },
        rooms: [{ rateKey: body.rateKey }],
        // A client reference makes support conversations possible.
        clientReference: `TD-${Date.now().toString(36).toUpperCase()}`,
        remark: body.notes || undefined,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      booking?: {
        reference?: string;
        status?: string;
        totalNet?: number;
        currency?: string;
        hotel?: { name?: string };
      };
      error?: { message?: string };
    } | null;

    if (!response.ok || !payload?.booking?.reference) {
      logger.warn({ status: response.status, payload }, "Hotelbeds booking failed");
      throw new BadRequestError(
        payload?.error?.message ?? `Hotelbeds booking failed (${response.status})`,
      );
    }

    const confirmation = payload.booking.reference;
    const module_ = MODULES.find((m) => m.id === "hotels");
    const extra = {
      supplier: "Hotelbeds",
      supplierReference: confirmation,
      rateKey: body.rateKey,
      hotelName: body.hotelName,
      roomName: body.roomName,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      bookedAt: new Date().toISOString(),
    };

    // Attach to the booking record when one was supplied, otherwise create a
    // hotel record so the reservation appears in the workspace and the ledger.
    let recordId = body.recordId ?? null;
    if (recordId) {
      const target = await prisma.record.findFirst({
        where: { id: recordId, organizationId },
        select: { id: true, extra: true },
      });
      if (!target) throw new NotFoundError("Record");
      const existingExtra = (() => {
        try {
          return JSON.parse(target.extra || "{}") as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      await prisma.record.update({
        where: { id: target.id },
        data: { extra: JSON.stringify({ ...existingExtra, hotel: extra }), status: "Confirmed" },
      });
    } else if (module_) {
      const record = await prisma.record.create({
        data: {
          organizationId,
          moduleId: "hotels",
          reference: await nextReference(organizationId, module_),
          name: body.hotelName,
          destination: body.hotelName,
          date: body.checkIn,
          amount: body.amount,
          currency: body.currency,
          status: "Confirmed",
          notes: body.notes,
          extra: JSON.stringify(extra),
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
        },
      });
      recordId = record.id;
    }

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "hotels",
      recordId: recordId ?? undefined,
      label: `Hotel booked on Hotelbeds — ${confirmation}`,
      meta: { confirmation, hotelName: body.hotelName },
      req,
    });

    return created(res, {
      confirmation,
      status: payload.booking.status ?? "CONFIRMED",
      recordId,
      currency: payload.booking.currency ?? body.currency,
      totalNet: payload.booking.totalNet ?? body.amount,
    });
  }),
);

// ── Contract rates (manual) ───────────────────────────────────────────────────

router.get(
  "/contract-rates",
  asyncHandler(async (req, res) => {
    const { city, hotelName } = req.query as Record<string, string | undefined>;
    const rates = await prisma.hotelRate.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        deletedAt: null,
        ...(city ? { city: { contains: city } } : {}),
        ...(hotelName ? { hotelName: { contains: hotelName } } : {}),
      },
      orderBy: [{ city: "asc" }, { hotelName: "asc" }],
    });
    return ok(res, rates);
  }),
);

const rateSchema = z.object({
  hotelName: z.string().min(1).max(120),
  city: z.string().max(80).default(""),
  country: z.string().max(80).default(""),
  roomType: z.string().max(80).default("Standard"),
  mealPlan: z.enum(["EP", "CP", "MAP", "AP", "BB", "HB", "FB", "AI"]).default("CP"),
  season: z.string().max(80).default("All year"),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0).default(0),
  currency: z.string().max(10).default("INR"),
  basis: z.string().max(80).default("Per room per night"),
  cancellation: z.string().max(200).default(""),
  supplierName: z.string().max(120).default(""),
  notes: z.string().max(500).default(""),
  active: z.boolean().default(true),
});

router.post(
  "/contract-rates",
  validate(rateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof rateSchema>;
    const rate = await prisma.hotelRate.create({
      data: {
        organizationId: req.auth!.organizationId,
        createdById: req.auth!.userId,
        ...body,
      },
    });
    return created(res, rate);
  }),
);

router.patch(
  "/contract-rates/:id",
  validate(rateSchema.partial()),
  asyncHandler(async (req, res) => {
    const rate = await prisma.hotelRate.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!rate) throw new NotFoundError("Rate");
    const updated = await prisma.hotelRate.update({
      where: { id: rate.id },
      data: req.body as Partial<z.infer<typeof rateSchema>>,
    });
    return ok(res, updated);
  }),
);

router.delete(
  "/contract-rates/:id",
  asyncHandler(async (req, res) => {
    const rate = await prisma.hotelRate.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!rate) throw new NotFoundError("Rate");
    await prisma.hotelRate.update({ where: { id: rate.id }, data: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

// ── Hotel voucher PDF ─────────────────────────────────────────────────────────

/** Downloads a hotel voucher PDF for a hotel record. */
router.get(
  "/:recordId/voucher",
  requireModulePermission("hotels", "view"),
  asyncHandler(async (req, res) => {
    const { filename, stream } = await generateVoucherPdf({
      organizationId: req.auth!.organizationId,
      recordId: req.params.recordId,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    stream.pipe(res);
  }),
);

export default router;
