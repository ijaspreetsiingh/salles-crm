/**
 * Favorites — star any record or module for quick access.
 *
 * A travel consultant who opens the same 5 high-value bookings every morning
 * should not hunt through a 300-row list to find them. Starring a record pins
 * it to the sidebar — per user, server-side, so it survives clearing the
 * browser, switching to a phone, or logging in from an airport lounge.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { cuid } from "../lib/utils";

const router = Router();
router.use(requireAuth);

const addSchema = z.object({
  targetType: z.enum(["record", "module"]),
  targetId: z.string().min(1).max(100),
});

/** All favorites for the current user. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const favorites = await prisma.favorite.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "asc" },
    });

    // Hydrate record favorites with the record's current name and module.
    const recordIds = favorites
      .filter((f) => f.targetType === "record")
      .map((f) => f.targetId);

    const records =
      recordIds.length > 0
        ? await prisma.record.findMany({
            where: { id: { in: recordIds }, organizationId, deletedAt: null },
            select: { id: true, reference: true, name: true, moduleId: true, status: true },
          })
        : [];
    const recordMap = new Map(records.map((r) => [r.id, r]));

    return ok(
      res,
      favorites
        .map((f) => ({
          id: f.id,
          targetType: f.targetType,
          targetId: f.targetId,
          record: f.targetType === "record" ? (recordMap.get(f.targetId) ?? null) : null,
          createdAt: f.createdAt.toISOString(),
        }))
        // Drop favorites whose records were deleted (soft-deleted or hard).
        .filter((f) => f.targetType !== "record" || f.record !== null),
    );
  }),
);

/** Checks whether a specific target is currently starred by this user. */
router.get(
  "/check",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { targetType, targetId } = req.query as { targetType?: string; targetId?: string };

    if (!targetType || !targetId) {
      return ok(res, { starred: false });
    }

    const fav = await prisma.favorite.findFirst({
      where: { organizationId, userId, targetType, targetId },
      select: { id: true },
    });

    return ok(res, { starred: Boolean(fav), id: fav?.id ?? null });
  }),
);

/** Stars a record or module. Idempotent — starring twice returns the existing row. */
router.post(
  "/",
  validate(addSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { targetType, targetId } = req.body as z.infer<typeof addSchema>;

    // Upsert so double-tapping the star button doesn't create two rows.
    const existing = await prisma.favorite.findFirst({
      where: { organizationId, userId, targetType, targetId },
    });

    if (existing) {
      return ok(res, {
        id: existing.id,
        targetType,
        targetId,
        created: false,
        createdAt: existing.createdAt.toISOString(),
      });
    }

    const fav = await prisma.favorite.create({
      data: { id: cuid(), organizationId, userId, targetType, targetId },
    });

    return created(res, {
      id: fav.id,
      targetType,
      targetId,
      created: true,
      createdAt: fav.createdAt.toISOString(),
    });
  }),
);

/** Removes a favorite by its id. */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const fav = await prisma.favorite.findFirst({
      where: { id: req.params.id, organizationId, userId },
    });
    if (!fav) throw new NotFoundError("Favorite");

    await prisma.favorite.delete({ where: { id: fav.id } });
    return ok(res, { deleted: true });
  }),
);

/** Removes a favorite by target (for the star-toggle UX — no need to remember the row id). */
router.delete(
  "/target/:targetType/:targetId",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { targetType, targetId } = req.params;

    const fav = await prisma.favorite.findFirst({
      where: { organizationId, userId, targetType, targetId },
    });
    if (!fav) throw new NotFoundError("Favorite");

    await prisma.favorite.delete({ where: { id: fav.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
