/**
 * Team Chat — internal Slack-style messaging for the travel team.
 *
 * Channels:  GET /team-chat/channels              list joined channels
 *            POST /team-chat/channels             create a new channel
 *            POST /team-chat/dm                   open / find DM thread
 *            GET  /team-chat/members              list org members (for @mention / DM picker)
 *
 * Messages:  GET  /team-chat/channels/:id/messages      paginated (cursor)
 *            POST /team-chat/channels/:id/messages      send a message
 *            POST /team-chat/channels/:id/messages/:mid/reactions   toggle emoji
 *
 * Read:      POST /team-chat/channels/:id/read          mark channel read
 *
 * All write endpoints emit socket.io events to the org room so every open
 * tab sees new messages without polling.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { NotFoundError, ForbiddenError } from "../lib/errors";
import { emitToOrg } from "../lib/socket";

const router = Router();
router.use(requireAuth);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Converts a raw reactions JSON string to the DTO shape. */
function reactionsDto(
  raw: string,
  myUserId: string,
): Array<{ emoji: string; count: number; mine: boolean }> {
  try {
    const map = JSON.parse(raw) as Record<string, string[]>;
    return Object.entries(map).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      mine: userIds.includes(myUserId),
    }));
  } catch {
    return [];
  }
}

function messageDto(
  msg: {
    id: string;
    channelId: string;
    senderId: string;
    senderName: string;
    senderAvatar: string | null;
    body: string;
    replyToId: string | null;
    edited: boolean;
    reactions: string;
    createdAt: Date;
  },
  myUserId: string,
  replyToBody?: string | null,
) {
  return {
    id: msg.id,
    channelId: msg.channelId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderAvatar: msg.senderAvatar,
    body: msg.body,
    replyToId: msg.replyToId,
    replyToBody: replyToBody ?? null,
    edited: msg.edited,
    reactions: reactionsDto(msg.reactions, myUserId),
    createdAt: msg.createdAt.toISOString(),
  };
}

/** Resolves the last message preview + unread count for a channel. */
async function channelDto(
  ch: {
    id: string;
    name: string;
    description: string;
    isPrivate: boolean;
    isDirect: boolean;
    createdAt: Date;
  },
  userId: string,
  organizationId: string,
) {
  const [lastMsg, totalCount, member] = await Promise.all([
    prisma.chatMessage.findFirst({
      where: { channelId: ch.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.chatMember.count({ where: { channelId: ch.id } }),
    prisma.chatMember.findUnique({ where: { channelId_userId: { channelId: ch.id, userId } } }),
  ]);

  const unreadCount = member
    ? await prisma.chatMessage.count({
        where: {
          channelId: ch.id,
          deletedAt: null,
          senderId: { not: userId },
          createdAt: { gt: member.lastReadAt },
        },
      })
    : 0;

  return {
    id: ch.id,
    name: ch.name,
    description: ch.description,
    isPrivate: ch.isPrivate,
    isDirect: ch.isDirect,
    memberCount: totalCount,
    unreadCount,
    lastMessage: lastMsg?.body.slice(0, 120) ?? null,
    lastMessageAt: lastMsg?.createdAt.toISOString() ?? null,
    createdAt: ch.createdAt.toISOString(),
  };
}

// ── ensure the org has a #general channel ────────────────────────────────────

async function ensureGeneralChannel(organizationId: string, createdById: string) {
  const existing = await prisma.chatChannel.findFirst({
    where: { organizationId, name: "#general" },
  });
  if (existing) return existing;

  const channel = await prisma.chatChannel.create({
    data: {
      organizationId,
      name: "#general",
      description: "Company-wide announcements",
      createdById,
    },
  });

  // Add the creator as first member
  await prisma.chatMember.create({ data: { channelId: channel.id, userId: createdById } });
  return channel;
}

// ── routes ───────────────────────────────────────────────────────────────────

/** List all channels the current user has joined. */
router.get(
  "/channels",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    // Auto-join #general if it exists and user isn't in it yet
    await ensureGeneralChannel(organizationId, userId);

    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      include: { channel: true },
    });

    // Also include public channels the user hasn't joined yet
    const joinedIds = memberships.map((m) => m.channelId);
    const publicChannels = await prisma.chatChannel.findMany({
      where: { organizationId, isPrivate: false, isDirect: false, id: { notIn: joinedIds } },
    });

    const all = [...memberships.map((m) => m.channel), ...publicChannels].filter(
      (c) => c.organizationId === organizationId,
    );

    const dtos = await Promise.all(all.map((c) => channelDto(c, userId, organizationId)));
    return ok(
      res,
      dtos.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")),
    );
  }),
);

const createChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .transform((v) => (v.startsWith("#") ? v : `#${v}`)),
  description: z.string().max(200).default(""),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(z.string()).default([]),
});

/** Create a new channel. Auto-adds creator + listed members. */
router.post(
  "/channels",
  validate(createChannelSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof createChannelSchema>;

    const channel = await prisma.chatChannel.create({
      data: {
        organizationId,
        name: body.name,
        description: body.description,
        isPrivate: body.isPrivate,
        isDirect: false,
        createdById: userId,
      },
    });

    const memberIds = Array.from(new Set([userId, ...body.memberIds]));
    await prisma.chatMember.createMany({
      data: memberIds.map((uid) => ({ channelId: channel.id, userId: uid })),
      skipDuplicates: true as boolean,
    });

    const dto = await channelDto(channel, userId, organizationId);
    emitToOrg(organizationId, "team_channel:new", dto);
    return created(res, dto);
  }),
);

/** Open or find an existing DM thread between two users. */
router.post(
  "/dm",
  validate(z.object({ userId: z.string() })),
  asyncHandler(async (req, res) => {
    const { organizationId, userId: myId } = req.auth!;
    const { userId: otherId } = req.body as { userId: string };
    if (myId === otherId) {
      return ok(res, null);
    }

    // Find an existing DM channel where both users are members
    const existing = await prisma.chatChannel.findFirst({
      where: {
        organizationId,
        isDirect: true,
        AND: [{ members: { some: { userId: myId } } }, { members: { some: { userId: otherId } } }],
      },
    });

    if (existing) {
      const dto = await channelDto(existing, myId, organizationId);
      return ok(res, dto);
    }

    // Get the other user's name for the channel label
    const otherMembership = await prisma.membership.findFirst({
      where: { userId: otherId, organizationId },
      include: { user: true },
    });

    const channel = await prisma.chatChannel.create({
      data: {
        organizationId,
        name: "",
        description: otherMembership?.user?.name ?? otherId,
        isPrivate: true,
        isDirect: true,
        createdById: myId,
      },
    });

    await prisma.chatMember.createMany({
      data: [
        { channelId: channel.id, userId: myId },
        { channelId: channel.id, userId: otherId },
      ],
      skipDuplicates: true as boolean,
    });

    const dto = await channelDto(channel, myId, organizationId);
    emitToOrg(organizationId, "team_channel:new", dto);
    return created(res, dto);
  }),
);

/** List org members for the @mention / DM picker. */
router.get(
  "/members",
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const memberships = await prisma.membership.findMany({
      where: { organizationId, active: true },
      include: { user: true },
    });
    return ok(
      res,
      memberships.map((m) => ({
        id: m.userId,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        online: false, // presence is best-effort; we don't track it server-side
      })),
    );
  }),
);

/** Paginated message history. Cursor-based: pass `before=<messageId>` for older. */
router.get(
  "/channels/:id/messages",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const channel = await prisma.chatChannel.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!channel) throw new NotFoundError("Channel");

    const pageSize = Math.min(Number(req.query["pageSize"] ?? 50), 100);
    const before = req.query["before"] as string | undefined;

    let cursor: { id: string } | undefined;
    if (before) {
      const pivot = await prisma.chatMessage.findUnique({ where: { id: before } });
      if (pivot) cursor = { id: before };
    }

    const rows = await prisma.chatMessage.findMany({
      where: { channelId: channel.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    // Fetch reply-to bodies in one query
    const replyIds = rows.map((r) => r.replyToId).filter(Boolean) as string[];
    const replies = replyIds.length
      ? await prisma.chatMessage.findMany({ where: { id: { in: replyIds } } })
      : [];
    const replyMap = Object.fromEntries(replies.map((r) => [r.id, r.body]));

    return ok(
      res,
      rows.reverse().map((m) => messageDto(m, userId, m.replyToId ? replyMap[m.replyToId] : null)),
    );
  }),
);

const sendSchema = z.object({
  body: z.string().min(1).max(4000),
  replyToId: z.string().optional(),
});

/** Send a message. Auto-joins the sender if they aren't a member yet. */
router.post(
  "/channels/:id/messages",
  validate(sendSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const channel = await prisma.chatChannel.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!channel) throw new NotFoundError("Channel");
    if (channel.isPrivate) {
      const isMember = await prisma.chatMember.findUnique({
        where: { channelId_userId: { channelId: channel.id, userId } },
      });
      if (!isMember) throw new ForbiddenError("Not a member of this private channel");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { body, replyToId } = req.body as z.infer<typeof sendSchema>;

    // Auto-join public channel on first message
    await prisma.chatMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId } },
      create: { channelId: channel.id, userId },
      update: {},
    });

    let replyToBody: string | null = null;
    if (replyToId) {
      const parent = await prisma.chatMessage.findUnique({ where: { id: replyToId } });
      replyToBody = parent?.body ?? null;
    }

    const msg = await prisma.chatMessage.create({
      data: {
        channelId: channel.id,
        senderId: userId,
        senderName: user.name,
        senderAvatar: user.avatarUrl,
        body,
        replyToId: replyToId ?? null,
      },
    });

    // Update channel timestamp
    await prisma.chatChannel.update({
      where: { id: channel.id },
      data: { updatedAt: new Date() },
    });

    // Mark sender's read pointer current
    await prisma.chatMember.update({
      where: { channelId_userId: { channelId: channel.id, userId } },
      data: { lastReadAt: new Date() },
    });

    const dto = messageDto(msg, userId, replyToBody);
    emitToOrg(organizationId, "team_message:new", dto);
    return created(res, dto);
  }),
);

/** Toggle an emoji reaction on a message. */
router.post(
  "/channels/:id/messages/:mid/reactions",
  validate(z.object({ emoji: z.string().min(1).max(8) })),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { emoji } = req.body as { emoji: string };

    const msg = await prisma.chatMessage.findFirst({
      where: { id: req.params.mid, channel: { organizationId } },
    });
    if (!msg) throw new NotFoundError("Message");

    const map = (() => {
      try {
        return JSON.parse(msg.reactions) as Record<string, string[]>;
      } catch {
        return {};
      }
    })();

    const users: string[] = map[emoji] ?? [];
    if (users.includes(userId)) {
      map[emoji] = users.filter((u) => u !== userId);
      if (!map[emoji].length) delete map[emoji];
    } else {
      map[emoji] = [...users, userId];
    }

    const updated = await prisma.chatMessage.update({
      where: { id: msg.id },
      data: { reactions: JSON.stringify(map) },
    });

    const dto = messageDto(updated, userId);
    emitToOrg(organizationId, "team_message:updated", dto);
    return ok(res, dto);
  }),
);

/** Mark a channel as read (advances lastReadAt). */
router.post(
  "/channels/:id/read",
  asyncHandler(async (req, res) => {
    const { userId } = req.auth!;
    await prisma.chatMember.updateMany({
      where: { channelId: req.params.id, userId },
      data: { lastReadAt: new Date() },
    });
    return ok(res, { read: true });
  }),
);

export default router;
