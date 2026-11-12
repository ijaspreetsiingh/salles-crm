/**
 * Module Extensions — covers placeholder tabs for 6 modules in one file.
 *
 * Tasks 3-8: Campaigns (segments/coupons/attribution), Flights (e-ticket/ancillaries/reissues),
 * Packages (fixed departures/seasonal rates), Visa (insurance/appointments/advisories),
 * Support (refund chain/KB/feedback), Agents (KYC/credit/sub-agents).
 *
 * All routes are mounted under /api/v1/ext/{module} and use the generic Record
 * table with specific tab values — no new Prisma models needed, just typed JSON.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { cuid, parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { createNotification } from "../services/notifications";
import { eventCreated, eventStatusChange } from "../services/timeline";
import { escalateBreachedTickets } from "../services/sla";
import PDFDocument from "pdfkit";

const router = Router();
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// TASK 3: CAMPAIGNS — Segments, Coupons, Attribution
// ═══════════════════════════════════════════════════════════════════════════

const segmentSchema = z.object({
  name: z.string().min(1).max(120),
  moduleId: z.string().max(40).default("leads"),
  rules: z.record(z.unknown()).default({}), // { statuses: [], destinations: [], sources: [] }
  description: z.string().max(500).default(""),
});

router.get("/campaigns/segments", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "campaigns", tab: "Segments", deletedAt: null },
    orderBy: { name: "asc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, name: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}) })));
}));

router.post("/campaigns/segments", requirePermission("create"), validate(segmentSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof segmentSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "campaigns", tab: "Segments",
    reference: `SEG-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.name,
    detail: body.description, status: "Active", extra: JSON.stringify(body.rules), meta: "{}",
    createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id, name: record.name });
}));

router.delete("/campaigns/segments/:id", requirePermission("delete"), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId } });
  if (!existing) throw new NotFoundError("Segment");
  await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  return ok(res, { deleted: true });
}));

const couponSchema = z.object({
  code: z.string().min(1).max(30),
  description: z.string().max(200).default(""),
  discountType: z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.number().min(0).default(10),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  usageLimit: z.number().int().min(0).default(100),
  active: z.boolean().default(true),
});

router.get("/campaigns/coupons", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "campaigns", tab: "Referrals & coupons", deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, code: r.reference, name: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status })));
}));

router.post("/campaigns/coupons", requirePermission("create"), validate(couponSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof couponSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "campaigns", tab: "Referrals & coupons",
    reference: body.code.toUpperCase(), name: body.description || body.code,
    status: body.active ? "Active" : "Inactive",
    extra: JSON.stringify({ discountType: body.discountType, discountValue: body.discountValue, validFrom: body.validFrom, validTo: body.validTo, usageLimit: body.usageLimit, used: 0 }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id, code: body.code });
}));

router.patch("/campaigns/coupons/:id", requirePermission("edit"), validate(couponSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId } });
  if (!existing) throw new NotFoundError("Coupon");
  const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
  const body = req.body as z.infer<typeof couponSchema>;
  await prisma.record.update({ where: { id: existing.id }, data: {
    ...(body.code !== undefined ? { reference: body.code.toUpperCase() } : {}),
    ...(body.description !== undefined ? { name: body.description } : {}),
    ...(body.active !== undefined ? { status: body.active ? "Active" : "Inactive" } : {}),
    extra: JSON.stringify({ ...extra, ...(body.discountType !== undefined ? { discountType: body.discountType } : {}), ...(body.discountValue !== undefined ? { discountValue: body.discountValue } : {}), ...(body.validTo !== undefined ? { validTo: body.validTo } : {}), ...(body.usageLimit !== undefined ? { usageLimit: body.usageLimit } : {}) }),
  }});
  return ok(res, { updated: true });
}));

router.delete("/campaigns/coupons/:id", requirePermission("delete"), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId } });
  if (!existing) throw new NotFoundError("Coupon");
  await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  return ok(res, { deleted: true });
}));

/** Attribution — which campaign/source led to which booking. */
router.get("/campaigns/attribution", requirePermission("view"), asyncHandler(async (req, res) => {
  const orgId = req.auth!.organizationId;
  // Count bookings by source (which is where campaign attribution lives)
  const bySource = await prisma.record.groupBy({
    by: ["source"], where: { organizationId: orgId, moduleId: "bookings", status: { in: ["Confirmed", "Completed"] }, deletedAt: null },
    _count: { _all: true }, _sum: { amount: true },
  });
  const byLeadSource = await prisma.record.groupBy({
    by: ["source"], where: { organizationId: orgId, moduleId: "leads", deletedAt: null },
    _count: { _all: true },
  });
  return ok(res, {
    bookingsBySource: bySource.map((s) => ({ source: s.source || "Unknown", bookings: s._count._all, revenue: Number(s._sum.amount ?? 0) })),
    leadsBySource: byLeadSource.map((s) => ({ source: s.source || "Unknown", leads: s._count._all })),
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 4: FLIGHTS — E-ticket PDF, Ancillaries, Reissues & Refunds
// ═══════════════════════════════════════════════════════════════════════════

/** E-ticket PDF for a flight record. */
router.get("/flights/:recordId/e-ticket", requirePermission("view"), asyncHandler(async (req, res) => {
  const record = await prisma.record.findFirst({ where: { id: req.params.recordId, organizationId: req.auth!.organizationId, moduleId: "flights", deletedAt: null } });
  if (!record) throw new NotFoundError("Flight record");
  const org = await prisma.organization.findUnique({ where: { id: req.auth!.organizationId }, select: { name: true, address: true, supportEmail: true, phone: true } });
  const extra = parseJson<Record<string, unknown>>(record.extra as string, {});
  const passengers = Array.isArray(extra["passengers"]) ? extra["passengers"] : [];
  const ticketNumbers = Array.isArray(extra["ticketNumbers"]) ? extra["ticketNumbers"] : [];

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.fontSize(18).font("Helvetica-Bold").fillColor("#17191a").text(org?.name ?? "Travel Agency", 50, 50);
  doc.fontSize(16).fillColor("#2f5c50").text("E-TICKET / ITINERARY RECEIPT", { align: "center" });
  doc.moveDown(1);
  doc.fontSize(9).fillColor("#555555");
  doc.text(`Booking Ref: ${record.reference}`, 50, doc.y);
  doc.text(`Passenger: ${record.name}`, 50, doc.y + 2);
  doc.text(`Route: ${extra["route"] ?? record.detail ?? ""}`, 50, doc.y + 2);
  doc.text(`Airline: ${extra["airline"] ?? ""}`, 50, doc.y + 2);
  doc.text(`Departure: ${extra["departure"] ?? record.date ?? ""}`, 50, doc.y + 2);
  doc.text(`Class: ${extra["fareType"] ?? "Economy"}`, 50, doc.y + 2);
  doc.text(`Status: ${record.status}`, 50, doc.y + 2);
  doc.moveDown(1);
  if (ticketNumbers.length > 0) {
    doc.font("Helvetica-Bold").text("Ticket Numbers:", 50, doc.y);
    doc.font("Helvetica");
    ticketNumbers.forEach((tn: unknown) => doc.text(String(tn), 60, doc.y + 2));
    doc.moveDown(0.5);
  }
  if (passengers.length > 0) {
    doc.font("Helvetica-Bold").text("Passengers:", 50, doc.y);
    doc.font("Helvetica");
    passengers.forEach((p: unknown, i: number) => {
      const pax = p as Record<string, string>;
      doc.text(`${i + 1}. ${pax["name"] ?? ""} ${pax["passport"] ? "· Passport: " + pax["passport"] : ""}`, 60, doc.y + 2);
    });
  }
  doc.moveDown(2);
  doc.fontSize(8).fillColor("#777777");
  doc.text(`Generated by ${org?.name ?? ""} on ${new Date().toLocaleString("en-IN")}`, 50, doc.page.height - 60);
  doc.text("Please carry a printout of this e-ticket along with a valid photo ID.", 50, doc.page.height - 48);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="eticket-${record.reference}.pdf"`);
  doc.pipe(res);
}));

const ancillarySchema = z.object({
  recordId: z.string().min(1),
  type: z.enum(["Extra baggage", "Meal preference", "Seat selection", "Wheelchair", "Infant bassinet", "Lounge access", "Travel insurance", "Other"]),
  description: z.string().max(300).default(""),
  amount: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  status: z.enum(["Requested", "Confirmed", "Declined"]).default("Requested"),
});

router.get("/flights/:recordId/ancillaries", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "flights", tab: "Ancillaries", extra: { contains: req.params.recordId }, deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  return ok(res, rows.map((r) => ({ id: r.id, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status })));
}));

router.post("/flights/ancillaries", requirePermission("create"), validate(ancillarySchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof ancillarySchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "flights", tab: "Ancillaries",
    reference: `ANC-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.type,
    detail: body.description, amount: body.amount, currency: body.currency, status: body.status,
    extra: JSON.stringify({ flightRecordId: body.recordId, type: body.type }), meta: "{}",
    createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

/**
 * Support SLA breach check.
 *
 * Finds every open support ticket whose SLA due date has passed, escalates it
 * (Open → Escalated) and notifies the team. Returns how many tickets were
 * escalated. Meant to be called on a schedule (e.g. every hour) so breached
 * tickets don't sit unnoticed.
 */
router.post(
  "/support/sla/escalate-breached",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const escalated = await escalateBreachedTickets(req.auth!.organizationId);
    return ok(res, { escalated });
  }),
);


const reissueRefundSchema = z.object({
  flightRecordId: z.string().min(1),
  type: z.enum(["Reissue", "Refund", "Cancellation"]),
  reason: z.string().min(1).max(500),
  penaltyAmount: z.number().min(0).default(0),
  refundAmount: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  newFlightDetails: z.string().max(500).optional(),
  status: z.enum(["Requested", "Approved", "Processed", "Rejected"]).default("Requested"),
});

router.post("/flights/reissues-refunds", requirePermission("create"), validate(reissueRefundSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof reissueRefundSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "flights", tab: "Reissues & refunds",
    reference: `${body.type.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase().slice(-5)}`,
    name: `${body.type} for flight`, detail: body.reason, amount: body.refundAmount, currency: body.currency,
    status: body.status, extra: JSON.stringify({ flightRecordId: body.flightRecordId, type: body.type, penaltyAmount: body.penaltyAmount, newFlightDetails: body.newFlightDetails }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  void eventCreated(req.auth!.organizationId, record.id, record.reference, body.type, req.auth!.userId, req.auth!.name);
  return created(res, { id: record.id, reference: record.reference });
}));

router.patch("/flights/reissues-refunds/:id", requirePermission("approve"), validate(reissueRefundSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId, moduleId: "flights" } });
  if (!existing) throw new NotFoundError("Reissue/Refund");
  const prevStatus = existing.status;
  const body = req.body as z.infer<typeof reissueRefundSchema>;
  await prisma.record.update({ where: { id: existing.id }, data: {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.refundAmount !== undefined ? { amount: body.refundAmount } : {}),
    extra: JSON.stringify({ ...parseJson<Record<string, unknown>>(existing.extra as string, {}), ...(body.penaltyAmount !== undefined ? { penaltyAmount: body.penaltyAmount } : {}), ...(body.newFlightDetails !== undefined ? { newFlightDetails: body.newFlightDetails } : {}) }),
  }});
  if (body.status && body.status !== prevStatus) void eventStatusChange(req.auth!.organizationId, existing.id, prevStatus, body.status, req.auth!.userId, req.auth!.name);
  return ok(res, { updated: true });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 5: PACKAGES — Fixed Departures + Seasonal Rates
// ═══════════════════════════════════════════════════════════════════════════

const departureSchema = z.object({
  packageId: z.string().min(1),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  capacity: z.number().int().min(1).max(500).default(20),
  booked: z.number().int().min(0).default(0),
  price: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  status: z.enum(["Open", "Guaranteed", "Closed", "Departed"]).default("Open"),
  notes: z.string().max(500).default(""),
});

router.get("/packages/departures", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "packages", tab: "Fixed departures", deletedAt: null },
    orderBy: { date: "asc" }, take: 200,
  });
  return ok(res, rows.map((r) => ({
    id: r.id, reference: r.reference, departureDate: r.date, packageName: r.name,
    ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status, available: Number(parseJson<Record<string, unknown>>(r.extra as string, {}).capacity ?? 0) - Number(parseJson<Record<string, unknown>>(r.extra as string, {}).booked ?? 0),
  })));
}));

router.post("/packages/departures", requirePermission("create"), validate(departureSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof departureSchema>;
  const pkg = await prisma.record.findFirst({ where: { id: body.packageId, organizationId: req.auth!.organizationId, moduleId: "packages" }, select: { name: true } });
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "packages", tab: "Fixed departures",
    reference: `DEP-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: pkg?.name ?? "Package departure",
    date: body.departureDate, amount: body.price, currency: body.currency, status: body.status,
    notes: body.notes, extra: JSON.stringify({ packageId: body.packageId, returnDate: body.returnDate, capacity: body.capacity, booked: body.booked, price: body.price }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id, reference: record.reference });
}));

router.patch("/packages/departures/:id", requirePermission("edit"), validate(departureSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId } });
  if (!existing) throw new NotFoundError("Departure");
  const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
  const body = req.body as z.infer<typeof departureSchema>;
  await prisma.record.update({ where: { id: existing.id }, data: {
    ...(body.departureDate !== undefined ? { date: body.departureDate } : {}),
    ...(body.price !== undefined ? { amount: body.price } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    extra: JSON.stringify({ ...extra, ...(body.capacity !== undefined ? { capacity: body.capacity } : {}), ...(body.booked !== undefined ? { booked: body.booked } : {}), ...(body.returnDate !== undefined ? { returnDate: body.returnDate } : {}) }),
  }});
  return ok(res, { updated: true });
}));

const seasonalRateSchema = z.object({
  packageId: z.string().min(1),
  seasonName: z.string().min(1).max(80), // e.g. "Summer 2026", "Christmas Peak"
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  markup: z.number().min(0).default(0), // percentage markup over base price
  notes: z.string().max(500).default(""),
});

router.get("/packages/seasonal-rates", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "packages", tab: "Seasonal rates", deletedAt: null },
    orderBy: { date: "asc" }, take: 200,
  });
  return ok(res, rows.map((r) => ({ id: r.id, ...parseJson<Record<string, unknown>>(r.extra as string, {}), packageName: r.name, validFrom: r.date, status: r.status })));
}));

router.post("/packages/seasonal-rates", requirePermission("create"), validate(seasonalRateSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof seasonalRateSchema>;
  const pkg = await prisma.record.findFirst({ where: { id: body.packageId, organizationId: req.auth!.organizationId, moduleId: "packages" }, select: { name: true } });
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "packages", tab: "Seasonal rates",
    reference: `SEA-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.seasonName,
    date: body.validFrom, amount: body.price, currency: body.currency, status: "Active",
    notes: body.notes, extra: JSON.stringify({ packageId: body.packageId, packageName: pkg?.name, seasonName: body.seasonName, validTo: body.validTo, markup: body.markup }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 6: VISA — Insurance, Appointments, Travel Advisories
// ═══════════════════════════════════════════════════════════════════════════

const insuranceSchema = z.object({
  visaRecordId: z.string().optional(),
  insurer: z.string().min(1).max(120),
  policyNo: z.string().max(40).optional(),
  coverageType: z.enum(["Medical only", "Comprehensive", "Trip cancellation", "Baggage", "Multi-trip"]).default("Comprehensive"),
  coverageAmount: z.number().min(0).default(0),
  premium: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  coveredPersons: z.array(z.string().max(120)).max(20).default([]),
  notes: z.string().max(500).default(""),
});

router.get("/visa/insurance", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Insurance", deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 200,
  });
  return ok(res, rows.map((r) => ({ id: r.id, insurer: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status, premium: r.amount })));
}));

router.post("/visa/insurance", requirePermission("create"), validate(insuranceSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof insuranceSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Insurance",
    reference: `INS-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.insurer,
    amount: body.premium, currency: body.currency, status: "Active",
    date: body.validFrom ?? new Date().toISOString().slice(0, 10),
    notes: body.notes, extra: JSON.stringify({ visaRecordId: body.visaRecordId, policyNo: body.policyNo, coverageType: body.coverageType, coverageAmount: body.coverageAmount, validTo: body.validTo, coveredPersons: body.coveredPersons }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id, reference: record.reference });
}));

const appointmentSchema = z.object({
  visaRecordId: z.string().optional(),
  embassy: z.string().min(1).max(120),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentTime: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  purpose: z.string().max(200).default("Visa interview"),
  status: z.enum(["Scheduled", "Completed", "Cancelled", "Rescheduled"]).default("Scheduled"),
  notes: z.string().max(500).default(""),
});

router.get("/visa/appointments", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Appointments", deletedAt: null },
    orderBy: { date: "asc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, embassy: r.name, date: r.date, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status })));
}));

router.post("/visa/appointments", requirePermission("create"), validate(appointmentSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof appointmentSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Appointments",
    reference: `APT-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.embassy,
    date: body.appointmentDate, status: body.status, notes: body.notes,
    extra: JSON.stringify({ visaRecordId: body.visaRecordId, appointmentTime: body.appointmentTime, address: body.address, purpose: body.purpose }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id, reference: record.reference });
}));

const advisorySchema = z.object({
  country: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  advisory: z.string().min(1).max(5000),
  severity: z.enum(["Info", "Warning", "Critical"]).default("Info"),
  source: z.string().max(120).default("Internal"),
});

router.get("/visa/advisories", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Travel advisories", deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, country: r.destination, title: r.name, advisory: r.notes, ...parseJson<Record<string, unknown>>(r.extra as string, {}), createdAt: r.createdAt.toISOString() })));
}));

router.post("/visa/advisories", requirePermission("create"), validate(advisorySchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof advisorySchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "visa", tab: "Travel advisories",
    reference: `ADV-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.title,
    destination: body.country, notes: body.advisory, status: "Active",
    extra: JSON.stringify({ severity: body.severity, source: body.source }), meta: "{}",
    createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 7: SUPPORT — Refund Approval Chain, Knowledge Base, Feedback
// ═══════════════════════════════════════════════════════════════════════════

const refundSchema = z.object({
  bookingReference: z.string().max(40).optional(),
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email().optional(),
  reason: z.string().min(1).max(500),
  refundAmount: z.number().min(0),
  currency: z.string().max(6).default("INR"),
  status: z.enum(["Requested", "Manager review", "Finance approved", "Processed", "Rejected"]).default("Requested"),
});

router.get("/support/refunds", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "support", tab: "Refund requests", deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, reference: r.reference, customerName: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}), amount: r.amount, status: r.status, createdAt: r.createdAt.toISOString() })));
}));

router.post("/support/refunds", requirePermission("create"), validate(refundSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof refundSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "support", tab: "Refund requests",
    reference: `RFD-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.customerName,
    email: body.customerEmail ?? "", amount: body.refundAmount, currency: body.currency,
    status: body.status, notes: body.reason,
    extra: JSON.stringify({ bookingReference: body.bookingReference, approvalHistory: [], reason: body.reason }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  void eventCreated(req.auth!.organizationId, record.id, record.reference, "Refund Request", req.auth!.userId, req.auth!.name);
  return created(res, { id: record.id, reference: record.reference });
}));

const refundDecisionSchema = z.object({
  action: z.enum(["approve", "reject", "escalate"]),
  note: z.string().max(500).default(""),
  nextStatus: z.string().max(40).optional(),
});

/** Advances a refund through the approval chain: Requested → Manager review → Finance approved → Processed. */
router.post("/support/refunds/:id/decision", requirePermission("approve"), validate(refundDecisionSchema), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId, moduleId: "support" } });
  if (!existing) throw new NotFoundError("Refund request");
  const { action, note, nextStatus } = req.body as z.infer<typeof refundDecisionSchema>;

  const flow: Record<string, string> = { "Requested": "Manager review", "Manager review": "Finance approved", "Finance approved": "Processed" };
  const newStatus = nextStatus ?? (action === "reject" ? "Rejected" : action === "escalate" ? "Manager review" : flow[existing.status] ?? "Processed");
  const prevStatus = existing.status;

  const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
  const history = Array.isArray(extra["approvalHistory"]) ? extra["approvalHistory"] as Array<unknown> : [];
  history.push({ actorId: req.auth!.userId, actorName: req.auth!.name, action, note, from: prevStatus, to: newStatus, at: new Date().toISOString() });

  await prisma.record.update({ where: { id: existing.id }, data: { status: newStatus, extra: JSON.stringify({ ...extra, approvalHistory: history }) } });
  void eventStatusChange(req.auth!.organizationId, existing.id, prevStatus, newStatus, req.auth!.userId, req.auth!.name);

  // Notify the requester
  void createNotification({ organizationId: req.auth!.organizationId, title: `Refund ${action === "reject" ? "rejected" : "approved"} — ${existing.reference}`, body: note || `Status: ${newStatus}`, moduleId: "support", recordId: existing.id, level: action === "reject" ? "warning" : "success" });

  return ok(res, { status: newStatus });
}));

const kbSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().max(80).default("General"),
  content: z.string().min(1).max(20000),
  tags: z.array(z.string().max(40)).max(10).default([]),
  status: z.enum(["Draft", "Published"]).default("Published"),
});

router.get("/support/kb", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "support", tab: "Knowledge base", deletedAt: null },
    orderBy: { name: "asc" }, take: 200,
  });
  return ok(res, rows.map((r) => ({ id: r.id, title: r.name, category: r.detail, content: r.notes, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status })));
}));

router.post("/support/kb", requirePermission("create"), validate(kbSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof kbSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "support", tab: "Knowledge base",
    reference: `KB-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.title,
    detail: body.category, notes: body.content, status: body.status,
    extra: JSON.stringify({ tags: body.tags }), meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

router.patch("/support/kb/:id", requirePermission("edit"), validate(kbSchema.partial()), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId } });
  if (!existing) throw new NotFoundError("KB article");
  const body = req.body as z.infer<typeof kbSchema>;
  await prisma.record.update({ where: { id: existing.id }, data: {
    ...(body.title !== undefined ? { name: body.title } : {}), ...(body.category !== undefined ? { detail: body.category } : {}),
    ...(body.content !== undefined ? { notes: body.content } : {}), ...(body.status !== undefined ? { status: body.status } : {}),
  }});
  return ok(res, { updated: true });
}));

const feedbackSchema = z.object({
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email().optional(),
  rating: z.number().int().min(1).max(5).default(5),
  category: z.enum(["Service", "Booking experience", "Trip quality", "Value for money", "Support", "Other"]).default("Service"),
  comments: z.string().max(5000).default(""),
  tripReference: z.string().max(40).optional(),
});

router.get("/support/feedback", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "support", tab: "Feedback", deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, customerName: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}), comments: r.notes, createdAt: r.createdAt.toISOString() })));
}));

router.post("/support/feedback", requirePermission("create"), validate(feedbackSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof feedbackSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "support", tab: "Feedback",
    reference: `FB-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.customerName,
    email: body.customerEmail ?? "", notes: body.comments, status: "Open",
    extra: JSON.stringify({ rating: body.rating, category: body.category, tripReference: body.tripReference }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

// ═══════════════════════════════════════════════════════════════════════════
// TASK 8: AGENTS — KYC Approvals, Credit Limits, Sub-agent Hierarchy
// ═══════════════════════════════════════════════════════════════════════════

const kycSchema = z.object({
  agentId: z.string().min(1),
  documentType: z.enum(["PAN card", "GST certificate", "Business registration", "ID proof", "Address proof", "Bank statement", "Other"]),
  documentNumber: z.string().max(60).optional(),
  fileName: z.string().max(200).optional(),
  fileUrl: z.string().max(500).optional(),
  status: z.enum(["Submitted", "Verified", "Rejected"]).default("Submitted"),
  notes: z.string().max(500).default(""),
});

router.get("/agents/:agentId/kyc", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "agents", tab: "KYC approvals", extra: { contains: req.params.agentId }, deletedAt: null },
    orderBy: { createdAt: "desc" }, take: 50,
  });
  return ok(res, rows.map((r) => ({ id: r.id, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status, agentId: req.params.agentId })));
}));

router.post("/agents/kyc", requirePermission("create"), validate(kycSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof kycSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "agents", tab: "KYC approvals",
    reference: `KYC-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.documentType,
    status: body.status, notes: body.notes,
    extra: JSON.stringify({ agentId: body.agentId, documentType: body.documentType, documentNumber: body.documentNumber, fileName: body.fileName, fileUrl: body.fileUrl }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

router.patch("/agents/kyc/:id", requirePermission("approve"), asyncHandler(async (req, res) => {
  const existing = await prisma.record.findFirst({ where: { id: req.params.id, organizationId: req.auth!.organizationId, moduleId: "agents" } });
  if (!existing) throw new NotFoundError("KYC document");
  const { status, notes } = req.body as { status?: string; notes?: string };
  const prevStatus = existing.status;
  await prisma.record.update({ where: { id: existing.id }, data: { ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) } });
  if (status && status !== prevStatus) void eventStatusChange(req.auth!.organizationId, existing.id, prevStatus, status, req.auth!.userId, req.auth!.name);
  return ok(res, { updated: true });
}));

const creditSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1).max(120),
  creditLimit: z.number().min(0).default(0),
  creditUsed: z.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  terms: z.string().max(200).default("Net 30"),
  status: z.enum(["Active", "Frozen", "Revoked"]).default("Active"),
});

router.get("/agents/:agentId/credit", requirePermission("view"), asyncHandler(async (req, res) => {
  const record = await prisma.record.findFirst({
    where: { organizationId: req.auth!.organizationId, moduleId: "agents", tab: "Credit limits", extra: { contains: req.params.agentId }, deletedAt: null },
  });
  if (!record) return ok(res, { configured: false });
  return ok(res, { configured: true, ...parseJson<Record<string, unknown>>(record.extra as string, {}), limit: record.amount, status: record.status });
}));

router.post("/agents/credit", requirePermission("approve"), validate(creditSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof creditSchema>;
  const existing = await prisma.record.findFirst({ where: { organizationId: req.auth!.organizationId, moduleId: "agents", tab: "Credit limits", extra: { contains: body.agentId } } });
  if (existing) {
    await prisma.record.update({ where: { id: existing.id }, data: { amount: body.creditLimit, status: body.status, extra: JSON.stringify({ agentId: body.agentId, agentName: body.agentName, creditUsed: body.creditUsed, currency: body.currency, terms: body.terms }) } });
    return ok(res, { updated: true });
  }
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "agents", tab: "Credit limits",
    reference: `CR-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.agentName,
    amount: body.creditLimit, currency: body.currency, status: body.status,
    extra: JSON.stringify({ agentId: body.agentId, agentName: body.agentName, creditUsed: body.creditUsed, terms: body.terms }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

const subAgentSchema = z.object({
  parentAgentId: z.string().min(1),
  parentAgentName: z.string().min(1).max(120),
  subAgentName: z.string().min(1).max(120),
  subAgentEmail: z.string().email().optional(),
  subAgentPhone: z.string().max(40).optional(),
  commissionShare: z.number().min(0).max(100).default(100), // % of commission passed to sub-agent
  status: z.enum(["Active", "Pending", "Suspended"]).default("Active"),
});

router.get("/agents/:agentId/sub-agents", requirePermission("view"), asyncHandler(async (req, res) => {
  const rows = await prisma.record.findMany({
    where: { organizationId: req.auth!.organizationId, moduleId: "agents", tab: "Sub-agents", extra: { contains: req.params.agentId }, deletedAt: null },
    orderBy: { name: "asc" }, take: 100,
  });
  return ok(res, rows.map((r) => ({ id: r.id, name: r.name, ...parseJson<Record<string, unknown>>(r.extra as string, {}), status: r.status })));
}));

router.post("/agents/sub-agents", requirePermission("create"), validate(subAgentSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof subAgentSchema>;
  const record = await prisma.record.create({ data: {
    id: cuid(), organizationId: req.auth!.organizationId, moduleId: "agents", tab: "Sub-agents",
    reference: `SUB-${Date.now().toString(36).toUpperCase().slice(-5)}`, name: body.subAgentName,
    email: body.subAgentEmail ?? "", phone: body.subAgentPhone ?? "", status: body.status,
    extra: JSON.stringify({ parentAgentId: body.parentAgentId, parentAgentName: body.parentAgentName, commissionShare: body.commissionShare }),
    meta: "{}", createdById: req.auth!.userId,
  }});
  return created(res, { id: record.id });
}));

export default router;
