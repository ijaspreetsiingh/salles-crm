import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission, requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, randomToken, stringifyJson } from "../lib/utils";
import { maskValue, redactSecrets } from "../lib/redact";
import { recordAudit } from "../services/audit";
import { assertSafeWebhookUrl, deliverWebhook } from "../services/webhooks";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("integrations", "view"));

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
      connections.map((c) => ({
        ...c,
        /*
         * The connected provider's API key/secret is write-only. The UI only
         * needs to know whether a value is stored, so every credential-like
         * key is masked before it leaves the server.
         */
        config: redactSecrets(parseJson<Record<string, unknown>>(c.config, {})),
      })),
    );
  }),
);

const findConnection = async (organizationId: string, id: string) => {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id, organizationId },
  });
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

    return ok(res, {
      ...updated,
      config: redactSecrets(parseJson<Record<string, unknown>>(updated.config, {})),
    });
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

    return ok(res, {
      ...updated,
      config: redactSecrets(parseJson<Record<string, unknown>>(updated.config, {})),
    });
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
    return ok(res, {
      ...updated,
      config: redactSecrets(parseJson<Record<string, unknown>>(updated.config, {})),
    });
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
    // The signing secret is shown in full only to the role that can create and
    // revoke webhooks; everyone else sees that one exists.
    const canSeeSecret =
      req.auth!.roleKey === "company_admin" || req.auth!.roleKey === "platform_admin";
    return ok(
      res,
      webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: parseJson<string[]>(w.events, []),
        active: w.active,
        secret: canSeeSecret ? w.secret : maskValue(w.secret),
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
    // Any workspace admin can type this URL, so it must never reach a private
    // network, a cloud metadata endpoint or a localhost service.
    const safeUrl = await assertSafeWebhookUrl(body.url);
    const webhook = await prisma.webhook.create({
      data: {
        organizationId: req.auth!.organizationId,
        url: safeUrl.toString(),
        events: stringifyJson(body.events),
        secret: `whsec_${randomToken(16)}`,
        active: body.active,
      },
    });
    return created(res, {
      ...webhook,
      events: body.events,
      createdAt: webhook.createdAt.toISOString(),
    });
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
    return ok(
      res,
      deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    );
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

    const payload = {
      event: "webhook.test",
      organizationId: req.auth!.organizationId,
      sentAt: new Date().toISOString(),
    };
    const body = stringifyJson(payload);
    const result = await deliverWebhook(webhook.url, webhook.secret, body);

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: "webhook.test",
        status: result.ok ? "success" : "failed",
        responseCode: result.status,
        payload: body,
      },
    });

    return ok(res, { ...delivery, createdAt: delivery.createdAt.toISOString() });
  }),
);

/**
 * Every webhook delivery in the workspace, newest first — the log an
 * integrator actually needs when a partner says "we never got the event".
 */
router.get(
  "/deliveries",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const take = Math.min(Math.max(Number(req.query.take ?? 50) || 50, 1), 200);
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId },
      select: { id: true, url: true, active: true },
    });
    const byId = new Map(webhooks.map((w) => [w.id, w]));

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId: { in: webhooks.map((w) => w.id) } },
      orderBy: { createdAt: "desc" },
      take,
    });

    return ok(
      res,
      deliveries.map((delivery) => ({
        id: delivery.id,
        webhookId: delivery.webhookId,
        url: byId.get(delivery.webhookId)?.url ?? "",
        active: byId.get(delivery.webhookId)?.active ?? false,
        event: delivery.event,
        status: delivery.status,
        responseCode: delivery.responseCode,
        payload: delivery.payload,
        createdAt: delivery.createdAt.toISOString(),
      })),
    );
  }),
);

/** Re-sends a past delivery exactly as it was sent. */
router.post(
  "/deliveries/:id/retry",
  requireRole("company_admin", "branch_manager"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    // Scope the read through the tenant's own webhooks — a delivery id from
    // another organisation must look exactly like a missing one.
    const delivery = await prisma.webhookDelivery.findFirst({
      where: {
        id: req.params.id,
        webhook: { organizationId },
      },
    });
    if (!delivery) throw new NotFoundError("Delivery");

    const webhook = await prisma.webhook.findFirst({
      where: { id: delivery.webhookId, organizationId },
    });
    if (!webhook) throw new NotFoundError("Webhook");

    const body = delivery.payload || "{}";
    const result = await deliverWebhook(webhook.url, webhook.secret, body, {
      "X-Traveldesk-Retry": "1",
    });

    const retried = await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: delivery.event,
        status: result.ok ? "success" : "failed",
        responseCode: result.status,
        payload: body,
      },
    });

    return ok(res, {
      id: retried.id,
      status: retried.status,
      responseCode: retried.responseCode,
      createdAt: retried.createdAt.toISOString(),
    });
  }),
);

export default router;
