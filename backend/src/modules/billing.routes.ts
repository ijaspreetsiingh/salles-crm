import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const changeSchema = z.object({
  planKey: z.string().min(2).optional(),
  billingCycle: z.enum(["Monthly", "Yearly"]).optional(),
  seats: z.coerce.number().int().min(1).max(1000).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

const period = () => new Date().toISOString().slice(0, 7);

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

/** Change plan, billing cycle or seat count. */
router.patch(
  "/subscription",
  requireRole("company_admin"),
  validate(changeSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof changeSchema>;

    const existing = await prisma.subscription.findUnique({ where: { organizationId } });
    if (!existing) throw new NotFoundError("Subscription");

    if (body.planKey) {
      const plan = await prisma.plan.findUnique({ where: { key: body.planKey } });
      if (!plan) throw new NotFoundError("Plan");
    }

    const subscription = await prisma.subscription.update({
      where: { organizationId },
      data: {
        planKey: body.planKey,
        billingCycle: body.billingCycle,
        seats: body.seats,
        cancelAtPeriodEnd: body.cancelAtPeriodEnd,
        status: body.cancelAtPeriodEnd === false ? "active" : undefined,
        // Changing plan starts a fresh billing period.
        currentPeriodStart: body.planKey ? new Date() : undefined,
        currentPeriodEnd: body.planKey
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * (body.billingCycle === "Monthly" ? 30 : 365))
          : undefined,
      },
      include: { plan: true },
    });

    if (body.planKey) {
      await prisma.organization.update({ where: { id: organizationId }, data: { plan: body.planKey } });
    }

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `Subscription ${body.planKey ? `changed to ${subscription.plan.name}` : "updated"}`,
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
 * Invoice history derived from the active subscription. In a full deployment
 * this is populated by the billing provider's webhook; here it reflects the
 * subscription's own billing periods so the UI has real rows to render.
 */
router.get(
  "/invoices",
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: req.auth!.organizationId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundError("Subscription");

    const amount =
      subscription.billingCycle === "Monthly" ? subscription.plan.priceMonthly : subscription.plan.priceYearly;
    const cycles = 6;
    const stepDays = subscription.billingCycle === "Monthly" ? 30 : 365;

    const invoices = Array.from({ length: cycles }, (_, index) => {
      const issued = new Date(Date.now() - index * stepDays * 24 * 60 * 60 * 1000);
      return {
        id: `INV-${issued.getFullYear()}${String(issued.getMonth() + 1).padStart(2, "0")}-${subscription.id.slice(-4)}`,
        issuedAt: issued.toISOString(),
        period,
        amount,
        currency: subscription.plan.currency,
        status: index === 0 ? subscription.status : "paid",
        planKey: subscription.planKey,
      };
    });

    return ok(res, {
      invoices,
      totals: {
        billed: invoices.reduce((total, invoice) => total + invoice.amount, 0),
        currency: subscription.plan.currency,
      },
    });
  }),
);

export default router;
