/**
 * AI Assistant Extensions — Sales Intelligence + Operations Insights.
 *
 * These two tabs generate analytics-driven insight cards without requiring
 * an LLM: they read real records and produce actionable observations.
 * When an LLM is configured, it can be used to narrate the findings.
 */
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { parseJson } from "../lib/utils";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("assistant", "view"));

/**
 * Sales Intelligence — lead conversion, top destinations, deal velocity,
 * stale pipeline alerts, and revenue forecast based on current pipeline.
 */
router.get("/sales-intelligence", asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  const [
    totalLeads, wonLeads, lostLeads, qualifiedLeads,
    totalBookings, confirmedBookings, bookingRevenue,
    staleLeads, topDestinations, recentLeads,
  ] = await Promise.all([
    prisma.record.count({ where: { organizationId, moduleId: "leads", deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "leads", status: "Won", deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "leads", status: "Lost", deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "leads", status: { in: ["Qualified", "Quoted"] }, deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "bookings", deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "bookings", status: { in: ["Confirmed", "Completed"] }, deletedAt: null } }),
    prisma.record.aggregate({ where: { organizationId, moduleId: "bookings", status: { in: ["Confirmed", "Completed"] }, deletedAt: null }, _sum: { amount: true } }),
    // Leads untouched for >14 days
    prisma.record.findMany({
      where: { organizationId, moduleId: "leads", status: { notIn: ["Won", "Lost"] }, updatedAt: { lt: new Date(now.getTime() - 14 * 86400000) }, deletedAt: null },
      orderBy: { updatedAt: "asc" }, take: 10,
      select: { id: true, reference: true, name: true, status: true, updatedAt: true, ownerName: true },
    }),
    prisma.record.groupBy({ by: ["destination"], where: { organizationId, moduleId: "bookings", destination: { not: "" }, deletedAt: null }, _count: { _all: true }, _sum: { amount: true }, orderBy: { _count: { destination: "desc" } }, take: 5 }),
    prisma.record.count({ where: { organizationId, moduleId: "leads", createdAt: { gte: thirtyDaysAgo }, deletedAt: null } }),
  ]);

  const winRate = (wonLeads + lostLeads) > 0 ? Math.round((wonLeads / (wonLeads + lostLeads)) * 100) : 0;
  const pipelineValue = await prisma.record.aggregate({ where: { organizationId, moduleId: "leads", status: { notIn: ["Won", "Lost"] }, deletedAt: null }, _sum: { amount: true } });
  const forecastRevenue = Math.round(Number(pipelineValue._sum.amount ?? 0) * winRate / 100);

  const insights: Array<{ type: string; title: string; body: string; urgency: string; value?: number }> = [];

  if (winRate < 20 && (wonLeads + lostLeads) > 5)
    insights.push({ type: "warning", title: "Low win rate", body: `Win rate is ${winRate}%. Industry average is 20-30%. Review lost lead reasons.`, urgency: "high" });
  if (staleLeads.length > 0)
    insights.push({ type: "action", title: `${staleLeads.length} stale leads`, body: `${staleLeads.slice(0, 3).map((l) => l.name).join(", ")} have not been touched in 14+ days.`, urgency: "medium" });
  if (winRate > 40)
    insights.push({ type: "positive", title: "Strong conversion", body: `Win rate is ${winRate}% — well above average. Consider scaling lead volume.`, urgency: "low" });
  if (recentLeads > 0)
    insights.push({ type: "info", title: `${recentLeads} new leads this month`, body: `New leads in the last 30 days. ${qualifiedLeads} are qualified or quoted.`, urgency: "low", value: recentLeads });

  return ok(res, {
    kpis: {
      totalLeads, wonLeads, lostLeads, qualifiedLeads,
      winRate, totalBookings, confirmedBookings,
      bookingRevenue: Number(bookingRevenue._sum.amount ?? 0),
      pipelineValue: Number(pipelineValue._sum.amount ?? 0),
      forecastRevenue,
    },
    staleLeads: staleLeads.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })),
    topDestinations: topDestinations.map((d) => ({ destination: d.destination, bookings: d._count._all, revenue: Number(d._sum.amount ?? 0) })),
    insights,
  });
}));

/**
 * Operations Insights — trip health, supplier reliability, PNR risks,
 * departure readiness, and staffing vs upcoming load.
 */
router.get("/operations-insights", asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const now = new Date();
  const next30 = new Date(now.getTime() + 30 * 86400000);
  const next7 = new Date(now.getTime() + 7 * 86400000);

  const [
    upcomingDepartures, activeTrips, openIncidents, criticalIncidents,
    pnrAtRisk, activeBookings, pendingPayables, overdueInvoices,
  ] = await Promise.all([
    prisma.record.count({ where: { organizationId, moduleId: "operations", tab: "Departures", date: { lte: next30.toISOString().slice(0, 10), gte: now.toISOString().slice(0, 10) }, status: { in: ["Upcoming", "Confirmed"] }, deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "operations", status: "In progress", deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "operations", tab: "Incidents", status: { in: ["Open", "In progress"] }, deletedAt: null } }),
    prisma.record.count({ where: { organizationId, moduleId: "operations", tab: "Incidents", status: { in: ["Open", "In progress"] }, extra: { contains: "Critical" }, deletedAt: null } }),
    prisma.flightPNR.count({ where: { organizationId, status: "Active", ticketDeadline: { lte: next7, gte: now } } }),
    prisma.record.count({ where: { organizationId, moduleId: "bookings", status: { in: ["Confirmed", "Pending"] }, deletedAt: null } }),
    prisma.payable.aggregate({ where: { organizationId, status: { in: ["due", "partial"] }, dueDate: { lte: now } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.record.count({ where: { organizationId, moduleId: "finance", status: "Overdue", deletedAt: null } }),
  ]);

  const insights: Array<{ type: string; title: string; body: string; urgency: string }> = [];
  if (criticalIncidents > 0) insights.push({ type: "critical", title: `${criticalIncidents} critical incident${criticalIncidents > 1 ? "s" : ""}`, body: "Immediate attention required. Open Operations → Incidents.", urgency: "critical" });
  if (pnrAtRisk > 0) insights.push({ type: "warning", title: `${pnrAtRisk} PNR${pnrAtRisk > 1 ? "s" : ""} due for ticketing in 7 days`, body: "Ticket or the reservation will auto-cancel.", urgency: "high" });
  if (Number(pendingPayables._sum.amount ?? 0) > 0) insights.push({ type: "warning", title: `₹${Number(pendingPayables._sum.amount ?? 0).toLocaleString("en-IN")} overdue to suppliers`, body: `${pendingPayables._count._all} payables past due date.`, urgency: "medium" });
  if (overdueInvoices > 0) insights.push({ type: "action", title: `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? "s" : ""}`, body: "Follow up with customers to collect outstanding payments.", urgency: "medium" });
  if (upcomingDepartures > 0) insights.push({ type: "info", title: `${upcomingDepartures} departure${upcomingDepartures > 1 ? "s" : ""} in 30 days`, body: "Review manifests and confirm all services.", urgency: "low" });

  return ok(res, {
    kpis: { upcomingDepartures, activeTrips, openIncidents, criticalIncidents, pnrAtRisk, activeBookings, overdueInvoices, overduePayables: pendingPayables._count._all, overduePayablesAmount: Number(pendingPayables._sum.amount ?? 0) },
    insights,
  });
}));

export default router;
