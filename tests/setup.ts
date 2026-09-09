process.env.DATABASE_URL ??= "postgresql://reels:reels@localhost:5432/reels_scheduler_test?schema=public";
process.env.AUTH_SECRET ??= "test-auth-secret-not-for-production";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.APP_URL ??= "http://localhost:3000";
process.env.META_PROVIDER ??= "mock";
process.env.AI_PROVIDER ??= "mock";
