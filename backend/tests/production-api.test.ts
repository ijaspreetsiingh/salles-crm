import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

/**
 * API + database regression tests for the production-gap work.
 *
 * These only run when TEST_DATABASE_URL points at a disposable, seeded
 * Postgres database. They create rows in that database (with unique names), so
 * never point them at a workspace anyone uses.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/traveldesk_test \
 *     npx vitest run tests/production-api.test.ts
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const canRun =
  Boolean(testDatabaseUrl) && /@(localhost|127\.0\.0\.1)[:/]/.test(testDatabaseUrl);

const ownerEmail = process.env.TEST_OWNER_EMAIL ?? "owner@horizontravel.in";
const ownerPassword = process.env.TEST_OWNER_PASSWORD ?? "Traveldesk@123";
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe.skipIf(!canRun)("production API regressions", () => {
  let app: Express;
  let prisma: typeof import("../src/lib/prisma").prisma;
  let token = "";
  let organizationId = "";
  let organizationSlug = "";

  const authed = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

  const get = (path: string) => authed(request(app).get(`/api/v1${path}`));
  const post = (path: string, body: unknown = {}) =>
    authed(request(app).post(`/api/v1${path}`)).send(body as object);
  const patch = (path: string, body: unknown = {}) =>
    authed(request(app).patch(`/api/v1${path}`)).send(body as object);

  beforeAll(async () => {
    // Set this before importing anything that constructs the Prisma client or
    // reads validated env (`REQUIRE_EMAIL_VERIFICATION` must be on at import).
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.NODE_ENV = "test";
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET ?? "test-access-secret-000000000000000000";
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-000000000000000000";
    process.env.SEED_ON_START = "false";

    const { createApp } = await import("../src/app");
    ({ prisma } = await import("../src/lib/prisma"));
    app = createApp();

    // Seeded owners are verified; make it explicit so an old seed cannot turn
    // every test into an email-verification failure.
    await prisma.user.updateMany({
      where: { email: ownerEmail.toLowerCase() },
      data: { emailVerified: true },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password: ownerPassword });
    if (login.status !== 200) {
      throw new Error(`Seed the test database first: ${JSON.stringify(login.body)}`);
    }
    token = login.body.data.accessToken;
    organizationId = login.body.data.membership.organizationId;
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    });
    organizationSlug = organization?.slug ?? "";
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  }, 30_000);

  it("enforces an agent's credit line and releases it on cancellation", async () => {
    const created = await post("/workspace/agents/records", {
      name: `Regression Agent ${run}`,
      email: `agent-${run}@example.com`,
    });
    expect(created.status).toBe(201);
    const agentId = created.body.data.id as string;

    // Opening the agent creates the account row.
    expect((await get(`/agents/${agentId}`)).status).toBe(200);
    const terms = await patch(`/agents/${agentId}`, {
      creditLimit: 1000,
      kycStatus: "verified",
      status: "Active",
    });
    expect(terms.status).toBe(200);

    const over = await post("/workspace/bookings/records", {
      name: `Over limit ${run}`,
      amount: 2000,
      extra: { agentRecordId: agentId },
    });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toMatch(/Credit limit reached/);

    const within = await post("/workspace/bookings/records", {
      name: `Within limit ${run}`,
      amount: 400,
      status: "Confirmed",
      extra: { agentRecordId: agentId },
    });
    expect(within.status).toBe(201);
    const bookingId = within.body.data.id as string;

    expect((await get(`/agents/${agentId}`)).body.data.account.creditUsed).toBe(400);

    const cancelled = await patch(`/workspace/bookings/records/${bookingId}`, {
      status: "Cancelled",
    });
    expect(cancelled.status).toBe(200);
    expect((await get(`/agents/${agentId}`)).body.data.account.creditUsed).toBe(0);
  });

  it("erases a customer's contact data and hides the record", async () => {
    const email = `erase-${run}@example.com`;
    const created = await post("/workspace/customers/records", {
      name: "Erase Me",
      email,
      phone: "+91 98190 01219",
      notes: "passport P1234567",
    });
    expect(created.status).toBe(201);
    const recordId = created.body.data.id as string;

    const erased = await post("/privacy/erasure", { email, reason: "regression test" });
    expect(erased.status).toBe(200);
    expect(erased.body.data.recordsErased).toBeGreaterThanOrEqual(1);

    expect((await get(`/workspace/customers/records/${recordId}`)).status).toBe(404);
    const row = await prisma.record.findUnique({ where: { id: recordId } });
    expect(row?.email).toBe("");
    expect(row?.phone).toBe("");
    expect(row?.notes).toBe("");
    expect(row?.deletedAt).toBeTruthy();

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId, action: "Erased" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("silently refuses honeypot leads and throttles duplicate submissions", async () => {
    const email = `lead-${run}@example.com`;

    const spam = await request(app)
      .post(`/api/v1/public/lead-form/${organizationSlug}`)
      .send({
        name: "Spam Bot",
        email,
        website: "http://spam.example",
        renderedAt: Date.now() - 5000,
      });
    expect(spam.status).toBe(200);
    expect(spam.body.data.reference).toBe("");
    expect(await prisma.record.count({ where: { organizationId, email } })).toBe(0);

    const normal = await request(app)
      .post(`/api/v1/public/lead-form/${organizationSlug}`)
      .send({ name: "Real Traveller", email, renderedAt: Date.now() - 5000 });
    expect(normal.status).toBe(201);
    const reference = normal.body.data.reference as string;
    expect(reference).toMatch(/^LD-/);

    const duplicate = await request(app)
      .post(`/api/v1/public/lead-form/${organizationSlug}`)
      .send({ name: "Real Traveller", email, renderedAt: Date.now() - 5000 });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.reference).toBe(reference);
    expect(await prisma.record.count({ where: { organizationId, email } })).toBe(1);
  });

  it("records attendance and returns it in the monthly view", async () => {
    const checkIn = await post("/attendance/check-in");
    expect(checkIn.status).toBe(200);
    expect(checkIn.body.data.checkIn).toBeTruthy();

    const checkOut = await post("/attendance/check-out");
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.data.checkOut).toBeTruthy();

    const me = await get("/attendance/me");
    expect(me.status).toBe(200);
    expect(me.body.data.days.length).toBeGreaterThanOrEqual(1);
  });

  it("issues a credit note, blocks over-crediting and nets it in GST returns", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await post("/workspace/finance/records", {
      name: `GST customer ${run}`,
      amount: 11800,
      date: today,
      status: "Sent",
      extra: { gstRate: 18, placeOfSupply: "27" },
    });
    expect(invoice.status).toBe(201);
    const invoiceReference = invoice.body.data.reference as string;

    const note = await post("/credit-notes", {
      invoiceReference,
      customerName: `GST customer ${run}`,
      amount: 1180,
      gstRate: 18,
      reason: "Regression refund",
      issuedOn: today,
    });
    expect(note.status).toBe(201);
    expect(note.body.data.currency).toBe("INR");
    expect(note.body.data.reference).toMatch(/^CN-/);
    const noteId = note.body.data.id as string;
    const noteReference = note.body.data.reference as string;

    const over = await post("/credit-notes", {
      invoiceReference,
      amount: 50000,
      gstRate: 18,
      reason: "Too much",
      issuedOn: today,
    });
    expect(over.status).toBe(400);
    expect(over.body.error.message).toMatch(/is left on/);

    const gstr1 = await get(`/gst/gstr1?from=${today}&to=${today}`);
    expect(gstr1.status).toBe(200);
    const row = gstr1.body.data.creditNotes.find(
      (entry: { creditNoteNumber: string }) => entry.creditNoteNumber === noteReference,
    );
    expect(row).toMatchObject({ taxable: 1000, igst: 0, cgst: 90, sgst: 90, total: 1180 });

    const gstr3b = await get(`/gst/gstr3b?from=${today}&to=${today}`);
    expect(gstr3b.status).toBe(200);
    expect(gstr3b.body.data.creditNotes.count).toBeGreaterThanOrEqual(1);
    expect(gstr3b.body.data.creditNotes.tax).toBeGreaterThanOrEqual(180);

    const csv = await get(`/gst/gstr1?format=csv&from=${today}&to=${today}`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("9B Credit note");
    expect(csv.text).toContain(noteReference);

    const applied = await post(`/credit-notes/${noteId}/apply`);
    expect(applied.status).toBe(200);
    expect(applied.body.data.status).toBe("applied");
  });

  it("blocks settlement of a variance until it is explicitly overridden", async () => {
    const supplierName = `Regression Supplier ${run}`;
    const matched = await post("/payables", {
      supplierName,
      amount: 1000,
      poAmount: 1000,
      receivedAmount: 1000,
      invoiceAmount: 1000,
      gstRate: 18,
    });
    expect(matched.status).toBe(201);
    const matchedId = matched.body.data.payable.id as string;

    const match = await post(`/payables/${matchedId}/match`);
    expect(match.status).toBe(200);
    expect(match.body.data.match.status).toBe("matched");
    expect((await post(`/payables/${matchedId}/payments`, { amount: 1000 })).status).toBe(201);

    const variance = await post("/payables", {
      supplierName,
      amount: 1000,
      poAmount: 1000,
      receivedAmount: 900,
      invoiceAmount: 1000,
      gstRate: 18,
    });
    expect(variance.status).toBe(201);
    const varianceId = variance.body.data.payable.id as string;
    const verdict = await post(`/payables/${varianceId}/match`);
    expect(verdict.body.data.match.status).toBe("variance");

    expect((await post(`/payables/${varianceId}/payments`, { amount: 1000 })).status).toBe(400);
    expect(
      (await post(`/payables/${varianceId}/payments`, { amount: 1000, overrideMatch: true })).status,
    ).toBe(201);
  });

  it("gates password login until the emailed token verifies the address", async () => {
    const email = `verify-${run}@example.com`;
    const password = `Zx9!${Math.random().toString(36).slice(2, 10)}Aa1`;

    const registered = await request(app).post("/api/v1/auth/register").send({
      organizationName: `Verify Org ${run}`,
      name: "Verify User",
      email,
      password,
    });
    expect(registered.status).toBe(201);
    const userId = registered.body.data.user.id as string;

    const denied = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("email_not_verified");

    const resent = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email });
    expect(resent.status).toBe(200);

    const { signEmailVerifyToken } = await import("../src/lib/jwt");
    const verified = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: signEmailVerifyToken(userId) });
    expect(verified.status).toBe(200);

    const allowed = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.emailVerified).toBe(true);
  });

  it("keeps the audit log append-only and has the trigram search indexes", async () => {
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    expect(audit).toBeTruthy();

    await expect(
      prisma.$executeRaw`UPDATE "AuditLog" SET label = 'tampered' WHERE id = ${audit!.id}`,
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${audit!.id}`,
    ).rejects.toThrow(/append-only/i);

    // Deleting an organisation must still cascade, otherwise the trigger would
    // make account deletion impossible.
    const temp = await prisma.organization.create({
      data: { name: `Cascade ${run}`, slug: `cascade-${run}` },
    });
    await prisma.auditLog.create({
      data: { organizationId: temp.id, action: "Created" },
    });
    await prisma.organization.delete({ where: { id: temp.id } });
    expect(
      await prisma.auditLog.count({ where: { organizationId: temp.id } }),
    ).toBe(0);

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Record'
    `;
    const names = indexes.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining(["Record_name_idx", "Record_detail_idx", "Record_destination_idx"]),
    );

    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    expect(extensions).toHaveLength(1);
  });

  it("consolidates foreign currency into the base currency without inventing rates", async () => {
    const { convertToBase, rateFor } = await import("../src/lib/fx");
    const ctx = {
      baseCurrency: "INR",
      rates: { INR: 1, USD: 84, EUR: 91 },
    };
    expect(convertToBase(100, "USD", ctx)).toBe(8400);
    expect(convertToBase(100, "INR", ctx)).toBe(100);
    expect(convertToBase(100, "GBP", ctx)).toBeNull();
    expect(rateFor("EUR", ctx)).toBe(91);
    expect(rateFor("GBP", ctx)).toBeNull();
  });
});
