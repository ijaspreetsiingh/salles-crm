import "dotenv/config";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v.toLowerCase() === "true" || v === "1"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().default("http://localhost:4000"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  PLATFORM_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:8080")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().default("file:./data/traveldesk.db"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(16, "JWT_ACCESS_SECRET must be at least 16 chars")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v.length >= 32,
      "JWT_ACCESS_SECRET must be at least 32 chars in production",
    ),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 chars")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v.length >= 32,
      "JWT_REFRESH_SECRET must be at least 32 chars in production",
    ),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * Session cookies are `Lax` by default, which is right when the app and the
   * API share a site (app.example.com + api.example.com). When they are on
   * different sites (a Netlify frontend calling a Render API) the browser
   * refuses to send a Lax cookie on the API request, so every refresh would
   * sign the person out. Set this to "none" in that deployment; `secure` is
   * forced on whenever the value is "none", because browsers reject it
   * otherwise.
   */
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  // The workspace loads every module on sign-in, so the ceiling has to be
  // comfortably above one full page load plus normal browsing.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(15),

  /**
   * ClamAV daemon for upload scanning. Empty = only the local EICAR test
   * signature is rejected; a real deployment should point this at clamd.
   */
  CLAMAV_HOST: z.string().optional().default(""),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /** Optional Sentry error reporting. Empty = errors stay in local logs only. */
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_ENVIRONMENT: z.string().optional().default(""),
  SENTRY_RELEASE: z.string().optional().default(""),

  /**
   * Demo data is a development convenience. It must never land in a real
   * workspace by accident, so the default is "on in development, off in
   * production" and production additionally needs SEED_DEMO=true.
   */
  SEED_ON_START: bool(process.env.NODE_ENV !== "production"),
  SEED_DEMO: bool(process.env.NODE_ENV !== "production"),

  /**
   * Issues short-lived customer portal links. Defaults to FRONTEND_URL so a
   * generated link always points at the app the customer is meant to open,
   * not at the API host.
   */
  PORTAL_URL: z.string().optional().default(""),

  SEED_OWNER_EMAIL: z.string().email().default("owner@horizontravel.in"),
  SEED_OWNER_PASSWORD: z
    .string()
    .min(8)
    .default("Traveldesk@123")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v !== "Traveldesk@123",
      "SEED_OWNER_PASSWORD must be changed from the default in production",
    ),
  /** The SaaS owner account that manages organisations and plans on /platform. */
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default("superadmin@traveldesk.io"),
  SEED_SUPER_ADMIN_PASSWORD: z
    .string()
    .min(8)
    .default("Superadmin@123")
    .refine(
      (v) => process.env.NODE_ENV !== "production" || v !== "Superadmin@123",
      "SEED_SUPER_ADMIN_PASSWORD must be changed from the default in production",
    ),

  LLM_PROVIDER: z.string().default("openai"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),

  /**
   * The daily email digest. The scheduler wakes up every few minutes and sends
   * to whichever organisation's local clock has passed its chosen hour; the
   * organisation-level switch in Settings decides whether anyone gets mail.
   */
  ENFORCE_SUBSCRIPTION: bool(process.env.NODE_ENV === "production"),

  /**
   * Two-factor enforcement for company admins, branch managers and finance.
   *
   * On by default in production. In development it stays off so a fresh clone
   * (and the seeded demo admin) can be opened without an authenticator app;
   * set `TWO_FACTOR_ENFORCEMENT=true` to exercise the gate locally.
   * Enrolment itself, and the per-account switch in Settings → Security, work
   * either way — this flag only decides whether the role is forced.
   */
  TWO_FACTOR_ENFORCEMENT: bool(process.env.NODE_ENV === "production"),

  /**
   * Refuse a password sign-in until the address has been verified. On in
   * production by default: an unverified address means password-reset mail and
   * invoices go to whoever typed the address, not necessarily its owner.
   * Existing sessions keep working until they expire; refresh is refused, so
   * the gate closes within one access-token lifetime.
   */
  REQUIRE_EMAIL_VERIFICATION: bool(process.env.NODE_ENV === "production"),

  /** Cloudflare Turnstile secret for the public lead form. Empty = no captcha. */
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  /** Public Turnstile site key, returned with the hosted form metadata. */
  TURNSTILE_SITE_KEY: z.string().optional().default(""),

  DIGEST_ENABLED: bool(true),
  DIGEST_CHECK_MINUTES: z.coerce.number().int().positive().default(15),

  /**
   * Token for `GET /api/v1/metrics`. Empty means the endpoint is served in
   * development and hidden in production, so a public deployment never leaks
   * request paths and memory numbers by accident.
   */
  METRICS_TOKEN: z.string().optional().default(""),

  /**
   * In-process schedulers (digest, follow-ups, interrupted-campaign cleanup)
   * assume a single API process. On a multi-node deployment set this to
   * "false" everywhere except one worker, so a digest is never sent twice.
   */
  RUN_SCHEDULERS: bool(true),

  /** SMTP — real email delivery. Empty = emails stay queued in the outbox. */
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),

  /** WhatsApp Business Cloud API (Meta). Empty = sends stay queued. */
  WHATSAPP_TOKEN: z.string().optional().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  /**
   * The Meta app secret used to verify `X-Hub-Signature-256` on inbound
   * webhooks. Without it the server cannot prove a POST really came from Meta,
   * so production refuses unsigned inbound messages.
   */
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  /**
   * The token Meta echoes back when it verifies the inbound webhook. Empty =
   * verification is refused, so a random caller cannot claim the number.
   */
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  /**
   * Shared secret for inbound email. Empty = the organisation slug alone
   * authenticates, which is enough for a provider that cannot set headers.
   */
  INBOUND_EMAIL_SECRET: z.string().optional().default(""),

  /** Razorpay — real payment links and checkout. Empty = links are recorded, not charged. */
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),

  /** Amadeus flight search. Empty = the adapter reports "not configured". */
  AMADEUS_CLIENT_ID: z.string().optional().default(""),
  AMADEUS_CLIENT_SECRET: z.string().optional().default(""),
  AMADEUS_HOST: z.string().default("https://test.api.amadeus.com"),

  /**
   * Hotelbeds hotel search API.
   * Sign up at https://developer.hotelbeds.com — sandbox is free.
   * Empty = live search disabled; contract rates are shown as fallback.
   */
  HOTELBEDS_API_KEY: z.string().optional().default(""),
  HOTELBEDS_SECRET: z.string().optional().default(""),
  /** "sandbox" (default) or "production" */
  HOTELBEDS_ENV: z.string().default("sandbox"),

  /**
   * Web Push (VAPID) for browser push notifications.
   * Generate once: npx web-push generate-vapid-keys
   * VAPID_PUBLIC_KEY is also exposed to the frontend via /api/v1/push/vapid-key
   */
  REDIS_URL: z.string().optional().default(""),
  VAPID_PUBLIC_KEY: z.string().optional().default(""),
  VAPID_PRIVATE_KEY: z.string().optional().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@traveldesk.io"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message instead of a cryptic runtime error later.
  console.error("✖ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
