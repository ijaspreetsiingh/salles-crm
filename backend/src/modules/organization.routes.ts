import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission, requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, stringifyJson } from "../lib/utils";
import { publicOrganizationSettings } from "../lib/redact";
import { recordAudit } from "../services/audit";
import { readDigestSettings, sendDigestTo, writeDigestSettings } from "../services/digest";
import { readSodRules } from "../services/sod";
import { readPurgeSettings } from "../services/trash-purge";
import { MODULES, moduleGroups } from "../domain/modules";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("settings", "view"));

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
    return ok(res, {
      ...organization,
      // Credentials never travel on the profile endpoint. Use /channels for
      // masked status and the company_admin-only write endpoints to change them.
      settings: publicOrganizationSettings(parseJson<Record<string, unknown>>(organization.settings, {})),
    });
  }),
);

/** Update organisation / tax / currency / security settings. */
router.patch(
  "/current",
  requireRole("company_admin"),
  validate(orgUpdateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof orgUpdateSchema>;

    /*
     * Settings are merged, not replaced: saving the tax rate must not wipe the
     * digest schedule or the channel credentials that live beside it. The
     * `channels` key is stripped because those secrets have their own
     * endpoints (and their own audit trail).
     */
    let mergedSettings: string | undefined;
    if (body.settings) {
      const current = await prisma.organization.findUniqueOrThrow({
        where: { id: req.auth!.organizationId },
        select: { settings: true },
      });
      const existing = parseJson<Record<string, unknown>>(current.settings, {});
      const { channels: _ignored, ...safePatch } = body.settings as Record<string, unknown>;
      mergedSettings = stringifyJson({ ...existing, ...safePatch });
    }

    const organization = await prisma.organization.update({
      where: { id: req.auth!.organizationId },
      data: {
        ...body,
        settings: mergedSettings,
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

    return ok(res, {
      ...organization,
      settings: publicOrganizationSettings(parseJson<Record<string, unknown>>(organization.settings, {})),
    });
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
      data: {
        organizationId: req.auth!.organizationId,
        ...(req.body as z.infer<typeof branchSchema>),
      },
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

/* ------------------------------------------------------------------ *
 * The daily email digest
 * ------------------------------------------------------------------ */

const digestSchema = z.object({
  enabled: z.boolean().optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
  scope: z.enum(["mine", "team"]).optional(),
  recipients: z.array(z.string().email()).max(20).optional(),
});

/** The digest settings, plus when it last went out. */
router.get(
  "/current/digest",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
      select: { name: true, settings: true, timezone: true },
    });
    return ok(res, {
      settings: readDigestSettings(organization.settings),
      timezone: organization.timezone,
    });
  }),
);

router.patch(
  "/current/digest",
  requireRole("company_admin"),
  validate(digestSchema),
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const settings = await writeDigestSettings(
      req.auth!.organizationId,
      organization.settings,
      req.body as z.infer<typeof digestSchema>,
    );
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: settings.enabled
        ? `Daily email digest on at ${String(settings.hour).padStart(2, "0")}:00`
        : "Daily email digest off",
      req,
    });
    return ok(res, { settings });
  }),
);

/**
 * Sends today's digest to the caller immediately.
 *
 * Waiting until 8am to find out whether email works is not a test. This uses
 * the real delivery path and reports what actually happened — "sent" or
 * "queued" because no SMTP account is connected yet.
 */
router.post(
  "/current/digest/send",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
      select: { id: true, name: true, settings: true },
    });
    const settings = readDigestSettings(organization.settings);

    const result = await sendDigestTo({
      organizationId: organization.id,
      organizationName: organization.name,
      recipient: {
        name: req.auth!.name,
        email: req.auth!.email,
        roleKey: req.auth!.roleKey,
        branchId: req.auth!.branchId,
      },
      scope: settings.scope,
    });

    return ok(res, { ...result, to: req.auth!.email });
  }),
);

/**
 * Segregation of duties rules — which actions on which modules require a
 * different person than the one who created the record.
 *
 * GET returns the current rules; PATCH lets a company admin set them.
 * Stored in the organization's settings JSON under `sodRules`.
 */
const sodRuleSchema = z.object({
  moduleId: z.string().min(1),
  actions: z.array(z.enum(["approve", "delete", "export"])).min(1),
  overrideRoles: z.array(z.string()).optional(),
});

router.get(
  "/current/sod-rules",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const rules = readSodRules(organization?.settings ?? null);
    return ok(res, { rules });
  }),
);

router.patch(
  "/current/sod-rules",
  requireRole("company_admin"),
  validate(z.object({ rules: z.array(sodRuleSchema) })),
  asyncHandler(async (req, res) => {
    const body = req.body as { rules: { moduleId: string; actions: string[]; overrideRoles?: string[] }[] };
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const settings = parseJson<Record<string, unknown>>(organization.settings, {});
    settings.sodRules = body.rules;
    await prisma.organization.update({
      where: { id: req.auth!.organizationId },
      data: { settings: stringifyJson(settings) },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `Segregation of duties rules updated (${body.rules.length} rules)`,
      req,
    });
    return ok(res, { rules: body.rules });
  }),
);

/**
 * Recycle-bin auto-purge settings — how many days a soft-deleted record stays
 * in the bin before being permanently removed. 0 means never.
 */
const purgeSettingsSchema = z.object({
  purgeAfterDays: z.coerce.number().int().min(0).max(36500),
});

router.get(
  "/current/purge-settings",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const settings = readPurgeSettings(organization?.settings ?? null);
    return ok(res, settings);
  }),
);

router.patch(
  "/current/purge-settings",
  requireRole("company_admin"),
  validate(purgeSettingsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { purgeAfterDays: number };
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
      select: { settings: true },
    });
    const settings = parseJson<Record<string, unknown>>(organization.settings, {});
    settings.purgeAfterDays = body.purgeAfterDays;
    await prisma.organization.update({
      where: { id: req.auth!.organizationId },
      data: { settings: stringifyJson(settings) },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `Recycle-bin auto-purge set to ${body.purgeAfterDays} days`,
      req,
    });
    return ok(res, { purgeAfterDays: body.purgeAfterDays });
  }),
);

export default router;
