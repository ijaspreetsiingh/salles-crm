import { Router, type Response as ExpressResponse } from "express";
import { ServerResponse } from "http";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { NotFoundError } from "../lib/errors";
import { deriveNotifications } from "../services/notifications";

// SSE connections per organisation — keeps a live stream open so the frontend
// gets pushed notifications instead of polling.
// We store the raw Node.js response socket so we can write SSE frames directly.
type SseStream = {
  res: ExpressResponse;
  socket: NodeJS.WritableStream;
  lastPing: NodeJS.Timeout;
};

const sseConnections = new Map<string, Set<SseStream>>();

function getOrgConnections(organizationId: string): Set<SseStream> {
  let conns = sseConnections.get(organizationId);
  if (!conns) {
    conns = new Set();
    sseConnections.set(organizationId, conns);
  }
  return conns;
}

/** Broadcast a new notification to all open SSE streams for an organisation. */
export function broadcastNotification(organizationId: string, notification: {
  id: string;
  title: string;
  body: string;
  moduleId?: string;
  recordId?: string;
  level: string;
  createdAt: string;
}) {
  const conns = getOrgConnections(organizationId);
  const payload = `data: ${JSON.stringify(notification)}\n\n`;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  for (const { socket } of conns) {
    try {
      socket.write(bytes);
    } catch {
      // dead stream — will be cleaned up on next heartbeat
    }
  }
}

const router = Router();
router.use(requireAuth);

/** SSE stream: real-time notifications pushed to the frontend. */
router.get(
  "/stream",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");

    const socket = res.socket as NodeJS.WritableStream;
    const conns = getOrgConnections(organizationId);
    const ping = setInterval(() => {
      try {
        socket.write(": ping\n\n");
      } catch {
        clearInterval(ping);
        conns.delete({ res, socket, lastPing: ping });
      }
    }, 25_000);
    conns.add({ res, socket, lastPing: ping });

    req.on("close", () => {
      clearInterval(ping);
      conns.delete({ res, socket, lastPing: ping });
      if (conns.size === 0) sseConnections.delete(organizationId);
    });
  }),
);

/** Notification tray: persisted notifications plus live derived signals. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const [persisted, derived] = await Promise.all([
      prisma.notification.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      deriveNotifications(organizationId),
    ]);

    return ok(res, {
      items: persisted.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        moduleId: n.moduleId,
        recordId: n.recordId,
        level: n.level,
        read: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
      })),
      derived,
      unread: persisted.filter((n) => !n.readAt).length,
    });
  }),
);

router.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { organizationId: req.auth!.organizationId, readAt: null },
    });
    return ok(res, { unread: count });
  }),
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!notification) throw new NotFoundError("Notification");

    await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    return ok(res, { read: true });
  }),
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { organizationId: req.auth!.organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { read: result.count });
  }),
);

export default router;
