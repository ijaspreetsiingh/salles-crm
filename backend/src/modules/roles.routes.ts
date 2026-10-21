import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { ConflictError, NotFoundError } from "../lib/errors";
import { parseJson, slugify, stringifyJson } from "../lib/utils";
import { ACTIONS, normalizePermissions, ROLE_DEFS } from "../domain/rbac";
import { MODULES } from "../domain/modules";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const permissionSchema = z.object({
  modules: z.union([z.literal("*"), z.array(z.string())]),
  actions: z.union([z.literal("*"), z.array(z.enum(ACTIONS))]),
});

const createSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(200).optional(),
  permissions: permissionSchema,
});

const updateSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(200).optional(),
  permissions: permissionSchema.optional(),
});

function toDto(role: { id: string; key: string; name: string; description: string | null; permissions: string; isSystem: boolean }, members = 0) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description ?? "",
    permissions: normalizePermissions(parseJson(role.permissions, {})),
    isSystem: role.isSystem,
    members,
  };
}

/** Roles & permissions (settings → roles tab). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const [roles, counts] = await Promise.all([
      prisma.role.findMany({ where: { organizationId }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] }),
      prisma.membership.groupBy({ by: ["roleKey"], where: { organizationId }, _count: { _all: true } }),
    ]);
    const countMap = new Map(counts.map((c) => [c.roleKey, c._count._all]));
    return ok(res, roles.map((role) => toDto(role, countMap.get(role.key) ?? 0)));
  }),
);

/** Everything the permission matrix UI needs in one call. */
router.get(
  "/matrix",
  asyncHandler(async (req, res) => {
    const roles = await prisma.role.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return ok(res, {
      actions: ACTIONS,
      modules: MODULES.map((m) => ({ id: m.id, name: m.name, group: m.group })),
      roles: roles.map((role) => toDto(role)),
      templates: ROLE_DEFS.map((r) => ({ key: r.key, name: r.name, permissions: r.permissions })),
    });
  }),
);

router.post(
  "/",
  requireRole("company_admin"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const organizationId = req.auth!.organizationId;
    const key = slugify(body.name) || "role";

    const clash = await prisma.role.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (clash) throw new ConflictError("A role with a similar name already exists");

    const role = await prisma.role.create({
      data: {
        organizationId,
        key,
        name: body.name,
        description: body.description,
        permissions: stringifyJson(body.permissions),
        isSystem: false,
      },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "settings",
      label: `Role "${role.name}" created`,
      req,
    });

    return created(res, toDto(role));
  }),
);

router.patch(
  "/:id",
  requireRole("company_admin"),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!role) throw new NotFoundError("Role");

    const updated = await prisma.role.update({
      where: { id: role.id },
      data: {
        name: body.name,
        description: body.description,
        permissions: body.permissions ? stringifyJson(body.permissions) : undefined,
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `Role "${updated.name}" updated`,
      req,
    });

    return ok(res, toDto(updated));
  }),
);

router.delete(
  "/:id",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!role) throw new NotFoundError("Role");
    if (role.isSystem) throw new ConflictError("Built-in roles cannot be deleted");

    await prisma.role.delete({ where: { id: role.id } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `Role "${role.name}" deleted`,
      req,
    });

    return ok(res, { deleted: true });
  }),
);

export default router;
