import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { NotFoundError } from "../lib/errors";
import { deriveNotifications } from "../services/notifications";

const router = Router();
router.use(requireAuth);

/** Notification tray: persisted notifications plus live derived signals. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const [persisted, derived] = await Promise.all([
      prisma.notification.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      deriveNotifications(organizationId),
    ]);

    return ok(res, {
      items: persisted.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        moduleId: n.moduleId,
        recordId: n.recordId,
        level: n.level,
        read: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
      })),
      derived,
      unread: persisted.filter((n) => !n.readAt).length,
    });
  }),
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { organizationId: req.auth!.organizationId, readAt: null },
    });
    return ok(res, { unread: count });
  }),
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!notification) throw new NotFoundError("Notification");

    await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    return ok(res, { read: true });
  }),
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { organizationId: req.auth!.organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { read: result.count });
  }),
);

export default router;
