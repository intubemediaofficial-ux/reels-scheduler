# Reels Scheduler

Multi-tenant SaaS for bulk-uploading, captioning, scheduling and publishing Reels to
Instagram Professional accounts and Facebook Pages through Meta's **official** Graph /
Instagram APIs. No scraping, no browser automation, no stored Instagram passwords.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the assessment, architecture,
data model, milestone plan, required Meta setup and risks.

## Status

Milestone 1 (auth, workspaces, RBAC, audit log, schema) is complete. Uploads, AI
captions, Meta OAuth and publishing arrive in the following milestones — the UI only
shows what actually works.

## Local setup

Requirements: Node 20+, PostgreSQL 14+, (Redis from Milestone 5), `ffprobe` (Milestone 2).

```bash
cp .env.example .env
# set AUTH_SECRET and TOKEN_ENCRYPTION_KEY:  openssl rand -base64 32
createuser reels -P            # password: reels (dev only)
createdb -O reels reels_scheduler
createdb -O reels reels_scheduler_test

npm install
npm run db:migrate             # prisma migrate dev
npm run dev                    # http://localhost:3000
```

Sign up, create a workspace, invite teammates from **Team & Roles**. Invitation and
password-reset emails are printed to the server console in development.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest — unit + DB integration tests (uses `DATABASE_URL`, defaults to `reels_scheduler_test`) |
| `npm run db:migrate` / `db:deploy` / `db:studio` | Prisma |

## Deployment (Docker-compatible)

The app is a standard Next.js server plus (from Milestone 5) a worker process, both
built from the same image. Provide the variables in `.env.example` as environment
variables; run `npx prisma migrate deploy` on release. A Dockerfile and `docker-compose`
for app + worker + Postgres + Redis are delivered in Milestone 8; `docker-compose.dev.yml`
here starts only the databases for local development.

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
