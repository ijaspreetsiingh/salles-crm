import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { getPagination, paginated } from "../lib/pagination";
import { parseJson } from "../lib/utils";

const router = Router();
router.use(requireAuth, requireRole("company_admin", "branch_manager", "finance"));

/** Immutable audit trail (settings → audit logs). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { moduleId, action, actor, from, to, search } = req.query as Record<string, string | undefined>;
    const where: Prisma.AuditLogWhereInput = { organizationId: req.auth!.organizationId };

    if (moduleId) where.moduleId = moduleId;
    if (action) where.action = action;
    if (actor) where.actorName = { contains: actor };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (search) where.label = { contains: search };

    const p = getPagination(req.query as Record<string, unknown>, 50);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
      prisma.auditLog.count({ where }),
    ]);

    return ok(
      res,
      paginated(
        items.map((log) => ({
          id: log.id,
          action: log.action,
          moduleId: log.moduleId,
          recordId: log.recordId,
          label: log.label,
          actor: log.actorName,
          meta: parseJson<Record<string, unknown>>(log.meta, {}),
          ip: log.ip,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
        })),
        total,
        p,
      ),
    );
  }),
);

export default router;
