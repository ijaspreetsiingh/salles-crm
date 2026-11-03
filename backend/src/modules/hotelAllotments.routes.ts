import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

/**
 * Room allotments — the rooms actually held under a hotel contract.
 *
 * A rate plan answers "what does a room cost". This answers "how many rooms do
 * we still have", which is the question that decides whether a booking can be
 * promised to a customer. Availability is always derived (total - used), never
 * typed in, so it cannot drift away from the truth.
 */
const router = Router();
router.use(requireAuth);

const bodySchema = z.object({
  hotelName: z.string().min(2).max(160),
  city: z.string().max(120).optional(),
  roomType: z.string().max(60).optional(),
  mealPlan: z.string().max(20).optional(),
  supplierName: z.string().max(160).optional(),
  contractFrom: z.string().max(20).optional(),
  contractTo: z.string().max(20).optional(),
  totalRooms: z.coerce.number().int().min(0).max(10000),
  costPrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  sellingPrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  currency: z.string().max(6).optional(),
  releaseDays: z.coerce.number().int().min(0).max(365).optional(),
  status: z.enum(["Open", "Released", "Closed"]).optional(),
  notes: z.string().max(2000).optional(),
});

const dto = (row: {
  id: string;
  hotelName: string;
  city: string;
  roomType: string;
  mealPlan: string;
  supplierName: string;
  contractFrom: string;
  contractTo: string;
  totalRooms: number;
  usedRooms: number;
  costPrice: number;
  sellingPrice: number;
  currency: string;
  releaseDays: number;
  status: string;
  notes: string;
  updatedAt: Date;
}) => ({
  ...row,
  availableRooms: Math.max(0, row.totalRooms - row.usedRooms),
  occupancy:
    row.totalRooms > 0 ? Math.round((row.usedRooms / row.totalRooms) * 1000) / 10 : 0,
  margin: Math.round((row.sellingPrice - row.costPrice) * 100) / 100,
  updatedAt: row.updatedAt.toISOString(),
});

/** List allotments, optionally narrowed to one hotel/city or a date window. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const { q, city, status, from, to } = req.query as Record<string, string | undefined>;
    // Every condition goes into one AND list: a top-level `OR` can only exist
    // once, so spreading two of them would silently drop the search box.
    const and: Prisma.HotelAllotmentWhereInput[] = [];
    if (q) {
      and.push({
        OR: [
          { hotelName: { contains: q } },
          { roomType: { contains: q } },
          { supplierName: { contains: q } },
        ],
      });
    }
    if (city && city !== "all") and.push({ city });
    if (status && status !== "all") and.push({ status });
    // Contract window overlaps the requested stay.
    if (from) and.push({ OR: [{ contractTo: "" }, { contractTo: { gte: from } }] });
    if (to) and.push({ contractFrom: { lte: to } });

    const rows = await prisma.hotelAllotment.findMany({
      where: { organizationId, deletedAt: null, ...(and.length ? { AND: and } : {}) },
      orderBy: [{ hotelName: "asc" }, { roomType: "asc" }],
      take: 500,
    });

    const cities = Array.from(new Set(rows.map((row) => row.city).filter(Boolean))).sort();
    return ok(res, {
      items: rows.map(dto),
      cities,
      totals: {
        rooms: rows.reduce((sum, row) => sum + row.totalRooms, 0),
        held: rows.reduce((sum, row) => sum + row.usedRooms, 0),
        free: rows.reduce((sum, row) => sum + Math.max(0, row.totalRooms - row.usedRooms), 0),
      },
    });
  }),
);

/** Availability for one hotel and a date window — the checkout question. */
router.get(
  "/availability",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { hotelName, from, to } = req.query as Record<string, string | undefined>;
    if (!hotelName) throw new BadRequestError("Tell us which hotel to check");
    const rows = await prisma.hotelAllotment.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        deletedAt: null,
        hotelName,
        status: "Open",
        ...(from ? { OR: [{ contractTo: "" }, { contractTo: { gte: from } }] } : {}),
        ...(to ? { AND: [{ contractFrom: { lte: to } }] } : {}),
      },
      orderBy: { roomType: "asc" },
    });
    return ok(res, {
      hotelName,
      from: from ?? null,
      to: to ?? null,
      items: rows.map((row) => ({
        id: row.id,
        roomType: row.roomType,
        mealPlan: row.mealPlan,
        availableRooms: Math.max(0, row.totalRooms - row.usedRooms),
        totalRooms: row.totalRooms,
        usedRooms: row.usedRooms,
        sellingPrice: row.sellingPrice,
        currency: row.currency,
        releaseDays: row.releaseDays,
      })),
    });
  }),
);

router.post(
  "/",
  requirePermission("create"),
  validate(bodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bodySchema>;
    const row = await prisma.hotelAllotment.create({
      data: {
        organizationId: req.auth!.organizationId,
        hotelName: body.hotelName,
        city: body.city ?? "",
        roomType: body.roomType ?? "Deluxe",
        mealPlan: body.mealPlan ?? "CP",
        supplierName: body.supplierName ?? "",
        contractFrom: body.contractFrom ?? "",
        contractTo: body.contractTo ?? "",
        totalRooms: body.totalRooms,
        costPrice: body.costPrice ?? 0,
        sellingPrice: body.sellingPrice ?? 0,
        currency: body.currency || "INR",
        releaseDays: body.releaseDays ?? 7,
        status: body.status ?? "Open",
        notes: body.notes ?? "",
        createdById: req.auth!.userId,
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "hotels",
      recordId: row.id,
      label: `Allotment: ${row.hotelName} ${row.roomType} · ${row.totalRooms} rooms`,
      req,
    });
    return created(res, dto(row));
  }),
);

router.patch(
  "/:id",
  requirePermission("edit"),
  validate(bodySchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hotelAllotment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Allotment");
    const body = req.body as Partial<z.infer<typeof bodySchema>>;
    if (body.totalRooms !== undefined && body.totalRooms < existing.usedRooms) {
      throw new BadRequestError(
        `${existing.usedRooms} room(s) are already sold — reduce them first or raise the total`,
      );
    }
    const row = await prisma.hotelAllotment.update({ where: { id: existing.id }, data: body });
    return ok(res, dto(row));
  }),
);

/** Holds rooms for a booking. Refuses rather than overbooking. */
router.post(
  "/:id/hold",
  requirePermission("edit"),
  validate(z.object({ rooms: z.coerce.number().int().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hotelAllotment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Allotment");
    const rooms = (req.body as { rooms: number }).rooms;
    const free = existing.totalRooms - existing.usedRooms;
    if (rooms > free) {
      throw new BadRequestError(
        `Only ${Math.max(0, free)} room(s) free on this allotment — ${rooms} requested`,
      );
    }
    const row = await prisma.hotelAllotment.update({
      where: { id: existing.id },
      data: { usedRooms: { increment: rooms } },
    });
    return ok(res, dto(row));
  }),
);

/** Releases held rooms (cancellation, or rooms going back to the hotel). */
router.post(
  "/:id/release",
  requirePermission("edit"),
  validate(z.object({ rooms: z.coerce.number().int().min(1).max(1000) })),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hotelAllotment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Allotment");
    const rooms = (req.body as { rooms: number }).rooms;
    const row = await prisma.hotelAllotment.update({
      where: { id: existing.id },
      data: { usedRooms: { decrement: Math.min(rooms, existing.usedRooms) } },
    });
    return ok(res, dto(row));
  }),
);

router.delete(
  "/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.hotelAllotment.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Allotment");
    await prisma.hotelAllotment.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    return ok(res, { deleted: true });
  }),
);

export default router;
