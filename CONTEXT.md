# GMAO — Session Context

## What this is
A GMAO (Computerized Maintenance Management System) built as a monorepo.
Full functional spec: GMAO_Description_Fonctionnelle.pdf
Data model: data_model.pdf
Tech stack decisions: stack.pdf

## Stack
- Backend: NestJS (TypeScript)
- Web: Next.js (App Router)
- Mobile: Expo React Native (not started)
- Database: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- File storage: MinIO
- Dev email: MailHog + Nodemailer + Handlebars
- Monorepo: Turborepo + pnpm workspaces

## Current state
- [x] Monorepo scaffold (Turborepo + pnpm workspaces)
- [x] packages/shared — all domain enums compiled
- [x] packages/db — full Prisma schema, migration applied
- [x] Docker infrastructure — postgres, redis, minio, mailhog
- [x] apps/backend — NestJS bootstrapped:
  - [x] ConfigModule (Joi validation, fail-fast on startup)
  - [x] PrismaModule (global)
  - [x] RedisModule (global, ioredis)
  - [x] AuthModule — login/refresh/logout, JWT + refresh token rotation, Redis revocation
  - [x] AuthModule — session inactivity timeout enforced from `SystemConfig` (`SESSION_IDLE_TIMEOUT_HOURS`) across refresh JWT expiry, Redis refresh-token TTL, and refresh cookie maxAge (with 7-day fallback on invalid config)
  - [x] MailModule — BullMQ queue, Nodemailer processor, Handlebars templates (setup-account, password-reset)
  - [x] SystemConfigModule — password policy, 14 config keys seeded
  - [x] UsersModule — Admin CRUD, setup token flow, deactivate/reactivate, resend setup
  - [x] Auth endpoints: /auth/setup, /auth/forgot-password, /auth/reset-password
  - [x] StorageModule — MinIO/S3 wrapper, multi-bucket, presigned URLs
  - [x] NotificationsModule — in-app + email notifications, global
  - [x] AssetsModule — locations, categories, assets, certificates, documents
  - [x] WorkOrdersModule — state machine, assignments, intervention logs, on-hold, validation, checklist, async PDF report generation on closure
- [x] AssetsModule — locations, categories, assets, certificates, documents, storage
- [x] AssetsModule — certificate expiry scheduler migrated to `@nestjs/schedule` (`@Timeout(0)` startup trigger + daily midnight `@Cron`) to replace legacy lifecycle `setInterval`
- [x] WorkOrdersModule — full state machine, assignments, intervention logs, on-hold, validation, checklist, automatic priority escalation for overdue WOs, async PDF report generation on closure
- [x] WorkOrdersModule — simultaneous maintenance authorization: `PATCH /work-orders/:id/authorize-simultaneous` (Supervisor) lifts the start-block when an asset already has an active WO; writes a status-log audit entry; notifies the principal technician via `SIMULTANEOUS_MAINTENANCE_AUTHORIZED`; supervisor detail dialog shows the action button when applicable
- [x] WorkOrdersModule — COULD_NOT_INTERVENE validation guard: `PATCH /work-orders/:id/validate` now requires `assetStatusOverride` when the last completed intervention result is `COULD_NOT_INTERVENE`; asset status is set to the supervisor's explicit choice instead of silently defaulting to OPERATIONAL; `FOLLOW_UP_PROMPT` notification dispatched to principal technician
- [x] InventoryModule — parts catalog, part requests, stock movements, low-stock alerts, analytics
- [x] InventoryModule — duplicate part `referenceCode` creates now return 409 Conflict instead of leaking Prisma unique-constraint 500s
- [x] PreventivePlansModule — plan CRUD, checklist templates, BullMQ WO generator, daily @Cron scheduler
- [x] ReportsModule — problem report lifecycle, comments, convert/reject/defer/reopen/archive
- [x] Backend integrity hardening — WO/PR reference generation now uses transaction advisory locks to prevent duplicate references under concurrent writes
- [x] Backend runtime compatibility — advisory lock SQL now casts lock keys to `int` to match PostgreSQL function overloads used in production
- [x] Backend verification — live smoke test covers auth, work orders, preventive plans, and reports
- [x] apps/web — Next.js started (auth + protected layouts + admin pages)
- [x] Auth module (web) — login page + account setup (/auth/setup) + password recovery (/auth/forgot-password, /auth/reset-password)
- [x] AdminModule (backend) — /admin/system-config (GET/PATCH), /admin/audit-log (GET paginated)
- [x] Admin module (web) — users management, system config panel, audit log table
- [x] Admin module (web) — hardening: ConfirmDialog for deactivate/delete, audit log filter fixed, hourlyRate clear on role change
- [x] Audit logging (backend) — comprehensive location mutations (create, update, delete) with before/after state capture
- [x] Audit logging (backend) — comprehensive category mutations (create, update, activate, deactivate) with before/after state capture
- [x] Audit logging (web) — audit log UI now exposes Location and Category audit entry types for filtering and viewing
- [x] Storekeeper module (web) — /storekeeper inventory catalog (list/filter/pagination + create/edit + activate/deactivate)
- [x] Storekeeper module (web) — stock operations on catalog rows (incoming stock, manual adjustments, per-part movement history, low-stock banner)
- [x] Storekeeper module (web) — /storekeeper/part-requests queue (list/filter/pagination + fulfill/reject dialogs)
- [x] Storekeeper module (web) — /storekeeper/analytics inventory analytics (filters + KPI cards + consumption/replenishment/dead-stock sections)
- [x] Supervisor module (web) — /supervisor/reports (list/filter/pagination + detail dialog + comment + convert/reject/defer/reopen/archive actions)
- [x] Supervisor module (web) — /supervisor/work-orders (list/filter/pagination + create WO dialog + detail dialog + full lifecycle actions: publish, assign, reassign, promote, validate, reject-closure, cancel, authorize-simultaneous-maintenance; list waits for auth initialization and asset selector respects backend limits; validate panel shows a mandatory asset-status override form when the last intervention result is COULD_NOT_INTERVENE)
- [x] Supervisor module (web) — /supervisor dashboard summary cards now wait for auth store initialization before firing queries
- [x] Web auth compatibility — legacy redirect pages `/app/auth/setup` and `/app/auth/reset-password` aligned with Next 15 `searchParams` Promise PageProps contract
- [x] Supervisor module (web) — /supervisor/preventive-plans (list/filter/pagination + create/edit + activate/deactivate + trigger-now + checklist CRUD/reorder)
- [x] Supervisor module (web) — /supervisor/assets (list/filter/pagination + create/edit + detail + status transitions)
- [x] Supervisor module (web) — asset certificates: full CRUD (add/edit/delete + optional file upload) wired in asset-detail-dialog
- [x] Supervisor module (web) — asset documents: upload + delete wired in asset-detail-dialog; document type label displayed
- [x] Storekeeper module (web) — part returns: record-return dialog with cancelled-WO picker, wired in inventory catalog
- [x] Repo hygiene — TypeScript incremental cache artifacts (`*.tsbuildinfo`) are ignored and untracked from git to keep working trees clean during local dev
- [x] Top bar / notifications (web) — balanced header layout + notification list, unread badge, mark-read actions
- [x] Admin audit (backend) — GET /admin/audit-log now accepts `actionType` query filter alongside `targetType`; admins can isolate specific action types (USER_DEACTIVATED, CONFIG_UPDATED, etc.)
- [x] Admin audit (backend) — GET /admin/audit-log now has dedicated route-level throttling (`10/min`) in addition to global throttling
- [x] Admin audit (web) — audit-log-table: `actionType` filter dropdown added (15 known action types with French labels); page resets on filter change; all hardcoded strings replaced with i18n
- [x] Admin users (web) — users-table and user-form-dialog fully converted to i18n (role labels, column headers, filters, toasts, confirm dialog, form labels)
- [x] WorkOrdersModule — daily supervisor summary email: `DailySummaryJob` (@Cron EVERY_HOUR, hour-gated via `DAILY_SUMMARY_HOUR` SystemConfig key, default 17); collects 7 WO metrics in a single $transaction; sends one `daily-summary` mail per active supervisor via BullMQ; `daily-summary.hbs` template added; `MailTemplate` union and `SUBJECT_MAP` extended
- [x] AdminModule (backend) — analytics endpoints: `GET /admin/analytics/users` (inactive accounts, login frequency, by-role breakdown) and `GET /admin/analytics/system` (BullMQ queue job counts for all 3 queues, failed/pending/sent notification stats); `AdminAnalyticsService` with 22 passing unit tests
- [x] Admin module (web) — analytics dashboard: `AdminAnalyticsBoard` with user-activity section (6 KPI cards, login-recency progress bars, by-role table) and system-health section (notification KPIs, one queue card per BullMQ queue); `Activity` icon nav entry in admin sidebar; `adminAnalytics` i18n section (30 + French keys)
- [x] Backend TypeScript diagnostics hygiene — `apps/backend/src/main.ts` cookie-parser import aligned with callable type usage; backend `tsconfig.json` now sets explicit `rootDir`; deprecated `baseUrl`/`moduleResolution` defaults removed where safe
- [ ] apps/mobile — Expo (not started)

## Key file locations
- Prisma schema: packages/db/prisma/schema.prisma
- Applied migrations: packages/db/prisma/migrations/
- Shared enums: packages/shared/src/enums/
- Infrastructure: docker-compose.yml
- Env template: .env.example
- Backend source: apps/backend/src/

## Dev accounts (after seed)
| Email | Password | Roles |
|-------|----------|-------|
| admin@gmao.local | Admin1234! | ADMIN |
| supervisor@gmao.local | Admin1234! | SUPERVISOR, STOREKEEPER |
| tech@gmao.local | Admin1234! | TECHNICIAN |
| tech2@gmao.local | Admin1234! | TECHNICIAN |
| requester@gmao.local | Admin1234! | REQUESTER |

## API
- Base URL (recommended split): http://localhost:3000/api/v1
- Swagger (recommended split): http://localhost:3000/api/docs
- Frontend: http://localhost:3001
- MailHog: http://localhost:8025
- MinIO: http://localhost:9001

## Architecture rules (critical)
- NestJS: Module → Controller → Service → Repository. No business logic in controllers.
- Global guards: JwtAuthGuard + RolesGuard applied to everything. Use @Public() to opt out.
- Global filter: AllExceptionsFilter on all routes.
- Email: NEVER send synchronously. Always enqueue via MailService.enqueue().
- PDF generation: always BullMQ job, never synchronous. Implemented for closed work-order report generation.
- Offline queue (mobile): only checklist completions, log drafts, photo attachments.
- Status transitions require connectivity — never queue them.
- Prisma migrations: never edit applied. Always create new.
- Audit log: append-only, INSERT+SELECT only at DB role level.

## Environment
- OS: Fedora KDE
- Node: v22.x
- pnpm: 10.6.3
- Docker: Docker CE

## How to resume work
1. cd ~/gmao
2. docker compose up -d
3. PORT=3000 APP_URL=http://localhost:3001 pnpm --filter @gmao/backend dev
4. NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 pnpm --filter @gmao/web dev
5. Verify backend: pnpm smoke:backend
6. Quick auth check: curl -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@gmao.local","password":"Admin1234!"}' | jq .accessToken

## Notifications testing

- Open http://localhost:3001/login and sign in with `supervisor@gmao.local` / `Admin1234!`
- Verify the top bar on http://localhost:3001/supervisor and http://localhost:3001/supervisor/reports
- Test notification endpoints with a bearer token:
  - `GET /api/v1/notifications`
  - `GET /api/v1/notifications/count/unread`
  - `PATCH /api/v1/notifications/:id/read`
  - `PATCH /api/v1/notifications/mark-all-read`

## Authentication testing

### Login
- Navigate to http://localhost:3001/auth/login
- Use credentials from dev accounts table
- Verify: Access token issued, user redirected to dashboard (admin/supervisor/storekeeper)

### Forgot Password (Password Recovery)
- On login page, click **"Oublié ?"** link
- Enter email of an active user
- Verify: Success message shown, backend sends password reset email to MailHog (http://localhost:8025)
- Email contains reset link: `http://localhost:3001/auth/reset-password?token=...`
- Click link → set new password (with confirmation) → redirected to login
- Login with new password to verify reset successful

### Account Setup (New User Onboarding)
- Admin creates new user via backend/API: `POST /users` with role (TECHNICIAN/REQUESTER, etc.)
- Verify: Setup email sent to MailHog containing: `http://localhost:3001/auth/setup?token=...`
- Click link → set password (with confirmation) → account activated and redirected to login
- New user can now log in with credentials

### Edge cases
- Invalid/expired token → error message: "Ce lien n'existe plus ou a expiré..."
- Missing query parameter → error message shown, "Retour à la connexion" button available
- Password mismatch → validation error: "Les mots de passe ne correspondent pas"
- Backend password policy violation → backend error displayed in form

## Git conventions
Branch: feat/short-description, fix/short-description, chore/short-description
Commit: type(scope): description
Scopes: backend, web, mobile, shared, infra
