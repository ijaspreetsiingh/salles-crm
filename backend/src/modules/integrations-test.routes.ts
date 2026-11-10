import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { resolveAmadeusAccount } from "../services/channels";
import { resolveHotelbedsAccount } from "../services/channels";
import { resolveRazorpayAccount } from "../services/channels";
import { resolveEmailAccount } from "../services/channels";
import { resolveWhatsAppAccount } from "../services/channels";
import { amadeusConfigured } from "../services/amadeus";
import { razorpayConfigured } from "../services/payments";
import { smtpConfigured } from "../services/email";
import { whatsappConfigured } from "../services/whatsapp";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("integrations", "view"));

/**
 * Connection test endpoints — let a workspace admin verify that their
 * credentials actually work before relying on them in production.
 *
 * Each endpoint returns { configured: boolean, ok: boolean, message: string }.
 * Nothing is sent or charged; these are read-only probes.
 */

router.get(
  "/amadeus",
  asyncHandler(async (req, res) => {
    const account = await resolveAmadeusAccount(req.auth!.organizationId);
    const creds = account
      ? { apiKey: account.apiKey, apiSecret: account.apiSecret, host: account.host }
      : null;
    if (!amadeusConfigured(creds)) {
      return ok(res, { configured: false, ok: false, message: "Amadeus credentials not configured. Add them in Workspace → Integrations." });
    }
    try {
      const { apiKey, apiSecret, host } = creds!;
      const baseUrl = host.replace(/\/$/, "");
      const tokenBody = new URLSearchParams({ grant_type: "client_credentials", client_id: apiKey, client_secret: apiSecret });
      const r = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Amadeus returned ${r.status}`);
      return ok(res, { configured: true, ok: true, message: "Amadeus connection successful." });
    } catch (err) {
      return ok(res, { configured: true, ok: false, message: (err as Error).message });
    }
  }),
);

router.get(
  "/hotelbeds",
  asyncHandler(async (req, res) => {
    const account = await resolveHotelbedsAccount(req.auth!.organizationId);
    const creds = account ? { apiKey: account.apiKey, secret: account.secret, env: account.env } : null;
    if (!creds?.apiKey || !creds?.secret) {
      return ok(res, { configured: false, ok: false, message: "Hotelbeds credentials not configured." });
    }
    try {
      const base = creds!.env === "production"
        ? "https://api.hotelbeds.com"
        : "https://api.test.hotelbeds.com";
      const signature = (await import("node:crypto")).createHash("sha256").update(creds!.apiKey + creds!.secret + Math.floor(Date.now() / 1000)).digest("hex");
      const r = await fetch(`${base}/hotel-api/1.0/status`, {
        headers: { "Api-key": creds!.apiKey, "X-Signature": signature, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Hotelbeds returned ${r.status}`);
      return ok(res, { configured: true, ok: true, message: "Hotelbeds connection successful." });
    } catch (err) {
      return ok(res, { configured: true, ok: false, message: (err as Error).message });
    }
  }),
);

router.get(
  "/razorpay",
  asyncHandler(async (req, res) => {
    const configured = await razorpayConfigured(req.auth!.organizationId);
    if (!configured) {
      return ok(res, { configured: false, ok: false, message: "Razorpay credentials not configured." });
    }
    return ok(res, { configured: true, ok: true, message: "Razorpay credentials present." });
  }),
);

router.get(
  "/email",
  asyncHandler(async (req, res) => {
    const configured = await smtpConfigured(req.auth!.organizationId);
    if (!configured) {
      return ok(res, { configured: false, ok: false, message: "SMTP credentials not configured." });
    }
    return ok(res, { configured: true, ok: true, message: "SMTP credentials present." });
  }),
);

router.get(
  "/whatsapp",
  asyncHandler(async (req, res) => {
    const configured = await whatsappConfigured(req.auth!.organizationId);
    if (!configured) {
      return ok(res, { configured: false, ok: false, message: "WhatsApp credentials not configured." });
    }
    return ok(res, { configured: true, ok: true, message: "WhatsApp credentials present." });
  }),
);

export default router;
