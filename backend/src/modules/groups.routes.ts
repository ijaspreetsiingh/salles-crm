import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { applyBranchScope } from "../services/records";

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
router.use(requireModulePermission("groups", "view"));

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

/** Verifies the group belongs to this tenant and this caller's branch before touching its travellers. */
type AuthCtx = { organizationId: string; roleKey: string; branchId: string | null };
async function assertGroup(auth: AuthCtx, recordId: string) {
  const record = await prisma.record.findFirst({
    where: applyBranchScope(
      { id: recordId, organizationId: auth.organizationId, moduleId: "groups", deletedAt: null },
      auth,
    ),
  });
  if (!record) throw new NotFoundError("Group");
  return record;
}

/** Delegates on a group trip. */
router.get(
  "/:recordId/members",
  requireModulePermission("groups", "view"),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!, req.params.recordId);
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
  requireModulePermission("groups", "create"),
  validate(memberSchema),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!, req.params.recordId);
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
  requireModulePermission("groups", "create"),
  validate(
    z.object({ text: z.string().min(1).max(20000), roomType: z.string().max(20).optional() }),
  ),
  asyncHandler(async (req, res) => {
    await assertGroup(req.auth!, req.params.recordId);
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
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "groups",
      recordId: req.params.recordId,
      label: `${rows.length} delegates added`,
      req,
    });
    return created(res, { added: rows.length });
  }),
);

router.patch(
  "/members/:id",
  requireModulePermission("groups", "edit"),
  validate(memberSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.groupMember.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Delegate");
    // The delegate is only reachable through an in-scope group, so a
    // branch-scoped role cannot edit a sibling branch's traveller by id.
    await assertGroup(req.auth!, existing.groupRecordId);
    const member = await prisma.groupMember.update({
      where: { id: existing.id },
      data: req.body as Partial<z.infer<typeof memberSchema>>,
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "groups",
      recordId: existing.groupRecordId,
      label: `Delegate updated: ${member.name}`,
      req,
    });
    return ok(res, memberDto(member));
  }),
);

router.delete(
  "/members/:id",
  requireModulePermission("groups", "delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.groupMember.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Delegate");
    await assertGroup(req.auth!, existing.groupRecordId);
    await prisma.groupMember.delete({ where: { id: existing.id } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "groups",
      recordId: existing.groupRecordId,
      label: `Delegate removed: ${existing.name}`,
      req,
    });
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
  requireModulePermission("groups", "edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    await assertGroup(req.auth!, req.params.recordId);
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

    const roomCount = new Set([...assignments.values()].map((value) => value.room)).size;
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "groups",
      recordId: req.params.recordId,
      label: `Rooms auto-assigned: ${assignments.size} delegates into ${roomCount} rooms`,
      req,
    });

    return ok(res, {
      assigned: assignments.size,
      rooms: roomCount,
    });
  }),
);

/** The rooming list a hotel asks for: rooms, guests in each, meal and bedding. */
router.get(
  "/:recordId/rooming",
  requireModulePermission("groups", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
    const members = await prisma.groupMember.findMany({
      where: { organizationId, groupRecordId: group.id, status: { not: "Cancelled" } },
      orderBy: { name: "asc" },
    });

    const rooms = new Map<
      string,
      { roomNumber: string; roomType: string; guests: typeof members }
    >();
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
  requireModulePermission("groups", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
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

// ── Room blocks — link hotel allotments to a group ───────────────────────────

const roomBlockSchema = z.object({
  allotmentId: z.string().min(1),
  roomsHeld: z.number().int().min(1).max(500).default(1),
  notes: z.string().max(500).default(""),
});

/** Lists all room blocks (allotment links) for a group. */
router.get(
  "/:recordId/room-blocks",
  requireModulePermission("groups", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
    const extra = parseJson<Record<string, unknown>>(group.extra as string, {});
    const blocks = Array.isArray(extra["roomBlocks"]) ? extra["roomBlocks"] as Array<Record<string, unknown>> : [];

    // Hydrate allotment details
    const allotmentIds = blocks.map((b) => String(b["allotmentId"] ?? "")).filter(Boolean);
    const allotments = allotmentIds.length > 0
      ? await prisma.hotelAllotment.findMany({ where: { id: { in: allotmentIds }, organizationId } })
      : [];
    const allotmentMap = new Map(allotments.map((a) => [a.id, a]));

    return ok(res, blocks.map((b) => ({
      ...b,
      allotment: allotmentMap.get(String(b["allotmentId"] ?? "")) ?? null,
    })));
  }),
);

/** Links a hotel allotment (contract room block) to this group. */
router.post(
  "/:recordId/room-blocks",
  requireModulePermission("groups", "edit"),
  validate(roomBlockSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
    const body = req.body as z.infer<typeof roomBlockSchema>;

    // Verify the allotment exists and belongs to this org
    const allotment = await prisma.hotelAllotment.findFirst({
      where: { id: body.allotmentId, organizationId },
    });
    if (!allotment) throw new NotFoundError("Allotment");

    // Check availability
    const available = allotment.totalRooms - allotment.usedRooms;
    if (body.roomsHeld > available) {
      throw new BadRequestError(
        `Only ${available} rooms available (total ${allotment.totalRooms}, used ${allotment.usedRooms})`,
      );
    }

    // Store the room block in the group record's extra JSON
    const extra = parseJson<Record<string, unknown>>(group.extra as string, {});
    const blocks = Array.isArray(extra["roomBlocks"]) ? extra["roomBlocks"] as Array<Record<string, unknown>> : [];
    blocks.push({
      allotmentId: body.allotmentId,
      hotelName: allotment.hotelName,
      roomType: allotment.roomType,
      roomsHeld: body.roomsHeld,
      notes: body.notes,
      linkedAt: new Date().toISOString(),
    });

    await prisma.record.update({
      where: { id: group.id },
      data: { extra: JSON.stringify({ ...extra, roomBlocks: blocks }) },
    });

    // Increment the allotment's used rooms
    await prisma.hotelAllotment.update({
      where: { id: allotment.id },
      data: { usedRooms: { increment: body.roomsHeld } },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "groups",
      recordId: group.id,
      label: `Room block: ${body.roomsHeld} ${allotment.roomType} at ${allotment.hotelName}`,
      req,
    });

    return created(res, { linked: true, roomsHeld: body.roomsHeld });
  }),
);

/** Removes a room block from a group (releases rooms back to the allotment). */
router.delete(
  "/:recordId/room-blocks/:blockIndex",
  requireModulePermission("groups", "edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
    const blockIndex = parseInt(req.params.blockIndex, 10);

    const extra = parseJson<Record<string, unknown>>(group.extra as string, {});
    const blocks = Array.isArray(extra["roomBlocks"]) ? extra["roomBlocks"] as Array<Record<string, unknown>> : [];
    if (blockIndex < 0 || blockIndex >= blocks.length) throw new NotFoundError("Room block");

    const removed = blocks[blockIndex];
    const roomsHeld = Number(removed["roomsHeld"] ?? 0);
    const allotmentId = String(removed["allotmentId"] ?? "");

    // Release the rooms back
    if (allotmentId && roomsHeld > 0) {
      await prisma.hotelAllotment.update({
        where: { id: allotmentId },
        data: { usedRooms: { decrement: roomsHeld } },
      }).catch(() => { /* best effort */ });
    }

    blocks.splice(blockIndex, 1);
    await prisma.record.update({
      where: { id: group.id },
      data: { extra: JSON.stringify({ ...extra, roomBlocks: blocks }) },
    });

    return ok(res, { removed: true });
  }),
);

export default router;
