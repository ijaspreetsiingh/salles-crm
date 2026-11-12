import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireModulePermission, requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);
router.use(requireModulePermission("settings", "view"));

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
      select: {
        id: true,
        name: true,
        slug: true,
        customDomain: true,
        plan: true,
        planStatus: true,
      },
    });
    if (!organization) throw new NotFoundError("Domain not found");
    return ok(res, organization);
  }),
);

/**
 * DNS verification for white-label domains.
 *
 * Checks whether a CNAME record points the custom domain at the platform.
 * Returns the DNS lookup result so the settings UI can show a green check
 * or a red "not configured yet" without the user leaving the page.
 */
router.get(
  "/check-dns/:domain",
  asyncHandler(async (req, res) => {
    const domain = req.params.domain;
    const target = process.env["PLATFORM_DOMAIN"] ?? "app.traveldesk.in";

    let resolved = false;
    let cnameTarget = "";
    let aRecords: string[] = [];

    try {
      const dns = await import("node:dns").then((m) => m.promises);
      // Check CNAME
      const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
      if (cnames.length > 0) {
        cnameTarget = cnames[0]!;
        resolved = cnames.some((c) => c.includes(target) || c.includes("traveldesk"));
      }
      // Check A records as fallback (direct IP)
      if (!resolved) {
        aRecords = await dns.resolve4(domain).catch(() => [] as string[]);
        resolved = aRecords.length > 0;
      }
    } catch {
      // DNS lookup failed — domain may not be configured yet
    }

    return ok(res, {
      domain,
      target,
      resolved,
      cnameTarget,
      aRecords,
      message: resolved
        ? `DNS resolves correctly — ${cnameTarget || aRecords.join(", ")}`
        : `No DNS record found for ${domain}. Add a CNAME pointing to ${target}.`,
    });
  }),
);

export default router;
