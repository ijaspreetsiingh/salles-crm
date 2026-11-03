import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { sendCampaign, resolveAudience } from "../services/campaigns";

/**
 * Campaigns — a message, an audience rule, and the delivery record.
 *
 * The audience is stored as a rule (which module, which statuses) rather than
 * a frozen list of ids, so the count you see while writing is the list that
 * gets sent.
 */
const router = Router();
router.use(requireAuth);

const mapCampaign = (row: {
  id: string;
  name: string;
  channel: string;
  subject: string;
  body: string;
  audienceModule: string;
  audience: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  name: row.name,
  channel: row.channel,
  subject: row.subject,
  body: row.body,
  audienceModule: row.audienceModule,
  statuses: (JSON.parse(row.audience || "{}") as { statuses?: string[] }).statuses ?? [],
  status: row.status,
  total: row.total,
  sent: row.sent,
  failed: row.failed,
  skipped: row.skipped,
  lastSentAt: row.lastSentAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const campaignSchema = z.object({
  name: z.string().min(2).max(120),
  channel: z.enum(["email", "whatsapp"]).default("email"),
  subject: z.string().max(160).optional(),
  body: z.string().max(4000).default(""),
  audienceModule: z.string().min(1).max(40).default("leads"),
  statuses: z.array(z.string().max(60)).max(12).default([]),
});

router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.campaign.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(res, rows.map(mapCampaign));
  }),
);

router.post(
  "/",
  requirePermission("edit"),
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof campaignSchema>;
    const campaign = await prisma.campaign.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: body.name.trim(),
        channel: body.channel,
        subject: body.subject?.trim() ?? "",
        body: body.body,
        audienceModule: body.audienceModule,
        audience: JSON.stringify({ statuses: body.statuses }),
        createdById: req.auth!.userId,
      },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "campaigns",
      label: `Campaign drafted: ${campaign.name}`,
      meta: { campaignId: campaign.id },
      req,
    });
    return created(res, mapCampaign(campaign));
  }),
);

router.patch(
  "/:id",
  requirePermission("edit"),
  validate(campaignSchema.partial()),
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<z.infer<typeof campaignSchema>>;
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Campaign");
    if (existing.status === "sending") {
      throw new BadRequestError("This campaign is sending — wait for it to finish");
    }

    const { statuses, ...rest } = body;
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(statuses
          ? { audience: JSON.stringify({ statuses }) }
          : {}),
        ...(rest.name ? { name: rest.name.trim() } : {}),
      },
    });
    return ok(res, mapCampaign(campaign));
  }),
);

router.delete(
  "/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Campaign");
    await prisma.campaign.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

/** Who would receive this campaign, right now, and who is left out. */
router.get(
  "/:id/audience",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!campaign) throw new NotFoundError("Campaign");

    const filters = JSON.parse(campaign.audience || "{}") as { statuses?: string[] };
    const preview = await resolveAudience(
      req.auth!.organizationId,
      campaign.audienceModule,
      campaign.channel,
      filters,
    );

    return ok(res, {
      eligible: preview.eligible.length,
      skippedNoAddress: preview.skippedNoAddress,
      skippedOptedOut: preview.skippedOptedOut,
      total: preview.total,
      sample: preview.eligible.slice(0, 8).map((member) => ({
        name: member.name,
        reference: member.reference,
        address: campaign.channel === "whatsapp" ? member.phone : member.email,
      })),
    });
  }),
);

/**
 * Kicks off a send. The work happens in the background so a 300-person list
 * does not hold an HTTP request open; the client polls the campaign row for
 * progress, which is also what survives a page reload mid-send.
 */
router.post(
  "/:id/send",
  requirePermission("edit"),
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!campaign) throw new NotFoundError("Campaign");
    if (campaign.status === "sending") throw new BadRequestError("This campaign is already sending");
    if (!campaign.body.trim()) throw new BadRequestError("Write the message before sending it");

    const filters = JSON.parse(campaign.audience || "{}") as { statuses?: string[] };
    const preview = await resolveAudience(
      req.auth!.organizationId,
      campaign.audienceModule,
      campaign.channel,
      filters,
    );
    if (preview.eligible.length === 0) {
      throw new BadRequestError(
        preview.skippedNoAddress + preview.skippedOptedOut > 0
          ? "Nobody in this audience has an address left after opt-outs — check the audience"
          : "This audience is empty — add contacts or widen the filter",
      );
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "sending", total: preview.eligible.length, sent: 0, failed: 0 },
    });

    void sendCampaign({
      organizationId: req.auth!.organizationId,
      campaignId: campaign.id,
      userId: req.auth!.userId,
    }).catch(async (error: unknown) => {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "failed" },
      });
      void error;
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "campaigns",
      label: `Campaign sent: ${campaign.name} (${preview.eligible.length} recipients)`,
      meta: { campaignId: campaign.id, channel: campaign.channel },
      req,
    });

    return ok(res, { status: "sending", queued: preview.eligible.length });
  }),
);

/** Everything this campaign produced, straight from the outbox. */
router.get(
  "/:id/deliveries",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!campaign) throw new NotFoundError("Campaign");

    const rows = await prisma.emailOutbox.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        relatedModule: "campaigns",
        relatedReference: campaign.id,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return ok(
      res,
      rows.map((row) => ({
        id: row.id,
        to: row.to,
        channel: row.channel,
        status: row.status,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
    );
  }),
);

export default router;
