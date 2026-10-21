import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { getPagination, paginated } from "../lib/pagination";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const conversationSchema = z.object({
  channel: z.string().max(40).default("Shared inbox"),
  contactName: z.string().min(1).max(120),
  contactEmail: z.string().max(160).optional(),
  contactPhone: z.string().max(40).optional(),
  subject: z.string().max(200).optional(),
  recordId: z.string().max(60).optional(),
  assignedTo: z.string().max(120).optional(),
});

const messageSchema = z.object({
  body: z.string().min(1).max(4000),
  channel: z.string().max(40).optional(),
  direction: z.enum(["in", "out"]).default("out"),
  templateId: z.string().max(60).optional(),
});

const templateSchema = z.object({
  channel: z.string().max(40).default("Shared inbox"),
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
});

const conversationDto = (c: {
  id: string;
  channel: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  subject: string;
  status: string;
  assignedTo: string | null;
  lastMessageAt: Date;
  messages?: Array<{ body: string }>;
  _count?: { messages: number };
}) => ({
  id: c.id,
  channel: c.channel,
  contactName: c.contactName,
  contactEmail: c.contactEmail,
  contactPhone: c.contactPhone,
  subject: c.subject,
  status: c.status,
  assignedTo: c.assignedTo,
  lastMessageAt: c.lastMessageAt.toISOString(),
  preview: c.messages?.[0]?.body ?? "",
  messageCount: c._count?.messages ?? c.messages?.length ?? 0,
});

/** Shared inbox conversation list. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { channel, status, search, assignedTo } = req.query as Record<string, string | undefined>;
    const where: Prisma.ConversationWhereInput = { organizationId: req.auth!.organizationId };
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (assignedTo) where.assignedTo = assignedTo;
    if (search) {
      where.OR = [
        { contactName: { contains: search } },
        { contactEmail: { contains: search } },
        { subject: { contains: search } },
      ];
    }

    const p = getPagination(req.query as Record<string, unknown>, 30);
    const [items, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: p.skip,
        take: p.take,
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { messages: true } } },
      }),
      prisma.conversation.count({ where }),
    ]);

    return ok(res, paginated(items.map(conversationDto), total, p));
  }),
);

/** Channel counters for the inbox sidebar. */
router.get(
  "/channels",
  asyncHandler(async (req, res) => {
    const rows = await prisma.conversation.groupBy({
      by: ["channel"],
      where: { organizationId: req.auth!.organizationId },
      _count: { _all: true },
    });
    return ok(res, rows.map((r) => ({ channel: r.channel, count: r._count._all })));
  }),
);

/** Full thread with messages. */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw new NotFoundError("Conversation");

    return ok(res, {
      ...conversationDto(conversation),
      messages: conversation.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        channel: m.channel,
        body: m.body,
        sentBy: m.sentByName,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }),
);

router.post(
  "/",
  validate(conversationSchema),
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.create({
      data: { organizationId: req.auth!.organizationId, ...(req.body as z.infer<typeof conversationSchema>) },
    });
    return created(res, conversationDto(conversation));
  }),
);

/**
 * Appends a message to a thread. Outbound delivery is stored against the thread
 * so the CRM timeline stays the single source of truth; no external supplier or
 * payment provider is ever contacted from here.
 */
router.post(
  "/:id/messages",
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!conversation) throw new NotFoundError("Conversation");

    const body = req.body as z.infer<typeof messageSchema>;
    const [message] = await Promise.all([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: body.direction,
          channel: body.channel ?? conversation.channel,
          body: body.body,
          templateId: body.templateId,
          sentById: req.auth!.userId,
          sentByName: req.auth!.name,
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: "In progress" },
      }),
    ]);

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "MessageSent",
      moduleId: "inbox",
      recordId: conversation.id,
      label: `Message sent to ${conversation.contactName}`,
      req,
    });

    return created(res, {
      id: message.id,
      direction: message.direction,
      channel: message.channel,
      body: message.body,
      sentBy: message.sentByName,
      createdAt: message.createdAt.toISOString(),
    });
  }),
);

router.patch(
  "/:id",
  validate(z.object({ status: z.string().max(40).optional(), assignedTo: z.string().max(120).optional() })),
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!conversation) throw new NotFoundError("Conversation");
    const updated = await prisma.conversation.update({ where: { id: conversation.id }, data: req.body });
    return ok(res, conversationDto(updated));
  }),
);

/** Message templates. */
router.get(
  "/templates/list",
  asyncHandler(async (req, res) => {
    const channel = req.query.channel as string | undefined;
    const templates = await prisma.messageTemplate.findMany({
      where: { organizationId: req.auth!.organizationId, ...(channel ? { channel } : {}) },
      orderBy: { createdAt: "asc" },
    });
    return ok(res, templates);
  }),
);

router.post(
  "/templates",
  validate(templateSchema),
  asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.create({
      data: { organizationId: req.auth!.organizationId, ...(req.body as z.infer<typeof templateSchema>) },
    });
    return created(res, template);
  }),
);

router.delete(
  "/templates/:templateId",
  asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.findFirst({
      where: { id: req.params.templateId, organizationId: req.auth!.organizationId },
    });
    if (!template) throw new NotFoundError("Template");
    await prisma.messageTemplate.delete({ where: { id: template.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
