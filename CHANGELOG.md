# Changelog

All notable changes to the GMAO project are documented here.

## [Unreleased]

### Fixed — COULD_NOT_INTERVENE validation data integrity (April 16, 2026)

#### `fix(work-orders): enforce assetStatusOverride when technician could not intervene`
- `ValidationService.validate()` previously set the asset to `OPERATIONAL` unconditionally, even when the technician submitted `result: COULD_NOT_INTERVENE` — marking an unrepaired asset as back in service
- The service now reads the most recent **completed** intervention log (i.e. with `endedAt IS NOT NULL` and `result IS NOT NULL`) before deciding the post-validation asset status:
  - **Normal results** (RESOLVED, PARTIALLY_RESOLVED, NEEDS_FOLLOW_UP, or no log): asset → `OPERATIONAL` as before
  - **COULD_NOT_INTERVENE**: `assetStatusOverride` is **mandatory**; missing it raises `400 BadRequestException` with an explicit message; the chosen status is applied and logged
- A `FOLLOW_UP_PROMPT` in-app notification is dispatched to the principal technician on the CNI path to signal that a follow-up intervention may be needed
- The WO status log label records `"COULD_NOT_INTERVENE acknowledged — asset set to <status>"` for full auditability
- New DTO `ValidateWorkOrderDto` with `assetStatusOverride?: AssetStatus` wired into `PATCH /work-orders/:id/validate`
- Frontend validate panel detects CNI from `detail.interventionLogs`: shows a **red warning banner** and a mandatory asset-status select (OUT_OF_SERVICE / IN_MAINTENANCE / OPERATIONAL — risk accepted); Confirm button is disabled until a choice is made
- 7 new French i18n keys added for the warning banner, status-select label, placeholder and per-option labels

### Fixed — Inventory part creation conflict handling (April 16, 2026)

#### `fix(inventory): return 409 on duplicate part reference codes`
- `POST /parts` now maps both the repository precheck and Prisma unique-constraint failures to `409 Conflict`
- Duplicate `referenceCode` values no longer surface as opaque 500 errors during concurrent or repeated creates
- Added backend unit coverage for the repository conflict paths and an HTTP integration test for the controller response

### Fixed — Stability and seed reliability hardening (April 16, 2026)

#### `fix(web): gate supervisor dashboard queries on auth initialization`
- Added `enabled: isInitialized` on all supervisor dashboard summary queries
- Prevents early unauthenticated requests, refresh-token race conditions, and dashboard bootstrap failures after full page reloads

#### `fix(i18n): restore French accents in supervisor dashboard copy`
- Restored missing accent marks in `supervisorDashboard` French translations (subtitle, error state, and card labels)

#### `fix(backend): cast advisory lock arguments for PostgreSQL overload resolution`
- Explicitly cast advisory lock parameters to `int` in reference-number generation queries
- Prevents `pg_advisory_xact_lock(bigint, bigint)` resolution errors that could fail WO/PR creation under runtime bindings

#### `fix(db): make seed execution robust with generated Prisma client mapping`
- Updated `packages/db/tsconfig.seed.json` with `baseUrl` and `paths` so `@prisma/client` resolves to `packages/db/src/generated/client` during seed compilation
- Seed data now includes a broader baseline fixture set (users, assets, plans, reports, work orders, inventory movements, notifications) while remaining idempotent

#### `chore(repo): stop tracking TypeScript incremental cache artifacts`
- Added `*.tsbuildinfo` to `.gitignore`
- Removed tracked `apps/web/tsconfig.tsbuildinfo` from version control

### Added — Automatic PDF report generation for closed work orders (April 16, 2026)

#### `feat(work-orders): generate and store PDF reports on validation`
- Added `WorkOrder.reportPdfKey` to persist the generated PDF storage key
- Introduced a dedicated PDF generation service, BullMQ queue, and processor for closed work orders
- Validation now enqueues PDF generation asynchronously after a successful closure
- PDFs are uploaded to MinIO and stored under the `reports/` prefix

### Fixed — Supervisor work-order loading and equipment selection (April 16, 2026)

#### `fix(web-supervisor): wait for auth init before loading work orders`
- Supervisor work-order list now waits for auth initialization before firing its query
- Create work-order equipment selection now uses a backend-valid asset query limit and waits for auth initialization
- Prevents premature request failures and empty equipment dropdowns during app startup

### Added — Automatic work order priority escalation (April 16, 2026)

#### `feat(work-orders): add automatic priority escalation job scheduler`
- New hourly Cron job (`PriorityEscalationJob`) evaluates and escalates overdue work orders
- Escalation follows strict priority chain: LOW → MEDIUM → HIGH → CRITICAL
- Already-CRITICAL work orders are excluded to prevent redundant escalations
- Terminal states (CLOSED, CANCELLED) are skipped automatically
- Full audit trail preserved via `WorkOrderPriorityLog` with `isAutoEscalation=true` flag
- Supervisor notifications sent via `NotificationType.WO_AUTO_ESCALATED` for every escalated work order
- System escalations logged explicitly as "automatic system escalation" per spec §4.3

### Fixed — Reference number integrity under concurrency (April 13, 2026)

#### `fix(backend): eliminate WO/PR reference race conditions with tx-level locks`
- Replaced all `count + 1` reference generation patterns that could produce duplicate references under parallel writes
- Added shared utility: `apps/backend/src/common/reference-number.util.ts`
- New generators use PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`) and last-reference lookup per year:
  - `nextWorkOrderReference(tx)`
  - `nextProblemReportReference(tx)`
- Wired into every affected creation flow:
  - Work order direct creation (`WorkOrdersRepository.create`)
  - Preventive plan auto-generated WO (`PreventivePlansService.generateWorkOrder`)
  - Checklist anomaly auto-created WO (`ChecklistService.completeItem`)
  - Problem report submission (`ReportsService.submit`)
  - Report conversion to WO (`ReportsService.convert`)
- Result: reference generation is serialized per sequence family/year and remains format-compatible (`WO-YYYY-XXXXXX`, `PR-YYYY-XXXXXX`)

### Added — Role-scope audit: asset certificate/document CRUD + part-return UI (April 9, 2026)

#### `feat(web-supervisor): asset certificate full CRUD in asset-detail-dialog`
- Asset certificates were displayed read-only despite the backend fully supporting create/update/delete
- Added **Add certificate** button (header of Certificates section) opening a new `CertificateFormDialog`
- Each certificate row now has inline **Edit** (pencil) and **Delete** (trash) icon buttons
- `CertificateFormDialog` handles both create and edit: `certificateType` select (with conditional `otherType` field), issuing authority, issue/expiration dates, optional file attachment (PDF/JPG/PNG)
- Form uses `react-hook-form` + Zod validation; `OTHER` type enforces `otherType` non-empty via `.refine()`
- File upload sends multipart/form-data via `FormData`; axios omits Content-Type so the browser sets the boundary automatically
- All certificate action buttons hidden when asset is DECOMMISSIONED

#### `feat(web-supervisor): asset document upload + delete in asset-detail-dialog`
- Asset documents were displayed read-only despite backend supporting upload and delete
- Added **Upload** button (header of Documents section) opening a new `DocumentUploadDialog`
- Each document row now has a **Delete** icon button with a loading spinner while in-flight
- `DocumentUploadDialog`: `documentType` select (all 8 types), mandatory file picker with clear button
- Document type label is now translated in the document row (was previously showing the raw enum value)
- Upload and delete buttons hidden when asset is DECOMMISSIONED

#### `feat(web-storekeeper): part-return dialog wired into inventory catalog`
- `POST /stock/returns` existed in the backend and in the API client but had zero UI entry point
- Added **Return** (↩) icon button per catalog row, opening a new `StockReturnDialog`
- Dialog shows current stock + projected stock after return, quantity field (min 1), and a searchable dropdown of cancelled work orders (fetched via `workOrdersApi.list({ status: CANCELLED })`)
- Live text filter narrows the WO list by reference number or asset name
- On success, invalidates `storekeeper.inventory` and `storekeeper.low-stock` query caches

#### `fix(web): add missing API client methods to assetsApi`
- `assetsApi` lacked five methods that the backend fully supports:
  `createCertificate`, `updateCertificate`, `deleteCertificate`, `uploadDocument`, `deleteDocument`
- All multipart methods build `FormData` internally; callers pass plain objects + optional `File`

#### `feat(web-i18n): add all French translations for new dialogs`
- New keys: `supervisorAssets.certificate.*` (form, validation, toasts)
- New keys: `supervisorAssets.document.*` (form, validation, toasts)
- New keys: `supervisorAssets.documentType.*` (all 8 DocumentType enum values)
- New key: `storekeeperInventory.actions.returnStock`
- New section: `storekeeperInventory.return.*` (dialog, form, validation, toasts)

---

### Added / Fixed — Admin audit & i18n hardening (April 9, 2026)

#### `feat(backend): add actionType filter to GET /admin/audit-log`
- Endpoint previously accepted only `targetType` as a query filter
- Added `@Query('actionType')` parameter; both filters are spread into the Prisma `where` clause and are independently optional
- Swagger `@ApiQuery` decorator added for `actionType`
- Admins can now query e.g. `?actionType=USER_DEACTIVATED` to isolate specific audit events

#### `feat(web-admin): add actionType filter dropdown to AuditLogTable`
- Second filter select added alongside the existing "target type" dropdown
- Dropdown lists all 15 known action types with human-readable French labels sourced from i18n (`admin.auditLog.actionTypes.*`)
- Selecting either filter resets pagination to page 1 to avoid stale offsets
- `adminApi.getAuditLog` updated to forward the new `actionType` param

#### `fix(web-admin): convert AuditLogTable to full i18n`
- All hardcoded French strings removed: column headers, "Avant"/"Après" diff labels, empty state, total count, filter placeholders
- `AuditChangeDetail` now receives labels as props so the component has no hardcoded locale
- New i18n keys added: `admin.auditLog.columns.*`, `admin.auditLog.filters.*`, `admin.auditLog.detail.*`, `admin.auditLog.states.*`, `admin.auditLog.actionTypes.*`, `admin.auditLog.total`

#### `fix(web-admin): convert UsersTable and UserFormDialog to full i18n`
- Both components previously bypassed the i18n system entirely despite `categories-table` and `locations-table` using `useTranslation` throughout
- All hardcoded strings replaced: role labels (driven by `t('admin.users.roles.ROLE')`), column headers, filter selects, status badges, toast messages, confirm-dialog text, form field labels/placeholders/errors
- New i18n keys added: `admin.users.filters.*`, `admin.users.columns.*`, `admin.users.status.*`, `admin.users.roles.*`, `admin.users.states.*`, `admin.users.actions.*`, `admin.users.toasts.*`, `admin.users.deactivateDialog.*`, `admin.users.form.*`

---

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
