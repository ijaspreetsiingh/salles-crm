/**
 * Frontend socket.io client.
 *
 * One connection per browser session. Components call useSocket() to subscribe
 * to events; the connection is created lazily on first use and reused across
 * component re-mounts.
 */
import { io, type Socket } from "socket.io-client";
import { tokenStore, API_BASE_URL } from "./api/client";

let socket: Socket | null = null;

function getBaseUrl(): string {
  // Strip /api/v1 suffix — socket lives on the root HTTP server
  return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getBaseUrl(), {
      path: "/ws",
      transports: ["websocket", "polling"],
      auth: () => ({ token: tokenStore.access ?? "" }),
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
  }
  return socket;
}

/** Connect (or reconnect) with the current access token. */
export function connectSocket(): void {
  const s = getSocket();
  // Refresh auth token before reconnecting so a rotated token is used.
  (s.auth as Record<string, string>)["token"] = tokenStore.access ?? "";
  if (!s.connected) s.connect();
}

/** Graceful teardown — called on logout. */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
