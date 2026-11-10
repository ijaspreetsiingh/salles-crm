/**
 * Global socket.io server instance.
 *
 * Kept in one module so every service (inbox, WhatsApp inbound, team chat)
 * can emit events without importing the HTTP server.
 *
 * Rooms:
 *   org:<organizationId>          — every member of an organisation
 *   user:<userId>                 — private notifications
 *
 * Events emitted by the server:
 *   conversation:new              — a new conversation was created
 *   conversation:updated          — status / assignee changed
 *   message:new                   — a new message landed in a conversation
 *   team_message:new              — a new team-chat message
 *   team_channel:new              — a new team channel was created
 *   notification:new              — a personal notification
 */

import type { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { prisma } from "./prisma";
import { env } from "../config/env";
import jwt from "jsonwebtoken";
import type { AccessTokenPayload } from "./jwt";

let io: SocketServer | null = null;

/** Call once from index.ts after the HTTP server is created. */
export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    path: "/ws",
    transports: ["websocket", "polling"],
  });

  // Horizontal scaling: when REDIS_URL is set, bridge socket.io across
  // instances so a message emitted on one node reaches clients on another.
  if (env.REDIS_URL) {
    void (async () => {
      try {
        const { createAdapter } = await import("@socket.io/redis-adapter");
        const { createClient } = await import("redis");
        const pubClient = createClient({ url: env.REDIS_URL });
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io?.adapter(createAdapter(pubClient, subClient));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Redis adapter unavailable — running single-node", error);
      }
    })();

  }

  io.use(async (socket: Socket, next) => {
    try {
      // Tokens travel in the handshake auth payload only. Accepting them from
      // the query string would leak live access tokens into proxy/access logs.
      const raw = (socket.handshake.auth as Record<string, string>)["token"] ?? "";

      const payload = jwt.verify(raw, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

      // Confirm the membership still exists.
      const membership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: payload.sub,
            organizationId: payload.org,
          },
        },
      });
      if (!membership || !membership.active) return next(new Error("Unauthorized"));

      // Attach identity to every subsequent call.
      (socket as Socket & { auth: AccessTokenPayload }).auth = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const auth = (socket as Socket & { auth: AccessTokenPayload }).auth;
    const orgRoom = `org:${auth.org}`;
    const userRoom = `user:${auth.sub}`;

    void socket.join([orgRoom, userRoom]);

    socket.on("disconnect", () => {
      // nothing to clean up — socket.io handles the room membership
    });
  });

  return io;
}

/** Returns the live io instance. Throws if initSocket was never called. */
export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io not initialised — call initSocket first");
  return io;
}

/** Emit to every connected member of an organisation. */
export function emitToOrg(organizationId: string, event: string, data: unknown): void {
  try {
    getIO().to(`org:${organizationId}`).emit(event, data);
  } catch {
    // Server may not have socket.io during unit tests — emit is best-effort.
  }
}

/** Emit to a single user (their private room). */
export function emitToUser(userId: string, event: string, data: unknown): void {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch {
    // best-effort
  }
}
