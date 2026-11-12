/**
 * Saved Views — filter + sort + column configurations per module.
 *
 * Without this, every person in a 15-person travel agency re-filters the same
 * "New leads from walk-in – this month – Delhi branch" view every morning.
 * A saved view is a URL-snapshot stored server-side, so it survives a refresh,
 * a device switch and a browser clear.
 *
 * Personal views (userId set) are only visible to their owner.
 * Shared views (isShared=true) are visible to everyone on the team.
 * Default views (isDefault=true, one per module per user) auto-load on open.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError, BadRequestError } from "../lib/errors";
import { cuid } from "../lib/utils";

const router = Router();
router.use(requireAuth);

const viewSchema = z.object({
  moduleId: z.string().min(1).max(60),
  title: z.string().min(1).max(100),
  filters: z.record(z.unknown()).optional(),
  sort: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).max(30).optional(),
  layout: z.enum(["table", "board", "cards"]).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

/** List all views for a module visible to this user (own + shared). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { moduleId } = req.query as { moduleId?: string };

    const views = await prisma.savedView.findMany({
      where: {
        organizationId,
        ...(moduleId ? { moduleId } : {}),
        OR: [{ userId }, { isShared: true }, { userId: null }],
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return ok(
      res,
      views.map((v) => ({
        id: v.id,
        moduleId: v.moduleId,
        title: v.title,
        filters: JSON.parse(v.filters || "{}"),
        sort: JSON.parse(v.sort || "{}"),
        columns: JSON.parse(v.columns || "[]"),
        layout: v.layout,
        isDefault: v.isDefault,
        isShared: v.isShared,
        isOwn: v.userId === userId,
        createdAt: v.createdAt.toISOString(),
      })),
    );
  }),
);

/** Creates a saved view for the current user. */
router.post(
  "/",
  validate(viewSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof viewSchema>;

    // If this is a new default, unset the old one for this module.
    if (body.isDefault) {
      await prisma.savedView.updateMany({
        where: { organizationId, userId, moduleId: body.moduleId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const view = await prisma.savedView.create({
      data: {
        id: cuid(),
        organizationId,
        userId,
        moduleId: body.moduleId,
        title: body.title.trim(),
        filters: JSON.stringify(body.filters ?? {}),
        sort: JSON.stringify(body.sort ?? {}),
        columns: JSON.stringify(body.columns ?? []),
        layout: body.layout ?? "table",
        isDefault: body.isDefault ?? false,
        isShared: body.isShared ?? false,
      },
    });

    return created(res, {
      id: view.id,
      moduleId: view.moduleId,
      title: view.title,
      filters: body.filters ?? {},
      sort: body.sort ?? {},
      columns: body.columns ?? [],
      layout: view.layout,
      isDefault: view.isDefault,
      isShared: view.isShared,
      isOwn: true,
      createdAt: view.createdAt.toISOString(),
    });
  }),
);

/** Updates a saved view (only the owner can edit their own). */
router.patch(
  "/:id",
  validate(viewSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof viewSchema>>;

    const existing = await prisma.savedView.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) throw new NotFoundError("Saved view");
    if (existing.userId !== userId) throw new BadRequestError("You can only edit your own views");

    if (body.isDefault && !existing.isDefault) {
      await prisma.savedView.updateMany({
        where: { organizationId, userId, moduleId: existing.moduleId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.savedView.update({
      where: { id: existing.id },
      data: {
        ...(body.title ? { title: body.title.trim() } : {}),
        ...(body.filters !== undefined ? { filters: JSON.stringify(body.filters) } : {}),
        ...(body.sort !== undefined ? { sort: JSON.stringify(body.sort) } : {}),
        ...(body.columns !== undefined ? { columns: JSON.stringify(body.columns) } : {}),
        ...(body.layout !== undefined ? { layout: body.layout } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.isShared !== undefined ? { isShared: body.isShared } : {}),
      },
    });

    return ok(res, { id: updated.id, updated: true });
  }),
);

/** Deletes a saved view (owner only). */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const existing = await prisma.savedView.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!existing) throw new NotFoundError("Saved view");
    if (existing.userId !== userId) throw new BadRequestError("You can only delete your own views");

    await prisma.savedView.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
