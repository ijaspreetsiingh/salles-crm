import { Router } from "express";
import { z } from "zod";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import {
  listItineraryTemplates,
  getItineraryTemplate,
  listSightseeingEntries,
  createItineraryTemplate,
  createSightseeingEntry,
  importItineraryTemplates,
} from "../services/itinerary-catalog";

const asString = (v: unknown): string | undefined =>
  Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : undefined;

const router = Router();
router.use(requireAuth);

/* ------------------------------------------------------------------ *
 * Itinerary Templates
 * ------------------------------------------------------------------ */

const templateQuerySchema = z.object({
  destination: z.string().optional(),
  category: z.string().optional(),
  activeOnly: z.coerce.boolean().default(true).optional(),
});

router.get(
  "/templates",
  requirePermission("view"),
  validate(templateQuerySchema),
  asyncHandler(async (req, res) => {
    const templates = await listItineraryTemplates(req.auth!.organizationId, {
      destination: asString(req.query.destination),
      category: asString(req.query.category),
      activeOnly: req.query.activeOnly === "true",
    });
    return ok(res, { templates });
  }),
);

router.get(
  "/templates/:id",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const template = await getItineraryTemplate(req.params.id, req.auth!.organizationId);
    if (!template) throw new NotFoundError("Itinerary template");
    return ok(res, { template });
  }),
);

const templateDayInput = z.object({
  dayNumber: z.coerce.number().int().min(1),
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  activities: z.array(z.string()).optional(),
  meals: z.string().optional(),
});

const templateBodySchema = z.object({
  name: z.string().min(2).max(120),
  destination: z.string().min(2).max(120),
  nights: z.coerce.number().int().min(1).max(365),
  totalDays: z.coerce.number().int().min(1).max(365),
  travellers: z.coerce.number().int().min(1).max(100),
  category: z.string().min(1).max(60),
  pricePerPerson: z.coerce.number().min(0),
  currency: z.string().default("INR"),
  durationType: z.string().default("Fixed"),
  days: z.array(templateDayInput),
}).refine((body) => body.days.length === body.totalDays, {
  path: ["days"],
  message: "Add one day plan for every itinerary day",
});

router.post(
  "/templates",
  requirePermission("create"),
  validate(templateBodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof templateBodySchema>;
    const template = await createItineraryTemplate(req.auth!.organizationId, {
      name: body.name,
      destination: body.destination,
      nights: body.nights,
      totalDays: body.totalDays,
      travellers: body.travellers,
      category: body.category,
      pricePerPerson: body.pricePerPerson,
      currency: body.currency,
      durationType: body.durationType,
      dayPlans: body.days.map((d) => ({
        dayNumber: d.dayNumber,
        title: d.title,
        description: d.description,
        activities: d.activities ?? [],
        meals: d.meals,
      })),
    });
    return created(res, { template });
  }),
);

/* ------------------------------------------------------------------ *
 * Sightseeing Entries
 * ------------------------------------------------------------------ */

const sightseeingQuerySchema = z.object({
  city: z.string().optional(),
  category: z.string().optional(),
  activeOnly: z.coerce.boolean().default(true).optional(),
});

router.get(
  "/sightseeing",
  requirePermission("view"),
  validate(sightseeingQuerySchema),
  asyncHandler(async (req, res) => {
    const entries = await listSightseeingEntries(req.auth!.organizationId, {
      city: asString(req.query.city),
      category: asString(req.query.category),
      activeOnly: req.query.activeOnly === "true",
    });
    return ok(res, { sightseeing: entries });
  }),
);

const sightseeingBodySchema = z.object({
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  state: z.string().optional(),
  country: z.string().default("India"),
  category: z.string().min(1).max(60),
  durationHours: z.coerce.number().int().min(1).max(24).default(2),
  entryFee: z.coerce.number().min(0).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
});

router.post(
  "/sightseeing",
  requirePermission("create"),
  validate(sightseeingBodySchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof sightseeingBodySchema>;
    const sightseeing = await createSightseeingEntry(req.auth!.organizationId, body);
    return created(res, { sightseeing });
  }),
);

/* ------------------------------------------------------------------ *
 * Import (admin only)
 * ------------------------------------------------------------------ */

const importDayInput = z.object({
  dayNumber: z.coerce.number().int().min(1),
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  activities: z.array(z.string()).optional(),
  meals: z.string().optional(),
});

const importTemplateInput = z.object({
  name: z.string().min(1).max(120),
  destination: z.string().min(1).max(120),
  nights: z.coerce.number().int().min(1).max(365),
  totalDays: z.coerce.number().int().min(1).max(365),
  travellers: z.coerce.number().int().min(1).max(100),
  category: z.string().min(1).max(60),
  pricePerPerson: z.coerce.number().min(0),
  currency: z.string().default("INR"),
  days: z.array(importDayInput),
});

const importSchema = z.object({
  templates: z.array(importTemplateInput),
}).refine(
  (body) => body.templates.every((template) => template.days.length === template.totalDays),
  { path: ["templates"], message: "Each template needs one day plan per itinerary day" },
);

router.post(
  "/import",
  requirePermission("create"),
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof importSchema>;
    const count = await importItineraryTemplates(
      req.auth!.organizationId,
      body.templates.map((t) => ({
        name: t.name,
        destination: t.destination,
        nights: t.nights,
        totalDays: t.totalDays,
        travellers: t.travellers,
        category: t.category,
        pricePerPerson: t.pricePerPerson,
        currency: t.currency,
        dayPlans: t.days.map((d) => ({
          dayNumber: d.dayNumber,
          title: d.title,
          description: d.description,
          activities: d.activities ?? [],
          meals: d.meals,
        })),
      })),
    );
    return ok(res, { imported: count });
  }),
);

export default router;
