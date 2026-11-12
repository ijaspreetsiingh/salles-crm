import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { parseJson, randomToken, sha256, stringifyJson } from "../lib/utils";
import { recordAudit } from "../services/audit";
import { API_KEY_SCOPES } from "../domain/rbac";

const router = Router();
router.use(requireAuth, requireRole("company_admin", "branch_manager"));

const createSchema = z.object({
  name: z.string().min(2).max(80),
  // Least privilege by default: a new key can read, and nothing else until
  // the person creating it says so.
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1)
    .max(API_KEY_SCOPES.length)
    .default(["read"]),
  // Optional expiry. Empty means the key never expires.
  expiresAt: z.string().datetime().optional().nullable(),
  // Allowed client IPs/CIDRs (e.g. ["203.0.113.5", "10.0.0.0/8"]). Empty means any IP.
  allowedIps: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  allowedIps: z.array(z.string()).optional(),
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
        expiresAt: key.expiresAt,
        allowedIps: parseJson<string[]>(key.allowedIps, []),
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
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        allowedIps: stringifyJson(body.allowedIps),
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
    return created(res, {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      scopes: body.scopes,
      expiresAt: apiKey.expiresAt,
      allowedIps: body.allowedIps,
    });
  }),
);

/**
 * Rotate a key: issue a brand-new key and revoke the old one.
 *
 * Rotation is the safe way to change a compromised or ageing key: the old key
 * stops working immediately, and the new key carries the same name, scopes,
 * expiry and allowlist. Integration code just swaps the secret.
 */
router.post(
  "/:id/rotate",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, revokedAt: null },
    });
    if (!key) throw new NotFoundError("API key");

    const rawKey = `tdk_${randomToken(24)}`;

    const [rotated, replacement] = await prisma.$transaction([
      prisma.apiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      }),
      prisma.apiKey.create({
        data: {
          organizationId: key.organizationId,
          name: key.name,
          prefix: rawKey.slice(0, 12),
          keyHash: sha256(rawKey),
          scopes: key.scopes,
          expiresAt: key.expiresAt,
          allowedIps: key.allowedIps,
        },
      }),
    ]);

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Rotated",
      moduleId: "settings",
      label: `API key "${key.name}" rotated`,
      req,
    });

    return created(res, {
      id: rotated.id,
      name: rotated.name,
      key: rawKey,
      scopes: parseJson<string[]>(rotated.scopes, []),
      expiresAt: rotated.expiresAt,
      allowedIps: parseJson<string[]>(rotated.allowedIps, []),
    });
  }),
);

/** Update a key's name, scopes, expiry or allowed IPs. */
router.patch(
  "/:id",
  requireRole("company_admin"),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!key) throw new NotFoundError("API key");

    const body = req.body as z.infer<typeof updateSchema>;

    const data: {
      name?: string;
      scopes?: string;
      expiresAt: Date | null;
      allowedIps?: string;
    } = { expiresAt: key.expiresAt };

    if (body.name !== undefined) data.name = body.name;
    if (body.scopes !== undefined) data.scopes = stringifyJson(body.scopes);
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.allowedIps !== undefined) data.allowedIps = stringifyJson(body.allowedIps);

    const updated = await prisma.apiKey.update({ where: { id: key.id }, data });

    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "settings",
      label: `API key "${key.name}" updated`,
      req,
    });

    return ok(res, {
      id: updated.id,
      name: updated.name,
      prefix: updated.prefix,
      scopes: parseJson<string[]>(updated.scopes, []),
      expiresAt: updated.expiresAt,
      allowedIps: parseJson<string[]>(updated.allowedIps, []),
      lastUsedAt: updated.lastUsedAt,
      createdAt: updated.createdAt,
    });
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
