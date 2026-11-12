import { prisma } from "../lib/prisma";
import { parseJson } from "../lib/utils";
import { BadRequestError } from "../lib/errors";

/**
 * Agent credit enforcement.
 *
 * `AgentAccount.creditUsed` used to move only when someone opened the agent
 * screen and pressed "charge". A booking created through the normal workspace
 * (or the public API) therefore bypassed the credit line entirely: the limit
 * was a number on a dashboard, not a control. These helpers make the booking
 * path itself refuse an over-limit sale.
 *
 * The charge is a conditional UPDATE, so two concurrent bookings cannot both
 * see "₹40,000 available" and each take ₹30,000.
 */

function agentRecordIdFrom(extraJson: string): string {
  const extra = parseJson<Record<string, unknown>>(extraJson || "{}", {});
  const raw = extra.agentRecordId ?? extra.agentId ?? extra.agentAccountRecordId;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Throws when the linked agent may not take this booking. */
export async function assertAgentCredit(
  organizationId: string,
  extraJson: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const recordId = agentRecordIdFrom(extraJson);
  if (!recordId) return;

  const account = await prisma.agentAccount.findFirst({
    where: { organizationId, recordId },
    select: { status: true, kycStatus: true, creditLimit: true, creditUsed: true },
  });
  // An agent record without an account has no credit line yet; do not invent
  // one here. The agent screen can create it explicitly.
  if (!account) return;

  if (account.status !== "Active") {
    throw new BadRequestError(`This agent is ${account.status.toLowerCase()} — bookings are blocked`);
  }
  if (account.kycStatus !== "verified") {
    throw new BadRequestError("KYC is not verified for this agent — clear it before extending credit");
  }
  if (account.creditLimit > 0 && account.creditUsed + amount > account.creditLimit + 0.005) {
    const available = Math.max(0, account.creditLimit - account.creditUsed);
    throw new BadRequestError(
      `Credit limit reached: ${available.toFixed(2)} available, ${amount.toFixed(2)} requested`,
    );
  }
}

/**
 * Atomically takes `amount` from the agent's credit line.
 *
 * Returns false when the line is exhausted (or the agent is not in a state to
 * buy). The caller deletes the just-created record in that case, so a refused
 * booking never lingers as an unposted sale.
 */
export async function chargeAgentCredit(
  organizationId: string,
  extraJson: string,
  amount: number,
): Promise<{ charged: boolean; recordId: string; accountId?: string }> {
  const recordId = agentRecordIdFrom(extraJson);
  if (!recordId || amount <= 0) return { charged: false, recordId };

  const account = await prisma.agentAccount.findFirst({
    where: { organizationId, recordId },
    select: { id: true, creditLimit: true },
  });
  if (!account) return { charged: false, recordId };
  if (account.creditLimit <= 0) {
    // No limit means "no credit line", not "unlimited": allow the booking but
    // still track what is owed.
    await prisma.agentAccount.update({
      where: { id: account.id },
      data: { creditUsed: { increment: amount } },
    });
    return { charged: true, recordId, accountId: account.id };
  }

  const updated = await prisma.agentAccount.updateMany({
    where: {
      id: account.id,
      status: "Active",
      kycStatus: "verified",
      creditUsed: { lte: account.creditLimit - amount },
    },
    data: { creditUsed: { increment: amount } },
  });
  if (updated.count === 0) return { charged: false, recordId, accountId: account.id };
  return { charged: true, recordId, accountId: account.id };
}

/** Puts money back when a credit sale is cancelled. */
export async function releaseAgentCredit(
  organizationId: string,
  extraJson: string,
  amount: number,
): Promise<void> {
  const recordId = agentRecordIdFrom(extraJson);
  if (!recordId || amount <= 0) return;
  const account = await prisma.agentAccount.findFirst({
    where: { organizationId, recordId },
    select: { id: true },
  });
  if (!account) return;

  // Never let the used line go below zero: a booking created before credit was
  // enforced was never charged, and releasing it must not create free credit.
  const released = await prisma.agentAccount.updateMany({
    where: { id: account.id, creditUsed: { gte: amount } },
    data: { creditUsed: { decrement: amount } },
  });
  if (released.count === 0) {
    await prisma.agentAccount.update({
      where: { id: account.id },
      data: { creditUsed: 0 },
    });
  }
}
