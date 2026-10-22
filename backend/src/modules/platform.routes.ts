import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePlatformAdmin } from "../middlewares/platform";
import { validate } from "../middlewares/validate";
import { ConflictError, NotFoundError } from "../lib/errors";
import { parseJson, stringifyJson } from "../lib/utils";

const router = Router();
router.use(requireAuth);
router.use(requirePlatformAdmin);

router.get(
  "/organizations",
  asyncHandler(async (_req, res) => {
    const organizations = await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memberships: true } } },
    });
    const subscriptions = await prisma.subscription.findMany();
    const subMap = new Map(subscriptions.map((s) => [s.organizationId, s]));
    return ok(
      res,
      organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        supportEmail: org.supportEmail,
        createdAt: org.createdAt.toISOString(),
        members: org._count.memberships,
        planKey: subMap.get(org.id)?.planKey ?? org.plan ?? null,
        status: subMap.get(org.id)?.status ?? "Active",
      })),
    );
  }),
);

/** Assign (or move) a tenant onto a plan. */
router.patch(
  "/organizations/:id/plan",
  validate(
    z.object({
      planKey: z.string().min(1),
      status: z.enum(["active", "trialing", "past_due", "canceled"]).default("active"),
    }),
  ),
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!organization) throw new NotFoundError("Organization");
    const { planKey, status } = req.body as { planKey: string; status: string };
    const plan = await prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw new NotFoundError("Plan");

    await prisma.subscription.upsert({
      where: { organizationId: organization.id },
      update: { planKey, status },
      create: {
        organizationId: organization.id,
        planKey,
        status,
        billingCycle: "Monthly",
        seats: 0,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    await prisma.organization.update({
      where: { id: organization.id },
      data: { plan: planKey, planStatus: status },
    });
    return ok(res, { organizationId: organization.id, planKey, status });
  }),
);

const planSchema = z.object({
  key: z.string().min(2).max(40),
  name: z.string().min(2).max(80),
  priceMonthly: z.coerce.number().min(0).default(0),
  priceYearly: z.coerce.number().min(0).default(0),
  currency: z.string().max(6).default("INR"),
  features: z.array(z.string()).default([]),
  limits: z.record(z.number()).default({}),
  popular: z.boolean().default(false),
  position: z.coerce.number().int().default(0),
});

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
        position: plan.position,
      })),
    );
  }),
);

router.post(
  "/plans",
  validate(planSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof planSchema>;
    const existingKey = await prisma.plan.findUnique({ where: { key: body.key } });
    if (existingKey) throw new ConflictError("A plan with this key already exists");
    const plan = await prisma.plan.create({
      data: {
        key: body.key,
        name: body.name,
        priceMonthly: body.priceMonthly,
        priceYearly: body.priceYearly,
        currency: body.currency,
        features: stringifyJson(body.features),
        limits: stringifyJson(body.limits),
        popular: body.popular,
        position: body.position,
      },
    });
    return created(res, plan);
  }),
);

router.patch(
  "/plans/:key",
  validate(planSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof planSchema>>;
    const existing = await prisma.plan.findUnique({ where: { key: req.params.key } });
    if (!existing) throw new NotFoundError("Plan");
    const plan = await prisma.plan.update({
      where: { key: existing.key },
      data: {
        name: body.name,
        priceMonthly: body.priceMonthly,
        priceYearly: body.priceYearly,
        currency: body.currency,
        features: body.features ? stringifyJson(body.features) : undefined,
        limits: body.limits ? stringifyJson(body.limits) : undefined,
        popular: body.popular,
        position: body.position,
      },
    });
    return ok(res, plan);
  }),
);

router.delete(
  "/plans/:key",
  asyncHandler(async (req, res) => {
    const plan = await prisma.plan.findUnique({ where: { key: req.params.key } });
    if (!plan) throw new NotFoundError("Plan");
    const inUse = await prisma.subscription.count({ where: { planKey: plan.key } });
    if (inUse > 0) {
      throw new ConflictError("This plan still has active subscriptions — move those companies to another plan first.");
    }
    await prisma.plan.delete({ where: { key: plan.key } });
    return ok(res, { deleted: true });
  }),
);

export default router;