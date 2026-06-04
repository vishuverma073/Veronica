import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_ADMIN_SECRET: z.string().min(32),
  // Image upload (Task 1.8). Optional so the server boots without storage configured;
  // the upload endpoint returns 503 until both are set.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // MSG91 SMS OTP (Phase 3). Optional: when absent, sendOtp() runs in stub mode
  // (logs the code) so the OTP flow works in dev without burning SMS credits.
  MSG91_AUTH_KEY: z.string().min(1).optional(),
  MSG91_SENDER_ID: z.string().length(6).optional(),
  MSG91_TEMPLATE_ID: z.string().min(1).optional(),
  // MSG91 Flow template id for transactional order-update SMS (order confirmed
  // + tracking link). Optional: when absent, order SMS runs in stub mode (logs).
  MSG91_ORDER_TEMPLATE_ID: z.string().min(1).optional(),
  // Customer-facing storefront origin used to build order tracking links sent
  // by email/SMS. Defaults to the production domain.
  STOREFRONT_URL: z.string().url().default("https://veronicaindia.com"),
  // Customer auth JWTs (Phase 3). Generate via: openssl rand -hex 32
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("veronica-api"),
  // Upstash Redis for distributed OTP rate limiting (Phase 3). Optional — falls
  // back to an in-process sliding window when unset.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Razorpay checkout (Phase 4). Optional: when any is unset the checkout flow
  // runs in stub mode with dummy data (no real Razorpay account needed) — orders
  // are created locally, signatures verify against a known dummy secret. Find
  // these in the Razorpay dashboard → Settings → API Keys / Webhooks.
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Inngest async jobs (Phase 4). Optional: events are skipped in test/dev when
  // unset; the local `inngest-cli dev` server needs no keys.
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  // Resend transactional email (Phase 4). Optional: when unset, order emails are
  // logged instead of sent (stub mode).
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  // Observability (Phase 5). All optional — absent means that sink is skipped
  // (Sentry no-ops, Axiom logs to stdout only, Slack alerts are dropped).
  SENTRY_DSN: z.string().url().optional(),
  GIT_SHA: z.string().min(1).optional(),
  AXIOM_DATASET: z.string().min(1).optional(),
  AXIOM_TOKEN: z.string().min(1).optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate process environment. Throws with field-level messages
 * if anything required is missing or malformed.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
