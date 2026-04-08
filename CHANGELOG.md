# Changelog

All notable changes to the GMAO project are documented here.

## [Unreleased]

### Added - Web Authentication Complete

#### Account Setup & Password Recovery (April 8, 2025)

**New Pages:**
- `/auth/setup?token=...` — New user account activation with password setup
- `/auth/reset-password?token=...` — Password reset flow for forgotten passwords
- `/auth/forgot-password` — Request password reset email

**New Components:**
- `lib/auth.api.ts` — API wrapper for setup, reset-password, and forgot-password endpoints
- `app/(auth)/setup/setup-content.tsx` — Account setup form with Suspense boundary
- `app/(auth)/reset-password/reset-content.tsx` — Password reset form with Suspense boundary
- `app/(auth)/forgot-password/forgot-content.tsx` — Email submission form

**Enhancements:**
- Login form (`components/auth/login-form.tsx`) — Added "Oublié ?" link to password recovery
- i18n translations — 15+ French labels for all auth flows and messages

**Features:**
- ✅ Password confirmation validation (client-side)
- ✅ Invalid/expired token error handling with clear UX
- ✅ Suspense boundaries for dynamic `useSearchParams()` (Next.js 15 compatibility)
- ✅ Loading states and success feedback with auto-redirect
- ✅ Backend password policy validation integration
- ✅ Full French i18n support (no hardcoded text)
- ✅ Production build verified (zero errors)

**Testing:**
- Setup flow: Admin invites user → user sets password → account active
- Reset flow: User requests reset → clicks email link → sets new password
- Forgot flow: User clicks "Oublié ?" → enters email → receives reset email
- Edge cases: Invalid tokens, password mismatch, missing params

**Documentation:**
- Updated README.md with authentication flows section
- Updated CONTEXT.md with web auth module status and testing instructions
- Updated CONTRIBUTING.md with web auth patterns and best practices

---

## Previous Releases

### [Completed Backend - March 2025]

**All 12 backend modules complete:**
- AuthModule: login/refresh/logout, JWT rotation, setup/reset token flows
- UsersModule: admin CRUD, setup tokens, activation
- SystemConfigModule: password policy, 14 config keys
- AssetsModule: locations, categories, assets, certificates, documents
- WorkOrdersModule: full state machine, assignments, intervention logs, checklist
- InventoryModule: parts catalog, stock movements, low-stock alerts
- PreventivePlansModule: plan CRUD, checklist templates, daily scheduler
- ReportsModule: problem report lifecycle, comments, conversion
- NotificationsModule: in-app notifications, unread count
- AdminModule: system config, audit log
- StorageModule: MinIO/S3 wrapper, presigned URLs
- MailModule: BullMQ queue, Nodemailer, Handlebars templates

**Backend verification:**
- ✅ Smoke test covers auth, work orders, preventive plans, reports
- ✅ Swagger API docs available
- ✅ PostgreSQL + Redis + MinIO + MailHog infrastructure verified

### [Web Frontend - Partial, March 2025]

**Implemented Modules:**
- Admin: users management, system config, audit log
- Storekeeper: inventory catalog, stock operations, part requests, analytics
- Supervisor: reports, work orders, preventive plans, assets
- Top bar: notifications with unread badge

**Remaining (Not in scope):**
- Technician/Requester role UI (backend endpoints exist but no navigation/flows)
- Admin master data (categories/locations CRUD pages not implemented)
- Asset compliance (certificate/document tabs on asset detail not implemented)

---

## Audit Status

**Latest Audit:** April 8, 2025
**Gap Identified:** Backend/Frontend capability gap (audit_report.md)
**Items Addressed:** Item 7 - Account Setup and Password Recovery ✅

**Remaining Audit Items** (not yet implemented):
1. Admin master data (categories/locations CRUD)
2. Asset compliance (certificates/documents workflows)
3. Work-order technician execution lifecycle
4. Part-request technician flow
5. Stock return endpoint integration
6. Problem report submission by requester/technician
7. Frontend methods defined but unused
8. Role-surface mismatch (technician/requester routes)
9. Deeper architectural decision needed for role expansion

---

## Technical Details

**Stack:**
- Backend: NestJS + TypeScript
- Web: Next.js 15 + App Router + TypeScript
- Database: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- Storage: MinIO (S3-compatible)
- Mail: MailHog + Nodemailer + Handlebars
- Monorepo: Turborepo + pnpm workspaces

**Development:**
- Node.js v22+
- pnpm v10+
- Docker Compose (postgres, redis, minio, mailhog)

**Git Conventions:**
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`
- Commits: Conventional Commits format
- Push strategy: Atomic commits, one concern per commit
