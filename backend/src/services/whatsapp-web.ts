import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { env } from "../config/env";

type BaileysModule = typeof import("@whiskeysockets/baileys");
type WASocket = import("@whiskeysockets/baileys").WASocket;

/**
 * Baileys is published as ESM only, and this server compiles to CommonJS.
 * `require("@whiskeysockets/baileys")` therefore crashes at boot with
 * ERR_PACKAGE_PATH_NOT_EXPORTED and takes the whole API down with it.
 *
 * A dynamic import solves that, but the TypeScript/esbuild CommonJS transform
 * rewrites `import()` into `require()` — so the loader is built at runtime,
 * where no transform can see it. Nothing is loaded until someone actually
 * pairs a number.
 */
const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

let baileys: Promise<BaileysModule> | null = null;
const loadBaileys = (): Promise<BaileysModule> =>
  (baileys ??= importEsm("@whiskeysockets/baileys") as Promise<BaileysModule>);

/**
 * WhatsApp Web pairing (the same multi-device link WhatsApp Web itself uses).
 *
 * An agency with a normal WhatsApp Business number should not have to become a
 * Meta Cloud API developer before it can message a customer. This keeps one
 * session per organisation: the operator scans a QR once, and the socket sends
 * messages from the number they already use. Credentials stay on this server.
 */

export type WebSessionState = "idle" | "connecting" | "qr" | "connected" | "error";

type Session = {
  state: WebSessionState;
  qr: string | null;
  me: string | null;
  error: string | null;
  sock: WASocket | null;
  starting: boolean;
  startedAt: number;
  /** WhatsApp closes an unscanned pairing after a minute — reopen with a new QR. */
  restarts: number;
};

const sessions = new Map<string, Session>();
const sessionDir = (organizationId: string) =>
  path.join(process.cwd(), "data", "wa-sessions", organizationId.replace(/[^a-zA-Z0-9_-]/g, ""));

const blank = (): Session => ({
  state: "idle",
  qr: null,
  me: null,
  error: null,
  sock: null,
  starting: false,
  startedAt: 0,
  restarts: 0,
});

export function webSessionStatus(organizationId: string) {
  const session = sessions.get(organizationId) ?? blank();
  return {
    state: session.state,
    qr: session.qr,
    me: session.me,
    error: session.error,
    linked: session.state === "connected",
  };
}

/**
 * Opens the pairing socket. Resolves as soon as a QR is available (or the
 * session is already linked), so the settings page can show it immediately.
 */
export async function connectWebSession(
  organizationId: string,
): Promise<{ state: WebSessionState; qr: string | null; me: string | null; error: string | null }> {
  const existing = sessions.get(organizationId);
  if (existing?.state === "connected") return webSessionStatus(organizationId);
  if (existing?.starting) return webSessionStatus(organizationId);

  const session = existing ?? blank();
  session.state = "connecting";
  session.error = null;
  session.starting = true;
  sessions.set(organizationId, session);

  const dir = sessionDir(organizationId);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const {
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      makeWASocket,
      Browsers,
      DisconnectReason,
    } = await loadBaileys();
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.macOS("Desktop"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      ...(env.NODE_ENV === "production" ? {} : {}),
    });
    session.sock = sock;

    sock.ev.on("creds.update", () => {
      void saveCreds();
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        void QRCode.toDataURL(qr, { margin: 1, width: 320 })
          .then((dataUrl) => {
            session.qr = dataUrl;
            session.state = "qr";
            session.starting = false;
          })
          .catch((error: unknown) => {
            session.state = "error";
            session.error = error instanceof Error ? error.message : "Could not render the QR code";
            session.starting = false;
          });
      }

      if (connection === "open") {
        session.restarts = 0;
        session.state = "connected";
        session.qr = null;
        session.error = null;
        session.starting = false;
        session.me = sock.user?.id ?? null;
      }

      if (connection === "close") {
        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;
        const loggedOut = status === DisconnectReason.loggedOut;
        session.sock = null;
        session.starting = false;
        session.me = null;
        session.qr = null;
        if (loggedOut) {
          session.state = "idle";
          fs.rmSync(dir, { recursive: true, force: true });
          return;
        }

        // An unscanned pairing always closes after about a minute. Keep a fresh
        // QR on screen instead of making the operator press a button again.
        const retryable =
          status === DisconnectReason.restartRequired || status === 408 || status === undefined;
        if (retryable && session.restarts < 20) {
          session.state = "connecting";
          session.error = null;
          session.restarts += 1;
          sessions.set(organizationId, session);
          setTimeout(() => {
            const current = sessions.get(organizationId);
            if (!current || current.state === "connected") return;
            current.state = "idle";
            current.starting = false;
            void connectWebSession(organizationId);
          }, 1200);
          return;
        }

        session.state = "error";
        session.error =
          status === undefined
            ? "WhatsApp closed the connection — press Connect for a new QR"
            : `WhatsApp closed the connection (${status})`;
      }
    });

    // Wait for the first QR (or a link) for a reasonable window.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const state: WebSessionState = session.state;
      if (state !== "connecting") break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    session.starting = false;
    const settled: WebSessionState = session.state;
    if (settled === "connecting") {
      session.state = "error";
      session.error = "WhatsApp did not return a QR code — try again";
    }
    return webSessionStatus(organizationId);
  } catch (error) {
    session.state = "error";
    session.starting = false;
    session.error = error instanceof Error ? error.message : "Could not start the WhatsApp session";
    return webSessionStatus(organizationId);
  }
}

/** Sends a text through the linked session. Throws with a clear reason. */
export async function sendViaWebSession(
  organizationId: string,
  to: string,
  body: string,
): Promise<{ id: string | null }> {
  const session = sessions.get(organizationId);
  if (!session || session.state !== "connected" || !session.sock) {
    throw new Error("WhatsApp is not linked — scan the QR in Settings first");
  }
  const digits = to.replace(/[^\d]/g, "");
  if (digits.length < 8) throw new Error("Enter the number with country code, e.g. 919876543210");
  const jid = `${digits}@s.whatsapp.net`;
  const sent = await session.sock.sendMessage(jid, { text: body });
  return { id: sent?.key?.id ?? null };
}

/** Unlinks the device and removes the stored credentials. */
export async function disconnectWebSession(organizationId: string): Promise<void> {
  const session = sessions.get(organizationId);
  if (session?.sock) {
    try {
      await session.sock.logout();
    } catch {
      // The socket may already be gone; removing the files is what matters.
    }
  }
  sessions.delete(organizationId);
  fs.rmSync(sessionDir(organizationId), { recursive: true, force: true });
}
