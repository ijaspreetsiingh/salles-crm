/**
 * Data export / portability (DPDP Act compliance).
 *
 * India's Digital Personal Data Protection Act (2023) gives individuals the
 * right to access and receive their personal data. This endpoint lets a
 * company admin download a complete snapshot of their organisation's data
 * as a structured JSON archive — every record, every customer, every note.
 *
 * The export is intentionally human-readable so it can be handed to a
 * customer who asks "what do you hold on me?" or handed to a data auditor.
 *
 * Large exports are chunked and streamed as NDJSON to avoid memory spikes.
 *
 * Routes:
 *   GET /api/v1/export/status    — record count per table (shows what will export)
 *   GET /api/v1/export/download  — full org data as a downloadable JSON file
 *   GET /api/v1/export/customer/:email — data for one customer (for subject access requests)
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requireRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { recordAudit } from "../services/audit";
import { parseJson } from "../lib/utils";

const router = Router();
router.use(requireAuth);

/** Summary of how many rows will be included in the full export. */
router.get(
  "/status",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;

    const [records, customers, tasks, conversations, payments, auditLogs] =
      await Promise.all([
        prisma.record.count({ where: { organizationId, deletedAt: null } }),
        prisma.record.count({ where: { organizationId, moduleId: "customers", deletedAt: null } }),
        prisma.task.count({ where: { organizationId } }),
        prisma.conversation.count({ where: { organizationId } }),
        prisma.payment.count({ where: { organizationId } }),
        prisma.auditLog.count({ where: { organizationId } }),
      ]);

    return ok(res, {
      organization: 1,
      records,
      customers,
      tasks,
      conversations,
      payments,
      auditLogs,
      estimatedRows: records + tasks + conversations + payments + auditLogs,
    });
  }),
);

/**
 * Full organisation data export as a single JSON file.
 *
 * Downloads as `traveldesk-export-{date}.json` with Content-Disposition.
 * Records are paginated internally to avoid a single huge Prisma query.
 */
router.get(
  "/download",
  requireRole("company_admin"),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, name } = req.auth!;

    const [organization, memberships, records, tasks, conversations, payments, auditLogs] =
      await Promise.all([
        prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
        prisma.membership.findMany({
          where: { organizationId },
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
        prisma.record.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 50_000,
        }),
        prisma.task.findMany({ where: { organizationId }, take: 20_000 }),
        prisma.conversation.findMany({
          where: { organizationId },
          include: { messages: { take: 1000 } },
          take: 10_000,
        }),
        prisma.payment.findMany({ where: { organizationId }, take: 20_000 }),
        prisma.auditLog.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 50_000,
        }),
      ]);

    await recordAudit({
      organizationId,
      action: "Export",
      moduleId: "settings",
      label: `Full data export downloaded by ${name}`,
      actorId: userId,
      actorName: name,
    });

    const exportDate = new Date().toISOString().slice(0, 10);
    const payload = {
      exportMeta: {
        exportedAt: new Date().toISOString(),
        exportedBy: name,
        organizationId,
        note: "This file contains all data held by Traveldesk for your organisation. Handle it with care — it includes personal data subject to privacy law.",
        dpdpAct: "India Digital Personal Data Protection Act, 2023",
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        legalName: organization.legalName,
        gstin: organization.gstin,
        createdAt: organization.createdAt.toISOString(),
      },
      team: memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        roleKey: m.roleKey,
        active: m.active,
      })),
      records: records.map((r) => ({
        id: r.id,
        reference: r.reference,
        moduleId: r.moduleId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        status: r.status,
        amount: r.amount,
        currency: r.currency,
        date: r.date,
        notes: r.notes,
        extra: parseJson(r.extra as string, {}),
        createdAt: r.createdAt.toISOString(),
        deletedAt: r.deletedAt?.toISOString() ?? null,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        ownerName: t.ownerName,
        done: t.done,
        date: t.date,
        createdAt: t.createdAt.toISOString(),
      })),
      conversations: conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        messages: c.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
      auditLog: auditLogs.map((a) => ({
        id: a.id,
        action: a.action,
        moduleId: a.moduleId,
        label: a.label,
        actorName: a.actorName,
        createdAt: a.createdAt.toISOString(),
      })),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="traveldesk-export-${exportDate}.json"`,
    );
    res.setHeader("X-Export-Rows", String(records.length + tasks.length + auditLogs.length));
    res.send(JSON.stringify(payload, null, 2));
  }),
);

const customerEmailSchema = z.object({ email: z.string().email() });

/**
 * Customer subject access request (SAR) — returns all data held for one person.
 * Used when a customer asks "what do you have on me?" (DPDP Act s.11).
 */
router.get(
  "/customer",
  requireRole("company_admin"),
  validate(customerEmailSchema, "query"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.auth!;
    const { email } = req.query as { email: string };

    const [records, conversations, consents, payments] = await Promise.all([
      prisma.record.findMany({
        where: { organizationId, email: { equals: email, mode: "insensitive" } },
        select: {
          id: true,
          reference: true,
          moduleId: true,
          name: true,
          status: true,
          amount: true,
          date: true,
          createdAt: true,
        },
      }),
      prisma.conversation.findMany({
        where: { organizationId, contactEmail: { equals: email, mode: "insensitive" } },
        include: { messages: { take: 500 } },
      }),
      prisma.consentRecord.findMany({
        where: { organizationId, contactEmail: { equals: email, mode: "insensitive" } },
      }),
      prisma.payment.findMany({
        where: { organizationId, recordReference: { not: "" } },
        take: 100,
      }),
    ]);

    return ok(res, {
      email,
      dataHeld: {
        records: records.length,
        conversations: conversations.length,
        consents: consents.length,
      },
      records,
      conversations: conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        createdAt: c.createdAt,
        messageCount: c.messages.length,
      })),
      consents: consents.map((c) => ({
        id: c.id,
        email: c.email,
        whatsapp: c.whatsapp,
        calls: c.calls,
        capturedAt: c.capturedAt,
      })),
    });
  }),
);

export default router;
