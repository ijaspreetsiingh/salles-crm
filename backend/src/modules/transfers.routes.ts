/**
 * Transfers — vehicle fleet, driver roster, assignment workflow.
 *
 * Routes:
 *   GET    /transfers/vehicles             — fleet list
 *   POST   /transfers/vehicles             — add a vehicle
 *   PATCH  /transfers/vehicles/:id         — update vehicle
 *   DELETE /transfers/vehicles/:id         — remove vehicle
 *   GET    /transfers/drivers              — driver roster
 *   POST   /transfers/drivers              — add a driver
 *   PATCH  /transfers/drivers/:id          — update driver
 *   DELETE /transfers/drivers/:id          — remove driver
 *   POST   /transfers/:transferId/assign   — assign vehicle + driver to a transfer
 *   GET    /transfers/:transferId/assignment — current assignment for a transfer
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { cuid, parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { assertTransportAvailable } from "../services/transport-assignment";
import { eventCreated, eventStatusChange } from "../services/timeline";

const router = Router();
router.use(requireAuth);

// ─── Vehicles ─────────────────────────────────────────────────────────────────

const vehicleSchema = z.object({
  registrationNo: z.string().min(1).max(20),
  make: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  type: z.enum(["Sedan", "SUV", "Minivan", "Coach", "Bus", "Tempo traveller", "Luxury"]).default("Sedan"),
  capacity: z.number().int().min(1).max(60).default(4),
  fuel: z.enum(["Petrol", "Diesel", "CNG", "Electric"]).default("Petrol"),
  branchId: z.string().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(400).default(""),
});

// ─── Rail / Bus / Cruise — non-vehicle transport ──────────────────────────────

const railBusCruiseSchema = z.object({
  transportMode: z.enum(["Rail", "Bus", "Cruise", "Ferry"]),
  operator: z.string().min(1).max(120), // e.g. "Indian Railways", "VRL Travels", "Royal Caribbean"
  route: z.string().max(200).optional(), // e.g. "Delhi → Agra → Jaipur"
  departurePoint: z.string().max(200).optional(),
  arrivalPoint: z.string().max(200).optional(),
  departureTime: z.string().max(20).optional(),
  arrivalTime: z.string().max(20).optional(),
  pnrOrBookingRef: z.string().max(40).optional(),
  classType: z.string().max(60).optional(), // e.g. "AC First Class", "Sleeper", "Balcony Suite"
  seats: z.array(z.string().max(20)).max(20).default([]),
  amount: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  notes: z.string().max(500).default(""),
});

/** Lists all rail/bus/cruise transport records. */
router.get(
  "/rail-bus-cruise",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: { organizationId, moduleId: "transfers", tab: "Rail, bus & cruise", deletedAt: null },
      orderBy: { date: "desc" },
      take: 200,
    });
    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        reference: r.reference,
        transportMode: extra["transportMode"] ?? "Rail",
        operator: r.name,
        route: extra["route"] ?? "",
        departurePoint: extra["departurePoint"] ?? "",
        arrivalPoint: extra["arrivalPoint"] ?? "",
        departureTime: extra["departureTime"] ?? "",
        arrivalTime: extra["arrivalTime"] ?? "",
        pnrOrBookingRef: extra["pnrOrBookingRef"] ?? "",
        classType: extra["classType"] ?? "",
        seats: extra["seats"] ?? [],
        amount: r.amount,
        currency: r.currency || "INR",
        date: r.date,
        status: r.status,
        notes: r.notes,
      };
    }));
  }),
);

/** Creates a rail/bus/cruise transport record. */
router.post(
  "/rail-bus-cruise",
  requirePermission("create"),
  validate(railBusCruiseSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof railBusCruiseSchema>;

    const reference = `${body.transportMode.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "transfers",
        tab: "Rail, bus & cruise",
        reference,
        name: body.operator,
        detail: body.route ?? "",
        destination: body.arrivalPoint ?? "",
        date: new Date().toISOString().slice(0, 10),
        amount: body.amount,
        currency: body.currency,
        status: "Requested",
        notes: body.notes,
        extra: JSON.stringify({
          transportMode: body.transportMode,
          route: body.route,
          departurePoint: body.departurePoint,
          arrivalPoint: body.arrivalPoint,
          departureTime: body.departureTime,
          arrivalTime: body.arrivalTime,
          pnrOrBookingRef: body.pnrOrBookingRef,
          classType: body.classType,
          seats: body.seats,
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    void eventCreated(organizationId, record.id, reference, body.transportMode, userId, actorName);
    return created(res, { id: record.id, reference });
  }),
);

/** Updates a rail/bus/cruise record. */
router.patch(
  "/rail-bus-cruise/:id",
  requirePermission("edit"),
  validate(railBusCruiseSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof railBusCruiseSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Transport record");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.operator !== undefined ? { name: body.operator } : {}),
        ...(body.route !== undefined ? { detail: body.route } : {}),
        ...(body.arrivalPoint !== undefined ? { destination: body.arrivalPoint } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        extra: JSON.stringify({ ...extra, ...Object.fromEntries(Object.entries(body).filter(([k]) => !["operator", "route", "amount", "notes"].includes(k))) }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

router.get(
  "/vehicles",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: { organizationId, moduleId: "transfers", tab: "Vehicles", deletedAt: null },
      orderBy: { name: "asc" },
      take: 300,
    });
    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        registrationNo: r.reference,
        name: r.name,
        type: extra["vehicleType"] ?? "Sedan",
        capacity: extra["capacity"] ?? 4,
        fuel: extra["fuel"] ?? "Petrol",
        active: r.status === "Active",
        notes: r.notes,
        branchId: r.branchId,
        branchName: r.branchName,
      };
    }));
  }),
);

router.post(
  "/vehicles",
  requirePermission("create"),
  validate(vehicleSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof vehicleSchema>;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "transfers",
        tab: "Vehicles",
        reference: body.registrationNo.toUpperCase(),
        name: `${body.make ?? ""} ${body.model ?? ""}`.trim() || body.registrationNo,
        detail: `${body.type} · ${body.capacity} seats`,
        status: body.active ? "Active" : "Inactive",
        notes: body.notes,
        branchId: body.branchId ?? null,
        extra: JSON.stringify({
          vehicleType: body.type,
          capacity: body.capacity,
          fuel: body.fuel,
          make: body.make ?? "",
          model: body.model ?? "",
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    await recordAudit({ organizationId, action: "Created", moduleId: "transfers", recordId: record.id, label: `Vehicle ${body.registrationNo} added`, req });
    return created(res, { id: record.id, registrationNo: record.reference, name: record.name });
  }),
);

router.patch(
  "/vehicles/:id",
  requirePermission("edit"),
  validate(vehicleSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof vehicleSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Vehicle");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.active !== undefined ? { status: body.active ? "Active" : "Inactive" } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.branchId !== undefined ? { branchId: body.branchId } : {}),
        extra: JSON.stringify({
          ...extra,
          ...(body.type !== undefined ? { vehicleType: body.type } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          ...(body.fuel !== undefined ? { fuel: body.fuel } : {}),
        }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

router.delete(
  "/vehicles/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Vehicle");
    await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

// ─── Drivers ──────────────────────────────────────────────────────────────────

const driverSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40),
  licenseNo: z.string().max(30).optional(),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  languages: z.array(z.string().max(40)).max(10).default([]),
  branchId: z.string().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(400).default(""),
});

router.get(
  "/drivers",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: { organizationId, moduleId: "transfers", tab: "Drivers", deletedAt: null },
      orderBy: { name: "asc" },
      take: 300,
    });
    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        licenseNo: extra["licenseNo"] ?? "",
        licenseExpiry: extra["licenseExpiry"] ?? null,
        languages: extra["languages"] ?? [],
        active: r.status === "Active",
        notes: r.notes,
        branchId: r.branchId,
      };
    }));
  }),
);

router.post(
  "/drivers",
  requirePermission("create"),
  validate(driverSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof driverSchema>;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "transfers",
        tab: "Drivers",
        reference: `DRV-${Date.now().toString(36).toUpperCase().slice(-5)}`,
        name: body.name,
        phone: body.phone,
        status: body.active ? "Active" : "Inactive",
        notes: body.notes,
        branchId: body.branchId ?? null,
        extra: JSON.stringify({
          licenseNo: body.licenseNo ?? "",
          licenseExpiry: body.licenseExpiry ?? null,
          languages: body.languages,
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    await recordAudit({ organizationId, action: "Created", moduleId: "transfers", recordId: record.id, label: `Driver ${body.name} added`, req });
    return created(res, { id: record.id, name: record.name });
  }),
);

router.patch(
  "/drivers/:id",
  requirePermission("edit"),
  validate(driverSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof driverSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Driver");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.active !== undefined ? { status: body.active ? "Active" : "Inactive" } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        extra: JSON.stringify({ ...extra, ...(body.licenseNo !== undefined ? { licenseNo: body.licenseNo } : {}), ...(body.licenseExpiry !== undefined ? { licenseExpiry: body.licenseExpiry } : {}), ...(body.languages !== undefined ? { languages: body.languages } : {}) }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

router.delete(
  "/drivers/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Driver");
    await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

// ─── Assignment ───────────────────────────────────────────────────────────────

const assignSchema = z.object({
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  pickupTime: z.string().optional(),
  pickupLocation: z.string().max(200).optional(),
  dropLocation: z.string().max(200).optional(),
  notes: z.string().max(400).optional(),
});

/** Assign a vehicle and/or driver to a transfer record. */
router.post(
  "/:transferId/assign",
  requirePermission("edit"),
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name: actorName } = req.auth!;
    const body = req.body as z.infer<typeof assignSchema>;

    const transfer = await prisma.record.findFirst({
      where: { id: req.params.transferId, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!transfer) throw new NotFoundError("Transfer");

    // Look up vehicle and driver names for the assignment record. The ids must
    // name a vehicle and a driver — not any record in the workspace.
    const [vehicle, driver] = await Promise.all([
      body.vehicleId
        ? prisma.record.findFirst({
            where: {
              id: body.vehicleId,
              organizationId,
              moduleId: "transfers",
              tab: "Vehicles",
              deletedAt: null,
            },
            select: { reference: true, name: true },
          })
        : null,
      body.driverId
        ? prisma.record.findFirst({
            where: {
              id: body.driverId,
              organizationId,
              moduleId: "transfers",
              tab: "Drivers",
              deletedAt: null,
            },
            select: { name: true, phone: true },
          })
        : null,
    ]);
    if (body.vehicleId && !vehicle) throw new NotFoundError("Vehicle");
    if (body.driverId && !driver) throw new NotFoundError("Driver");

    /*
     * One vehicle and one driver per calendar day. Without this the same Innova
     * could be sent on two airport pickups at once — the fleet board looked
     * right because nothing compared the two transfers.
     */
    await assertTransportAvailable(organizationId, {
      transferId: transfer.id,
      date: transfer.date,
      vehicleId: body.vehicleId ?? undefined,
      driverId: body.driverId ?? undefined,
    });

    const extra = parseJson<Record<string, unknown>>(transfer.extra as string, {});
    const updated = await prisma.record.update({
      where: { id: transfer.id },
      data: {
        status: "Assigned",
        extra: JSON.stringify({
          ...extra,
          vehicleId: body.vehicleId ?? null,
          vehicleRef: vehicle?.reference ?? null,
          vehicleName: vehicle?.name ?? null,
          driverId: body.driverId ?? null,
          driverName: driver?.name ?? null,
          driverPhone: driver?.phone ?? null,
          pickupTime: body.pickupTime ?? null,
          pickupLocation: body.pickupLocation ?? null,
          dropLocation: body.dropLocation ?? null,
          assignmentNotes: body.notes ?? null,
        }),
        updatedById: userId,
      },
    });

    void eventStatusChange(organizationId, transfer.id, transfer.status, "Assigned", userId, actorName);

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "transfers",
      recordId: transfer.id,
      label: `Transfer assigned — ${vehicle?.name ?? "no vehicle"} · ${driver?.name ?? "no driver"}`,
      req,
    });

    return ok(res, {
      status: updated.status,
      vehicle: vehicle ?? null,
      driver: driver ?? null,
    });
  }),
);

/** Current assignment details for a transfer. */
router.get(
  "/:transferId/assignment",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const transfer = await prisma.record.findFirst({
      where: { id: req.params.transferId, organizationId, moduleId: "transfers", deletedAt: null },
    });
    if (!transfer) throw new NotFoundError("Transfer");

    const extra = parseJson<Record<string, unknown>>(transfer.extra as string, {});
    return ok(res, {
      vehicleId: extra["vehicleId"] ?? null,
      vehicleRef: extra["vehicleRef"] ?? null,
      vehicleName: extra["vehicleName"] ?? null,
      driverId: extra["driverId"] ?? null,
      driverName: extra["driverName"] ?? null,
      driverPhone: extra["driverPhone"] ?? null,
      pickupTime: extra["pickupTime"] ?? null,
      pickupLocation: extra["pickupLocation"] ?? null,
      dropLocation: extra["dropLocation"] ?? null,
      assigned: Boolean(extra["vehicleId"] || extra["driverId"]),
    });
  }),
);

export default router;
