/**
 * User preferences — server-side key/value store for UI settings.
 *
 * Before this, layout preferences (theme, sidebar pinned, table density,
 * default landing module) lived only in localStorage. That means they reset
 * on browser clear, don't follow the user to a phone or another computer,
 * and differ between team members on shared devices.
 *
 * Valid keys (defined here so a rogue client can't store arbitrary data):
 *   theme            "light" | "dark" | "system"
 *   density          "comfortable" | "compact"
 *   sidebarPinned    "true" | "false"
 *   landingModule    module id (e.g. "leads")
 *   language         "en" | "hi" | "es" | "fr" | "ar"
 *   notifyDigest     "true" | "false"
 *   recordsPerPage   "25" | "50" | "100"
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import { BadRequestError } from "../lib/errors";
import { cuid } from "../lib/utils";

const router = Router();
router.use(requireAuth);

const ALLOWED_KEYS = new Set([
  "theme",
  "density",
  "sidebarPinned",
  "landingModule",
  "language",
  "notifyDigest",
  "recordsPerPage",
]);

const setSchema = z.object({
  key: z.string().min(1).max(60),
  value: z.string().max(200),
});

const setBulkSchema = z.object({
  prefs: z.array(setSchema).max(20),
});

/** Returns all preferences for the current user as a plain key→value map. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;

    const rows = await prisma.preference.findMany({
      where: { organizationId, userId },
    });

    const prefs: Record<string, string> = {};
    for (const row of rows) {
      prefs[row.key] = row.value;
    }

    return ok(res, { prefs });
  }),
);

/** Sets a single preference value. */
router.put(
  "/:key",
  validate(z.object({ value: z.string().max(200) })),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { key } = req.params;
    const { value } = req.body as { value: string };

    if (!ALLOWED_KEYS.has(key)) {
      throw new BadRequestError(
        `"${key}" is not a recognised preference key. Valid: ${[...ALLOWED_KEYS].join(", ")}`,
      );
    }

    await prisma.preference.upsert({
      where: { organizationId_userId_key: { organizationId, userId, key } },
      create: { id: cuid(), organizationId, userId, key, value },
      update: { value },
    });

    return ok(res, { key, value });
  }),
);

/** Sets multiple preferences in one round trip (called on workspace load to sync). */
router.put(
  "/",
  validate(setBulkSchema),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth!;
    const { prefs } = req.body as z.infer<typeof setBulkSchema>;

    const invalid = prefs.filter((p) => !ALLOWED_KEYS.has(p.key));
    if (invalid.length > 0) {
      throw new BadRequestError(
        `Unknown preference keys: ${invalid.map((p) => p.key).join(", ")}. Valid: ${[...ALLOWED_KEYS].join(", ")}`,
      );
    }

    // Upsert each — Prisma doesn't support bulk upsert, but the list is short.
    await Promise.all(
      prefs.map((p) =>
        prisma.preference.upsert({
          where: { organizationId_userId_key: { organizationId, userId, key: p.key } },
          create: { id: cuid(), organizationId, userId, key: p.key, value: p.value },
          update: { value: p.value },
        }),
      ),
    );

    return ok(res, { saved: prefs.length });
  }),
);

export default router;
