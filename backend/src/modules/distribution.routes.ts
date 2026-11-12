/**
 * Website & Distribution — product catalogue, B2C/B2B portals, pages.
 *
 * Routes:
 *   GET    /distribution/catalogue            — public package list (B2C)
 *   GET    /distribution/catalogue/:id        — single package detail (B2C)
 *   POST   /distribution/enquiry              — B2C visitor submits a trip enquiry
 *   GET    /distribution/pages                — CMS pages list
 *   POST   /distribution/pages                — create page
 *   PATCH  /distribution/pages/:id            — update page
 *   DELETE /distribution/pages/:id            — delete page
 *   GET    /distribution/destinations         — destination list
 *   POST   /distribution/destinations         — create destination
 *   PATCH  /distribution/destinations/:id     — update destination
 *   GET    /distribution/b2b-portal/stats     — agent portal statistics
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { cuid, parseJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { applyBranchScope, toRecordDto } from "../services/records";

const router = Router();

// ─── Public catalogue (no auth — B2C visitors) ───────────────────────────────

/**
 * Published packages visible on the website.
 * Filtered to `status = "Published"` so draft packages stay invisible.
 */
router.get(
  "/catalogue",
  asyncHandler(async (req, res) => {
    // For public catalogue we need the org slug to scope it.
    const orgSlug = req.query.org as string | undefined;
    const destination = req.query.destination as string | undefined;
    const take = Math.min(Number(req.query.take ?? 20), 100);
    const q = (req.query.q as string | undefined)?.trim();

    // If org slug provided, scope to that org; otherwise return empty (B2C
    // always has a branded URL that knows its org).
    if (!orgSlug) return ok(res, { items: [], total: 0 });

    const org = await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } });
    if (!org) return ok(res, { items: [], total: 0 });

    const [items, total] = await Promise.all([
      prisma.record.findMany({
        where: {
          organizationId: org.id,
          moduleId: "packages",
          status: "Published",
          deletedAt: null,
          ...(destination ? { destination: { contains: destination, mode: "insensitive" } } : {}),
          ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { detail: { contains: q, mode: "insensitive" } }] } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, reference: true, name: true, detail: true, destination: true, amount: true, currency: true, extra: true, createdAt: true },
      }),
      prisma.record.count({
        where: { organizationId: org.id, moduleId: "packages", status: "Published", deletedAt: null },
      }),
    ]);

    return ok(res, {
      organization: org.name,
      total,
      items: items.map((r) => ({
        id: r.id,
        reference: r.reference,
        title: r.name,
        summary: r.detail,
        destination: r.destination,
        price: r.amount,
        currency: r.currency || "INR",
        nights: parseJson<Record<string, unknown>>(r.extra as string, {})["nights"] ?? null,
        imageUrl: parseJson<Record<string, unknown>>(r.extra as string, {})["imageUrl"] ?? null,
        highlights: parseJson<Record<string, unknown>>(r.extra as string, {})["highlights"] ?? [],
      })),
    });
  }),
);

router.get(
  "/catalogue/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.record.findFirst({
      where: { id: req.params.id, moduleId: "packages", status: "Published", deletedAt: null },
    });
    if (!item) throw new NotFoundError("Package");
    const extra = parseJson<Record<string, unknown>>(item.extra as string, {});
    return ok(res, {
      id: item.id,
      title: item.name,
      summary: item.detail,
      destination: item.destination,
      price: item.amount,
      currency: item.currency || "INR",
      nights: extra["nights"] ?? null,
      imageUrl: extra["imageUrl"] ?? null,
      highlights: extra["highlights"] ?? [],
      itinerary: extra["itinerary"] ?? [],
      inclusions: extra["inclusions"] ?? [],
      exclusions: extra["exclusions"] ?? [],
      terms: extra["terms"] ?? "",
    });
  }),
);

/** B2C visitor submits a trip enquiry — creates a lead. */
const enquirySchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  destination: z.string().max(160).optional(),
  packageId: z.string().optional(),
  message: z.string().max(2000).optional(),
  budget: z.number().min(0).optional(),
  travelDate: z.string().optional(),
  pax: z.number().int().min(1).max(100).optional(),
});

router.post(
  "/enquiry",
  validate(enquirySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof enquirySchema>;

    const org = await prisma.organization.findUnique({
      where: { slug: body.orgSlug },
      select: { id: true },
    });
    if (!org) return ok(res, { received: true }); // silent — don't reveal org existence

    // Find the HQ branch to assign to.
    const branch = await prisma.branch.findFirst({
      where: { organizationId: org.id, active: true },
      orderBy: { createdAt: "asc" },
    });

    const reference = `LD-WEB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId: org.id,
        moduleId: "leads",
        tab: "All leads",
        reference,
        name: body.name,
        detail: body.destination ?? "",
        destination: body.destination ?? "",
        email: body.email,
        phone: body.phone ?? "",
        amount: body.budget ?? 0,
        currency: "INR",
        date: body.travelDate ?? new Date().toISOString().slice(0, 10),
        status: "New",
        source: "Website",
        notes: body.message ?? "",
        branchId: branch?.id ?? null,
        branchName: branch?.name ?? "Head Office",
        extra: JSON.stringify({
          pax: body.pax ?? 1,
          packageId: body.packageId ?? null,
          source: "B2C website enquiry",
        }),
        meta: "{}",
      },
    });

    return ok(res, { received: true, reference: record.reference });
  }),
);

// ─── CMS pages (authenticated) ───────────────────────────────────────────────

router.use(requireAuth);

const pageSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens"),
  content: z.string().max(50000).default(""),
  metaTitle: z.string().max(160).optional(),
  metaDescription: z.string().max(320).optional(),
  status: z.enum(["Draft", "Published"]).default("Draft"),
  pageType: z.enum(["destination", "package", "general", "landing"]).default("general"),
});

router.get(
  "/pages",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: { organizationId, moduleId: "distribution", tab: "Website pages", deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return ok(res, rows.map((r) => {
      const extra = parseJson<Record<string, unknown>>(r.extra as string, {});
      return {
        id: r.id,
        title: r.name,
        slug: extra["slug"] ?? "",
        pageType: extra["pageType"] ?? "general",
        metaTitle: extra["metaTitle"] ?? "",
        metaDescription: extra["metaDescription"] ?? "",
        status: r.status,
        updatedAt: r.updatedAt.toISOString(),
      };
    }));
  }),
);

router.post(
  "/pages",
  requirePermission("create"),
  validate(pageSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof pageSchema>;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "distribution",
        tab: "Website pages",
        reference: `PG-${body.slug.slice(0, 10).toUpperCase()}`,
        name: body.title,
        detail: body.metaDescription ?? "",
        status: body.status,
        extra: JSON.stringify({
          slug: body.slug,
          content: body.content,
          metaTitle: body.metaTitle ?? body.title,
          metaDescription: body.metaDescription ?? "",
          pageType: body.pageType,
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    await recordAudit({ organizationId, action: "Created", moduleId: "distribution", recordId: record.id, label: `Page "${body.title}" created`, req });
    return created(res, toRecordDto(record));
  }),
);

router.patch(
  "/pages/:id",
  requirePermission("edit"),
  validate(pageSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof pageSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "distribution", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Page");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { name: body.title } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        extra: JSON.stringify({
          ...extra,
          ...(body.slug !== undefined ? { slug: body.slug } : {}),
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.metaTitle !== undefined ? { metaTitle: body.metaTitle } : {}),
          ...(body.metaDescription !== undefined ? { metaDescription: body.metaDescription } : {}),
          ...(body.pageType !== undefined ? { pageType: body.pageType } : {}),
        }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

router.delete(
  "/pages/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "distribution", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Page");
    await prisma.record.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return ok(res, { deleted: true });
  }),
);

// ─── Destinations ─────────────────────────────────────────────────────────────

const destinationSchema = z.object({
  name: z.string().min(1).max(100),
  country: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["Draft", "Published"]).default("Published"),
  highlights: z.array(z.string().max(200)).max(10).optional(),
});

router.get(
  "/destinations",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const rows = await prisma.record.findMany({
      where: { organizationId, moduleId: "distribution", tab: "Destinations", deletedAt: null },
      orderBy: { name: "asc" },
      take: 200,
    });
    return ok(res, rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      ...parseJson<Record<string, unknown>>(r.extra as string, {}),
    })));
  }),
);

router.post(
  "/destinations",
  requirePermission("create"),
  validate(destinationSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as z.infer<typeof destinationSchema>;

    const record = await prisma.record.create({
      data: {
        id: cuid(),
        organizationId,
        moduleId: "distribution",
        tab: "Destinations",
        reference: `DEST-${body.name.slice(0, 6).toUpperCase().replace(/\s/g, "")}`,
        name: body.name,
        detail: body.description ?? "",
        status: body.status,
        extra: JSON.stringify({
          country: body.country ?? "",
          imageUrl: body.imageUrl ?? "",
          highlights: body.highlights ?? [],
        }),
        meta: "{}",
        createdById: userId,
      },
    });

    return created(res, { id: record.id, name: record.name });
  }),
);

router.patch(
  "/destinations/:id",
  requirePermission("edit"),
  validate(destinationSchema.partial()),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const body = req.body as Partial<z.infer<typeof destinationSchema>>;

    const existing = await prisma.record.findFirst({
      where: { id: req.params.id, organizationId, moduleId: "distribution", deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Destination");

    const extra = parseJson<Record<string, unknown>>(existing.extra as string, {});
    await prisma.record.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { detail: body.description } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        extra: JSON.stringify({ ...extra, ...(body.country !== undefined ? { country: body.country } : {}), ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}), ...(body.highlights !== undefined ? { highlights: body.highlights } : {}) }),
        updatedById: userId,
      },
    });

    return ok(res, { updated: true });
  }),
);

/** B2B agent portal stats — bookings, commissions, top routes. */
router.get(
  "/b2b-portal/stats",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const [bookings, revenue] = await Promise.all([
      prisma.record.count({ where: { organizationId, moduleId: "bookings", status: "Confirmed", deletedAt: null } }),
      prisma.record.aggregate({ where: { organizationId, moduleId: "bookings", status: { in: ["Confirmed", "Completed"] }, deletedAt: null }, _sum: { amount: true } }),
    ]);
    return ok(res, {
      confirmedBookings: bookings,
      totalRevenue: Number(revenue._sum.amount ?? 0),
    });
  }),
);

export default router;
