import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { validate } from "../middlewares/validate";
import { portalLookupLimiter } from "../middlewares/rateLimit";
import { nextReference } from "../services/records";
import type { ModuleDef } from "../domain/modules";
import { sendEmail } from "../services/email";
import { env } from "../config/env";
import { sha256 } from "../lib/utils";
import { generateInvoicePdf } from "../services/invoice-pdf";
import { parseJson } from "../lib/utils";
import jwt from "jsonwebtoken";
import { verifyUnsubscribeToken, unsubscribeEmail, unsubscribeUrl } from "../services/unsubscribe";

/**
 * Public lead capture — the one marketing feature that puts this CRM on the
 * map: every travel company gets a working "enquire now" form with zero code.
 * The submission becomes a real lead in the Leads module, the team is alerted
 * by email (or your SMTP/WhatsApp queues) and the journey begins at once.
 */
const router = Router();

const leadSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160).toLowerCase(),
  phone: z.string().max(30).optional(),
  destination: z.string().max(160).optional(),
  travellers: z.coerce.number().int().min(1).max(99).optional(),
  notes: z.string().max(2000).optional(),
});

/** Form metadata for the hosted lead page. */
router.get(
  "/lead-form/:slug",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!organization) throw new NotFoundError("Travel company");
    // A short public token ties the form to the org without leaking internals.
    const token = sha256(`${organization.id}:lead-form`).slice(0, 32);
    return ok(res, {
      organization: {
        name: organization.name,
        slug: organization.slug,
        supportEmail: organization.supportEmail,
      },
      token,
    });
  }),
);

router.post(
  "/lead-form/:slug",
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUnique({ where: { slug: req.params.slug } });
    if (!organization) throw new NotFoundError("Travel company");

    const body = req.body as z.infer<typeof leadSchema>;

    // Website enquiries can arrive in bursts — reference uniqueness matters
    // more than a perfect sequence, so retries add a time suffix on conflict.
    let reference = await nextReference(organization.id, {
      id: "leads",
      prefix: "LD",
    } as ModuleDef);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await prisma.record.findFirst({
        where: { organizationId: organization.id, reference },
        select: { id: true },
      });
      if (!existing) break;
      reference = `${reference}-${Date.now().toString(36).slice(-4)}`;
    }

    const record = await prisma.record.create({
      data: {
        organizationId: organization.id,
        moduleId: "leads",
        tab: "Hot",
        reference,
        name: body.name,
        detail:
          `${body.destination ? `${body.travellers ?? 1} traveller(s) · ${body.destination}` : `${body.travellers ?? 1} traveller(s)`}` +
          (body.phone ? ` · Phone ${body.phone}` : ""),
        destination: body.destination ?? "",
        date: new Date().toISOString().slice(0, 10),
        email: body.email,
        phone: body.phone ?? "",
        source: "Website",
        status: "New",
        notes: body.notes ?? "",
        extra: JSON.stringify({ leadSource: "Website form", via: "public_form" }),
        meta: JSON.stringify({ publicForm: true }),
      },
    });

    // Notify the company's support inbox (queued if SMTP is not set up yet).
    const owner = await prisma.membership.findFirst({
      where: { organizationId: organization.id, roleKey: "company_admin", active: true },
      include: { user: { select: { email: true } } },
    });
    if (owner?.user.email) {
      await sendEmail({
        organizationId: organization.id,
        to: owner.user.email,
        subject: `New enquiry ${reference} — ${body.name}`,
        body: [
          `New enquiry from your website form:`,
          "",
          `Name: ${body.name}`,
          `Email: ${body.email}`,
          `Phone: ${body.phone ?? "—"}`,
          `Destination: ${body.destination ?? "—"}`,
          `Travellers: ${body.travellers ?? 1}`,
          body.notes ? `Message: ${body.notes}` : "",
          "",
          `Open it in Traveldesk → ${env.APP_URL}/workspace/leads`,
        ]
          .filter(Boolean)
          .join("\n"),
        template: "new_lead",
        relatedModule: "leads",
        relatedReference: reference,
      });
    }

    return created(res, {
      ok: true,
      reference,
      message:
        "Thank you! Your enquiry is with our travel desk — we will reply within one working day.",
    });
  }),
);

/**
 * Customer portal lookup — a customer can look up their bookings by email +
 * booking reference. No password needed — the reference is secret enough.
 */
const customerLookupSchema = z.object({
  email: z.string().email().max(160).toLowerCase(),
  reference: z.string().min(2).max(40),
});

router.get(
  "/customer-portal/lookup",
  portalLookupLimiter,
  validate(customerLookupSchema, "query"),
  asyncHandler(async (req, res) => {
    const { email, reference } = req.query as z.infer<typeof customerLookupSchema>;

    // Find the organization via the booking reference + email match.
    // References are sequential per tenant (BK-2401 exists in many companies),
    // so a bare match could return a different agency's customer. Refuse to
    // guess when more than one organisation matches.
    const candidates = await prisma.record.findMany({
      where: {
        email,
        reference,
        deletedAt: null,
        moduleId: { in: ["bookings", "leads", "quotations", "finance"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (candidates.length === 0)
      throw new NotFoundError("No booking found with this email and reference");
    const organizationIds = [...new Set(candidates.map((r) => r.organizationId))];
    if (organizationIds.length > 1) {
      throw new BadRequestError(
        "That reference is used by more than one company. Please open the link your travel company sent you.",
      );
    }
    const record = candidates[0];
    if (!record) throw new NotFoundError("No booking found with this email and reference");

    // Find all related records for this customer (same email, same org)
    const related = await prisma.record.findMany({
      where: {
        organizationId: record.organizationId,
        email,
        deletedAt: null,
        moduleId: { in: ["bookings", "leads", "quotations", "finance"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const organization = await prisma.organization.findUnique({
      where: { id: record.organizationId },
    });

    return ok(res, {
      organization: {
        name: organization?.name ?? "Traveldesk",
        supportEmail: organization?.supportEmail ?? "",
        phone: organization?.phone ?? "",
        gstin: organization?.gstin ?? "",
        address: organization?.address ?? "",
      },
      customer: {
        name: record.name,
        email: record.email,
        phone: record.phone,
      },
      records: related.map((r) => ({
        id: r.id,
        reference: r.reference,
        moduleId: r.moduleId,
        name: r.name,
        destination: r.destination,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        date: r.date,
        notes: r.notes,
        canDownloadInvoice: r.moduleId === "finance" && r.status !== "Draft",
        /*
         * A signed, 7-day token replaces "reference + email" as the invoice
         * download credential. Invoice references are sequential, so letting
         * anyone who knows an email pull a PDF by guessing a reference is a
         * data leak, not a feature.
         */
        invoiceDownloadToken:
          r.moduleId === "finance" && r.status !== "Draft"
            ? jwt.sign(
                {
                  sub: "invoice-download",
                  org: r.organizationId,
                  reference: r.reference,
                  email,
                },
                env.JWT_ACCESS_SECRET,
                { audience: "invoice-download", expiresIn: "7d" },
              )
            : null,
      })),
    });
  }),
);

/**
 * Public invoice download.
 *
 * The credential is the signed token issued by the lookup above — never the
 * sequential reference. The token names one organisation, one invoice and one
 * email, so it cannot be reused to read somebody else's invoice.
 */
router.get(
  "/customer-portal/invoice/:token/download",
  asyncHandler(async (req, res) => {
    let claims: { sub: string; org: string; reference: string; email: string };
    try {
      claims = jwt.verify(req.params.token, env.JWT_ACCESS_SECRET, {
        audience: "invoice-download",
      }) as typeof claims;
    } catch {
      throw new NotFoundError("This invoice link has expired");
    }
    if (claims.sub !== "invoice-download") throw new NotFoundError("Invoice not found");

    const record = await prisma.record.findFirst({
      where: {
        organizationId: claims.org,
        reference: claims.reference,
        email: claims.email,
        moduleId: "finance",
        deletedAt: null,
        status: { not: "Draft" },
      },
    });
    if (!record) throw new NotFoundError("Invoice not found");

    const { stream, filename } = await generateInvoicePdf({
      organizationId: record.organizationId,
      reference: record.reference,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    stream.pipe(res);
  }),
);

/* ------------------------------------------------------------------ *
 * Unsubscribe
 * ------------------------------------------------------------------ */

/** One-click opt-out linked from every marketing email. */
router.get(
  "/unsubscribe/:token",
  asyncHandler(async (req, res) => {
    let claims: { org: string; email: string };
    try {
      claims = verifyUnsubscribeToken(req.params.token);
    } catch {
      res
        .status(410)
        .type("html")
        .send(
          "<!doctype html><meta charset=utf-8><title>Link expired</title><p style='font-family:system-ui;padding:40px'>This unsubscribe link has expired. Reply to the email and the team will remove you.</p>",
        );
      return;
    }

    const organization = await prisma.organization.findUnique({ where: { id: claims.org } });
    if (!organization) throw new NotFoundError("Travel company");

    await unsubscribeEmail(claims.org, claims.email);

    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    res
      .status(200)
      .type("html")
      .send(
        `<!doctype html><meta charset=utf-8><title>Unsubscribed</title><div style="font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px"><h1 style="font-size:20px">You're unsubscribed</h1><p style="color:#555;line-height:1.6">${escapeHtml(organization.name)} will no longer send marketing email to <strong>${escapeHtml(claims.email)}</strong>. Booking confirmations and invoices are not affected.</p></div>`,
      );
  }),
);

export default router;
