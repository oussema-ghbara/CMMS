# GMAO — Session Context

## What this is
A GMAO (Computerized Maintenance Management System) built as a monorepo.
Full functional spec: GMAO_Description_Fonctionnelle.pdf
Data model: data_model.pdf
Tech stack decisions: stack.pdf

## Stack
- Backend: NestJS (TypeScript)
- Web: Next.js (not started)
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
  - [x] MailModule — BullMQ queue, Nodemailer processor, Handlebars templates (setup-account, password-reset)
  - [x] SystemConfigModule — password policy, 14 config keys seeded
  - [x] UsersModule — Admin CRUD, setup token flow, deactivate/reactivate, resend setup
  - [x] Auth endpoints: /auth/setup, /auth/forgot-password, /auth/reset-password
- [ ] AssetsModule (next)
- [ ] WorkOrdersModule
- [ ] InventoryModule
- [ ] PreventivePlansModule
- [ ] ReportsModule
- [ ] apps/web — Next.js (not started)
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

## API
- Base URL: http://localhost:3001/api/v1
- Swagger: http://localhost:3001/api/docs
- MailHog: http://localhost:8025
- MinIO: http://localhost:9001

## Architecture rules (critical)
- NestJS: Module → Controller → Service → Repository. No business logic in controllers.
- Global guards: JwtAuthGuard + RolesGuard applied to everything. Use @Public() to opt out.
- Global filter: AllExceptionsFilter on all routes.
- Email: NEVER send synchronously. Always enqueue via MailService.enqueue().
- PDF generation: always BullMQ job, never synchronous (not yet built).
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
3. pnpm --filter @gmao/backend dev
4. Verify: curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@gmao.local","password":"Admin1234!"}' | jq .accessToken

## Git conventions
Branch: feat/short-description, fix/short-description, chore/short-description
Commit: type(scope): description
Scopes: backend, web, mobile, shared, infra
