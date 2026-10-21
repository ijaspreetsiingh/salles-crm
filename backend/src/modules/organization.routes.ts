import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { MODULES, moduleGroups } from "../domain/modules";

const router = Router();
router.use(requireAuth);

const orgUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  legalName: z.string().max(160).optional(),
  gstin: z.string().max(30).optional(),
  supportEmail: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(400).optional(),
  currency: z.string().max(6).optional(),
  financialYear: z.string().max(40).optional(),
  timezone: z.string().max(60).optional(),
  settings: z.record(z.unknown()).optional(),
});

const branchSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().max(12).optional(),
  address: z.string().max(300).optional(),
  active: z.boolean().optional(),
});

/** Current organisation profile (settings → organisation tab). */
router.get(
  "/current",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });
    return ok(res, { ...organization, settings: parseJson(organization.settings, {}) });
  }),
);

/** Update organisation / tax / currency / security settings. */
router.patch(
  "/current",
  requireRole("company_admin"),
  validate(orgUpdateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof orgUpdateSchema>;
    const organization = await prisma.organization.update({
      where: { id: req.auth!.organizationId },
      data: {
        ...body,
        settings: body.settings ? stringifyJson(body.settings) : undefined,
      },
    });

    await recordAudit({
      organizationId: organization.id,
      action: "Updated",
      moduleId: "settings",
      label: "Organisation settings updated",
      meta: { fields: Object.keys(body) },
      req,
    });

    return ok(res, { ...organization, settings: parseJson(organization.settings, {}) });
  }),
);

/** Module catalogue + navigation groups used by the workspace shell. */
router.get(
  "/current/modules",
  asyncHandler(async (_req, res) => {
    return ok(res, { modules: MODULES, groups: moduleGroups() });
  }),
);

/** Branch directory. */
router.get(
  "/current/branches",
  asyncHandler(async (req, res) => {
    const branches = await prisma.branch.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true } } },
    });
    const data = branches.map((b) => ({ ...b, members: b._count.memberships }));
    return ok(res, data);
  }),
);

router.post(
  "/current/branches",
  requireRole("company_admin"),
  validate(branchSchema),
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.create({
      data: { organizationId: req.auth!.organizationId, ...(req.body as z.infer<typeof branchSchema>) },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "settings",
      label: `Branch "${branch.name}" created`,
      req,
    });
    return created(res, branch);
  }),
);

router.patch(
  "/current/branches/:id",
  requireRole("company_admin"),
  validate(branchSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Branch");

    const branch = await prisma.branch.update({
      where: { id: existing.id },
      data: req.body,
    });
    return ok(res, branch);
  }),
);

router.delete(
  "/current/branches/:id",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.branch.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Branch");

    // Soft-deactivate to preserve historical record ownership.
    await prisma.branch.update({ where: { id: existing.id }, data: { active: false } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `Branch "${existing.name}" deactivated`,
      req,
    });
    return ok(res, { deactivated: true });
  }),
);

export default router;
