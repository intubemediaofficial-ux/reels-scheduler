# Reels Scheduler — Assessment, Architecture & Plan

## 1. Repository assessment

`intubemediaofficial-ux/reels-scheduler` was created empty for this project. Existing
organisation repositories (music distribution dashboard, label websites, e-commerce,
micro-drama) contain no reusable Meta/Instagram integration, scheduling engine or
multi-tenant auth, so the app was scaffolded from scratch rather than forked.

Scaffold: `create-next-app` → **Next.js 16.3 (App Router, Turbopack, `proxy.ts`)**,
React 19, TypeScript 5 strict, Tailwind 4, ESLint 9. Notable Next 16 differences honoured
(see `node_modules/next/dist/docs/`): `middleware.ts` is now `proxy.ts`; `params` /
`searchParams` are Promises; generated `PageProps<"/route">` types via `next typegen`.

## 2. Proposed architecture

```
 Browser ──► Next.js (App Router)
             ├── Server Components   read-only, tenant-scoped via requireWorkspace()
             ├── Server Actions      every mutation; Zod-validated; RBAC checked server-side
             ├── Route Handlers      /api/auth/*, /api/meta/callback, /api/uploads/sign,
             │                        /api/meta/deauthorize, /api/health
             └── proxy.ts            optimistic auth redirect only (NOT authorization)
                        │
             ┌──────────┴───────────┐
          PostgreSQL (Prisma)     Redis (BullMQ)
                                       │
                               Worker process (separate Node entry, same codebase)
                               ├── publish queue: 1 job per PostDestination, idempotencyKey
                               ├── container poller (IG: create → poll FINISHED → publish)
                               ├── token health checks / expiry warnings
                               └── retention cleanup
                        │
     Provider abstractions (src/lib/providers/*), each with a typed mock
       meta/     MetaProvider   → GraphMetaProvider | MockMetaProvider (META_PROVIDER)
       ai/       CaptionProvider→ OpenAI | Mock                          (AI_PROVIDER)
       storage/  StorageProvider→ S3/R2 signed uploads | LocalDisk       (STORAGE_PROVIDER)
       queue/    QueueProvider  → BullMQ | InMemory (tests)
       email/    EmailProvider  → Brevo/Resend | Console
```

**Tenancy.** Every workspace-owned row carries `workspaceId`. All reads/writes go through
`requireWorkspace(slug, permission)` (`src/lib/tenant.ts`), which resolves the caller's
membership in one query and throws 404 for non-members (no slug enumeration) and 403 for
insufficient role. Services take the resulting `WorkspaceContext`, never a raw id from the
client.

**RBAC.** Single permission matrix in `src/lib/rbac.ts` (`can`, `canAssignRole`). UI hides
what the role cannot do, but the server re-checks on every action.

**Secrets.** OAuth tokens live in `OAuthCredential.encryptedToken` (AES-256-GCM,
`TOKEN_ENCRYPTION_KEY`), decrypted only inside the worker/route handler making the Graph
call. Audit metadata is passed through a redactor that strips `token|secret|password|…`
keys. Tokens never reach client components or logs.

**Publishing safety.** `PublishJob.idempotencyKey` is `UNIQUE`; `PostDestination` is
`UNIQUE(postId, socialAccountId)`. A job is claimed with a row lock + `lockedAt`, so two
workers cannot publish the same destination. Retries reuse the same job row with a new
`PublishAttempt`; only `PublishErrorClass` values marked retryable back off exponentially.

## 3. Database model (`prisma/schema.prisma`, 22 models)

| Area | Models |
|---|---|
| Identity | `User`, `Session`, `PasswordResetToken` |
| Tenancy | `Workspace`, `WorkspaceMember (UNIQUE workspaceId+userId)`, `Invitation`, `BrandKit` |
| Meta | `SocialConnection` (one per Facebook user OAuth), `SocialAccount` (Page / IG account, `UNIQUE workspaceId+platform+externalId`), `OAuthCredential` (encrypted tokens, scopes, expiry) |
| Media | `UploadBatch`, `MediaAsset` (`UNIQUE workspaceId+sha256` for duplicate detection, ffprobe fields), `SongMetadata` |
| Content | `Post` (status machine), `CaptionVersion` (AI + manual history), `CaptionTemplate` |
| Scheduling | `PostDestination`, `Schedule` (UTC instant + display timezone) |
| Publishing | `PublishJob` (idempotencyKey, lock), `PublishAttempt` (container id, error class, raw Meta error code) |
| Ops | `Notification`, `AuditLog` (workspace-scoped, actor nullable for system) |

Conventions: UUID PKs, `createdAt/updatedAt` everywhere, `deletedAt` soft-delete on User,
Workspace, SocialConnection/Account, MediaAsset, Post. Enums for every status/classification.

## 4. Milestone plan

| # | Scope | Status |
|---|---|---|
| 1 | Scaffold, schema + migration, Auth.js credentials (sign-up/in, reset), workspaces, invitations, RBAC, audit log, legal pages, tests, CI | **Done (this PR)** |
| 2 | Storage provider (S3/R2 signed multipart uploads + local), bulk drag-drop uploader, ffprobe inspection, configurable Reel validation, duplicate detection, content library, song metadata batch editor | Next |
| 3 | Brand Kit UI, `CaptionProvider` (OpenAI + mock), caption generator (3 variants, hashtags, CTA, EN/HI/Hinglish), templates, versions | |
| 4 | Meta OAuth (Facebook Login for Business), Page + IG account discovery, encrypted token storage, long-lived token exchange, health checks, disconnect/revoke, deauthorize callback | |
| 5 | Calendar (month/week/day/list), approval workflow + state machine, publishing queue (BullMQ), `MockMetaProvider` end-to-end | |
| 6 | `GraphMetaProvider`: IG Reel container → poll → publish; FB Page Reels; error classification, retries, idempotency, rate-limit handling | |
| 7 | Notifications, dashboard KPIs, full test matrix, security review | |
| 8 | Dockerfile + compose, deployment docs, Meta App Review checklist + reviewer instructions, final verification | |

## 5. External credentials / Meta setup required from you

Nothing is needed to run Milestones 1–3 or 5 (mock provider). Before Milestone 4/6:

1. **Meta developer account + Business app** at developers.facebook.com → add products
   *Facebook Login for Business* and *Instagram* (Graph API).
2. `META_APP_ID`, `META_APP_SECRET`; add `META_OAUTH_REDIRECT_URI` to *Valid OAuth
   Redirect URIs*; set *Data Deletion Callback URL* → `/api/meta/deauthorize` and
   Privacy Policy URL → `/privacy` (both pages exist in this PR).
3. **Business Verification** for the app's business portfolio.
4. **App Review** for the permissions the app requests — the current list to confirm
   against Meta's docs at implementation time is: `pages_show_list`,
   `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
   `instagram_content_publish`, `business_management` (only if needed for asset discovery).
   Permission names are not hard-coded yet; they will be configurable in Milestone 4.
5. Test users: in **Development mode** only app roles (admins/developers/testers) can
   authorise, and only Pages/IG accounts they own. Publishing to third-party customers
   requires **Live mode** after review — approval is not guaranteed.
6. Optional: `OPENAI_API_KEY`; S3/R2 bucket credentials; transactional email API key
   (Brevo key already exists in your secrets); `SENTRY_DSN`.

## 6. Risks / blockers

- **Meta App Review** is the critical path (typically weeks; may require screencast +
  business docs). Mitigated by the mock adapter so all product work proceeds in parallel.
- **API version drift**: `META_GRAPH_API_VERSION` is env-configured; the default must be
  re-verified against Meta's changelog before Milestone 6.
- **Instagram publishing limits** (documented as 100 API-published posts/24 h per account,
  to be re-confirmed) are enforced via `content_publishing_limit` at publish time.
- **Media hosting**: Meta fetches the video from a public URL; storage must serve signed,
  publicly reachable URLs long enough for container processing.
- **Rate limiter** is in-memory today; must move to Redis before multi-instance deploy (M5).
- **Email**: console provider only in M1; password-reset/invite links print to server logs.
- **Repo creation** needed manual action (GitHub App lacks `createRepository`).
