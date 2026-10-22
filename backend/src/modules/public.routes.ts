import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok, created } from "../lib/http";
import { NotFoundError } from "../lib/errors";
import { validate } from "../middlewares/validate";
import { nextReference } from "../services/records";
import type { ModuleDef } from "../domain/modules";
import { sendEmail } from "../services/email";
import { env } from "../config/env";
import { sha256 } from "../lib/utils";

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
      organization: { name: organization.name, slug: organization.slug, supportEmail: organization.supportEmail },
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

    const reference = await nextReference(organization.id, {
      id: "leads",
      prefix: "LD",
    } as ModuleDef);

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
      message: "Thank you! Your enquiry is with our travel desk — we will reply within one working day.",
    });
  }),
);

export default router;
