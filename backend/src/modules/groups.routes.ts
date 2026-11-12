import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
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

type RoomBlockRow = {
  id: string;
  allotmentId: string;
  hotelName: string;
  roomType: string;
  roomsHeld: number;
  notes: string;
  createdAt: Date;
};

const roomBlockDto = (
  block: RoomBlockRow,
  allotment?: {
    id: string;
    hotelName: string;
    city: string;
    roomType: string;
    mealPlan: string;
    contractFrom: string;
    contractTo: string;
    totalRooms: number;
    usedRooms: number;
    status: string;
  } | null,
) => ({
  id: block.id,
  allotmentId: block.allotmentId,
  hotelName: block.hotelName,
  roomType: block.roomType,
  roomsHeld: block.roomsHeld,
  notes: block.notes,
  linkedAt: block.createdAt.toISOString(),
  allotment: allotment
    ? {
        ...allotment,
        // What is actually still free, so the screen never has to subtract.
        availableRooms: Math.max(0, allotment.totalRooms - allotment.usedRooms),
      }
    : null,
});

/** Lists all room blocks (allotment links) for a group. */
router.get(
  "/:recordId/room-blocks",
  requireModulePermission("groups", "view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);

    const blocks = await prisma.groupRoomBlock.findMany({
      where: { organizationId, groupRecordId: group.id },
      orderBy: { createdAt: "asc" },
      include: {
        allotment: {
          select: {
            id: true,
            hotelName: true,
            city: true,
            roomType: true,
            mealPlan: true,
            contractFrom: true,
            contractTo: true,
            totalRooms: true,
            usedRooms: true,
            status: true,
          },
        },
      },
    });

    return ok(res, blocks.map((block) => roomBlockDto(block, block.allotment)));
  }),
);

/**
 * Links a hotel allotment (contract room block) to this group.
 *
 * The rooms are claimed with a conditional update inside the same transaction
 * that writes the block: two people holding the last room at the same moment
 * cannot both succeed, and if the block cannot be written the counter rolls
 * back with it.
 */
router.post(
  "/:recordId/room-blocks",
  requireModulePermission("groups", "edit"),
  validate(roomBlockSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);
    const body = req.body as z.infer<typeof roomBlockSchema>;

    const block = await prisma.$transaction(async (tx) => {
      const allotment = await tx.hotelAllotment.findFirst({
        where: { id: body.allotmentId, organizationId, deletedAt: null },
      });
      if (!allotment) throw new NotFoundError("Allotment");
      if (allotment.status !== "Open") {
        throw new BadRequestError(
          `This contract is ${allotment.status.toLowerCase()} — no rooms can be held against it.`,
        );
      }

      const available = allotment.totalRooms - allotment.usedRooms;
      if (body.roomsHeld > available) {
        throw new BadRequestError(
          `Only ${available} of ${allotment.totalRooms} rooms are free on this contract (${allotment.usedRooms} already held).`,
        );
      }

      const claimed = await tx.hotelAllotment.updateMany({
        where: {
          id: allotment.id,
          organizationId,
          status: "Open",
          // Re-checked against the row as it is now, not as it was read.
          usedRooms: { lte: allotment.totalRooms - body.roomsHeld },
        },
        data: { usedRooms: { increment: body.roomsHeld } },
      });
      if (claimed.count === 0) {
        throw new ConflictError(
          "Those rooms were taken by someone else just now. Refresh the contract and try again.",
        );
      }

      return tx.groupRoomBlock.create({
        data: {
          organizationId,
          groupRecordId: group.id,
          allotmentId: allotment.id,
          hotelName: allotment.hotelName,
          roomType: allotment.roomType,
          roomsHeld: body.roomsHeld,
          notes: body.notes,
          createdById: req.auth!.userId,
        },
      });
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "groups",
      recordId: group.id,
      label: `Room block: ${block.roomsHeld} ${block.roomType} at ${block.hotelName}`,
      req,
    });

    return created(res, roomBlockDto(block));
  }),
);

/** Removes a room block from a group (releases rooms back to the allotment). */
router.delete(
  "/:recordId/room-blocks/:blockId",
  requireModulePermission("groups", "edit"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const group = await assertGroup(req.auth!, req.params.recordId);

    const removed = await prisma.$transaction(async (tx) => {
      const block = await tx.groupRoomBlock.findFirst({
        where: {
          id: req.params.blockId,
          organizationId,
          groupRecordId: group.id,
        },
      });
      if (!block) throw new NotFoundError("Room block");

      // Only this row releases these rooms, so the counter cannot drift.
      await tx.hotelAllotment.updateMany({
        where: { id: block.allotmentId, organizationId },
        data: { usedRooms: { decrement: block.roomsHeld } },
      });
      await tx.groupRoomBlock.delete({ where: { id: block.id } });
      return block;
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "groups",
      recordId: group.id,
      label: `Room block released: ${removed.roomsHeld} ${removed.roomType} at ${removed.hotelName}`,
      req,
    });

    return ok(res, { removed: true });
  }),
);

export default router;
