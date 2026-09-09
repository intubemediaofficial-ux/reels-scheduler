# Reels Scheduler

Multi-tenant SaaS for bulk-uploading, captioning, scheduling and publishing Reels to
Instagram Professional accounts and Facebook Pages through Meta's **official** Graph /
Instagram APIs. No scraping, no browser automation, no stored Instagram passwords.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the assessment, architecture,
data model, milestone plan, required Meta setup and risks.

## Status

End-to-end flow is implemented: bulk video upload with ffprobe validation and duplicate
detection → song metadata → Meta OAuth (Facebook Pages + linked Instagram Professional
accounts) → caption generation (template or OpenAI) → destinations → approval →
scheduling in the workspace timezone → durable publish worker with retries, publish
attempts, notifications, calendar and dashboard KPIs.

Providers default to **mock** mode (`META_PROVIDER=mock`, `AI_PROVIDER=mock`) so the whole
flow can be exercised without Meta credentials: "Connect Facebook" immediately creates a
fake Page + Instagram account, and publishing succeeds instantly (put `[fail]` or
`[retry]` in a caption to simulate Meta errors). Set `META_PROVIDER=graph` with
`META_APP_ID`/`META_APP_SECRET` for real publishing.

### Connecting Instagram / Facebook (real mode)

1. Create a Meta app (Business type) at developers.facebook.com; add **Facebook Login for
   Business** and set `APP_URL/api/meta/callback` as a valid OAuth redirect URI.
2. Your Instagram account must be Professional (Business/Creator) and linked to a Facebook
   Page. The app discovers Instagram accounts through the Pages you manage — it never asks
   for an Instagram password.
3. While the app is in Development mode only app admins/testers can connect.
   Business verification + App Review (`instagram_content_publish`, `pages_manage_posts`,
   …) are needed before other users can connect.

## Local setup

Requirements: Node 20+, PostgreSQL 14+, `ffprobe` (ffmpeg package).

```bash
cp .env.example .env
# set AUTH_SECRET and TOKEN_ENCRYPTION_KEY:  openssl rand -base64 32
createuser reels -P            # password: reels (dev only)
createdb -O reels reels_scheduler
createdb -O reels reels_scheduler_test

npm install
npm run db:migrate             # prisma migrate dev
npm run dev                    # http://localhost:3000
npm run worker                 # publish worker (separate process, polls every 10s)
```

Sign up, create a workspace, invite teammates from **Team & Roles**. Invitation and
password-reset emails are printed to the server console in development.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run worker` | Publish worker (`src/worker.ts`) — claims due `PublishJob`s with `FOR UPDATE SKIP LOCKED` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest — unit + DB integration tests (uses `DATABASE_URL`, defaults to `reels_scheduler_test`) |
| `npm run db:migrate` / `db:deploy` / `db:studio` | Prisma |

## Deployment (Docker-compatible)

The app is a standard Next.js server plus a worker process (`npm run worker`). Provide
the variables in `.env.example` as environment variables; run `npx prisma migrate deploy`
on release. With `STORAGE_PROVIDER=local` the app and worker must share
`STORAGE_LOCAL_DIR`; use `s3` for multi-host deployments. `docker-compose.dev.yml` starts
only the databases for local development.

## Security notes

- Server-side RBAC on every action (`src/lib/rbac.ts`, `src/lib/tenant.ts`); `proxy.ts`
  only performs optimistic redirects.
- OAuth tokens: AES-256-GCM at rest, never sent to the browser or logged.
- Password reset / invitation tokens stored as SHA-256 hashes; 1 h / 7 d expiry.
- Audit log redacts credential-like keys.
- Never commit `.env`.

## Legal pages

`/privacy`, `/terms`, `/data-deletion` — required by Meta App Review. Replace the
bracketed operator placeholders before going live.
