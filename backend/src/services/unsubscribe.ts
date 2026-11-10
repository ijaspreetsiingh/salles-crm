import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

/**
 * One-click unsubscribe links.
 *
 * Every marketing email must carry a way out that works without a login. The
 * link is a signed token: it names the organisation and the address, so the
 * recipient can only unsubscribe themselves and cannot enumerate other people.
 */

type UnsubscribeClaims = {
  sub: "unsubscribe";
  org: string;
  email: string;
};

const TTL = "120d";

export function signUnsubscribeToken(organizationId: string, email: string): string {
  return jwt.sign(
    { sub: "unsubscribe", org: organizationId, email: email.trim().toLowerCase() },
    env.JWT_ACCESS_SECRET,
    { audience: "unsubscribe", expiresIn: TTL },
  );
}

export function verifyUnsubscribeToken(token: string): UnsubscribeClaims {
  const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    audience: "unsubscribe",
  }) as UnsubscribeClaims;
  if (claims.sub !== "unsubscribe") throw new Error("Not an unsubscribe token");
  return claims;
}

export function unsubscribeUrl(organizationId: string, email: string): string {
  const base = (env.APP_URL || "").replace(/\/+$/, "");
  const token = signUnsubscribeToken(organizationId, email);
  return `${base}/api/v1/public/unsubscribe/${encodeURIComponent(token)}`;
}

/**
 * Records the opt-out in the same table the campaign audience already reads,
 * so the next send skips this address without any extra logic.
 */
export async function unsubscribeEmail(organizationId: string, email: string): Promise<void> {
  const contactEmail = email.trim().toLowerCase();
  const existing = await prisma.record.findFirst({
    where: { organizationId, email: contactEmail, deletedAt: null },
    select: { name: true, phone: true },
  });

  await prisma.consentRecord.upsert({
    where: { organizationId_contactEmail: { organizationId, contactEmail } },
    update: { email: false },
    create: {
      organizationId,
      contactEmail,
      contactName: existing?.name ?? "",
      contactPhone: existing?.phone ?? "",
      email: false,
      whatsapp: false,
      calls: false,
      source: "Unsubscribe link",
    },
  });
}
