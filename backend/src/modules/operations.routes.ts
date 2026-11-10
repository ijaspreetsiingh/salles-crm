import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { NotFoundError } from "../lib/errors";
import { generateVoucherPdf } from "../services/voucher-pdf";

/**
 * Trip operations — what the desk needs on the day a trip leaves.
 *
 * Three real things, all derived from records that already exist: the day's
 * departures, the manifest the tour manager carries, and the hotel voucher
 * that gets a guest checked in.
 */
const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("operations", "view"));

const dayOf = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

/** Departures for a date window, with the travellers behind each booking. */
router.get(
  "/departures",
  requireModulePermission("operations", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const from = String(req.query.from ?? dayOf(0));
    const to = String(req.query.to ?? dayOf(7));

    const bookings = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "bookings",
        deletedAt: null,
        date: { gte: from, lte: to },
        status: { notIn: ["Cancelled"] },
      },
      orderBy: { date: "asc" },
      take: 500,
    });

    // Group trips starting in the window are departures too.
    const groups = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "groups",
        deletedAt: null,
        date: { gte: from, lte: to },
        status: { notIn: ["Cancelled"] },
      },
      orderBy: { date: "asc" },
      take: 200,
    });
    const groupIds = groups.map((group) => group.id);
    const members = groupIds.length
      ? await prisma.groupMember.findMany({
          where: { organizationId, groupRecordId: { in: groupIds }, status: { not: "Cancelled" } },
        })
      : [];
    const memberCount = new Map<string, number>();
    for (const member of members) {
      memberCount.set(member.groupRecordId, (memberCount.get(member.groupRecordId) ?? 0) + 1);
    }

    const byDate = new Map<string, Array<Record<string, unknown>>>();
    const push = (date: string, item: Record<string, unknown>) =>
      byDate.set(date, [...(byDate.get(date) ?? []), item]);

    for (const booking of bookings) {
      push(booking.date || "unscheduled", {
        id: booking.id,
        moduleId: "bookings",
        reference: booking.reference,
        name: booking.name,
        destination: booking.destination,
        status: booking.status,
        owner: booking.ownerName,
        amount: booking.amount,
        currency: booking.currency,
      });
    }
    for (const group of groups) {
      push(group.date || "unscheduled", {
        id: group.id,
        moduleId: "groups",
        reference: group.reference,
        name: group.name,
        destination: group.destination,
        status: group.status,
        owner: group.ownerName,
        travellers: memberCount.get(group.id) ?? 0,
      });
    }

    return ok(res, {
      from,
      to,
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({ date, items })),
      totals: {
        departures: bookings.length + groups.length,
        travellers: members.length,
      },
    });
  }),
);

/**
 * The manifest for one departure: every traveller with passport, room and
 * contact, ready to print or hand to a guide.
 */
router.get(
  "/manifest/:recordId",
  requireModulePermission("operations", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const record = await prisma.record.findFirst({
      where: { id: req.params.recordId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundError("Departure");

    const members =
      record.moduleId === "groups"
        ? await prisma.groupMember.findMany({
            where: { organizationId, groupRecordId: record.id },
            orderBy: [{ roomNumber: "asc" }, { name: "asc" }],
          })
        : [];

    return ok(res, {
      departure: {
        id: record.id,
        moduleId: record.moduleId,
        reference: record.reference,
        name: record.name,
        destination: record.destination,
        date: record.date,
        status: record.status,
        owner: record.ownerName,
        phone: record.phone,
        notes: record.notes,
      },
      generatedAt: new Date().toISOString(),
      travellers:
        members.length > 0
          ? members.map((member) => ({
              name: member.name,
              passport: member.passport,
              nationality: member.nationality,
              dateOfBirth: member.dateOfBirth,
              phone: member.phone,
              room: member.roomNumber,
              roomType: member.roomType,
              status: member.status,
              dietary: member.dietary,
              emergencyContact: member.emergencyContact,
            }))
          : [],
      counts: {
        travellers: members.length,
        withoutPassport: members.filter((m) => m.status !== "Cancelled" && !m.passport).length,
      },
    });
  }),
);

/** Printable hotel / service voucher for one booking. */
router.get(
  "/voucher/:recordId",
  requireModulePermission("operations", "view"),
  asyncHandler(async (req, res) => {
    const { stream, filename, voucherNo } = await generateVoucherPdf({
      organizationId: req.auth!.organizationId,
      recordId: req.params.recordId,
    });
    await prisma.record
      .update({
        where: { id: req.params.recordId },
        data: {
          status: "Vouchered",
          updatedById: req.auth!.userId,
        },
      })
      .catch(() => undefined);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("X-Voucher-No", voucherNo);
    stream.pipe(res);
  }),
);

/**
 * Deadlines that cost money if missed: allotments about to release and visa
 * applications still short of documents.
 */
router.get(
  "/deadlines",
  requireModulePermission("operations", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const today = dayOf(0);
    const horizon = dayOf(21);

    const allotments = await prisma.hotelAllotment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "Open",
        contractTo: { gte: today, lte: horizon },
      },
      orderBy: { contractTo: "asc" },
      take: 100,
    });

    const visaApplications = await prisma.record.findMany({
      where: {
        organizationId,
        moduleId: "visa",
        deletedAt: null,
        status: { in: ["Documents pending", "In review"] },
        date: { gte: today, lte: horizon },
      },
      orderBy: { date: "asc" },
      take: 100,
    });
    const checklist = visaApplications.length
      ? await prisma.visaChecklistItem.findMany({
          where: {
            organizationId,
            recordId: { in: visaApplications.map((a) => a.id) },
            status: "pending",
          },
        })
      : [];
    const pendingByRecord = new Map<string, number>();
    for (const item of checklist) {
      pendingByRecord.set(item.recordId, (pendingByRecord.get(item.recordId) ?? 0) + 1);
    }

    return ok(res, {
      allotments: allotments.map((row) => ({
        id: row.id,
        hotelName: row.hotelName,
        roomType: row.roomType,
        contractTo: row.contractTo,
        releaseDays: row.releaseDays,
        freeRooms: Math.max(0, row.totalRooms - row.usedRooms),
        daysLeft: Math.ceil(
          (new Date(`${row.contractTo}T00:00:00`).getTime() -
            new Date(`${today}T00:00:00`).getTime()) /
            86_400_000,
        ),
      })),
      visas: visaApplications.map((record) => ({
        id: record.id,
        reference: record.reference,
        name: record.name,
        destination: record.destination,
        date: record.date,
        pendingDocuments: pendingByRecord.get(record.id) ?? 0,
      })),
    });
  }),
);

export default router;
