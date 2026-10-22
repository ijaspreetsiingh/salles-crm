import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ok, asyncHandler } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError } from "../lib/errors";import { recordAudit } from "../services/audit";
import {
  maskSecret,
  resolveEmailAccount,
  resolveWhatsAppAccount,
  describeWhatsAppAccount,
} from "../services/channels";
import { sendEmail } from "../services/email";
import { sendWhatsApp } from "../services/whatsapp";
import { env } from "../config/env";
import { string } from "zod/v4";

const router = Router();

router.use(requireAuth);

const readOrgSettings = async (organizationId: string): Promise<Record<string, unknown>> => {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { settings: true },
  });
  try {
    return organization.settings ? (JSON.parse(organization.settings) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const writeOrgSettings = async (
  organizationId: string,
  patch: (settings: Record<string, unknown>) => Record<string, unknown>,
) => {
  const current = await readOrgSettings(organizationId);
  const next = patch(current);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: JSON.stringify(next) },
  });
};

/** The channel status for the settings page (secrets masked). */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const email = await resolveEmailAccount(organizationId);
    const whatsapp = await resolveWhatsAppAccount(organizationId);
    const emailSource =
      email && env.SMTP_HOST && email.user === env.SMTP_USER ? "env" : email ? "settings" : "none";
    return ok(res, {
      email: {
        configured: Boolean(email),
        source: emailSource,
        host: email?.host ?? "",
        user: email?.user ?? "",
        from: email?.from ?? "",
        hasPassword: Boolean(email?.pass),
      },
      whatsapp: {
        ...(describeWhatsAppAccount(whatsapp, organizationId)),
        phoneNumberId: whatsapp?.phoneNumberId ?? "",
        hasToken: Boolean(whatsapp?.token),
      },
    });
  }),
);

const emailSchema = z.object({
  host: z.string().min(3).max(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.coerce.boolean().default(false),
  user: z.string().min(3).max(200),
  /** Empty keeps the stored password; a value replaces it. */
  pass: z.string().max(200).optional(),
  from: z.string().max(200).optional(),
});

/** Saves the organisation's own SMTP account (Gmail app password, Zoho…). */
router.put(
  "/email",
  requireRole("company_admin"),
  validate(emailSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof emailSchema>;
    await writeOrgSettings(organizationId, (settings) => {
      const channels = (settings.channels ?? {}) as Record<string, unknown>;
      const previous = (channels.email ?? {}) as Record<string, unknown>;
      const pass = body.pass && body.pass !== "••••" ? body.pass : previous["pass"];
      if (!pass) throw new BadRequestError("A password/app-password is required");
      return {
        ...settings,
        channels: {
          ...channels,
          email: {
            host: body.host,
            port: body.port,
            secure: body.secure,
            user: body.user,
            pass,
            from: body.from || body.user,
          },
        },
      };
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `Email channel updated (${body.user})`,
      req,
    });
    return ok(res, { saved: true });
  }),
);

/** Removes the organisation's SMTP account (falls back to server env / queue). */
router.delete(
  "/email",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    await writeOrgSettings(organizationId, (settings) => {
      const channels = { ...((settings.channels ?? {}) as Record<string, unknown>) };
      delete channels.email;
      return { ...settings, channels };
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "Email channel removed",
      req,
    });
    return ok(res, { saved: true });
  }),
);

const whatsappSchema = z.object({
  phoneNumberId: z.string().min(4).max(40),
  /** Empty keeps the stored token. */
  token: z.string().max(500).optional(),
});

/** Saves the organisation's WhatsApp Cloud API credentials. */
router.put(
  "/whatsapp",
  requireRole("company_admin"),
  validate(whatsappSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof whatsappSchema>;
    await writeOrgSettings(organizationId, (settings) => {
      const channels = (settings.channels ?? {}) as Record<string, unknown>;
      const previous = (channels.whatsapp ?? {}) as Record<string, unknown>;
      const token =
        body.token && body.token !== maskSecret(previous["token"] as string ?? "")
          ? body.token
          : previous["token"];
      if (!token) throw new BadRequestError("A WhatsApp access token is required");
      return {
        ...settings,
        channels: {
          ...channels,
          whatsapp: { token, phoneNumberId: body.phoneNumberId },
        },
      };
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `WhatsApp channel updated (${body.phoneNumberId})`,
      req,
    });
    return ok(res, { saved: true });
  }),
);

/** Removes the organisation's WhatsApp credentials. */
router.delete(
  "/whatsapp",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    await writeOrgSettings(organizationId, (settings) => {
      const channels = { ...((settings.channels ?? {}) as Record<string, unknown>) };
      delete channels.whatsapp;
      return { ...settings, channels };
    });
    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: "WhatsApp channel removed",
      req,
    });
    return ok(res, { saved: true });
  }),
);

const testSchema = z.object({ to: z.string().min(5).max(200) });

/** Sends a real test email (or queues it honestly when no account is set). */
router.post(
  "/email/test",
  requireRole("company_admin"),
  validate(testSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const result = await sendEmail({
      organizationId,
      to: (req.body as z.infer<typeof testSchema>).to,
      subject: "Traveldesk test email",
      body: "This is a test email from your Traveldesk workspace. If you can read this, your email channel works.",
      template: "channel_test",
      userId: req.auth!.userId,
      relatedModule: "settings",
      relatedReference: "email-test",
    });
    return ok(res, result);
  }),
);

/** Sends a real test WhatsApp message (or queues it honestly). */
router.post(
  "/whatsapp/test",
  requireRole("company_admin"),
  validate(testSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const result = await sendWhatsApp({
      organizationId,
      to: (req.body as z.infer<typeof testSchema>).to,
      body: "This is a test message from your Traveldesk workspace — your WhatsApp channel is live. 🧳",
      template: "channel_test",
      userId: req.auth!.userId,
      relatedReference: "whatsapp-test",
    });
    return ok(res, result);
  }),
);

export default router;
