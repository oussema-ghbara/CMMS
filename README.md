# GMAO

Computerized Maintenance Management System — PFE project.

Turborepo monorepo. TypeScript throughout. NestJS backend, Next.js web (not started), Expo mobile (not started).

## Prerequisites

- Node.js v22+
- pnpm v10+ — `npm install -g pnpm`
- Docker + Docker Compose

## First-time setup
```bash
git clone https://github.com/oussema-ghbara/gmao.git
cd gmao
cp .env.example .env
# Fill in .env — see comments inside
docker compose up -d
pnpm install
cd packages/db && pnpm db:generate && pnpm db:migrate && npx prisma db seed && cd ../..
pnpm --filter @gmao/backend dev
```

Swagger is available at http://localhost:3001/api/docs once the backend is running.

## Resuming work
```bash
docker compose up -d
pnpm --filter @gmao/backend dev
```

## Monorepo structure
```
apps/
  backend/     NestJS API — the only app currently active
  web/         Next.js — not started
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
| Mobile | Expo (React Native) |
| Database | PostgreSQL via Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| File storage | MinIO (S3-compatible) |
| Dev email | MailHog + Nodemailer + Handlebars |
| Real-time | Socket.io (not started) |

## Infrastructure (Docker)
```bash
docker compose up -d     # start postgres, redis, minio, mailhog
docker compose down      # stop
docker compose down -v   # stop and delete volumes (destroys data)
```

| Service | URL |
|---|---|
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| MinIO API | localhost:9000 |
| MinIO console | http://localhost:9001 |
| MailHog | http://localhost:8025 |
| Backend API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/api/docs |

## Database
```bash
# After schema changes — never edit applied migrations
cd packages/db
pnpm db:migrate      # create and apply new migration
pnpm db:generate     # regenerate Prisma client after schema change
npx prisma db seed   # seed dev accounts and system config (idempotent)
npx prisma studio    # visual DB browser
```

## Dev accounts (after seed)

| Email | Password | Roles |
|---|---|---|
| admin@gmao.local | Admin1234! | ADMIN |
| supervisor@gmao.local | Admin1234! | SUPERVISOR, STOREKEEPER |
| tech@gmao.local | Admin1234! | TECHNICIAN |

## Backend module status

| Module | Status |
|---|---|
| ConfigModule | done — Joi env validation, fail-fast on startup |
| PrismaModule | done — global |
| RedisModule | done — global, ioredis |
| AuthModule | done — login/refresh/logout, JWT rotation, Redis revocation |
| MailModule | done — BullMQ queue, Nodemailer, Handlebars templates |
| SystemConfigModule | done — 14 config keys, password policy |
| UsersModule | done — Admin CRUD, setup token flow, deactivate/reactivate |
| StorageModule | done — MinIO/S3 wrapper, multi-bucket, presigned URLs |
| AssetsModule | done — locations, categories, assets, certificates, documents |
| WorkOrdersModule | not started |
| InventoryModule | not started |
| PreventivePlansModule | not started |
| ReportsModule | not started |

## Architecture rules

These apply to every change. Read before contributing.

**NestJS:** Module -> Controller -> Service -> Repository. No business logic in controllers.

**Guards:** JwtAuthGuard + RolesGuard are global. Use `@Public()` to opt out. Use `@Roles()` to restrict.

**Email:** Never call Nodemailer directly. Always `mailService.enqueue()`.

**PDF generation:** Always a BullMQ job. Never synchronous in a request path.

**Offline (mobile):** Only checklist completions, intervention log drafts, and photo attachments are queueable. Status transitions require connectivity — never queue them.

**Prisma migrations:** Never edit an applied migration. Always create a new one.

**Audit log:** Append-only. The DB user has INSERT and SELECT only — no UPDATE, no DELETE.

**Shared types:** All domain enums go in `packages/shared`. Never duplicate them.

**TypeScript:** Strict mode throughout. No `any` without a comment explaining why.

## Git conventions

Branch naming: `feat/short-description`, `fix/short-description`, `chore/short-description`. One concern per branch.

Commit format (Conventional Commits):
```
type(scope): short description

Types: feat, fix, chore, refactor, perf, test, docs
Scopes: backend, web, mobile, shared, infra
```

Example: `feat(backend): add BullMQ job for preventive WO generation`

Commits must be atomic. Do not mix features and fixes in the same commit.
