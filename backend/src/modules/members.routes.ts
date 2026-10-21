import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { ConflictError, NotFoundError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { ROLE_MAP } from "../domain/rbac";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const inviteSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().toLowerCase(),
  phone: z.string().max(30).optional(),
  roleKey: z.string().min(2),
  branchId: z.string().optional(),
  password: z.string().min(8).max(128).optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(30).optional(),
  roleKey: z.string().min(2).optional(),
  branchId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

/** Team directory with role and branch (settings → employees). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, active: true, lastLoginAt: true, avatarUrl: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

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
      lastLoginAt: m.user.lastLoginAt,
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
    const { name, email, phone, roleKey, branchId, password } = req.body as z.infer<typeof inviteSchema>;
    const organizationId = req.auth!.organizationId;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: existing.id, organizationId } },
      });
      if (membership) throw new ConflictError("This person is already in your team");
    }

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email,
          name,
          phone,
          // Temporary password — the invitee is expected to reset it.
          passwordHash: await hashPassword(password ?? `Welcome@${Math.random().toString(36).slice(2, 8)}`),
        },
      }));

    const membership = await prisma.membership.create({
      data: { userId: user.id, organizationId, roleKey, branchId: branchId ?? null },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "settings",
      label: `${name} invited as ${ROLE_MAP[roleKey]?.name ?? roleKey}`,
      req,
    });

    return created(res, { id: membership.id, userId: user.id, email: user.email, roleKey, branchId: branchId ?? null });
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
      await prisma.user.update({ where: { id: membership.userId }, data: { active: body.active } });
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        roleKey: body.roleKey,
        branchId: body.branchId === undefined ? undefined : body.branchId,
        active: body.active,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Team member updated",
      meta: { membershipId: membership.id, changes: Object.keys(body) },
      req,
    });

    return ok(res, updated);
  }),
);

/** Removes a teammate from the organisation. */
router.delete(
  "/:id",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const membership = await prisma.membership.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
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

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: "Team member access revoked",
      req,
    });

    return ok(res, { removed: true });
  }),
);

export default router;
