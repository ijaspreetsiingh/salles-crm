import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { NotFoundError } from "../lib/errors";
import { parseJson, randomToken, sha256, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(2).max(80),
  scopes: z.array(z.string()).default(["*"]),
});

/** API keys for integrations and the B2B agent portal. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: req.auth!.organizationId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return ok(
      res,
      keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: parseJson<string[]>(key.scopes, []),
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      })),
    );
  }),
);

router.post(
  "/",
  requireRole("company_admin"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const rawKey = `tdk_${randomToken(24)}`;

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: body.name,
        prefix: rawKey.slice(0, 12),
        keyHash: sha256(rawKey),
        scopes: stringifyJson(body.scopes),
      },
    });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Created",
      moduleId: "settings",
      label: `API key "${body.name}" created`,
      req,
    });

    // The raw key is returned exactly once.
    return created(res, { id: apiKey.id, name: apiKey.name, key: rawKey, scopes: body.scopes });
  }),
);

router.delete(
  "/:id",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!key) throw new NotFoundError("API key");

    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Deleted",
      moduleId: "settings",
      label: `API key "${key.name}" revoked`,
      req,
    });

    return ok(res, { revoked: true });
  }),
);

export default router;
