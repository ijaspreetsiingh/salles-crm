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

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
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

  LLM_PROVIDER: z.string().default("openai"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
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
