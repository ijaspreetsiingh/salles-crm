import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const domainSchema = z.object({
  customDomain: z.string().min(3).max(200).optional().nullable(),
});

/** Get the organisation's current white-label domain settings. */
router.get(
  "/domain",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, customDomain: true },
    });
    if (!organization) throw new NotFoundError("Organisation");
    return ok(res, organization);
  }),
);

/** Set / clear the organisation's white-label custom domain. */
router.put(
  "/domain",
  requireRole("company_admin"),
  validate(domainSchema),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof domainSchema>;
    const customDomain = body.customDomain ? body.customDomain.trim() : null;

    if (customDomain) {
      // Make sure no other org already owns this domain.
      const existing = await prisma.organization.findUnique({
        where: { customDomain },
      });
      if (existing && existing.id !== organizationId) {
        throw new BadRequestError("This domain is already in use by another organisation");
      }
    }

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { customDomain },
      select: { id: true, name: true, slug: true, customDomain: true },
    });

    await recordAudit({
      organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `White-label domain ${customDomain ? `set to ${customDomain}` : "cleared"}`,
      req,
    });

    return ok(res, organization);
  }),
);

/** Resolve an organisation by custom domain (used by reverse-proxy / subdomain routing). */
router.get(
  "/resolve/:domain",
  asyncHandler(async (req, res) => {
    const { domain } = req.params;
    const organization = await prisma.organization.findUnique({
      where: { customDomain: domain },
      select: { id: true, name: true, slug: true, customDomain: true, plan: true, planStatus: true },
    });
    if (!organization) throw new NotFoundError("Domain not found");
    return ok(res, organization);
  }),
);

export default router;
