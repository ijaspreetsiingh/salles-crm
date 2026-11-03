import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/errors";
import { env } from "../config/env";
import { htmlToText, recordInboundMessage } from "../services/inbox-inbound";

/**
 * Inbound channel webhooks — no login, because the sender is Mailgun/Resend
 * or Meta, not a person.
 *
 * The organisation is identified by its slug in the URL, and the payload is
 * written into the shared inbox as a real inbound message. Both endpoints
 * answer with the thread they landed in, so a setup test can prove the wire
 * works instead of guessing.
 */
const router = Router();

const organizationBySlug = async (slug: string) => {
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) throw new NotFoundError("Travel company");
  return organization;
};

/* ------------------------------------------------------------------ *
 * WhatsApp Cloud API
 * ------------------------------------------------------------------ */

/**
 * Meta's verification handshake. It calls this once when you save the webhook
 * URL in the app dashboard and expects the challenge echoed back verbatim.
 */
router.get(
  "/whatsapp/:slug",
  asyncHandler(async (req, res) => {
    const mode = String(req.query["hub.mode"] ?? "");
    const token = String(req.query["hub.verify_token"] ?? "");
    const challenge = String(req.query["hub.challenge"] ?? "");

    if (!env.WHATSAPP_VERIFY_TOKEN) {
      throw new BadRequestError(
        "Set WHATSAPP_VERIFY_TOKEN on the server before verifying the WhatsApp webhook",
      );
    }
    if (mode !== "subscribe" || token !== env.WHATSAPP_VERIFY_TOKEN) {
      throw new ForbiddenError("Verification token did not match");
    }
    await organizationBySlug(req.params.slug);
    // Meta reads the body as plain text, not JSON.
    return res.status(200).send(challenge);
  }),
);

const whatsappPayload = z
  .object({
    entry: z
      .array(
        z.object({
          changes: z
            .array(
              z.object({
                value: z
                  .object({
                    contacts: z
                      .array(z.object({ profile: z.object({ name: z.string().optional() }).optional(), wa_id: z.string().optional() }))
                      .optional(),
                    messages: z
                      .array(
                        z.object({
                          id: z.string().optional(),
                          from: z.string().optional(),
                          timestamp: z.string().optional(),
                          type: z.string().optional(),
                          text: z.object({ body: z.string() }).optional(),
                          button: z.object({ text: z.string().optional() }).optional(),
                          interactive: z
                            .object({
                              button_reply: z.object({ title: z.string().optional() }).optional(),
                              list_reply: z.object({ title: z.string().optional() }).optional(),
                            })
                            .optional(),
                        }),
                      )
                      .optional(),
                  })
                  .optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

router.post(
  "/whatsapp/:slug",
  asyncHandler(async (req, res) => {
    const organization = await organizationBySlug(req.params.slug);
    const parsed = whatsappPayload.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Not a WhatsApp Cloud API payload");

    let accepted = 0;
    for (const entry of parsed.data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const name = value?.contacts?.[0]?.profile?.name ?? "";
        for (const message of value?.messages ?? []) {
          const body =
            message.text?.body ??
            message.button?.text ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            (message.type && message.type !== "text" ? `[${message.type} message]` : "");
          if (!body) continue;
          await recordInboundMessage({
            organizationId: organization.id,
            channel: "WhatsApp",
            contactName: name,
            contactPhone: message.from ?? "",
            body,
            externalId: message.id,
          });
          accepted += 1;
        }
      }
    }

    // Meta requires a 200 quickly; the work above is already done.
    return ok(res, { accepted });
  }),
);

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

/**
 * Inbound email, provider-neutral.
 *
 * Accepts the JSON body that Resend, Mailgun, Postmark and SendGrid forward
 * (they all send `from`, `subject` and either `text` or `html`), plus a plain
 * `{ from, subject, text }` from a custom script. If the server has a shared
 * secret configured, the provider must send it in `x-inbound-secret`.
 */
const emailPayload = z
  .object({
    from: z.union([z.string(), z.object({ email: z.string().optional(), name: z.string().optional() })]).optional(),
    sender: z.string().optional(),
    "from-name": z.string().optional(),
    fromName: z.string().optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
    "body-plain": z.string().optional(),
    html: z.string().optional(),
    "body-html": z.string().optional(),
    "stripped-text": z.string().optional(),
    messageId: z.string().optional(),
    "Message-Id": z.string().optional(),
  })
  .passthrough();

router.post(
  "/email/:slug",
  asyncHandler(async (req, res) => {
    const organization = await organizationBySlug(req.params.slug);

    if (env.INBOUND_EMAIL_SECRET) {
      const provided =
        req.header("x-inbound-secret") ??
        (typeof req.query.secret === "string" ? req.query.secret : "");
      if (provided !== env.INBOUND_EMAIL_SECRET) {
        throw new ForbiddenError("Inbound secret did not match");
      }
    }

    const parsed = emailPayload.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Not an inbound email payload");
    const payload = parsed.data;

    const fromField = payload.from;
    const rawFrom =
      typeof fromField === "string"
        ? fromField
        : fromField?.email ?? payload.sender ?? "";
    // "Aarti Sharma <aarti@example.com>" → address + name.
    const angleMatch = rawFrom.match(/^(.*?)<([^>]+)>$/);
    const contactEmail = (angleMatch ? angleMatch[2] : rawFrom).trim().toLowerCase();
    if (!contactEmail.includes("@")) throw new BadRequestError("Inbound email has no sender address");

    const contactName =
      (angleMatch ? angleMatch[1] : "").replace(/^"|"$/g, "").trim() ||
      payload.fromName ||
      payload["from-name"] ||
      contactEmail.split("@")[0];

    const body =
      payload.text ??
      payload["body-plain"] ??
      payload["stripped-text"] ??
      (payload.html || payload["body-html"] ? htmlToText(payload.html ?? payload["body-html"] ?? "") : "");

    const result = await recordInboundMessage({
      organizationId: organization.id,
      channel: "Email",
      contactName,
      contactEmail,
      subject: payload.subject ?? "",
      body,
      externalId: payload.messageId ?? payload["Message-Id"],
    });

    return ok(res, result);
  }),
);

/** Public setup info the settings screen uses to show the exact webhook URLs. */
router.get(
  "/setup/:slug",
  asyncHandler(async (req, res) => {
    const organization = await organizationBySlug(req.params.slug);
    return ok(res, {
      organization: organization.name,
      emailWebhook: `${env.APP_URL.replace(/\/$/, "")}/api/v1/inbound/email/${organization.slug}`,
      whatsappWebhook: `${env.APP_URL.replace(/\/$/, "")}/api/v1/inbound/whatsapp/${organization.slug}`,
      whatsappVerifyTokenSet: Boolean(env.WHATSAPP_VERIFY_TOKEN),
      emailSecretRequired: Boolean(env.INBOUND_EMAIL_SECRET),
    });
  }),
);

export default router;
