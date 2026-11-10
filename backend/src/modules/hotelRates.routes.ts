import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

/**
 * Hotel rates — the contracted price of a room.
 *
 * A package is costed room night by room night. Without a rate master every
 * quotation starts from a blank sheet and the margin is whatever the person
 * remembered, so each row here keeps the supplier cost and the selling price
 * side by side, with the season and cancellation rule that apply to it.
 */
const router = Router();
router.use(requireAuth);

type RateRow = {
  id: string;
  hotelName: string;
  city: string;
  country: string;
  roomType: string;
  mealPlan: string;
  season: string;
  validFrom: string | null;
  validTo: string | null;
  costPrice: number;
  sellingPrice: number;
  currency: string;
  basis: string;
  cancellation: string;
  supplierName: string;
  notes: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const mapRate = (row: RateRow) => {
  const margin = row.sellingPrice - row.costPrice;
  return {
    id: row.id,
    hotelName: row.hotelName,
    city: row.city,
    country: row.country,
    roomType: row.roomType,
    mealPlan: row.mealPlan,
    season: row.season,
    validFrom: row.validFrom,
    validTo: row.validTo,
    costPrice: row.costPrice,
    sellingPrice: row.sellingPrice,
    currency: row.currency,
    basis: row.basis,
    cancellation: row.cancellation,
    supplierName: row.supplierName,
    notes: row.notes,
    active: row.active,
    margin,
    // A zero selling price has no meaningful percentage; the screen shows "—".
    marginPercent:
      row.sellingPrice > 0 ? Math.round((margin / row.sellingPrice) * 1000) / 10 : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

const MEAL_PLANS = ["EP", "CP", "MAP", "AP"] as const;
const BASIS = [
  "Per room per night",
  "Per person per night",
  "Per room per stay",
  "Per person per stay",
] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const rateSchema = z.object({
  hotelName: z.string().min(1).max(160),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  roomType: z.string().max(80).optional(),
  mealPlan: z.enum(MEAL_PLANS).optional(),
  season: z.string().max(80).optional(),
  validFrom: dateString.optional().or(z.literal("")),
  validTo: dateString.optional().or(z.literal("")),
  costPrice: z.number().min(0).max(10_000_000),
  sellingPrice: z.number().min(0).max(10_000_000),
  currency: z.string().max(8).optional(),
  basis: z.enum(BASIS).optional(),
  cancellation: z.string().max(600).optional(),
  supplierName: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

/** Every rate, newest hotel first, with the margin totals the panel shows. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const q = String(req.query.q ?? "")
      .trim()
      .toLowerCase();
    const city = String(req.query.city ?? "").trim();
    const includeInactive = String(req.query.inactive ?? "") === "true";

    const rows = await prisma.hotelRate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { active: true }),
        ...(city ? { city } : {}),
      },
      orderBy: [{ hotelName: "asc" }, { roomType: "asc" }],
    });

    let items = rows.map((row) => mapRate(row as unknown as RateRow));
    if (q) {
      items = items.filter((item) =>
        [item.hotelName, item.city, item.roomType, item.season, item.supplierName]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    const hotels = new Set(items.map((item) => item.hotelName));
    const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))].sort();
    const avgMarginPercent = items.filter((i) => i.marginPercent !== null).length
      ? Math.round(
          (items
            .filter((i) => i.marginPercent !== null)
            .reduce((sum, i) => sum + (i.marginPercent ?? 0), 0) /
            items.filter((i) => i.marginPercent !== null).length) *
            10,
        ) / 10
      : null;

    return ok(res, {
      items,
      cities,
      totals: {
        count: items.length,
        hotels: hotels.size,
        avgMarginPercent,
      },
    });
  }),
);

/** The cheapest and most recent selling price for a hotel — used while quoting. */
router.get(
  "/lookup",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const hotelName = String(req.query.hotel ?? "").trim();
    if (!hotelName) return ok(res, { items: [] });
    const rows = await prisma.hotelRate.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        deletedAt: null,
        active: true,
        hotelName: { contains: hotelName },
      },
      orderBy: { sellingPrice: "asc" },
      take: 40,
    });
    return ok(res, { items: rows.map((row) => mapRate(row as unknown as RateRow)) });
  }),
);

router.post(
  "/",
  requirePermission("edit"),
  validate(rateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof rateSchema>;
    const rate = await prisma.hotelRate.create({
      data: {
        organizationId: req.auth!.organizationId,
        hotelName: body.hotelName.trim(),
        city: body.city?.trim() ?? "",
        country: body.country?.trim() ?? "",
        roomType: body.roomType?.trim() || "Standard",
        mealPlan: body.mealPlan ?? "EP",
        season: body.season?.trim() || "All year",
        validFrom: body.validFrom || null,
        validTo: body.validTo || null,
        costPrice: body.costPrice,
        sellingPrice: body.sellingPrice,
        currency: body.currency || "INR",
        basis: body.basis ?? "Per room per night",
        cancellation: body.cancellation?.trim() ?? "",
        supplierName: body.supplierName?.trim() ?? "",
        notes: body.notes?.trim() ?? "",
        active: body.active ?? true,
        createdById: req.auth!.userId,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "hotels",
      label: `Rate added: ${rate.hotelName} ${rate.roomType} (${rate.mealPlan})`,
      meta: { hotelRateId: rate.id },
      req,
    });

    return created(res, { rate: mapRate(rate as unknown as RateRow) });
  }),
);

router.patch(
  "/:id",
  requirePermission("edit"),
  validate(rateSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof rateSchema>>;
    const existing = await prisma.hotelRate.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Hotel rate");

    const updated = await prisma.hotelRate.update({
      where: { id: existing.id },
      data: {
        ...(body.hotelName !== undefined ? { hotelName: body.hotelName.trim() } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() } : {}),
        ...(body.country !== undefined ? { country: body.country.trim() } : {}),
        ...(body.roomType !== undefined ? { roomType: body.roomType.trim() || "Standard" } : {}),
        ...(body.mealPlan !== undefined ? { mealPlan: body.mealPlan } : {}),
        ...(body.season !== undefined ? { season: body.season.trim() || "All year" } : {}),
        ...(body.validFrom !== undefined ? { validFrom: body.validFrom || null } : {}),
        ...(body.validTo !== undefined ? { validTo: body.validTo || null } : {}),
        ...(body.costPrice !== undefined ? { costPrice: body.costPrice } : {}),
        ...(body.sellingPrice !== undefined ? { sellingPrice: body.sellingPrice } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.basis !== undefined ? { basis: body.basis } : {}),
        ...(body.cancellation !== undefined ? { cancellation: body.cancellation.trim() } : {}),
        ...(body.supplierName !== undefined ? { supplierName: body.supplierName.trim() } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.trim() } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "hotels",
      label: `Rate updated: ${updated.hotelName} ${updated.roomType}`,
      meta: { hotelRateId: updated.id, fields: Object.keys(body) },
      req,
    });

    return ok(res, { rate: mapRate(updated as unknown as RateRow) });
  }),
);

/** A rate is retired, not erased — historical quotations still point at it. */
router.delete(
  "/:id",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hotelRate.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Hotel rate");

    await prisma.hotelRate.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), active: false },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "hotels",
      label: `Rate removed: ${existing.hotelName} ${existing.roomType}`,
      req,
    });
    return ok(res, { deleted: true });
  }),
);

export default router;
