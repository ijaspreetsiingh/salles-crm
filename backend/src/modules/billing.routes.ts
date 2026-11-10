import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";

const router = Router();
router.use((req, res, next) => {
  if (req.method === "GET" && req.path === "/plans") return next();
  return requireAuth(req, res, next);
});

const changeSchema = z.object({
  planKey: z.string().min(2).optional(),
  billingCycle: z.enum(["Monthly", "Yearly"]).optional(),
  seats: z.coerce.number().int().min(1).max(1000).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

/** Available SaaS plans. */
router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const plans = await prisma.plan.findMany({ orderBy: { position: "asc" } });
    return ok(
      res,
      plans.map((plan) => ({
        key: plan.key,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        features: parseJson<string[]>(plan.features, []),
        limits: parseJson<Record<string, number>>(plan.limits, {}),
        popular: plan.popular,
      })),
    );
  }),
);

/** Current subscription, plan limits and live usage. */
router.get(
  "/subscription",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundError("Subscription");

    const [seats, branches, bookings] = await Promise.all([
      prisma.membership.count({ where: { organizationId, active: true } }),
      prisma.branch.count({ where: { organizationId, active: true } }),
      prisma.record.count({ where: { organizationId, moduleId: "bookings", deletedAt: null } }),
    ]);

    const limits = parseJson<Record<string, number>>(subscription.plan.limits, {});

    return ok(res, {
      subscription: {
        planKey: subscription.planKey,
        planName: subscription.plan.name,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        seats: subscription.seats,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      plan: {
        key: subscription.plan.key,
        name: subscription.plan.name,
        priceMonthly: subscription.plan.priceMonthly,
        priceYearly: subscription.plan.priceYearly,
        currency: subscription.plan.currency,
        features: parseJson<string[]>(subscription.plan.features, []),
        limits,
      },
      usage: [
        { metric: "seats", used: seats, limit: limits.seats ?? null },
        { metric: "branches", used: branches, limit: limits.branches ?? null },
        { metric: "bookings", used: bookings, limit: limits.bookings ?? null },
      ],
    });
  }),
);

/** Cancel or resume the current subscription. Plan/seat changes are billable. */
router.patch(
  "/subscription",
  requireRole("company_admin"),
  validate(changeSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof changeSchema>;

    // A tenant must never be able to grant itself a paid plan or extra seats.
    // Those changes come from the payment provider webhook or the platform
    // admin console, where money actually changes hands.
    if (body.planKey || body.billingCycle || body.seats !== undefined) {
      throw new ForbiddenError(
        "Plan and seat changes are handled by your Traveldesk account manager. You can cancel or resume the current plan here.",
      );
    }

    const existing = await prisma.subscription.findUnique({ where: { organizationId } });
    if (!existing) throw new NotFoundError("Subscription");

    const subscription = await prisma.subscription.update({
      where: { organizationId },
      data: {
        cancelAtPeriodEnd: body.cancelAtPeriodEnd,
        status:
          body.cancelAtPeriodEnd === false && existing.status === "cancelled"
            ? "active"
            : undefined,
      },
      include: { plan: true },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: body.cancelAtPeriodEnd ? "Subscription set to cancel at period end" : "Subscription resumed",
      req,
    });

    return ok(res, subscription);
  }),
);

/** Current-period usage meters. */
router.get(
  "/usage",
  asyncHandler(async (req, res) => {
    const records = await prisma.usageRecord.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { period: "desc" },
      take: 50,
    });
    return ok(res, records);
  }),
);

/**
 * Billing history.
 *
 * This deployment does not run a subscription payment provider, so there are
 * no real invoices to show. The endpoint returns an empty, honest list rather
 * than inventing six months of paid rows that never existed — money screens
 * must never display a number that cannot be backed by a record.
 */
router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: req.auth!.organizationId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundError("Subscription");

    return ok(res, {
      invoices: [],
      totals: { billed: 0, currency: subscription.plan.currency },
      note: "Subscription billing is handled outside this workspace. Platform invoices appear here once a billing provider is connected.",
    });
  }),
);

export default router;
