# Changelog

All notable changes to the GMAO project are documented here.

## [Unreleased]

### Fixed - Admin UI audit & hardening (April 9, 2026)

#### `fix(web-admin): replace window.confirm with ConfirmDialog in LocationsTable`
- Removed `window.confirm` (blocking, inconsistent with app UI)
- Introduced reusable `components/ui/confirm-dialog.tsx` built on the existing `Dialog` primitive
- Supports: title, description, destructive/default variant, loading state (blocks close while pending), cancel/confirm labels
- LocationsTable now uses `ConfirmDialog` for delete — shows location name and context in the modal

#### `fix(web-admin): add deactivate confirmation dialog in UsersTable`
- Deactivating a user now opens a `ConfirmDialog` warning that all active sessions will be revoked
- Previously the mutation fired immediately on button click with no confirmation
- Dialog shows the user's full name and blocks closure while the mutation is in-flight

#### `fix(web-admin): repair AuditLog targetType filter`
- Filter dropdown was built via `useMemo` from the **current page's data only** — if page 1 had only `SystemConfig` entries, `User` and `Asset` were invisible options
- Replaced with a hardcoded `KNOWN_TARGET_TYPES` constant derived from the actual backend services that write to the audit log (`UsersService`, `SystemConfigService`, `AssetsService`)
- Removed unused `useMemo` import

#### `fix(backend+web): clear hourlyRate when TECHNICIAN role is removed`
- Editing a Technician user, unchecking the TECHNICIAN role, and saving silently preserved `hourlyRate` in the database
- `UserFormDialog.onSubmit` now derives `effectiveHourlyRate: null` when TECHNICIAN is not in the selected roles
- `UpdateUserDto` updated with `@ValidateIf((_, value) => value !== null)` so `null` is accepted and treated as a clear operation
- `UpdateUserPayload` shared type already typed `number | null` — backend DTO now matches

---

### Added - Admin Master Data UI Complete

#### Admin locations/categories rollout (April 8, 2026)

**New Pages:**
- `/admin/locations` — Admin location hierarchy management
- `/admin/categories` — Admin asset category management

**New Components:**
- `components/admin/locations-table.tsx`
- `components/admin/location-form-dialog.tsx`
- `components/admin/categories-table.tsx`
- `components/admin/category-form-dialog.tsx`

**API client enhancements:**
- `lib/locations.api.ts` — added create/update/delete methods
- `lib/categories.api.ts` — added create/update/activate/deactivate methods

**Admin UX improvements:**
- Sidebar navigation now includes locations and categories entries
- Audit log target filter added (dynamic from fetched data — later corrected to static list)
- User edit flow now refreshes data through `GET /users/:id` before opening edit form

**Testing/quality:**
- `pnpm --filter web lint` ✅
- `pnpm --filter web type-check` ✅

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
1. Asset compliance (certificates/documents workflows)
2. Work-order technician execution lifecycle
3. Part-request technician flow
4. Stock return endpoint integration
5. Problem report submission by requester/technician
6. Frontend methods defined but unused
7. Role-surface mismatch (technician/requester routes)
8. Deeper architectural decision needed for role expansion

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
