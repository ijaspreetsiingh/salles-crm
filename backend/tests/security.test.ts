import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/services/payments";
import { permissionsForApiKeyScopes } from "../src/domain/rbac";
import { isSecretKey, maskValue, redactSecrets } from "../src/lib/redact";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../src/services/unsubscribe";

const sign = (body: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(body).digest("hex");

/**
 * Payment webhooks move money, so the two things that must never drift are:
 * the bytes that were signed are the bytes that were verified, and a secret
 * that is missing or wrong fails closed instead of throwing a 500.
 */
describe("Razorpay webhook signature", () => {
  const secret = "whsec_company_specific_0001";

  it("accepts a signature computed over the exact raw body", async () => {
    const raw = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}';
    await expect(verifyWebhookSignature(raw, sign(raw, secret), secret)).resolves.toBe(true);
  });

  it("rejects a signature made with a different organisation's secret", async () => {
    const raw = '{"event":"payment.captured"}';
    await expect(
      verifyWebhookSignature(raw, sign(raw, "whsec_someone_else"), secret),
    ).resolves.toBe(false);
  });

  it("refuses an unparseable/absent secret or signature", async () => {
    const raw = '{"event":"payment.captured"}';
    await expect(verifyWebhookSignature(raw, undefined, secret)).resolves.toBe(false);
    await expect(verifyWebhookSignature(raw, sign(raw, secret), "")).resolves.toBe(false);
  });

  it("returns false instead of throwing on a truncated signature", async () => {
    // timingSafeEqual throws on a length mismatch; a webhook must answer 400,
    // not crash the process with a 500.
    const raw = '{"event":"payment.captured"}';
    await expect(verifyWebhookSignature(raw, "deadbeef", secret)).resolves.toBe(false);
  });

  it("does not accept a signature over re-serialised JSON", async () => {
    // Exactly the bug raw-body capture exists to prevent: the same event,
    // different whitespace, different signature.
    const received = '{"event": "payment.captured", "id": "evt_1"}';
    const reserialised = JSON.stringify(JSON.parse(received));
    await expect(
      verifyWebhookSignature(received, sign(reserialised, secret), secret),
    ).resolves.toBe(false);
  });
});

/**
 * An API key is a machine identity that usually lives in someone else's
 * dashboard. Granting it the power to delete records or approve refunds by
 * default is how an integration leak becomes a money loss.
 */
describe("API key scopes", () => {
  it("defaults to read-only", () => {
    const permissions = permissionsForApiKeyScopes([]);
    expect(permissions.actions).toEqual(["view", "export"]);
  });

  it("write allows create/edit but never delete or approve", () => {
    const permissions = permissionsForApiKeyScopes(["read", "write"]);
    expect(permissions.actions).toContain("create");
    expect(permissions.actions).toContain("edit");
    expect(permissions.actions).not.toContain("delete");
    expect(permissions.actions).not.toContain("approve");
  });

  it("treats legacy wildcard keys as read + write, not admin", () => {
    const permissions = permissionsForApiKeyScopes(["*"]);
    expect(permissions.actions).toEqual(["view", "export", "create", "edit"]);
    expect(permissions.modules).toBe("*");
  });

  it("only an explicit admin scope grants everything", () => {
    expect(permissionsForApiKeyScopes(["admin"])).toEqual({ modules: "*", actions: "*" });
  });
});

describe("secret redaction", () => {
  it("recognises credential-shaped keys", () => {
    for (const key of ["password", "apiKey", "api_key", "keySecret", "webhookSecret", "token"]) {
      expect(isSecretKey(key)).toBe(true);
    }
    expect(isSecretKey("host")).toBe(false);
    expect(isSecretKey("port")).toBe(false);
  });

  it("masks nested credentials but keeps the shape readable", () => {
    const redacted = redactSecrets({
      email: { host: "smtp.zoho.in", port: 465, pass: "supersecretpass" },
      whatsapp: { phoneNumberId: "12345", token: "EAAG-long-lived-token" },
    });
    expect(redacted.email.host).toBe("smtp.zoho.in");
    expect(redacted.email.port).toBe(465);
    expect(redacted.email.pass).not.toContain("supersecretpass");
    expect(redacted.whatsapp.token).not.toContain("long-lived");
    // Short values must not be revealed by the mask either.
    expect(maskValue("abc")).toBe("••••");
  });
});

describe("unsubscribe links", () => {
  it("round-trips the organisation and the address", () => {
    const token = signUnsubscribeToken("org_1", "Priya@Example.com");
    const claims = verifyUnsubscribeToken(token);
    expect(claims.org).toBe("org_1");
    expect(claims.email).toBe("priya@example.com");
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken("org_1", "priya@example.com");
    const [header, payload, signature] = token.split(".");
    // Swap the address in the payload while keeping the original signature.
    const forged = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    forged.email = "someone-else@example.com";
    const tampered = [
      header,
      Buffer.from(JSON.stringify(forged), "utf8").toString("base64url"),
      signature,
    ].join(".");
    expect(() => verifyUnsubscribeToken(tampered)).toThrow();
  });
});
