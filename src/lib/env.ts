import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3000"),

  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v24.0"),
  META_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/api/meta/callback"),
  META_PROVIDER: z.enum(["mock", "graph"]).default("mock"),
  META_SCOPES: z
    .string()
    .default("pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  OPENAI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),

  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  S3_PUBLIC_OR_SIGNED_MEDIA_BASE_URL: z.string().default(""),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),

  REEL_MAX_FILE_MB: z.coerce.number().int().positive().default(1024),
  REEL_MIN_DURATION_SEC: z.coerce.number().positive().default(3),
  REEL_MAX_DURATION_SEC: z.coerce.number().positive().default(90),
  REEL_MIN_WIDTH: z.coerce.number().int().positive().default(540),
  PUBLISH_WORKER_ID: z.string().default("worker-1"),

  EMAIL_PROVIDER_API_KEY: z.string().default(""),
  SENTRY_DSN: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parsed, validated server-side environment. Never import from client components. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
