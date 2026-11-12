import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

/**
 * Attendance (working hours).
 *
 * One row per teammate per local day. Check-in creates it, check-out closes it,
 * and a manager can correct the status with a note. Hours are derived on read —
 * storing a total would let it drift away from the two timestamps.
 */
const router = Router();
router.use(requireAuth);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MANAGER_ROLES = new Set(["company_admin", "branch_manager"]);

function todayIn(timezone: string): string {
  try {
    // en-CA gives YYYY-MM-DD directly.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function minutesBetween(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function statusFor(checkIn: Date | null, checkOut: Date | null, fallback: string): string {
  if (fallback !== "Present") return fallback;
  if (!checkIn) return "Absent";
  if (!checkOut) return "Present";
  return minutesBetween(checkIn, checkOut) < 240 ? "Half day" : "Present";
}

function dto(row: {
  id: string;
  userId: string;
  userName: string;
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  status: string;
  notes: string;
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    date: row.date,
    checkIn: row.checkIn?.toISOString() ?? null,
    checkOut: row.checkOut?.toISOString() ?? null,
    minutes: minutesBetween(row.checkIn, row.checkOut),
    status: statusFor(row.checkIn, row.checkOut, row.status),
    notes: row.notes,
  };
}

async function organizationTimezone(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return organization?.timezone || "Asia/Kolkata";
}

/** My attendance for a month (defaults to the current month). */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const month = String(req.query.month ?? "").trim();
    const prefix = DATE.test(`${month}-01`) ? month : todayIn(await organizationTimezone(req.auth!.organizationId)).slice(0, 7);
    const rows = await prisma.attendance.findMany({
      where: { organizationId: req.auth!.organizationId, userId: req.auth!.userId, date: { startsWith: prefix } },
      orderBy: { date: "asc" },
    });
    return ok(res, {
      month: prefix,
      days: rows.map(dto),
      totalMinutes: rows.reduce((sum, row) => sum + minutesBetween(row.checkIn, row.checkOut), 0),
    });
  }),
);

/** Check in for today. Calling it twice returns the existing row. */
router.post(
  "/check-in",
  validate(
    z.object({
      date: z.string().regex(DATE).optional(),
      notes: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as { date?: string; notes?: string };
    const date = body.date ?? todayIn(await organizationTimezone(organizationId));
    const existing = await prisma.attendance.findUnique({
      where: { organizationId_userId_date: { organizationId, userId: req.auth!.userId, date } },
    });
    if (existing?.checkIn) return ok(res, dto(existing));

    const row = existing
      ? await prisma.attendance.update({
          where: { id: existing.id },
          data: { checkIn: new Date(), notes: body.notes ?? existing.notes },
        })
      : await prisma.attendance.create({
          data: {
            organizationId,
            userId: req.auth!.userId,
            userName: req.auth!.name,
            date,
            checkIn: new Date(),
            status: "Present",
            notes: body.notes ?? "",
          },
        });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "attendance",
      label: `Checked in for ${date}`,
      req,
    });
    return ok(res, dto(row));
  }),
);

/** Check out. A day without a check-in cannot be checked out. */
router.post(
  "/check-out",
  validate(z.object({ date: z.string().regex(DATE).optional() })),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as { date?: string };
    const date = body.date ?? todayIn(await organizationTimezone(organizationId));
    const existing = await prisma.attendance.findUnique({
      where: { organizationId_userId_date: { organizationId, userId: req.auth!.userId, date } },
    });
    if (!existing?.checkIn) throw new BadRequestError("Check in first");
    if (existing.checkOut) return ok(res, dto(existing));

    const row = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOut: new Date() },
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "attendance",
      label: `Checked out for ${date} (${minutesBetween(row.checkIn, row.checkOut)} min)`,
      req,
    });
    return ok(res, dto(row));
  }),
);

/** Team attendance for one date. Managers and admins only. */
router.get(
  "/team",
  asyncHandler(async (req, res) => {
    if (!MANAGER_ROLES.has(req.auth!.roleKey)) {
      throw new ForbiddenError("Only a manager or admin can view the team attendance");
    }
    const organizationId = req.auth!.organizationId;
    const date = String(req.query.date ?? "").trim() || todayIn(await organizationTimezone(organizationId));
    if (!DATE.test(date)) throw new BadRequestError("date must be YYYY-MM-DD");

    const [rows, memberships] = await Promise.all([
      prisma.attendance.findMany({ where: { organizationId, date } }),
      prisma.membership.findMany({
        where: { organizationId, active: true },
        include: { user: { select: { id: true, name: true, active: true } } },
      }),
    ]);
    const byUser = new Map(rows.map((row) => [row.userId, row]));

    return ok(res, {
      date,
      people: memberships
        .filter((membership) => membership.user.active)
        .map((membership) => {
          const row = byUser.get(membership.userId);
          return row
            ? dto(row)
            : {
                id: null,
                userId: membership.userId,
                userName: membership.user.name,
                date,
                checkIn: null,
                checkOut: null,
                minutes: 0,
                status: "Not marked",
                notes: "",
              };
        }),
    });
  }),
);

/** Monthly totals per teammate. */
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    if (!MANAGER_ROLES.has(req.auth!.roleKey)) {
      throw new ForbiddenError("Only a manager or admin can view attendance summaries");
    }
    const organizationId = req.auth!.organizationId;
    const requested = String(req.query.month ?? "").trim();
    const month = DATE.test(`${requested}-01`)
      ? requested
      : todayIn(await organizationTimezone(organizationId)).slice(0, 7);
    const rows = await prisma.attendance.findMany({
      where: { organizationId, date: { startsWith: month } },
      orderBy: { date: "asc" },
    });

    const byUser = new Map<
      string,
      { userId: string; userName: string; present: number; halfDays: number; leave: number; minutes: number }
    >();
    for (const row of rows) {
      const entry =
        byUser.get(row.userId) ??
        { userId: row.userId, userName: row.userName, present: 0, halfDays: 0, leave: 0, minutes: 0 };
      const status = statusFor(row.checkIn, row.checkOut, row.status);
      if (status === "Present") entry.present += 1;
      if (status === "Half day") entry.halfDays += 1;
      if (["Leave", "Holiday", "Work from home"].includes(status)) entry.leave += 1;
      entry.minutes += minutesBetween(row.checkIn, row.checkOut);
      byUser.set(row.userId, entry);
    }

    return ok(res, {
      month,
      people: [...byUser.values()].sort((a, b) => a.userName.localeCompare(b.userName)),
    });
  }),
);

/** Correct a row (status/notes). Managers and admins only. */
router.patch(
  "/:id",
  validate(
    z.object({
      status: z.enum(["Present", "Half day", "Leave", "Holiday", "Work from home", "Absent"]).optional(),
      notes: z.string().max(300).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!MANAGER_ROLES.has(req.auth!.roleKey)) {
      throw new ForbiddenError("Only a manager or admin can correct attendance");
    }
    const body = req.body as { status?: string; notes?: string };
    const existing = await prisma.attendance.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Attendance row");

    const row = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "attendance",
      label: `Attendance corrected for ${row.userName} on ${row.date}`,
      req,
    });
    return ok(res, dto(row));
  }),
);

export default router;
