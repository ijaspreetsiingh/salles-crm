/**
 * End-to-end check of the two-factor gate.
 *
 * Runs the real Express app in-process with TWO_FACTOR_ENFORCEMENT=true, so no
 * dev server or port is needed:
 *   npx tsx scripts/verify-two-factor.ts
 *
 * It registers a throwaway organisation, proves the workspace is refused until
 * an authenticator is enrolled, enrols one, proves sign-in now needs a code,
 * proves "sign out everywhere" kills the old access token, and finally deletes
 * everything it created.
 *
 * This is deliberately a script rather than a vitest file: it flips a
 * process-wide env flag, and a test file that does that can bleed into the
 * other suites when Vitest reuses a worker.
 */
import type { Db } from "../src/lib/prisma";

process.env.TWO_FACTOR_ENFORCEMENT = "true";
process.env.RUN_SCHEDULERS = "false";
process.env.SEED_ON_START = "false";
process.env.SEED_DEMO = "false";

const stamp = Date.now();
const email = `twofactor-verify-${stamp}@example.com`;
const password = "Traveldesk@123";

type Json = Record<string, unknown>;

const data = (body: Json) => (body?.data ?? {}) as Json;
const error = (body: Json) => (body?.error ?? {}) as Json;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  console.error(`  FAIL ${label}`, JSON.stringify(detail ?? "").slice(0, 600));
  process.exitCode = 1;
}

async function main() {
  // Imported after the env flags above are set: `config/env.ts` snapshots
  // `process.env` when it first loads.
  const [{ createApp }, supertest, { prisma }, { totpCode }] = await Promise.all([
    import("../src/app"),
    import("supertest"),
    import("../src/lib/prisma"),
    import("../src/lib/totp"),
  ]);
  const request = supertest.default;
  const app = createApp();

  // `npx tsx scripts/verify-two-factor.ts <orgId>` cleans up a previous run.
  const leftover = process.argv[2];
  if (leftover) {
    await cleanup(prisma, leftover, "");
    return;
  }

  console.log("Verifying two-factor enforcement in-process");

  const registered = await request(app).post("/api/v1/auth/register").send({
    organizationName: `2FA Verify ${stamp}`,
    name: "Verify Admin",
    email,
    password,
  });
  const session = data(registered.body as Json);
  check("registration succeeds", registered.status < 300, registered.body);
  const token = String(session.accessToken ?? "");
  check("registration returns an access token", token.length > 0);

  const organizationId = String((session.organization as Json | undefined)?.id ?? "");
  check("registration returns the organisation", organizationId.length > 0);

  const authGet = (path: string) => request(app).get(path).auth(token, { type: "bearer" });
  const authPost = (path: string) => request(app).post(path).auth(token, { type: "bearer" });

  const me = await authGet("/api/v1/auth/me");
  check("the new account can read its own profile", me.status === 200, me.body);
  const meUser = ((data(me.body as Json) as { user?: Json }).user ?? {}) as Json;
  check(
    "the profile says 2FA is required but not enabled",
    meUser.twoFactorRequired === true && meUser.twoFactorEnabled === false,
    meUser,
  );

  const blocked = await authGet("/api/v1/workspace/modules");
  check(
    "the workspace is refused before enrolment",
    blocked.status === 403 && error(blocked.body as Json).code === "two_factor_setup_required",
    blocked.body,
  );

  const setup = await authPost("/api/v1/auth/2fa/setup").send({});
  const secret = String(data(setup.body as Json).secret ?? "");
  check("setup returns a secret", setup.status === 200 && secret.length > 0, setup.body);

  const wrong = await authPost("/api/v1/auth/2fa/enable").send({ code: "000000" });
  check("a wrong code does not enable 2FA", wrong.status === 400, wrong.body);

  const enabled = await authPost("/api/v1/auth/2fa/enable").send({ code: totpCode(secret) });
  const recoveryCodes = (data(enabled.body as Json).recoveryCodes ?? []) as string[];
  check("a valid code enables 2FA", enabled.status === 200, enabled.body);
  check("ten recovery codes are issued once", recoveryCodes.length === 10);

  const workspace = await authGet("/api/v1/workspace/modules");
  check("the workspace opens after enrolment", workspace.status === 200, workspace.body);

  const status = await authGet("/api/v1/auth/2fa/status");
  const statusData = data(status.body as Json);
  check(
    "status reports enabled with recovery codes left",
    statusData.enabled === true && statusData.recoveryCodesRemaining === 10,
    status.body,
  );

  const noCode = await request(app).post("/api/v1/auth/login").send({ email, password });
  check(
    "sign-in without a code is refused",
    noCode.status === 401 && error(noCode.body as Json).code === "two_factor_required",
    noCode.body,
  );

  const withCode = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password, totp: totpCode(secret) });
  check("sign-in with a code succeeds", withCode.status === 200, withCode.body);

  const withRecovery = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password, recoveryCode: recoveryCodes[0] });
  check("a recovery code also signs in", withRecovery.status === 200, withRecovery.body);

  const afterRecovery = await authGet("/api/v1/auth/2fa/status");
  check(
    "the used recovery code is burned",
    data(afterRecovery.body as Json).recoveryCodesRemaining === 9,
    afterRecovery.body,
  );

  const signOutAll = await authPost("/api/v1/auth/logout-all").send({ password });
  check("sign out everywhere succeeds", signOutAll.status === 200, signOutAll.body);

  const stale = await authGet("/api/v1/workspace/modules");
  check("the old access token is rejected afterwards", stale.status === 401, stale.body);

  await cleanup(prisma, organizationId, email);
}

async function cleanup(db: Db, organizationId: string, email: string) {
  if (!organizationId) return;
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const userId = user?.id ?? null;
  try {
    await db.$transaction(async (tx) => {
      // Deliveries hang off the webhook, not the organisation.
      await tx.webhookDelivery.deleteMany({ where: { webhook: { organizationId } } });
      await tx.webhook.deleteMany({ where: { organizationId } });
      await tx.emailOutbox.deleteMany({ where: { organizationId } });
      await tx.auditLog.deleteMany({ where: { organizationId } });
      await tx.sequence.deleteMany({ where: { organizationId } });
      await tx.subscription.deleteMany({ where: { organizationId } });
      // The registering user is the only member of a throwaway organisation.
      const members = await tx.membership.findMany({ where: { organizationId } });
      await tx.membership.deleteMany({ where: { organizationId } });
      await tx.refreshToken.deleteMany({
        where: { userId: { in: [userId, ...members.map((m) => m.userId)].filter(Boolean) as string[] } },
      });
      await tx.role.deleteMany({ where: { organizationId } });
      await tx.branch.deleteMany({ where: { organizationId } });
      for (const id of new Set([userId, ...members.map((m) => m.userId)].filter(Boolean) as string[])) {
        await tx.user.delete({ where: { id } });
      }
      await tx.organization.delete({ where: { id: organizationId } });
    });
    console.log("  ok   throwaway organisation deleted");
  } catch (cleanupError) {
    console.warn("  warn cleanup left rows behind:", cleanupError);
  }
}

main()
  .catch((failure) => {
    console.error(failure);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
