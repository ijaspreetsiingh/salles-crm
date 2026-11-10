import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { isBranchScoped, ROLE_MAP } from "../domain/rbac";
import { recordAudit } from "../services/audit";
import { parseJson } from "../lib/utils";
import { sendEmail } from "../services/email";
import { applyBranchScope } from "../services/records";
import { MODULES } from "../domain/modules";
import { env } from "../config/env";
import { num } from "../lib/money";

const router = Router();
router.use(requireAuth);

/**
 * Enforces the seat limit of the organisation's active plan. This is the one
 * piece of SaaS billing that has to happen server-side — a company on the
 * Starter plan cannot invite a sixth teammate.
 */
async function assertSeatsAvailable(organizationId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { organizationId } });
  if (!subscription) return; // grandfathered organisations without a subscription row
  const plan = await prisma.plan.findUnique({ where: { key: subscription.planKey } });
  if (!plan) return;
  const seatLimit = parseJson<Record<string, number>>(plan.limits, {}).seats;
  if (typeof seatLimit !== "number" || seatLimit < 1) return;
  const activeSeats = await prisma.membership.count({
    where: { organizationId, active: true },
  });
  // A deactivated teammate keeps occupying the record but not a seat; inviting
  // someone new must fit inside the limit.
  if (activeSeats >= seatLimit) {
    throw new ForbiddenError(
      `Your ${plan.name} plan includes ${seatLimit} team members. Invite fewer people or upgrade to a bigger plan.`,
    );
  }
}

const inviteSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().toLowerCase(),
  phone: z.string().max(30).optional(),
  roleKey: z.string().min(2),
  branchId: z.string().optional(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((v) => /[a-z]/.test(v), "Password must contain a lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Password must contain an uppercase letter")
    .refine((v) => /\d/.test(v), "Password must contain a digit")
    .optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(30).optional(),
  roleKey: z.string().min(2).optional(),
  branchId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  /**
   * Membership id of the teammate who takes this person's unfinished work.
   * Omit it and the records go back to the unclaimed queue.
   */
  reassignTo: z.string().min(1).optional(),
});

type Handover = { records: number; tasks: number; to: string | null };

/**
 * Moves a departing teammate's open work to someone who is still here.
 *
 * Revoking access on its own leaves two quiet failures behind: records owned
 * by a person who cannot sign in (invisible in the owner filter), and open
 * tasks addressed to them. Both are handled here, every time access is taken
 * away, so nothing is stranded.
 */
async function handoverWork(args: {
  organizationId: string;
  fromUserId: string;
  fromName: string;
  /** The person doing the removal — takes the tasks when no successor is named. */
  fallbackName: string;
  reassignTo?: string | undefined;
}): Promise<Handover> {
  let toUserId: string | null = null;
  let toName = args.fallbackName;

  if (args.reassignTo) {
    const target = await prisma.membership.findFirst({
      where: { id: args.reassignTo, organizationId: args.organizationId, active: true },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!target) throw new BadRequestError("Choose someone who is still on the team");
    if (target.userId === args.fromUserId) {
      throw new BadRequestError("Choose someone else to take this work");
    }
    toUserId = target.userId;
    toName = target.user.name;
  }

  // Records become the successor's, or unclaimed when nobody was named — the
  // unclaimed queue on everyone's home page is exactly where they belong.
  const [records, tasks] = await Promise.all([
    prisma.record.updateMany({
      where: {
        organizationId: args.organizationId,
        ownerId: args.fromUserId,
        deletedAt: null,
      },
      data: toUserId ? { ownerId: toUserId, ownerName: toName } : { ownerId: null, ownerName: "" },
    }),
    prisma.task.updateMany({
      where: { organizationId: args.organizationId, ownerName: args.fromName, done: false },
      data: { ownerName: toName },
    }),
  ]);

  return { records: records.count, tasks: tasks.count, to: toUserId ? toName : null };
}

/**
 * Team directory with role, branch and current workload.
 *
 * A company with five people can read a plain list. A company with fifty
 * needs to know who is carrying too much and who has nothing yet, so each
 * row carries honest counts read from the same records the modules show.
 * Branch-scoped roles only see their own branch, like every other list.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const branchId = isBranchScoped(req.auth!.roleKey) ? req.auth!.branchId : null;

    const memberships = await prisma.membership.findMany({
      where: {
        organizationId,
        // The vendor's platform staff are never part of a customer's team.
        ...(env.PLATFORM_ADMIN_EMAILS.length > 0
          ? { user: { email: { notIn: env.PLATFORM_ADMIN_EMAILS } } }
          : {}),
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
            lastLoginAt: true,
            avatarUrl: true,
          },
        },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const [taskCounts, enquiryCounts, tripCounts] = await Promise.all([
      prisma.task.groupBy({
        by: ["ownerName"],
        where: {
          organizationId,
          done: false,
          ...(branchId ? { ownerName: { in: memberships.map((m) => m.user.name) } } : {}),
        },
        _count: { _all: true },
      }),
      prisma.record.groupBy({
        by: ["ownerName"],
        where: applyBranchScope(
          {
            organizationId,
            moduleId: "leads",
            deletedAt: null,
            status: { in: ["New", "Contacted", "Qualified", "Quoted"] },
          },
          req.auth!,
        ),
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.record.groupBy({
        by: ["ownerName"],
        where: applyBranchScope(
          {
            organizationId,
            moduleId: "bookings",
            deletedAt: null,
            status: { notIn: ["Cancelled"] },
          },
          req.auth!,
        ),
        _count: { _all: true },
      }),
    ]);

    const taskBy = new Map(taskCounts.map((row) => [row.ownerName, row._count._all]));
    const enquiryBy = new Map(
      enquiryCounts.map((row) => [
        row.ownerName,
        { count: row._count._all, value: num(row._sum.amount) },
      ]),
    );
    const tripBy = new Map(tripCounts.map((row) => [row.ownerName, row._count._all]));

    const data = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      avatarUrl: m.user.avatarUrl,
      roleKey: m.roleKey,
      roleName: ROLE_MAP[m.roleKey]?.name ?? m.roleKey,
      branch: m.branch?.name ?? null,
      branchId: m.branchId,
      active: m.active && m.user.active,
      lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      openTasks: taskBy.get(m.user.name) ?? 0,
      openEnquiries: enquiryBy.get(m.user.name)?.count ?? 0,
      activeTrips: tripBy.get(m.user.name) ?? 0,
      pipelineValue: enquiryBy.get(m.user.name)?.value ?? 0,
    }));

    return ok(res, data);
  }),
);

/** Invites a teammate into the organisation. */
router.post(
  "/",
  requireRole("company_admin"),
  validate(inviteSchema),
  asyncHandler(async (req, res) => {
    const { name, email, phone, roleKey, branchId, password } = req.body as z.infer<
      typeof inviteSchema
    >;
    const organizationId = req.auth!.organizationId;

    await assertSeatsAvailable(organizationId);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: existing.id, organizationId } },
      });
      if (membership) throw new ConflictError("This person is already in your team");
    }

    // A new teammate needs a usable credential. Generate one and return it
    // once to the admin — the previous flow created a password nobody could
    // see, which locked every invited user out.
    const temporaryPassword = existing
      ? null
      : (password ?? `Welcome1@${Math.random().toString(36).slice(2, 8)}`);

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email,
          name,
          phone,
          passwordHash: await hashPassword(temporaryPassword!),
        },
      }));

    const membership = await prisma.membership.create({
      data: { userId: user.id, organizationId, roleKey, branchId: branchId ?? null },
    });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, supportEmail: true },
    });
    await sendEmail({
      organizationId,
      to: user.email,
      subject: `You have been added to ${organization.name} on Traveldesk`,
      body: [
        `Hi ${name},`,
        "",
        `${req.auth!.name} added you to the ${organization.name} travel workspace on Traveldesk.`,
        "",
        ...(existing
          ? ["Sign in with your existing Traveldesk password."]
          : ["Your workspace admin will share a temporary password with you. Change it after your first sign-in."]),
        "",
        `${process.env.APP_URL ?? "http://localhost:8080"}`,
        "",
        `${organization.name}`,
      ].join("\n"),
      template: "member_invite",
      userId: req.auth!.userId,
      relatedModule: "settings",
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "settings",
      label: `${name} invited as ${ROLE_MAP[roleKey]?.name ?? roleKey}`,
      req,
    });

    // `newUser` tells the admin whether the temporary password they set is
    // actually needed: an existing Traveldesk account keeps its own password.
    return created(res, {
      id: membership.id,
      userId: user.id,
      email: user.email,
      roleKey,
      branchId: branchId ?? null,
      newUser: !existing,
      // Shown once to the admin so the invitation can actually be completed.
      temporaryPassword,
    });
  }),
);

/** Updates a teammate's role, branch or active state. */
router.patch(
  "/:id",
  requireRole("company_admin"),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!membership) throw new NotFoundError("Team member");

    const body = req.body as z.infer<typeof updateSchema>;

    if (body.name || body.phone) {
      await prisma.user.update({
        where: { id: membership.userId },
        data: { name: body.name, phone: body.phone },
      });
    }

    if (body.active !== undefined) {
      if (body.active === false) {
        // A person can belong to several organisations. Removing them here
        // must not lock them out of the others.
        const otherActive = await prisma.membership.count({
          where: { userId: membership.userId, active: true, id: { not: membership.id } },
        });
        if (otherActive === 0) {
          await prisma.user.update({
            where: { id: membership.userId },
            data: { active: false, tokenVersion: { increment: 1 } },
          });
        } else {
          // Still a member elsewhere, but this organisation's access tokens
          // must stop working here — bumping the version is the only lever.
          await prisma.user.update({
            where: { id: membership.userId },
            data: { tokenVersion: { increment: 1 } },
          });
        }
      } else {
        await prisma.user.update({ where: { id: membership.userId }, data: { active: true } });
      }
    }

    /*
     * A role change is a permission change, and permissions are baked into the
     * session at sign-in. Bumping the version forces the person to sign in
     * again so a demoted admin cannot keep their old powers for 15 minutes.
     */
    if (body.roleKey && body.roleKey !== membership.roleKey) {
      await prisma.user.update({
        where: { id: membership.userId },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        roleKey: body.roleKey,
        branchId: body.branchId === undefined ? undefined : body.branchId,
        active: body.active,
      },
    });

    // Losing access means their unfinished work needs a home, right now.
    const handover =
      body.active === false && membership.active
        ? await handoverWork({
            organizationId: req.auth!.organizationId,
            fromUserId: membership.userId,
            fromName: membership.user.name,
            fallbackName: req.auth!.name,
            ...(body.reassignTo ? { reassignTo: body.reassignTo } : {}),
          })
        : null;

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: handover
        ? `${membership.user.name} lost access — ${handover.records} records and ${handover.tasks} tasks handed to ${handover.to ?? "the unclaimed queue"}`
        : "Team member updated",
      meta: { membershipId: membership.id, changes: Object.keys(body) },
      req,
    });

    return ok(res, { ...updated, handover });
  }),
);

/** Removes a teammate from the organisation, handing their work on. */
router.delete(
  "/:id",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!membership) throw new NotFoundError("Team member");
    if (membership.userId === req.auth!.userId) {
      throw new ConflictError("You cannot remove your own access");
    }

    await prisma.membership.update({ where: { id: membership.id }, data: { active: false } });
    await prisma.refreshToken.updateMany({
      where: { userId: membership.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Access tokens already issued must stop working too.
    await prisma.user.update({
      where: { id: membership.userId },
      data: { tokenVersion: { increment: 1 } },
    });

    // `reassignTo` may arrive in the body or the query string; both are fine.
    const requested: unknown = req.body?.reassignTo ?? req.query.reassignTo;
    const reassignTo =
      typeof requested === "string" && requested.length > 0 ? requested : undefined;

    const handover = await handoverWork({
      organizationId: req.auth!.organizationId,
      fromUserId: membership.userId,
      fromName: membership.user.name,
      fallbackName: req.auth!.name,
      ...(reassignTo ? { reassignTo } : {}),
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `${membership.user.name}'s access revoked — ${handover.records} records and ${handover.tasks} tasks handed to ${handover.to ?? "the unclaimed queue"}`,
      req,
    });

    return ok(res, { removed: true, handover });
  }),
);

const shareSchema = z.object({
  moduleId: z.string().min(2).default("leads"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * Shares unclaimed work out to the team, oldest first.
 *
 * The alternative is a manager dragging records to names one at a time, which
 * nobody does past the third. Whoever is carrying the least gets the next
 * record, so the queue empties evenly and nobody is handed a pile in one go.
 * Only records nobody owns are touched — an assignment made by a person is
 * never overwritten.
 */
router.post(
  "/workload/share",
  requireRole("company_admin", "branch_manager"),
  validate(shareSchema),
  asyncHandler(async (req, res) => {
    const { moduleId, limit } = req.body as z.infer<typeof shareSchema>;
    const module = MODULES.find((m) => m.id === moduleId);
    if (!module) throw new BadRequestError(`Unknown module "${moduleId}"`);
    const organizationId = req.auth!.organizationId;

    const unclaimed = await prisma.record.findMany({
      where: applyBranchScope(
        {
          organizationId,
          moduleId: module.id,
          deletedAt: null,
          OR: [{ ownerId: null }, { ownerName: "" }],
        },
        req.auth!,
      ),
      // The longest wait is the most urgent.
      orderBy: { date: "asc" },
      take: limit,
    });
    if (unclaimed.length === 0) return ok(res, { assigned: 0, byPerson: [] });

    const branchId = isBranchScoped(req.auth!.roleKey) ? req.auth!.branchId : null;
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId,
        active: true,
        user: { active: true },
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
    });
    const people = memberships.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      branchId: m.branchId,
      load: 0,
    }));
    if (people.length === 0) {
      throw new BadRequestError("There is nobody active on the team to take this work");
    }

    // Current load: open tasks plus records already owned. Two grouped queries,
    // not one per person.
    const [taskCounts, recordCounts] = await Promise.all([
      prisma.task.groupBy({
        by: ["ownerName"],
        where: { organizationId, done: false },
        _count: { _all: true },
      }),
      prisma.record.groupBy({
        by: ["ownerName"],
        where: applyBranchScope(
          { organizationId, deletedAt: null, ownerName: { not: "" } },
          req.auth!,
        ),
        _count: { _all: true },
      }),
    ]);
    const taskBy = new Map(taskCounts.map((row) => [row.ownerName, row._count._all]));
    const recordBy = new Map(recordCounts.map((row) => [row.ownerName, row._count._all]));
    for (const person of people) {
      person.load = (taskBy.get(person.name) ?? 0) + (recordBy.get(person.name) ?? 0);
    }

    const assigned = new Map<string, { userId: string; name: string; ids: string[] }>();
    for (const record of unclaimed) {
      // Prefer people in the record's own branch; fall back to the whole team
      // when that branch has nobody active.
      const inBranch = record.branchId
        ? people.filter((person) => person.branchId === record.branchId)
        : [];
      const candidates = inBranch.length > 0 ? inBranch : people;
      let chosen = candidates[0]!;
      for (const person of candidates) if (person.load < chosen.load) chosen = person;
      chosen.load += 1;
      const bucket = assigned.get(chosen.userId) ?? {
        userId: chosen.userId,
        name: chosen.name,
        ids: [] as string[],
      };
      bucket.ids.push(record.id);
      assigned.set(chosen.userId, bucket);
    }

    const byPerson: Array<{ name: string; count: number }> = [];
    for (const bucket of assigned.values()) {
      await prisma.record.updateMany({
        where: { id: { in: bucket.ids } },
        data: { ownerId: bucket.userId, ownerName: bucket.name, updatedById: req.auth!.userId },
      });
      byPerson.push({ name: bucket.name, count: bucket.ids.length });
    }

    await recordAudit({
      organizationId,
      action: "Assigned",
      moduleId: module.id,
      label: `${unclaimed.length} unclaimed ${module.noun}s shared across the team`,
      meta: { byPerson },
      req,
    });

    return ok(res, { assigned: unclaimed.length, byPerson });
  }),
);

export default router;
