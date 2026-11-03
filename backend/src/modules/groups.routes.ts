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
 * Group travel: the delegate list and the rooming list.
 *
 * A group booking is one record (GRP-2401) plus N travellers. The travellers
 * live in one table so the two documents an agency actually produces — the
 * rooming list the hotel asks for and the manifest the tour manager carries —
 * are always built from the same rows.
 */
const router = Router();
router.use(requireAuth);

const memberSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  passport: z.string().max(40).optional(),
  nationality: z.string().max(80).optional(),
  dateOfBirth: z.string().max(20).optional(),
  roomType: z.enum(["Single", "Double", "Twin", "Triple", "Child"]).optional(),
  roomNumber: z.string().max(20).optional(),
  sharingWith: z.string().max(160).optional(),
  bedPreference: z.string().max(80).optional(),
  dietary: z.string().max(200).optional(),
  emergencyContact: z.string().max(160).optional(),
  status: z.enum(["Confirmed", "Pending", "Cancelled"]).optional(),
  notes: z.string().max(1000).optional(),
});

const memberDto = (row: {
  id: string;
  name: string;
  email: string;
  phone: string;
  passport: string;
  nationality: string;
  dateOfBirth: string;
  roomType: string;
  roomNumber: string;
  sharingWith: string;
  bedPreference: string;
  dietary: string;
  emergencyContact: string;
  status: string;
  notes: string;
  updatedAt: Date;
}) => ({ ...row, updatedAt: row.updatedAt.toISOString() });

/** Verifies the group belongs to this tenant before touching its travellers. */
async function assertGroup(organizationId: string, recordId: string) {
  const record = await prisma.record.findFirst({
    where: { id: recordId, organizationId, moduleId: "groups", deletedAt: null },
  });
  if (!record) throw new NotFoundError("Group");
  return record;
}

/** Delegates on a group trip. */
router.get(
  "/:recordId/members",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!.organizationId, req.params.recordId);
    const members = await prisma.groupMember.findMany({
      where: { organizationId: req.auth!.organizationId, groupRecordId: req.params.recordId },
      orderBy: [{ roomNumber: "asc" }, { name: "asc" }],
    });
    const active = members.filter((m) => m.status !== "Cancelled");
    const rooms = new Set(active.map((m) => m.roomNumber).filter(Boolean));
    return ok(res, {
      items: members.map(memberDto),
      summary: {
        delegates: members.length,
        confirmed: members.filter((m) => m.status === "Confirmed").length,
        pending: members.filter((m) => m.status === "Pending").length,
        cancelled: members.filter((m) => m.status === "Cancelled").length,
        rooms: rooms.size,
        unassigned: active.filter((m) => !m.roomNumber).length,
        passportsMissing: active.filter((m) => !m.passport).length,
      },
    });
  }),
);

router.post(
  "/:recordId/members",
  requirePermission("create"),
  validate(memberSchema),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!.organizationId, req.params.recordId);
    const body = req.body as z.infer<typeof memberSchema>;
    const member = await prisma.groupMember.create({
      data: {
        organizationId: req.auth!.organizationId,
        groupRecordId: req.params.recordId,
        name: body.name,
        email: body.email ?? "",
        phone: body.phone ?? "",
        passport: body.passport ?? "",
        nationality: body.nationality ?? "",
        dateOfBirth: body.dateOfBirth ?? "",
        roomType: body.roomType ?? "Double",
        roomNumber: body.roomNumber ?? "",
        sharingWith: body.sharingWith ?? "",
        bedPreference: body.bedPreference ?? "",
        dietary: body.dietary ?? "",
        emergencyContact: body.emergencyContact ?? "",
        status: body.status ?? "Confirmed",
        notes: body.notes ?? "",
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "groups",
      recordId: req.params.recordId,
      label: `Delegate added: ${member.name}`,
      req,
    });
    return created(res, memberDto(member));
  }),
);

router.post(
  "/:recordId/members/bulk",
  requirePermission("create"),
  validate(z.object({ text: z.string().min(1).max(20000), roomType: z.string().max(20).optional() })),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!.organizationId, req.params.recordId);
    const { text, roomType } = req.body as { text: string; roomType?: string };
    // One name per line; "Name, phone, passport" also works for a pasted list.
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const rows = lines.map((line) => {
      const [name, phone = "", passport = ""] = line.split(/[,;\t]/).map((part) => part.trim());
      return {
        organizationId: req.auth!.organizationId,
        groupRecordId: req.params.recordId,
        name: name.slice(0, 160),
        phone: phone.slice(0, 40),
        passport: passport.slice(0, 40),
        roomType: roomType ?? "Double",
        status: "Confirmed",
      };
    });
    await prisma.groupMember.createMany({ data: rows });
    return created(res, { added: rows.length });
  }),
);

router.patch(
  "/members/:id",
  requirePermission("edit"),
  validate(memberSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.groupMember.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Delegate");
    const member = await prisma.groupMember.update({
      where: { id: existing.id },
      data: req.body as Partial<z.infer<typeof memberSchema>>,
    });
    return ok(res, memberDto(member));
  }),
);

router.delete(
  "/members/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.groupMember.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Delegate");
    await prisma.groupMember.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

/**
 * Auto-assigns room numbers.
 *
 * People who named each other as sharing go in the same room; everybody else
 * is packed by room type, and sleeping capacity is respected (single 1, twin 2,
 * triple 3, child shares a parent's room). The office can still edit any room
 * afterwards — this just removes the spreadsheet step.
 */
router.post(
  "/:recordId/auto-rooms",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    await assertGroup(organizationId, req.params.recordId);
    const members = await prisma.groupMember.findMany({
      where: { organizationId, groupRecordId: req.params.recordId, status: { not: "Cancelled" } },
      orderBy: { name: "asc" },
    });

    const capacity: Record<string, number> = { Single: 1, Double: 2, Twin: 2, Triple: 3, Child: 1 };
    const used = new Set<string>();
    const assignments = new Map<string, { room: string; roomType: string }>();
    let roomNo = 101;

    const nextRoom = (type: string) => {
      let number = "";
      // Skip numbers that a manual assignment already took.
      do {
        number = String(roomNo++);
      } while (used.has(number));
      used.add(number);
      void type;
      return number;
    };

    // 1. Honour explicit sharing pairs.
    const byName = new Map(members.map((m) => [m.name.toLowerCase(), m]));
    for (const member of members) {
      if (assignments.has(member.id)) continue;
      const partner = member.sharingWith ? byName.get(member.sharingWith.toLowerCase()) : undefined;
      if (partner && partner.id !== member.id && !assignments.has(partner.id)) {
        const type = member.roomType === "Single" ? "Twin" : member.roomType;
        const room = member.roomNumber || partner.roomNumber || nextRoom(type);
        assignments.set(member.id, { room, roomType: type });
        assignments.set(partner.id, { room, roomType: type });
      }
    }

    // 2. Pack the rest by room type.
    const open = members.filter((m) => !assignments.has(m.id));
    const groups = new Map<string, typeof open>();
    for (const member of open) {
      if (member.roomNumber) {
        assignments.set(member.id, { room: member.roomNumber, roomType: member.roomType });
        used.add(member.roomNumber);
        continue;
      }
      const key = member.roomType;
      groups.set(key, [...(groups.get(key) ?? []), member]);
    }
    for (const [type, list] of groups) {
      const size = capacity[type] ?? 2;
      for (let index = 0; index < list.length; index += size) {
        const room = nextRoom(type);
        for (const member of list.slice(index, index + size)) {
          assignments.set(member.id, { room, roomType: type });
        }
      }
    }

    await prisma.$transaction(
      [...assignments.entries()].map(([id, value]) =>
        prisma.groupMember.update({
          where: { id },
          data: { roomNumber: value.room, roomType: value.roomType },
        }),
      ),
    );

    return ok(res, {
      assigned: assignments.size,
      rooms: new Set([...assignments.values()].map((value) => value.room)).size,
    });
  }),
);

/** The rooming list a hotel asks for: rooms, guests in each, meal and bedding. */
router.get(
  "/:recordId/rooming",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(organizationId, req.params.recordId);
    const members = await prisma.groupMember.findMany({
      where: { organizationId, groupRecordId: group.id, status: { not: "Cancelled" } },
      orderBy: { name: "asc" },
    });

    const rooms = new Map<string, { roomNumber: string; roomType: string; guests: typeof members }>();
    for (const member of members) {
      const key = member.roomNumber || "unassigned";
      const room = rooms.get(key) ?? {
        roomNumber: member.roomNumber || "",
        roomType: member.roomType,
        guests: [],
      };
      room.guests.push(member);
      rooms.set(key, room);
    }

    return ok(res, {
      group: {
        id: group.id,
        reference: group.reference,
        name: group.name,
        destination: group.destination,
        date: group.date,
        status: group.status,
      },
      rooms: [...rooms.values()]
        .sort((a, b) => (a.roomNumber || "zzz").localeCompare(b.roomNumber || "zzz"))
        .map((room) => ({
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          guests: room.guests.map((g) => ({
            name: g.name,
            passport: g.passport,
            dietary: g.dietary,
            bedPreference: g.bedPreference,
            age: g.dateOfBirth,
          })),
        })),
      unassigned: members.filter((m) => !m.roomNumber).map((m) => m.name),
    });
  }),
);

/** The manifest the tour manager carries: every traveller, every detail. */
router.get(
  "/:recordId/manifest",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(organizationId, req.params.recordId);
    const members = await prisma.groupMember.findMany({
      where: { organizationId, groupRecordId: group.id },
      orderBy: [{ status: "asc" }, { roomNumber: "asc" }, { name: "asc" }],
    });
    return ok(res, {
      group: {
        reference: group.reference,
        name: group.name,
        destination: group.destination,
        date: group.date,
        status: group.status,
        notes: group.notes,
      },
      generatedAt: new Date().toISOString(),
      travellers: members.map((m) => ({
        name: m.name,
        passport: m.passport,
        nationality: m.nationality,
        dateOfBirth: m.dateOfBirth,
        phone: m.phone,
        room: m.roomNumber,
        roomType: m.roomType,
        status: m.status,
        dietary: m.dietary,
        emergencyContact: m.emergencyContact,
        notes: m.notes,
      })),
      counts: {
        total: members.length,
        confirmed: members.filter((m) => m.status === "Confirmed").length,
        withoutPassport: members.filter((m) => m.status !== "Cancelled" && !m.passport).length,
      },
    });
  }),
);

export default router;
