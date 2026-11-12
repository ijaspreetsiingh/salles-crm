/**
 * Team Chat Extensions — @mention notifications, file sharing, message search.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { createNotification } from "../services/notifications";

const router = Router();
router.use(requireAuth);

/**
 * Message search across all channels.
 * Searches body text, returns channel + sender + timestamp for context.
 */
router.get("/search", asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const q = String(req.query.q ?? "").trim();
  const take = Math.min(Number(req.query.take ?? 50), 200);
  if (q.length < 2) return ok(res, { results: [] });

  const messages = await prisma.chatMessage.findMany({
    where: { channel: { organizationId }, body: { contains: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" }, take,
    include: { channel: { select: { name: true, isDirect: true } } },
  });

  return ok(res, {
    results: messages.map((m) => ({
      id: m.id, body: m.body, senderName: m.senderName,
      channelName: m.channel.name, channelType: m.channel.isDirect ? "dm" : "channel",
      createdAt: m.createdAt.toISOString(),
    })),
  });
}));

/**
 * File sharing — upload a file reference (not the file itself, which goes
 * through /uploads) and attach it to a chat message.
 */
const fileShareSchema = z.object({
  channelId: z.string().min(1),
  messageId: z.string().optional(),
  fileName: z.string().min(1).max(200),
  fileSize: z.number().int().min(0).default(0),
  mimeType: z.string().max(100).default("application/octet-stream"),
  attachmentId: z.string().optional(), // links to the uploads table
});

router.get("/files", asyncHandler(async (req, res) => {
  const { organizationId } = req.auth!;
  const channelId = req.query.channelId as string | undefined;

  // Files are stored as chat messages with a special prefix
  const messages = await prisma.chatMessage.findMany({
    where: { channel: { organizationId }, body: { startsWith: "[file]" }, ...(channelId ? { channelId } : {}) },
    orderBy: { createdAt: "desc" }, take: 100,
    include: { channel: { select: { name: true } } },
  });

  const files = messages.map((m) => {
    // body format: "[file] filename | size | mimeType | attachmentId"
    const parts = m.body.replace("[file]", "").split("|").map((p) => p.trim());
    return {
      messageId: m.id, fileName: parts[0] ?? "Unknown", size: Number(parts[1] ?? 0),
      mimeType: parts[2] ?? "application/octet-stream", attachmentId: parts[3] ?? null,
      senderName: m.senderName, channelName: m.channel.name,
      createdAt: m.createdAt.toISOString(),
    };
  });

  return ok(res, { files });
}));

router.post("/files", validate(fileShareSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof fileShareSchema>;
  // Verify channel belongs to org
  const channel = await prisma.chatChannel.findFirst({ where: { id: body.channelId, organizationId: req.auth!.organizationId } });
  if (!channel) throw new NotFoundError("Channel");

  const fileBody = `[file] ${body.fileName} | ${body.fileSize} | ${body.mimeType} | ${body.attachmentId ?? ""}`;
  const message = await prisma.chatMessage.create({ data: {
    channelId: body.channelId, senderId: req.auth!.userId, senderName: req.auth!.name,
    body: fileBody,
  }});

  return created(res, { id: message.id, fileName: body.fileName });
}));

/**
 * @mention processing — when a message contains @username, send a notification
 * to that user. Called after a message is sent.
 */
const mentionSchema = z.object({
  messageId: z.string().min(1),
  mentionedUserIds: z.array(z.string().min(1)).max(20),
  messagePreview: z.string().max(200),
  channelName: z.string().max(100),
});

router.post("/mentions", validate(mentionSchema), asyncHandler(async (req, res) => {
  const { messageId, mentionedUserIds, messagePreview, channelName } = req.body as z.infer<typeof mentionSchema>;

  for (const userId of mentionedUserIds) {
    void createNotification({
      organizationId: req.auth!.organizationId,
      userId,
      title: `Mentioned in #${channelName}`,
      body: `${req.auth!.name}: ${messagePreview.slice(0, 100)}`,
      moduleId: "team-chat",
      level: "info",
    });
  }

  return created(res, { notified: mentionedUserIds.length });
}));

export default router;
