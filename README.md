# CMMS

Computerized Maintenance Management System — PFE project.

Turborepo monorepo. TypeScript throughout. NestJS backend, Next.js web frontend, Expo mobile (not started).

## Prerequisites

- Node.js v22+
- pnpm v10+ — `npm install -g pnpm`
- Docker + Docker Compose

## Setup

```bash
git clone https://github.com/oussema-ghbara/CMMS.git
cd CMMS
cp .env.example .env
# Fill in .env — see comments inside
docker compose up -d
pnpm install
cd packages/db && pnpm db:generate && pnpm db:migrate && npx prisma db seed && cd ../..
```

Start the apps (two terminals):

```bash
# terminal 1 — backend
PORT=3000 APP_URL=http://localhost:3001 pnpm --filter @gmao/backend dev

# terminal 2 — web
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 pnpm --filter @gmao/web dev
```

Swagger: http://localhost:3000/api/docs

On subsequent sessions, skip the clone/install/seed steps — just run `docker compose up -d` and start the two apps.

## Monorepo structure

```
apps/
  backend/     NestJS API
  web/         Next.js web application
  mobile/      Expo React Native — not started
packages/
  shared/      Domain enums shared across all apps
  db/          Prisma schema, migrations, seed
```

## Stack

| Layer | Tool |
|---|---|
| Language | TypeScript (everywhere) |
| Monorepo | Turborepo + pnpm workspaces |
| Backend | NestJS |
| Web | Next.js (App Router) |
| Mobile | Expo (React Native) — not started |
| Database | PostgreSQL via Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| File storage | MinIO (S3-compatible) |
| Dev email | MailHog + Nodemailer + Handlebars |
| Real-time | Socket.io — `NotificationsGateway`, JWT auth-on-connect |

## Infrastructure

```bash
docker compose up -d     # start all services
docker compose down      # stop
docker compose down -v   # stop and wipe volumes (destroys all data)
```

| Service | URL |
|---|---|
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| MinIO API | localhost:9000 |
| MinIO console | http://localhost:9001 |
| MailHog | http://localhost:8025 |
| Backend API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/docs |
| Frontend | http://localhost:3001 |

## Database

```bash
cd packages/db
pnpm db:migrate        # create and apply new migration
pnpm db:generate       # regenerate Prisma client after schema change
npx prisma db seed     # seed dev accounts and system config (idempotent)
npx prisma studio      # visual DB browser
```

Never edit an applied migration. Always create a new one.

## Dev accounts (after seed)

| Email | Password | Roles |
|---|---|---|
| admin@cmms.local | Admin1234! | ADMIN |
| supervisor@cmms.local | Admin1234! | SUPERVISOR, STOREKEEPER |
| tech@cmms.local | Admin1234! | TECHNICIAN |
| tech2@cmms.local | Admin1234! | TECHNICIAN |
| requester@cmms.local | Admin1234! | REQUESTER |

## Feature scope

### Backend

| Module | Notes |
|---|---|
| Auth | JWT + refresh token rotation, Redis revocation, session inactivity timeout, account setup + public resend, password recovery |
| Users | Admin CRUD, setup token flow, deactivate/reactivate, per-user email notification preferences |
| Assets | Locations, categories, assets, certificates (soft-archive, expiry alerts), documents (versioned), QR code endpoint |
| WorkOrders | Full state machine, assignments, intervention logs, on-hold (hold metadata, contractor/access-retry jobs), validation (CNI guard, asset-status override), checklist (anomaly WO creation), priority escalation, duplicate guard, follow-up WO creation, cost summary, PDF report (async + on-demand fallback), daily summary email, analytics (MTBF/MTTR, technician KPIs with rejection rate, asset health, requester stats, plan efficiency), technician load + duration hints endpoints |
| Inventory | Parts catalog, stock movements, part requests, part document attachments, analytics (cost trend, long-waiting requests) |
| PreventivePlans | Plan CRUD, checklist templates, BullMQ WO generator, daily cron scheduler, same-asset same-day conflict detection with supervisor notification, calendar preview, plan document attachments |
| Reports | Problem report lifecycle (convert/reject/defer/reopen/archive), comments, three-tier deferred aging, report detail enriched with asset context |
| Notifications | In-app + email, Socket.io live push, deep-linking, `notifySupervisors()` / `notifyAdmins()` fan-out |
| Admin | System config (GET/PATCH), audit log (paginated, filterable by targetType + actionType), user analytics, system health analytics (queue stats, notification delivery, scheduled job status) |
| JobLogger | Cross-cutting cron observability — upserts `ScheduledJobLog` per job, emits `SCHEDULED_JOB_FAILED` to admins on failure (23h dedup) |

### Web (Next.js)

| Area | Notes |
|---|---|
| Auth | Login, account setup, resend-setup, forgot/reset password |
| Admin | Users table, system config panel, audit log with filters, analytics dashboard (user activity + system health + job status) |
| Supervisor | Dashboard (summary cards, technician load, operational alerts, certificate risk panel), work orders board + detail dialog (full lifecycle actions, validation signals, hold management, cost summary, follow-up prompt, PDF download), validation queue, preventive plans board (list + calendar views), assets board (CRUD, certificates, documents, QR print), reports board (with asset context and duplicate WO banner), analytics board (6 tabs: asset KPIs, technician KPIs with rejection breakdown, requester stats, plan efficiency, operational overview, asset health) |
| Storekeeper | Inventory catalog (with document attachments, stock operations, movement history), part requests queue, analytics (cost trend, long-waiting requests) |
| Notifications | Live Socket.io push, unread badge, mark-read, deep-link navigation |

## Tests

```bash
# backend
pnpm --filter @gmao/backend test

# web
pnpm --filter @gmao/web test

# smoke test (requires running backend + seeded DB)
pnpm smoke:backend
```

Current coverage: ~507 backend unit tests, ~120 frontend unit tests.

## Architecture rules

**NestJS:** Module → Controller → Service → Repository. No business logic in controllers.

**Guards:** `JwtAuthGuard` + `RolesGuard` are global. Use `@Public()` to opt out. Use `@Roles()` to restrict at method level.

**Email:** Never call Nodemailer directly. Always `mailService.enqueue()`.

**PDF generation:** Always a BullMQ job. Never synchronous in a request path.

**Shared types:** All domain enums live in `packages/shared`. Never duplicate them across apps.

**Prisma migrations:** Never edit an applied migration. Always create a new one with `pnpm db:migrate`.

**Audit log:** Append-only. No UPDATE or DELETE on audit records.

**TypeScript:** Strict mode throughout. No `any` without a comment explaining why.

**Failure paths:** Every error path must be explicit. No silent catch blocks.

## Adding a backend module

1. Create `apps/backend/src/<module>/` with `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `<module>.repository.ts`
2. Add DTOs in `<module>/dto/`
3. Register the module in `app.module.ts`
4. Export services that other modules need to inject

## Adding a web feature

1. New pages go under `apps/web/app/(protected)/` or `apps/web/app/(auth)/`
2. Use existing UI components from `apps/web/components/ui/` (shadcn/ui)
3. Create API wrappers in `apps/web/lib/` following existing patterns (e.g. `users.api.ts`)
4. All strings must use i18n keys from `apps/web/public/locales/fr/common.json` — no hardcoded labels
5. Wrap any component that uses `useSearchParams` in a `<Suspense>` boundary (Next.js 15 requirement)
6. State: Zustand for auth, React Query for server data

## Git conventions

Commit format (Conventional Commits):
```
type(scope): short description

Types: feat, fix, chore, refactor, perf, test, docs
Scopes: work-orders, preventive-plans, assets, inventory, reports, auth, web, admin, infra
```

Commits must be atomic — one concern per commit.
