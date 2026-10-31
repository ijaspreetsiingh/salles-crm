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

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  // The workspace loads every module on sign-in, so the ceiling has to be
  // comfortably above one full page load plus normal browsing.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(40),

  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(15),

  SEED_ON_START: bool(true),
  SEED_OWNER_EMAIL: z.string().email().default("owner@horizontravel.in"),
  SEED_OWNER_PASSWORD: z.string().min(6).default("Traveldesk@123"),
  /** The SaaS owner account that manages organisations and plans on /platform. */
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default("superadmin@traveldesk.io"),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(6).default("Superadmin@123"),

  LLM_PROVIDER: z.string().default("openai"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),

  /**
   * The daily email digest. The scheduler wakes up every few minutes and sends
   * to whichever organisation's local clock has passed its chosen hour; the
   * organisation-level switch in Settings decides whether anyone gets mail.
   */
  DIGEST_ENABLED: bool(true),
  DIGEST_CHECK_MINUTES: z.coerce.number().int().positive().default(15),

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

  /** Razorpay — real payment links and checkout. Empty = links are recorded, not charged. */
  RAZORPAY_KEY_ID: z.string().optional().default(""),
  RAZORPAY_KEY_SECRET: z.string().optional().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),

  /** Amadeus flight search. Empty = the adapter reports "not configured". */
  AMADEUS_CLIENT_ID: z.string().optional().default(""),
  AMADEUS_CLIENT_SECRET: z.string().optional().default(""),
  AMADEUS_HOST: z.string().default("https://test.api.amadeus.com"),
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
