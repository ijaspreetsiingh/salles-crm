import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, created, ok } from "../lib/http";
import { requireAuth } from "../middlewares/auth";
import { requirePermission } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { recordAudit } from "../services/audit";
import { num } from "../lib/money";

/**
 * The B2B channel: agents, their credit and what they earn.
 *
 * Two numbers decide whether an agency can safely sell through a partner —
 * how much credit that partner still has, and what commission is owed. Both
 * live here, on the agent record, and both move only through this API so the
 * ledger and the credit line cannot disagree.
 */
const router = Router();
router.use(requireAuth);

const accountSchema = z.object({
  agencyName: z.string().max(160).optional(),
  contactName: z.string().max(160).optional(),
  creditLimit: z.coerce.number().min(0).max(1_000_000_000).optional(),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  commissionType: z.enum(["percent", "fixed"]).optional(),
  commissionRate: z.coerce.number().min(0).max(1_000_000).optional(),
  kycStatus: z.enum(["pending", "submitted", "verified", "rejected"]).optional(),
  kycNotes: z.string().max(2000).optional(),
  panNumber: z.string().max(20).optional(),
  gstin: z.string().max(20).optional(),
  contractFrom: z.string().max(20).optional(),
  contractTo: z.string().max(20).optional(),
  status: z.enum(["Active", "Suspended", "Inactive"]).optional(),
  notes: z.string().max(2000).optional(),
});

const accountDto = (row: {
  id: string;
  recordId: string;
  agencyName: string;
  contactName: string;
  creditLimit: number;
  creditUsed: number;
  creditDays: number;
  commissionType: string;
  commissionRate: number;
  kycStatus: string;
  kycNotes: string;
  panNumber: string;
  gstin: string;
  contractFrom: string;
  contractTo: string;
  status: string;
  notes: string;
  updatedAt: Date;
}) => ({
  ...row,
  creditAvailable: Math.round((row.creditLimit - row.creditUsed) * 100) / 100,
  creditUsedPercent:
    row.creditLimit > 0 ? Math.round((row.creditUsed / row.creditLimit) * 1000) / 10 : 0,
  updatedAt: row.updatedAt.toISOString(),
});

async function assertAgent(organizationId: string, recordId: string) {
  const record = await prisma.record.findFirst({
    where: { id: recordId, organizationId, moduleId: "agents", deletedAt: null },
  });
  if (!record) throw new NotFoundError("Agent");
  return record;
}

/** Returns the account, creating it the first time the agent is opened. */
async function loadOrCreate(organizationId: string, recordId: string) {
  const record = await assertAgent(organizationId, recordId);
  const existing = await prisma.agentAccount.findUnique({ where: { recordId: record.id } });
  if (existing) return { record, account: existing };
  const account = await prisma.agentAccount.create({
    data: {
      organizationId,
      recordId: record.id,
      agencyName: record.name,
      contactName: record.ownerName,
    },
  });
  return { record, account };
}

/** Every agent with its credit line and commission summary. */
router.get(
  "/",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;
    const records = await prisma.record.findMany({
      where: { organizationId, moduleId: "agents", deletedAt: null },
      orderBy: { name: "asc" },
      take: 500,
    });
    const accounts = await prisma.agentAccount.findMany({
      where: { organizationId, recordId: { in: records.map((r) => r.id) } },
    });
    const commissions = await prisma.agentCommission.groupBy({
      by: ["agentAccountId", "status"],
      where: { organizationId },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const byRecord = new Map(accounts.map((account) => [account.recordId, account]));
    const items = records.map((record) => {
      const account = byRecord.get(record.id);
      const rows = account ? commissions.filter((c) => c.agentAccountId === account.id) : [];
      const sum = (status: string) =>
        rows
          .filter((row) => row.status === status)
          .reduce((total, row) => total + num(row._sum.amount), 0);
      return {
        recordId: record.id,
        reference: record.reference,
        name: record.name,
        city: record.destination,
        recordStatus: record.status,
        account: account ? accountDto(account) : null,
        commission: {
          accrued: Math.round(sum("Accrued") * 100) / 100,
          approved: Math.round(sum("Approved") * 100) / 100,
          paid: Math.round(sum("Paid") * 100) / 100,
        },
      };
    });

    return ok(res, {
      items,
      totals: {
        agents: items.length,
        creditExtended: items.reduce((sum, item) => sum + (item.account?.creditLimit ?? 0), 0),
        creditUsed: items.reduce((sum, item) => sum + (item.account?.creditUsed ?? 0), 0),
        commissionOwed: items.reduce(
          (sum, item) => sum + item.commission.accrued + item.commission.approved,
          0,
        ),
        kycPending: items.filter((item) => (item.account?.kycStatus ?? "pending") === "pending")
          .length,
      },
    });
  }),
);

router.get(
  "/:recordId",
  requirePermission("view"),
  asyncHandler(async (req, res) => {
    const { record, account } = await loadOrCreate(req.auth!.organizationId, req.params.recordId);
    const commissions = await prisma.agentCommission.findMany({
      where: { organizationId: req.auth!.organizationId, agentAccountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(res, {
      agent: {
        id: record.id,
        reference: record.reference,
        name: record.name,
        status: record.status,
        email: record.email,
        phone: record.phone,
      },
      account: accountDto(account),
      commissions: commissions.map((row) => ({
        ...row,
        paidOn: row.paidOn?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      summary: {
        accrued: commissions
          .filter((c) => c.status === "Accrued")
          .reduce((s, c) => s + c.amount, 0),
        approved: commissions
          .filter((c) => c.status === "Approved")
          .reduce((s, c) => s + c.amount, 0),
        paid: commissions.filter((c) => c.status === "Paid").reduce((s, c) => s + c.amount, 0),
      },
    });
  }),
);

router.patch(
  "/:recordId",
  requirePermission("edit"),
  validate(accountSchema.partial()),
  asyncHandler(async (req, res) => {
    const { account } = await loadOrCreate(req.auth!.organizationId, req.params.recordId);
    const updated = await prisma.agentAccount.update({
      where: { id: account.id },
      data: req.body as Partial<z.infer<typeof accountSchema>>,
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "agents",
      recordId: req.params.recordId,
      label: `Agent terms updated for ${updated.agencyName}`,
      req,
    });
    return ok(res, accountDto(updated));
  }),
);

/**
 * Puts a booking on the agent's account. Refused when the credit line is gone
 * or the KYC is not cleared — the two things that keep a B2B channel solvent.
 */
router.post(
  "/:recordId/charge",
  requirePermission("edit"),
  validate(
    z.object({
      amount: z.coerce.number().positive().max(1_000_000_000),
      bookingReference: z.string().max(40).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { account } = await loadOrCreate(req.auth!.organizationId, req.params.recordId);
    const { amount, bookingReference } = req.body as { amount: number; bookingReference?: string };

    if (account.status !== "Active") {
      throw new BadRequestError(
        `This agent is ${account.status.toLowerCase()} — bookings are blocked`,
      );
    }
    if (account.kycStatus !== "verified") {
      throw new BadRequestError(
        "KYC is not verified for this agent — clear it before extending credit",
      );
    }
    if (account.creditLimit > 0 && account.creditUsed + amount > account.creditLimit) {
      const available = Math.max(0, account.creditLimit - account.creditUsed);
      throw new BadRequestError(
        `Credit limit reached: ${available.toFixed(2)} available, ${amount.toFixed(2)} requested`,
      );
    }

    const updated = await prisma.agentAccount.update({
      where: { id: account.id },
      data: { creditUsed: { increment: amount } },
    });
    await recordAudit({
      organizationId: req.auth!.organizationId,
      action: "Updated",
      moduleId: "agents",
      recordId: req.params.recordId,
      label: `${amount.toFixed(2)} charged${bookingReference ? ` for ${bookingReference}` : ""}`,
      req,
    });
    return ok(res, accountDto(updated));
  }),
);

/** Records a payment from the agent against the outstanding credit. */
router.post(
  "/:recordId/settle",
  requirePermission("edit"),
  validate(z.object({ amount: z.coerce.number().positive().max(1_000_000_000) })),
  asyncHandler(async (req, res) => {
    const { account } = await loadOrCreate(req.auth!.organizationId, req.params.recordId);
    const { amount } = req.body as { amount: number };
    const updated = await prisma.agentAccount.update({
      where: { id: account.id },
      data: { creditUsed: { decrement: Math.min(amount, account.creditUsed) } },
    });
    return ok(res, accountDto(updated));
  }),
);

/** Books commission on a sale. The rate comes from the agent's own terms. */
router.post(
  "/:recordId/commissions",
  requirePermission("create"),
  validate(
    z.object({
      bookingReference: z.string().max(40).optional(),
      description: z.string().max(200).optional(),
      saleAmount: z.coerce.number().min(0).max(1_000_000_000),
      rate: z.coerce.number().min(0).max(1_000_000).optional(),
      currency: z.string().max(6).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { account } = await loadOrCreate(req.auth!.organizationId, req.params.recordId);
    const body = req.body as {
      bookingReference?: string;
      description?: string;
      saleAmount: number;
      rate?: number;
      currency?: string;
    };
    const commissionType = account.commissionType;
    const rate = body.rate ?? account.commissionRate;
    const amount = commissionType === "percent" ? Math.round(body.saleAmount * rate) / 100 : rate;

    const row = await prisma.agentCommission.create({
      data: {
        organizationId: req.auth!.organizationId,
        agentAccountId: account.id,
        bookingReference: body.bookingReference ?? "",
        description: body.description ?? "",
        saleAmount: body.saleAmount,
        rate,
        commissionType,
        amount: Math.round(amount * 100) / 100,
        currency: body.currency || "INR",
      },
    });
    return created(res, {
      ...row,
      paidOn: null,
      createdAt: row.createdAt.toISOString(),
    });
  }),
);

router.patch(
  "/commissions/:id",
  requirePermission("edit"),
  validate(
    z.object({
      status: z.enum(["Accrued", "Approved", "Paid", "Cancelled"]).optional(),
      note: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await prisma.agentCommission.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Commission");
    const body = req.body as { status?: string; note?: string };
    const row = await prisma.agentCommission.update({
      where: { id: existing.id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.note !== undefined ? { notes: body.note } : {}),
        paidOn: body.status === "Paid" ? new Date() : body.status ? null : undefined,
      },
    });
    return ok(res, {
      ...row,
      paidOn: row.paidOn?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }),
);

router.delete(
  "/commissions/:id",
  requirePermission("delete"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.agentCommission.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId },
    });
    if (!existing) throw new NotFoundError("Commission");
    await prisma.agentCommission.delete({ where: { id: existing.id } });
    return ok(res, { deleted: true });
  }),
);

export default router;
