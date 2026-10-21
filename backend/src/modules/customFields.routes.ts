import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { ConflictError, NotFoundError } from "../lib/errors";
import { parseJson, slugify, stringifyJson } from "../lib/utils";
import { findModule } from "../domain/modules";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const fieldSchema = z.object({
  moduleId: z.string().min(2),
  label: z.string().min(1).max(60),
  key: z.string().min(1).max(60).optional(),
  type: z.enum(["text", "number", "date", "select", "boolean", "email", "phone"]).default("text"),
  options: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});

/** Custom field definitions for a module (settings → custom fields). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const moduleId = req.query.module as string | undefined;
    const fields = await prisma.customField.findMany({
      where: { organizationId: req.auth!.organizationId, ...(moduleId ? { moduleId } : {}) },
      orderBy: [{ moduleId: "asc" }, { position: "asc" }],
    });
    return ok(res, fields.map((f) => ({ ...f, options: parseJson<string[]>(f.options, []) })));
  }),
);

router.post(
  "/",
  requireRole("company_admin", "branch_manager"),
  validate(fieldSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof fieldSchema>;
    const organizationId = req.auth!.organizationId;

    if (!findModule(body.moduleId)) throw new NotFoundError("Module");
    const key = body.key ? slugify(body.key) : slugify(body.label);

    const clash = await prisma.customField.findUnique({
      where: { organizationId_moduleId_key: { organizationId, moduleId: body.moduleId, key } },
    });
    if (clash) throw new ConflictError("A custom field with this key already exists for the module");

    const field = await prisma.customField.create({
      data: {
        organizationId,
        moduleId: body.moduleId,
        key,
        label: body.label,
        type: body.type,
        options: stringifyJson(body.options),
        required: body.required,
        position: body.position,
      },
    });

    await recordAudit({
      organizationId,
      action: "Created",
      moduleId: "settings",
      label: `Custom field "${field.label}" added to ${body.moduleId}`,
      req,
    });

    return created(res, { ...field, options: parseJson<string[]>(field.options, []) });
  }),
);

router.patch(
  "/:id",
  requireRole("company_admin", "branch_manager"),
  validate(fieldSchema.partial().omit({ moduleId: true })),
  asyncHandler(async (req, res) => {
    const field = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!field) throw new NotFoundError("Custom field");

    const body = req.body as Partial<z.infer<typeof fieldSchema>>;
    const updated = await prisma.customField.update({
      where: { id: field.id },
      data: {
        label: body.label,
        type: body.type,
        required: body.required,
        position: body.position,
        options: body.options ? stringifyJson(body.options) : undefined,
      },
    });
    return ok(res, { ...updated, options: parseJson<string[]>(updated.options, []) });
  }),
);

router.delete(
  "/:id",
  requireRole("company_admin", "branch_manager"),
  asyncHandler(async (req, res) => {
    const field = await prisma.customField.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!field) throw new NotFoundError("Custom field");
    await prisma.customField.delete({ where: { id: field.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
