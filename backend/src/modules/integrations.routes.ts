import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, randomToken, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

const connectSchema = z.object({
  environment: z.enum(["Sandbox", "Production"]).default("Sandbox"),
  config: z.record(z.unknown()).default({}),
});

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default(["record.created", "record.updated", "booking.confirmed"]),
  active: z.boolean().default(true),
});

/** Supplier + business connections (integrations workspace). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const connections = await prisma.integrationConnection.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: [{ category: "asc" }, { provider: "asc" }],
    });
    return ok(
      res,
      connections.map((c) => ({ ...c, config: parseJson<Record<string, unknown>>(c.config, {}) })),
    );
  }),
);

const findConnection = async (organizationId: string, id: string) => {
  const connection = await prisma.integrationConnection.findFirst({ where: { id, organizationId } });
  if (!connection) throw new NotFoundError("Integration");
  return connection;
};

router.post(
  "/:id/connect",
  requireRole("company_admin", "branch_manager"),
  validate(connectSchema),
  asyncHandler(async (req, res) => {
    const connection = await findConnection(req.auth!.organizationId, req.params.id);
    const body = req.body as z.infer<typeof connectSchema>;

    const updated = await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: "Connected",
        environment: body.environment,
        config: stringifyJson(body.config),
        connectedAt: new Date(),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Connected",
      moduleId: "integrations",
      recordId: connection.id,
      label: `${connection.provider} connected (${body.environment})`,
      req,
    });

    return ok(res, { ...updated, config: body.config });
  }),
);

router.post(
  "/:id/disconnect",
  requireRole("company_admin", "branch_manager"),
  asyncHandler(async (req, res) => {
    const connection = await findConnection(req.auth!.organizationId, req.params.id);
    const updated = await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: "Not connected", connectedAt: null },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Disconnected",
      moduleId: "integrations",
      recordId: connection.id,
      label: `${connection.provider} disconnected`,
      req,
    });

    return ok(res, updated);
  }),
);

router.patch(
  "/:id",
  requireRole("company_admin", "branch_manager"),
  validate(z.object({ environment: z.enum(["Sandbox", "Production"]).optional() })),
  asyncHandler(async (req, res) => {
    const connection = await findConnection(req.auth!.organizationId, req.params.id);
    const updated = await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: req.body,
    });
    return ok(res, updated);
  }),
);

/** Webhooks (API & webhooks tab). */
router.get(
  "/webhooks/list",
  asyncHandler(async (req, res) => {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { deliveries: true } } },
    });
    return ok(
      res,
      webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: parseJson<string[]>(w.events, []),
        active: w.active,
        secret: w.secret,
        deliveries: w._count.deliveries,
        createdAt: w.createdAt.toISOString(),
      })),
    );
  }),
);

router.post(
  "/webhooks",
  requireRole("company_admin", "branch_manager"),
  validate(webhookSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof webhookSchema>;
    const webhook = await prisma.webhook.create({
      data: {
        organizationId: req.auth!.organizationId,
        url: body.url,
        events: stringifyJson(body.events),
        secret: `whsec_${randomToken(16)}`,
        active: body.active,
      },
    });
    return created(res, { ...webhook, events: body.events, createdAt: webhook.createdAt.toISOString() });
  }),
);

router.delete(
  "/webhooks/:webhookId",
  requireRole("company_admin", "branch_manager"),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.webhookId, organizationId: req.auth!.organizationId },
    });
    if (!webhook) throw new NotFoundError("Webhook");
    await prisma.webhook.delete({ where: { id: webhook.id } });
    return ok(res, { deleted: true });
  }),
);

router.get(
  "/webhooks/:webhookId/deliveries",
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.webhookId, organizationId: req.auth!.organizationId },
    });
    if (!webhook) throw new NotFoundError("Webhook");

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: webhook.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(res, deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })));
  }),
);

/**
 * Sends a test event so integrators can verify their endpoint. This is a
 * first-party developer utility (not a supplier or payment call).
 */
router.post(
  "/webhooks/:webhookId/test",
  requireRole("company_admin", "branch_manager"),
  asyncHandler(async (req, res) => {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.webhookId, organizationId: req.auth!.organizationId },
    });
    if (!webhook) throw new NotFoundError("Webhook");

    const payload = { event: "webhook.test", organizationId: req.auth!.organizationId, sentAt: new Date().toISOString() };
    let status = "failed";
    let responseCode: number | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Traveldesk-Signature": webhook.secret },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      responseCode = response.status;
      status = response.ok ? "success" : "failed";
    } catch (error) {
      logger.warn({ err: error, webhookId: webhook.id }, "Webhook test delivery failed");
    }

    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: webhook.id, event: "webhook.test", status, responseCode, payload: stringifyJson(payload) },
    });

    return ok(res, { ...delivery, createdAt: delivery.createdAt.toISOString() });
  }),
);

export default router;
