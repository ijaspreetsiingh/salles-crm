import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { dashboardOverview } from "../services/analytics";
import { deriveNotifications } from "../services/notifications";

const router = Router();
router.use(requireAuth);

const filtersFrom = (query: Record<string, unknown>) => ({
  branch: (query.branch as string) || undefined,
  from: (query.from as string) || undefined,
  to: (query.to as string) || undefined,
});

/** Home dashboard: KPIs, revenue series, pipeline and attention list. */
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const data = await dashboardOverview(
      req.auth!.organizationId,
      filtersFrom(req.query as Record<string, unknown>),
    );
    return ok(res, data);
  }),
);

/** Live alerts / sidebar notifications derived from real records. */
router.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    return ok(res, await deriveNotifications(req.auth!.organizationId));
  }),
);

/** Compact status counters used across the shell header. */
router.get(
  "/counters",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const today = new Date().toISOString().slice(0, 10);

    const [leads, bookings, tickets, tasksToday, unpaidInvoices] = await Promise.all([
      prisma.record.count({ where: { organizationId, moduleId: "leads", status: "New", deletedAt: null } }),
      prisma.record.count({ where: { organizationId, moduleId: "bookings", status: { in: ["Pending", "On hold"] }, deletedAt: null } }),
      prisma.record.count({ where: { organizationId, moduleId: "support", status: { in: ["Open", "Escalated"] }, deletedAt: null } }),
      prisma.task.count({ where: { organizationId, done: false, date: today } }),
      prisma.record.count({ where: { organizationId, moduleId: "finance", status: "Overdue", deletedAt: null } }),
    ]);

    return ok(res, { newLeads: leads, pendingBookings: bookings, openTickets: tickets, tasksToday, overdueInvoices: unpaidInvoices });
  }),
);

export default router;
