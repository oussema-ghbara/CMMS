# Changelog

All notable changes to the GMAO project are documented here.

## [Unreleased]

### Added — On-demand PDF report download for closed work orders (April 24, 2026)

#### `fix(work-orders): correct pdfkit CommonJS import for ESM interop`
- `ReportGenerationService` was importing `PDFDocument` as a default ES import (`import PDFDocument from 'pdfkit'`), which compiles to `pdfkit_1.default` under `module: commonjs` without `esModuleInterop`. The `pdfkit` package uses `module.exports = PDFDocument` (CJS), so `pdfkit_1.default` was `undefined` at runtime — `new PDFDocument()` threw `TypeError: pdfkit_1.default is not a constructor`.
- Fixed by switching to a namespace import: `import * as PDFDocument from 'pdfkit'`. This correctly resolves to the `module.exports` value under CommonJS compilation.

#### `feat(work-orders): add on-demand PDF report download endpoint (§11.3)`
- `WorkOrdersService.getReportUrl(id)`: fetches the WO, throws `BadRequestException('workOrders.report.notClosed')` if not CLOSED, returns a presigned MinIO URL. When `reportPdfKey` is null (WO closed before async job completed or job failed), generates the PDF synchronously on first request, uploads to the `pdfs` bucket, and persists `reportPdfKey` for subsequent calls.
- `StorageService` and `ReportGenerationService` injected into `WorkOrdersService` (already in `WorkOrdersModule` providers — no new module wiring needed).
- `GET /work-orders/:id/report` (Supervisor only) added to `WorkOrdersController` as a clean one-line delegate to `this.workOrders.getReportUrl(id)` — no service logic in the controller.
- `authorize-simultaneous.service.spec.ts` updated to pass two additional `{} as never` stubs matching the new `WorkOrdersService` constructor arity.

#### `feat(web): add PDF report download button to closed WO detail dialog`
- `WorkOrderDetail` interface gains `reportPdfKey: string | null` field.
- `workOrdersApi.getReportUrl(id)` API call added.
- Download button rendered in `DialogFooter` when `status === WorkOrderStatus.CLOSED`: shows spinner while request is in flight, opens the presigned URL in a new tab on success, shows `toast.error` on failure.
- i18n keys added (French): `supervisorWorkOrders.actions.downloadReport`, `supervisorWorkOrders.actions.reportNotReady`, `supervisorWorkOrders.toasts.reportDownloadError`.

---

### Added — Full KPI analytics and asset health recurring-failure detection (April 23, 2026)

#### `feat(work-orders): add full KPI analytics across 5 categories (§1.1 §2.1)`
- `WorkOrdersService.getAnalytics(periodDays, categoryId?)` extended with 5 new KPI categories computed in a single parallel `Promise.all` alongside the existing basic queries:
  - **Asset KPIs:** global MTBF (average days between corrective failures across assets); global MTTR (average hours from WO created to closed for CLOSED CORRECTIVE WOs); top-10 assets by failure frequency in period; top-10 assets by total maintenance cost; preventive compliance rate (closed preventive WOs / total preventive WOs created in period); total maintenance cost.
  - **Technician KPIs:** per-technician closed WO count, first-pass resolution rate (closed without any REJECTED validation action), average active intervention duration (minutes), average response time (hours from WO creation to first intervention log), average hold periods per WO.
  - **Requester analytics:** total problem reports submitted, total converted to WO (via `derivedWorkOrders`), conversion rate, average report-to-action delay (days from report creation to `processedAt`).
  - **Preventive plan efficiency:** compliance rate, checklist anomaly rate (`ANOMALY_DETECTED` items / all completed items on closed WOs in period), total vs closed preventive WOs.
  - **Operational overview:** WO source distribution (grouped by `sourceType`), rejection reason distribution (grouped by `rejectionReason` on `REJECTED` validations), reassignment count (`WorkOrderReassignment.count`), average hold periods per WO.
- `GET /work-orders/analytics` gains optional `?categoryId` query parameter — when provided, all asset-related queries filter by `asset.categoryId`.
- New interfaces: `AssetFailureKpiItem`, `AssetCostKpiItem`, `TechnicianKpiItem`, `AssetHealthItem`.
- `WorkOrderAnalyticsResponse` extended with `categoryId`, `assetKpis`, `technicianKpis`, `requesterAnalytics`, `preventivePlanEfficiency`, `operationalOverview` fields (backward-compatible addition).
- `SupervisorAnalyticsBoard` fully rewritten with 6-tab navigation using local state and `Button` components (no Radix dependency): Overview, Équipements, Techniciens, Plans préventifs, Demandeurs, Opérationnel. Each tab renders KPI cards + relevant tables.
- i18n keys added: `supervisorAnalytics.tabs.*`, `supervisorAnalytics.kpi.{globalMtbf,globalMttr,preventiveCompliance,totalMaintenanceCost,planComplianceRate,anomalyRate,totalPreventiveWOs,totalReportsSubmitted,reportConversionRate,reportToActionDelay,reassignmentCount,avgHoldPeriodsPerWo,...}`, `supervisorAnalytics.sections.{topFailingAssets,topCostAssets,technicianPerformance,sourceDistribution,rejectionReasons}`, `supervisorAnalytics.columns.*`, `supervisorAnalytics.states.noData`.

#### `feat(work-orders): add asset health recurring-failure panel to supervisor dashboard (§2.2)`
- `WorkOrdersService.getRecurringFailureAssets(thresholdCount, periodDays)`: groups CORRECTIVE WOs by asset within the lookback window, returns assets meeting or exceeding `thresholdCount` sorted descending by failure count. Returns `{ assetId, assetName, qrCode, failureCount, lastFailureDate }[]`.
- `GET /work-orders/asset-health?thresholdCount=3&periodDays=90` endpoint (Supervisor only, placed before `/:id`). Defaults: threshold = 3, period = 90 days.
- `AssetHealthItem` interface + `getAssetHealth()` API call added to `apps/web/lib/work-orders.api.ts`.
- Asset health panel added to `supervisor/page.tsx` between technician load and operational alerts sections: red border when assets are flagged; lists each at-risk asset with `Activity` icon, failure count badge, and last failure date.
- i18n keys: `supervisorDashboard.assetHealth.{title, description, none, lastFailure}`.
- **Tests (4 backend + 6 frontend):** `getRecurringFailureAssets` — empty when no WOs; asset returned when count meets threshold; excluded when below threshold; sorted descending by failure count. Frontend: `WorkOrderAnalyticsResponse` full contract, all-null nullable fields, `AssetHealthItem` shape, `TechnicianKpiItem` with data and nulls.
- **441 backend tests + 87 frontend tests total — 0 regressions.**

---

### Added — Technician pre-assignment, email preferences, and calendar preview (April 23, 2026)

#### `feat(work-orders): add technician pre-assignment and duration hints to WO creation (§2.5)`
- `CreateWorkOrderDto` gains two new optional fields: `principalTechnicianId?: string` and `contributorIds?: string[]` (both validated with `@IsOptional`, `@IsString`, `@IsArray`).
- `WorkOrdersController.create()` becomes async: when `principalTechnicianId` is provided in the payload, the controller calls `workOrders.publish()` then `assignment.assign()` immediately after creation — the WO is published and assigned in a single request.
- `GET /work-orders/duration-hints?assetId=&type=&technicianId=` returns `{ last5AssetAvgDays: number|null, categoryAvgDays: number|null, technicianAvgDays: number|null }`. All three values are computed in parallel via `Promise.all`: last-5 closed WOs on the same asset; average across closed WOs of the same category (skipped — resolves to `[]` — when the asset has no category); average for the given technician (omitted when `technicianId` is not provided). All averages rounded to 1 decimal.
- `DurationHintsQueryDto` added (`apps/backend/src/work-orders/dto/duration-hints-query.dto.ts`) with `assetId: string`, `type: WorkOrderType` (`@IsEnum`), and `technicianId?: string`.
- Route `GET /work-orders/duration-hints` declared before `GET /work-orders/:id` to prevent NestJS parameter capture.
- `GET /users/technicians` endpoint added to `UsersController` with `@Roles(Role.ADMIN, Role.SUPERVISOR)` method-level override (bypasses class-level ADMIN-only guard via `Reflector.getAllAndOverride`). Returns active TECHNICIAN users with id, name, email.
- Frontend `work-order-form-dialog.tsx` rewritten:
  - Technician `<Select>` populated from `usersApi.listTechnicians()`; shows open-WO count badge (amber CRITICAL indicator when any critical WO); principal is excluded from contributor list.
  - Contributor checkbox list shows per-tech load.
  - Blue duration-hints panel (Clock icon) shows `last5AssetAvgDays` / `categoryAvgDays` / `technicianAvgDays` — queried only when both `assetId` and `type` are selected.
  - `doCreate()` includes `principalTechnicianId` and `contributorIds` in the payload.
- `TechnicianOption` interface + `listTechnicians()` API call added to `apps/web/lib/users.api.ts`.
- `DurationHintsResponse` interface + `getDurationHints()` API call added to `apps/web/lib/work-orders.api.ts`.
- i18n keys added: `supervisorWorkOrders.form.principalTechnician`, `technicianPlaceholder`, `contributors`, `techLoad`, `techNoLoad`, `durationHints.{title, last5Asset, categoryAvg, techAvg}`.
- **Tests (6 in `work-orders.service.spec.ts`):** all-null with no WOs; correct averaging; technician avg; null when `technicianId` absent; category query uses asset's `categoryId`; rounding to 1 decimal. Note: when `categoryId` is null, `Promise.all` does not invoke `findMany` for category — only 2 mock calls needed.
- **423 backend tests total — 0 regressions.**

#### `feat(users): add per-user email notification preferences (§1.15)`
- `UsersService.getPreferences(userId)`: queries `emailNotificationsEnabled` for the user; throws `NotFoundException` if user does not exist.
- `UsersService.updateEmailNotificationsPreference(userId, enabled)`: updates the field and returns `{ emailNotificationsEnabled }`. Throws `NotFoundException` when user not found; does not call `update` in that case.
- `UpdateEmailNotificationsDto` (`apps/backend/src/users/dto/update-email-notifications.dto.ts`): single `@IsBoolean() enabled` field.
- `GET /users/me/preferences` endpoint: all roles allowed (method-level `@Roles` override). Returns `{ emailNotificationsEnabled: boolean }`.
- `PATCH /users/me/email-notifications` endpoint: all roles allowed, `@HttpCode(200)`. Accepts `UpdateEmailNotificationsDto`.
- `app-sidebar.tsx` sidebar user menu gains an email notification toggle item:
  - `useQuery` reads current preference; `useMutation` toggles it.
  - Optimistic cache update via `queryClient.setQueryData` on success.
  - `Mail` icon used regardless of enabled/disabled state (lucide-react v0.x does not export `MailOff`).
- `getMyPreferences()` + `updateEmailNotifications(enabled)` added to `apps/web/lib/users.api.ts`.
- i18n keys added: `userPreferences.emailNotifications.{label, description, enabled, disabled, updateSuccess, updateError}`.
- **Tests (11 in `users.service.spec.ts`):** `getPreferences` returns value; `getPreferences` throws on missing user; `updateEmailNotificationsPreference` updates to false; updates to true; throws on missing user; does not call `update` when user not found; `listActiveTechnicians` uses correct role filter.
- **434 backend tests total — 0 regressions.**

#### `feat(preventive-plans): add foreseeable WO generation calendar preview (§2.9)`
- `PreventivePlansService.getCalendarPreview(fromDate, toDate)`: fetches all active plans via `repo.findAll()`; for each plan with a non-null `nextDueAt`, projects future WO generation dates by iterating `computeNextDueAt()` in a loop. Safety cap: `MAX_ITEMS_PER_PLAN = 200` items per plan; `try/catch` around each `computeNextDueAt()` call breaks on malformed cron expressions. Occurrences before `fromDate` are skipped; iteration stops once past `toDate`. Final result is sorted ascending by `generationDate`.
- `CalendarPreviewItem` interface exported from `preventive-plans.service.ts`: `{ planId, planTitle, assetId, assetName, generationDate: string, estimatedDurationMinutes: number|null, defaultTechnicianId: string|null, defaultTechnicianName: string|null }`.
- `GET /preventive-plans/calendar?fromDate&toDate` endpoint: SUPERVISOR only; inline `CalendarQueryDto` class with `@IsOptional @IsDateString` fields; defaults to today and today + 90 days when params omitted. Declared before `GET /preventive-plans/:id`.
- Frontend `preventive-plans-board.tsx` gains a List/Calendar toggle button group in the header:
  - List view: existing table + pagination (unchanged).
  - Calendar view: `useQuery` for `preventivePlansApi.getCalendar()`; results grouped by day string via `useMemo`; each day section shows plan title, asset name, technician name (if set), and estimated duration in minutes.
- `CalendarPreviewItem` interface + `getCalendar()` API call added to `apps/web/lib/preventive-plans.api.ts`.
- i18n keys added: `supervisorPreventivePlans.views.{list, calendar}`, `supervisorPreventivePlans.calendar.{empty, total, itemCount}`.
- **Tests (8 in `preventive-plans-calendar.service.spec.ts`):** empty array when no `nextDueAt`; item within window; 3 occurrences with 30-day interval over 90 days; excludes occurrences before `fromDate`; results sorted by date across multiple plans; `defaultTechnicianName` populated when plan has a technician; `defaultTechnicianId` null when no technician.
- **442 backend tests total — 0 regressions.**

---

### Added — Storekeeper cost analytics and on-hold long-waiting request detection (April 23, 2026)

#### `feat(inventory): add monthly cost trend analytics (§3.1)`
- `InventoryRepository.getCostTrend(periodDays)`: raw SQL query that groups `OUTGOING` stock movements by calendar month and computes `SUM(quantity × COALESCE(unitCostAtTime, unitCost, 0))`. Returns `[{ month: "YYYY-MM", totalCost: number }]` ordered ASC — suitable for a month-over-month trend table.
- `InventoryCostTrendItem` interface added to `apps/web/lib/inventory.api.ts`.
- `StockAnalyticsBoard` gains a "Évolution des dépenses en pièces" section: table of monthly spending rows with currency formatting; empty state shown when no OUTGOING movements exist in the period.

#### `feat(inventory): add long-waiting requests on blocked work orders (§3.2)`
- `InventoryRepository.getLongWaitingOnHoldRequests(thresholdHours)`: raw SQL with `JOIN "WorkOrder" ON status='ON_HOLD'`, `LEFT JOIN "Part"`, filtered to `PartRequest.status='PENDING'` and `createdAt <= NOW() - thresholdHours`. Returns full request detail including `waitingHours` (rounded integer).
- `LongWaitingPartRequest` interface added to `apps/web/lib/inventory.api.ts`.
- `InventoryService.getAnalytics()` extended with a `longWaitingThresholdHours = 24` parameter (backward compatible; existing callers without the param keep the default of 24 h).
- `GET /stock/analytics` gains an optional `?longWaitingThresholdHours` query param (clamped to ≥ 1 in controller).
- `StockAnalyticsBoard` gains a configurable "Attente max (h)" filter input and a "Demandes en attente sur OT bloqués" section: amber warning banner when count > 0 (badge on card title); table of stuck requests with WO reference, part name (or off-catalog description), quantity, and waiting hours; empty state when none detected.
- `InventoryAnalyticsResponse` extended with `costTrend`, `longWaitingRequests`, and `longWaitingThresholdHours` fields; `getAnalytics()` API call accepts the new param.
- i18n: `storekeeperAnalytics.filters.longWaitingHours`, `storekeeperAnalytics.sections.{costTrend,costTrendDescription,longWaitingRequests,longWaitingRequestsDescription}`, `storekeeperAnalytics.columns.{month,totalSpending,workOrder,waitingHours}`, `storekeeperAnalytics.labels.{offCatalog,longWaitingWarning}`, `storekeeperAnalytics.states.noLongWaiting` added to FR translations.
- **Tests (9 in `inventory.repository.spec.ts`):** `getCostTrend` maps rows; empty array on no data; null total_cost defaults to 0; `since` date boundary matches `periodDays × 86400 s`. `getLongWaitingOnHoldRequests` maps rows; off-catalog request (null partId/partName); empty array; cutoff boundary matches `thresholdHours × 3600 s`; `waitingHours` rounds correctly.
- **417 backend tests total — 0 regressions.**

### Added — Document versioning, part catalog documents, and preventive plan documents (April 22, 2026)

#### `feat(documents): implement automatic versioning on document upload (§1.10)`
- `DocumentsService` now implements version archiving via a private `_doUpload()` helper called by all upload paths (asset, part, plan).
- On each upload: queries for an existing `isCurrentVersion: true` document with the same `entityType + entityId + documentType`; if found, marks it `isCurrentVersion = false` and sets `replacedById = newDocId` inside a Prisma `$transaction` that atomically creates the new record; new document receives `version = old.version + 1`. First upload always creates `version = 1`.
- New `getVersionHistory(docId)`: finds all documents sharing the same `entityType`, `entityId`, and `documentType`, returned in `version desc` order.
- Existing asset document upload (`upload()`) now delegates to `_doUpload()` — asset documents gain versioning without any API surface change.
- **Tests (25 in `documents.service.spec.ts`):** version-1 creation when no prior doc; version-2 creation + archiving of prior current version; `replacedById` wired correctly; `$transaction` used; `getVersionHistory` queries all chain docs; `NotFoundException` on missing entity (asset, part, plan); `BadRequestException` for disallowed types per entity; `ForbiddenException` on delete of certificate-owned doc; `getDownloadUrl` returns presigned URL.

#### `feat(inventory): add document attachments to part catalog (§1.11 + §3.3)`
- `DocumentsService.findByPart(partId)` + `uploadForPart(partId, file, documentType, actorId)` added. Allowed types enforced: `TECHNICAL_MANUAL`, `SAFETY_DATA_SHEET`, `SPECIFICATION_SHEET`. Any other type throws `BadRequestException`.
- `AssetsModule` exports `DocumentsService`; `InventoryModule` imports `AssetsModule` to inject it into `PartsController`.
- `PartsController` gains five new endpoints:
  - `GET /parts/:id/documents` — list current-version docs (all operational roles)
  - `POST /parts/:id/documents` — upload with multipart `file` + `documentType` (SUPERVISOR or STOREKEEPER)
  - `GET /parts/:id/documents/:docId/download` — presigned URL (all operational roles)
  - `GET /parts/:id/documents/:docId/versions` — full version history (all operational roles)
  - `DELETE /parts/:id/documents/:docId` — hard delete (SUPERVISOR or STOREKEEPER)
- `PartDocument` interface + five `inventoryApi` methods added to `apps/web/lib/inventory.api.ts`.
- `PartDocumentsDialog` component (`apps/web/components/storekeeper/part-documents-dialog.tsx`): Dialog opened from a new FileText icon button on every part row in the storekeeper inventory catalog; shows current-version documents with version badge, download and delete actions; inline upload form (type select + file picker) shown only to SUPERVISOR/STOREKEEPER roles (checked via `useAuthStore`).
- `storekeeperInventory.documents.*` and `storekeeperInventory.actions.viewDocuments` i18n keys added.
- **Tests (10 in `parts.documents.controller.spec.ts`):** `listDocuments` → `findByPart`; `uploadDocument` → `uploadForPart` with correct args; `BadRequestException` propagated for invalid type; `getDocumentDownload` → presigned URL; `getDocumentVersionHistory` → ordered list; `deleteDocument` → `delete`; `NotFoundException` propagated on all paths.

#### `feat(preventive-plans): add document attachments to preventive plans (§1.12)`
- `DocumentsService.findByPlan(planId)` + `uploadForPlan(planId, file, documentType, actorId)` added. Allowed types: `PROCEDURE_DOCUMENT`, `SAFETY_DATA_SHEET`, `SPECIFICATION_SHEET`.
- `PreventivePlansModule` imports `AssetsModule`; `PreventivePlansController` injects `DocumentsService`.
- `PreventivePlansController` gains five new endpoints following the same pattern as parts (all-roles read, SUPERVISOR-only write).
- `PlanDocument` interface + five `preventivePlansApi` methods added to `apps/web/lib/preventive-plans.api.ts`.
- `PreventivePlanDetailDialog` gains an inline "Documents du plan" section positioned between the plan metadata and the checklist: document list with version badge + download + delete; upload form (type select + file picker) always visible to supervisors (the only role accessing this dialog); `useQuery` with `['supervisor', 'preventive-plans', planId, 'documents']` key.
- `supervisorPreventivePlans.documents.*` i18n keys added.
- **Tests (6 in `preventive-plans.documents.controller.spec.ts`):** delegates to `DocumentsService` on all 5 endpoints; error propagation verified.
- **Frontend tests (27 in `document-utils.spec.ts`):** `PART_ALLOWED_TYPES` contains exactly the 3 allowed types and excludes all 6 disallowed types; `PLAN_ALLOWED_TYPES` same coverage; `formatFileSize` boundary tests (bytes / KB / MB); version chain semantics (single upload = v1, chain cardinality, `isCurrentVersion` uniqueness, `replacedById` linkage).
- **408 backend tests total — 0 regressions. 74 frontend tests total — 0 regressions.**

### Added — Admin notifications for job failures and email delivery errors (April 22, 2026)

#### `feat(notifications): add notifyAdmins() to NotificationsService (§1.16)`
- `NotificationsService.notifyAdmins(type, title, summary, entityType?, entityId?)` added — symmetric to `notifySupervisors()`: queries all active `ADMIN` users and calls `notifyMany()` with the full fan-out; `entityType` and `entityId` are optional to accommodate system-level notifications that have no specific entity.
- **Tests (3):** active ADMIN users queried; `notifyMany` called with correct `recipientId`/type/title/summary/entityType/entityId per admin; no-op (empty `notifyMany` call) when no active admins exist; `entityType`/`entityId` passed through as `undefined` when omitted.

#### `feat(job-logger): emit SCHEDULED_JOB_FAILED to admins on cron job failure (§1.16)`
- `JobLoggerService` now injects `@Optional() NotificationsService | null` as a second constructor argument. The `@Optional()` decorator preserves backward compatibility: all existing unit tests that instantiate the service with only `PrismaService` continue to pass without modification.
- `recordFailure()` calls the private `notifyAdminsJobFailed(jobName, message)` after persisting the failure log. That helper checks the `Notification` table for a recent `SCHEDULED_JOB_FAILED` entry within the last 23 hours (`entityType='ScheduledJob'`, `entityId=jobName`) and skips if one exists — preventing hourly spam when a job fails persistently.
- Notification summary includes the job name and the (possibly truncated) error message.
- No modification to any of the 6 existing cron job files — the notification is fired transparently from the shared logger.
- **Tests (8 new, 2 updated existing):** dedup skip when recent notification found; sends when no dedup entry; dedup query uses correct `type`/`entityType`/`entityId`/23h window; notification summary contains job name; notification summary contains error message; error message truncated to 500 chars before inclusion; `@Optional()` null-safety — no crash, no notification when `notifications=null`; DB errors in `recordFailure` still swallowed.

#### `feat(admin): add FailedNotificationDetectorJob for email delivery failure alerting (§1.16)`
- New `@Cron(EVERY_HOUR)` job at `apps/backend/src/admin/failed-notification-detector.job.ts`, registered in `AdminModule`.
- `doRun()` counts `Notification` rows with `emailFailed: true` created within the last 23 hours. If count > 0, checks a dedup entry (`NOTIFICATION_DELIVERY_FAILED`, `entityType='system'`, `entityId='email-delivery'`) within the same 23h window; if not found, emits `NOTIFICATION_DELIVERY_FAILED` to all active admins via `notifyAdmins()` with the failure count in the summary.
- Job execution wrapped with `jobLogger.recordStart`/`recordSuccess`/`recordFailure`, making it visible in the admin scheduled-job health panel.
- Does NOT query dedup when `failedCount === 0` (short-circuits early to avoid an unnecessary `findFirst`).
- **Tests (15):** `run()` calls `recordStart`/`recordSuccess` on success; `run()` calls `recordFailure` and re-throws on error; `doRun()` skips `notifyAdmins` when `failedCount=0`; count query uses `emailFailed=true` with 23h `gte` window; notifies when count > 0 and no dedup entry; summary contains the failure count; dedup skip when recent `NOTIFICATION_DELIVERY_FAILED` exists; dedup query uses correct type/entityType/entityId/window; `findFirst` not called when count is 0.
- **367 backend tests total — 0 regressions.**

### Added — Supervisor dashboard operational panels and validation queue (April 22, 2026)

#### `feat(backend): add closedAfter/closedBefore date filters to work-order list query (§2.2)`
- `WorkOrderQueryDto` gains two optional `@IsDateString()` fields: `closedAfter` and `closedBefore` (both documented via Swagger `@ApiPropertyOptional`).
- `WorkOrdersRepository.findAll` translates the params to a `closedAt: { gte, lte }` Prisma predicate using only the provided bounds; absent params produce no `closedAt` key in the `where` clause — all existing callers are unaffected.
- Used by the supervisor dashboard "Clôturés aujourd'hui" panel to count WOs closed since UTC midnight.
- **Tests (8):** `closedAfter` → `gte` Date object; `closedBefore` → `lte` Date object; combined range → both keys in same `closedAt` object; absent params → no `closedAt`; `status` filter still applied alongside `closedAfter`; `search` still applied alongside `closedAfter`; param stored as a `Date` instance (not a string); empty query → no `closedAt` key.

#### `feat(assets): add certificate alerts endpoint for supervisor dashboard (§2.2)`
- New `CertificatesService.findAlerts()` method: queries all non-archived `EXPIRING_SOON` and `EXPIRED` compliance certificates with their parent asset (`id`, `name`), ordered by `expirationDate` ascending. Returns `CertificateAlertItem[]` (exported interface).
- New `GET /assets/certificates/alerts` route in `AssetsController` (Supervisor only). Declared before the generic `GET /assets/:id` handler to prevent NestJS routing the literal segment `certificates` as an asset ID.
- **Tests (5):** only EXPIRING_SOON/EXPIRED queried; archived certs excluded; Prisma rows mapped to `CertificateAlertItem`; EXPIRED status preserved; empty list returned when none; results ordered by `expirationDate asc`. (341 backend tests total, 0 regressions.)

#### `feat(web): add operational panels to supervisor dashboard (§2.2)`
- New `lib/date-utils.ts` module: `elapsedSince(isoDate)` returns a short human-readable elapsed duration ("3h", "2j"); `todayStartIso()` returns the ISO-8601 UTC midnight timestamp for today. Both utilities are pure functions and covered by dedicated tests.
- `CertificateAlertItem` interface + `assetsApi.getCertificateAlerts()` added to `assets.api.ts`.
- `closedAfter?: string` and `closedBefore?: string` added to `WorkOrderListQuery` in `work-orders.api.ts`.
- Supervisor dashboard (`supervisor/page.tsx`) gains a second row of three operational panels below the existing summary cards:
  1. **Clôturés aujourd'hui** — live count of WOs with `status=CLOSED&closedAfter=<UTC-midnight>`; links to work-orders board.
  2. **Demandes bloquées** — fetches up to 100 PENDING part requests and counts those where `workOrder.status === ON_HOLD`; amber border when count > 0; links to work-orders board.
  3. **Certificats à risque** — lists up to 4 EXPIRING_SOON/EXPIRED certs inline with asset name, expiration date, and colored badge; shows overflow count; links to assets page.
- The "À valider" summary card CTA now navigates to `/supervisor/validation-queue` instead of the general work-orders board.
- **Tests (10):** `elapsedSince` boundary at 0h / Nh / 23h59m / 24h / 2j / 7j; `todayStartIso` produces UTC midnight of today; ISO-8601 format; always in the past. (37 frontend tests total, 0 regressions.)

#### `feat(web): add dedicated validation queue view for supervisors (§2.7)`
- New `ValidationQueueBoard` component (`components/supervisor/validation-queue-board.tsx`): paginated table filtered to `PENDING_VALIDATION` WOs with columns — reference (monospace), asset + location path, principal technician, type badge, priority badge, time-in-queue (from `elapsedSince`). Clicking a row opens the existing `WorkOrderDetailDialog` where the supervisor can approve or reject closure. Empty state, error state, and pagination controls included.
- New route `app/(protected)/supervisor/validation-queue/page.tsx` with page title and subtitle.
- Supervisor sidebar gains a "File de validation" nav item (ShieldCheck icon) pointing to `/supervisor/validation-queue`.
- **i18n:** `nav.validationQueue`, `validationQueue.{title,subtitle,total,columns.*,states.*}` keys added to `common.json`.

### Added — COULD_NOT_INTERVENE follow-up WO flow and technician load panel (April 22, 2026)

#### `feat(db): add FOLLOW_UP to WorkOrderSource enum with migration (§1.4)`
- `WorkOrderSource.FOLLOW_UP` added to `packages/db/prisma/schema.prisma` and to the `@gmao/shared` `WorkOrderSource` enum in `packages/shared/src/enums/work-order.enum.ts`.
- Migration `20260422000001_add_follow_up_source`: `ALTER TYPE "WorkOrderSource" ADD VALUE 'FOLLOW_UP';` — additive, safe to apply with zero downtime.

#### `feat(work-orders): add follow-up WO creation from COULD_NOT_INTERVENE closures (§1.4)`
- New `CreateFollowUpDto` (`apps/backend/src/work-orders/dto/create-follow-up.dto.ts`): `type`, `priority`, `description` (required) + `internalNotes`, `estimatedDurationMinutes`, `dueDate` (optional). `assetId` is intentionally excluded — inherited from the original WO to enforce unambiguous cross-reference.
- `WorkOrdersRepository.create()` gains an optional 7th parameter `followUpFromId?: string` passed to `tx.workOrder.create`. `findById` include now fetches `followUpFrom: { id, referenceNumber }` and `followUps: [{ id, referenceNumber }]` self-relations.
- `WorkOrdersService.createFollowUp(originalWoId, dto, actorId)`: validates original WO status is `CLOSED` (throws `BadRequestException('workOrders.followUp.originalMustBeClosed')` otherwise); inherits `assetId`; calls `repo.create` with `sourceType=FOLLOW_UP` and `followUpFromId=originalWoId`.
- New `GET /work-orders/technician-load` endpoint declared before `GET /:id` to avoid route shadowing. `TechnicianLoadItem` interface exported from the service.
- New `POST /work-orders/:id/follow-up` controller action (Supervisor only).
- **Tests (9):** happy path verifies `repo.create` receives `FOLLOW_UP` source + `followUpFromId`; non-CLOSED guard throws `BadRequestException`; `assetId` inherited (not from DTO); asset not-found propagates; 5 `getTechnicianLoad` tests (empty, aggregation, CRITICAL detection, sort order, hasCritical=false). (350 backend tests total, 0 regressions.)

#### `feat(web): add follow-up WO prompt and cross-reference display in validation dialog (§2.4)`
- `WorkOrderCrossRef`, `CreateFollowUpPayload`, and `TechnicianLoadItem` interfaces added to `lib/work-orders.api.ts`; `WorkOrderDetail` extended with `followUpFrom: WorkOrderCrossRef | null` and `followUps: WorkOrderCrossRef[]`; `createFollowUp()` and `getTechnicianLoad()` API methods added.
- `work-order-detail-dialog.tsx` uses a `useRef` (`pendingFollowUpCtxRef`) to capture the pre-mutation context (originalWoId, referenceNumber, assetId, description, priority) immediately before `validateMutation.mutate()` fires. In `onSuccess`, if the ref is set, a yellow-bordered prompt panel replaces the validation panel, offering "Ignorer" and "Créer un OT de suivi" buttons.
- Cross-reference section in the detail card shows `followUpFrom.referenceNumber` and a list of `followUps` references when present.
- **i18n:** `supervisorWorkOrders.followUp.{promptTitle,promptBody,dismiss,create,descriptionPrefix}`, `supervisorWorkOrders.toasts.{followUpCreated,followUpError}`, `supervisorWorkOrders.detail.{followUpChain,followUpFrom,followUps}` keys added to `fr/common.json`.
- **Tests (10):** `follow-up-utils.spec.ts` — `buildFollowUpDescription` prefix formatting (3 tests); `resolveNotificationRoute` for `FOLLOW_UP_PROMPT` notifications (3 tests); `TechnicianLoadItem` sort/hasCritical display logic (4 tests). (47 frontend tests total, 0 regressions.)

#### `feat(web): add technician load panel to supervisor dashboard (§2.2 remaining)`
- `TechnicianLoadItem` type imported from `lib/work-orders.api.ts`.
- New `TechnicianLoadRow` sub-component renders technician name, open WO count, and a destructive "CRITIQUE" badge when `hasCritical=true`.
- `supervisor/page.tsx` adds an 11th `useQueries` entry calling `getTechnicianLoad()`; the result is rendered as a card panel sorted descending by `openWoCount`; empty state shows a checkmark message.
- **i18n:** `supervisorDashboard.technicianLoad.{title,woCount,criticalLabel,none}` keys added to `fr/common.json`.

### Added — Scheduled job health monitoring and QR code print (April 21, 2026)

#### `feat(admin): track scheduled job execution health with per-job cron log (§4.1)`
- New `ScheduledJobLog` Prisma model (`jobName UNIQUE`, `lastRunAt`, `lastSuccessAt`, `lastFailureAt`, `lastErrorMessage`, `updatedAt`) with migration `20260421000000_scheduled_job_log`.
- New `JobLoggerService` in `apps/backend/src/job-logger/` (dedicated module): `recordStart()`, `recordSuccess()`, `recordFailure()` (message truncated to 500 chars), `getAll()`. All log methods swallow DB errors so a failing log write never interrupts a cron job.
- All 6 existing cron jobs (`ValidationReminderJob`, `DueDateApproachingJob`, `ContractorDateOverdueJob`, `AccessRetryApproachingJob`, `DailySummaryJob`, `PriorityEscalationJob`) now wrap their execution in a try/catch that calls `recordStart` / `recordSuccess` / `recordFailure`. Logic extracted to a private `doRun()` to keep the `run()` shell clean.
- `JobLoggerModule` imported in both `WorkOrdersModule` (for the cron jobs) and `AdminModule` (for analytics read-path) — no circular dependency.
- `AdminAnalyticsService.getSystemHealthStats()` fetches job logs in parallel via `Promise.all` and merges them as `scheduledJobs: ScheduledJobStatus[]` in the response.
- Admin analytics board now shows a "Tâches planifiées" section: per-job table with status badge (healthy / failed / unknown), last run, last success, last failure timestamp, and last error message.
- **Tests:** 9 `job-logger.service.spec.ts` tests; 2 new `admin-analytics.service.spec.ts` tests; 3 lifecycle-logging tests added to each of the 6 existing job spec files; new `priority-escalation.job.spec.ts` with 6 tests. 328 backend tests total (0 regressions).

#### `feat(web): render QR code image with print action in asset detail dialog (§2.8)`
- Added `react-qr-code ^2.0.15` dependency to `apps/web`.
- New pure-function library `apps/web/lib/qr-print.ts`: `buildQrPrintHtml(options, svgMarkup)` generates an XSS-safe standalone print HTML document (escapes `<`/`>` in `assetName` and `identifier`, embeds SVG verbatim, includes `window.print()` auto-trigger); `openQrPrintWindow()` opens a `_blank` popup and writes the HTML.
- `asset-detail-dialog.tsx` now renders a `<QRCode>` SVG component (size 120, level M) beside the QR identifier and exposes a "Imprimer le QR" print button that extracts the SVG from the DOM and calls `openQrPrintWindow()`.
- i18n: `supervisorAssets.detail.printQrCode` and `supervisorAssets.detail.qrCodeAriaLabel` added to `common.json`.
- **Tests:** 10 `qr-print.spec.ts` tests covering asset name/identifier inclusion, SVG injection, XSS escaping, auto-print script, HTML document structure, print media query, SVG dimensions, and `lang="fr"` attribute. 27 frontend tests total (0 regressions).

### Fixed + Added — Checklist source attribution, WO detail cost summary, and checklist display (April 20, 2026)

#### `fix(work-orders): fix checklist anomaly-WO source attribution (§1.14)`
- Auto-corrective WOs created from checklist anomalies were tagged `sourceType: PREVENTIVE_PLAN`, making them indistinguishable from plan-generated WOs in analytics. Added `WorkOrderSource.CHECKLIST_ANOMALY` to the Prisma schema, `@gmao/shared` enum, and migration `20260420143130_add_checklist_anomaly_source`.
- `ChecklistService.completeItem()` now uses `WorkOrderSource.CHECKLIST_ANOMALY` and propagates `sourcePlanId` from the parent WO, so the link to the originating preventive plan is preserved.
- `@gmao/db` rebuilt to distribute the updated enum to consumers.
- 12 new unit tests in `checklist.service.spec.ts` covering: wrong WO status, unassigned actor, missing item, wrong WO binding, already-completed guard, missing `anomalyDescription`, mandatory item NOT_APPLICABLE guard, missing `notApplicableReason`, DONE without auto-create, ANOMALY + auto-create with/without `sourcePlanId`, and ANOMALY without auto-create.

#### `feat(work-orders): expose computed cost summary on WO detail endpoint (§1.2)`
- `GET /work-orders/:id` now computes `costSummary` (laborCost, partsCost, contractorCost, totalCost) via `calculateWorkOrderCostSummary` and returns it merged into the WO detail response. No new DB query — the data was already included (intervention logs with `hourlyRateAtTime`/`activeDurationMinutes`, stock movements with `unitCostAtTime`/`quantity`).
- 2 new integration tests: zero-cost WO returns all-zero summary; WO with 120min @ 30/h + 2 parts @ 15 + 100 contractor = 190 total.

#### `fix(web): fix checklist status display and expose cost summary in WO detail dialog (§6.3 + §1.2)`
- **Ghost field removed (§6.3):** `completedNote: string | null` did not exist in the Prisma schema and was always `undefined` at runtime. Replaced with `anomalyDescription: string | null` and `notApplicableReason: string | null` (the actual DB fields).
- **Status badge fix:** The checklist item badge in the supervisor WO detail dialog was checking for `COMPLETED` and `SKIPPED` — values that do not exist in `ChecklistItemStatus`. Now correctly switches on `DONE`, `ANOMALY_DETECTED`, `NOT_APPLICABLE`, and `PENDING` with appropriate badge variants (`success`, `destructive`, `secondary`, `outline`).
- **i18n key pattern fixed:** The badge label was built from a broken string concatenation (`checklist${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`) which produced wrong keys for multi-word statuses. Replaced with `checklistStatus.<STATUS>` nested object keys in `common.json`.
- **Anomaly/notApplicable sub-text:** Checklist items now show `anomalyDescription` in destructive color and `notApplicableReason` in muted color when set.
- **Cost summary section:** WO detail dialog renders a four-cell grid (labor / parts / contractor / total) when `costSummary` is present, using `Intl.NumberFormat('fr-FR')` formatting.
- **Type updates:** `WorkOrderDetail` gains `costSummary: WorkOrderCostSummaryDetail`; `WorkOrderAnalyticsResponse` also typed; `WorkOrderCostSummaryDetail` interface extracted.
- **i18n additions:** `checklistStatus.{PENDING,DONE,ANOMALY_DETECTED,NOT_APPLICABLE}`, `checklistAnomalyDescription`, `checklistNotApplicableReason`, `costSummary`, `costSummaryDescription`, `costLabor`, `costParts`, `costContractor`, `costTotal` keys added to `common.json`.

### Fixed + Added — On-hold supervisor management, hold-metadata endpoint, and hold scheduler jobs (April 20, 2026)

#### `fix(work-orders): separate hold management actor responsibilities (§6.1 + §1.5)`
- **Actor fix (§6.1):** `ResolveHoldDto` no longer accepts `resolutionNote` — the supervisor's resolution plan note is not the technician's responsibility. `OnHoldService.resume()` removes the `supervisorResolutionNote` write from the resume transaction; the field must be set exclusively via the new supervisor endpoint before the technician resumes.
- **New endpoint (§1.5):** `PATCH /work-orders/:id/hold-metadata` (Supervisor only) — `UpdateHoldMetadataDto` accepts `expectedResolutionDate?: string`, `retryDate?: string`, `resolutionNote?: string`; all fields are optional and only provided fields are written. Returns the updated `WorkOrder`.
- `OnHoldService.updateHoldMetadata()` validates that the WO is `ON_HOLD`, finds the most-recent unresolved `OnHoldPeriod` (`resumedAt: null`), and applies a partial update. Empty DTO is a safe no-op (no DB write).
- Guards: `BadRequestException` when WO is not `ON_HOLD`; `NotFoundException` when no active hold period exists.

#### `feat(work-orders): add ContractorDateOverdueJob and AccessRetryApproachingJob schedulers (§1.6)`
- **`ContractorDateOverdueJob`** (`@Cron(EVERY_HOUR)`): queries `OnHoldPeriod` rows where `reasonType = EXTERNAL_CONTRACTOR`, `resumedAt = null`, and `expectedResolutionDate < now`; emits `CONTRACTOR_DATE_OVERDUE` to all supervisors for each matching WO; 23-hour deduplication window prevents hourly re-notification.
- **`AccessRetryApproachingJob`** (`@Cron(EVERY_HOUR)`): queries `OnHoldPeriod` rows where `reasonType = ACCESS_DENIED`, `resumedAt = null`, and `retryDate ∈ [now, now+24h]`; emits `ACCESS_RETRY_APPROACHING` to all supervisors; formatted retry date included in the notification summary; 23-hour deduplication window.
- Both jobs registered in `WorkOrdersModule` alongside the existing hold-related jobs.
- 8 unit tests each: cron metadata, no-op, send, dedup skip, mixed send/skip, hold query predicate, dedup query window, error propagation.

#### `feat(web): supervisor hold management UI with hold-metadata endpoint wiring (§2.6 + §6.2)`
- **Frontend type fix (§6.2):** `WorkOrderOnHoldPeriod` interface corrected — removed the wrong `reason`/`note` fields (which were always `undefined` at runtime; the DB columns are `reasonType` and `detail`); added all missing fields: `reasonType`, `detail`, `expectedResolutionDate`, `retryDate`, `supervisorAssetStatusChoice`, `supervisorResolutionNote`.
- **API client:** `workOrdersApi.updateHoldMetadata(id, payload)` wraps `PATCH /work-orders/:id/hold-metadata`.
- **Hold period display:** On-hold period cards in the supervisor WO detail dialog now render `reasonType` (translated via `supervisorWorkOrders.holdReasonType.*`), `detail`, `expectedResolutionDate`, `retryDate`, and `supervisorResolutionNote`.
- **Supervisor management form:** When the WO is `ON_HOLD`, a collapsible inline form ("Mettre à jour les informations de mise en attente") allows the supervisor to set any combination of `expectedResolutionDate`, `retryDate`, and `resolutionNote` and save via `PATCH /hold-metadata`.
- **i18n:** All new UI strings added to `apps/web/public/locales/fr/common.json` under `supervisorWorkOrders.holdReasonType.*`, `supervisorWorkOrders.labels.*`, `supervisorWorkOrders.actions.*`, and `supervisorWorkOrders.toasts.*`.

### Added — Work-order cost summary in analytics and PDF reports (April 18, 2026)

#### `feat(work-orders): compute labor, parts, and contractor cost for closed work orders`
- Added a shared work-order cost calculator that rolls up contractor cost, labor cost from intervention logs, and parts cost from outgoing stock movements
- `GET /work-orders/analytics` now includes a `costSummary` payload for the requested period
- PDF generation for closed work orders now renders a dedicated cost section with parts, labor, contractor, and total cost values
- Added coverage:
  - `work-orders.service.spec.ts`: analytics cost summary calculation
  - `work-orders.controller.integration.spec.ts`: analytics endpoint payload shape
  - `report-generation.service.spec.ts`: PDF cost section rendering and computed totals

### Fixed — Work-order promotion guard and intervention-log cleanup (April 18, 2026)

#### `fix(work-orders): reject promote on terminal WOs and close the previous principal log on in-progress promotion`
- `AssignmentService.promote()` now reuses the shared terminal-state guard, so `CLOSED` and `CANCELLED` work orders cannot be promoted
- When promotion happens on an `IN_PROGRESS` work order, the old principal's open `InterventionLog` is closed with the same reassignment-remnant semantics used by the reassignment flow
- Added full coverage:
  - `assignment.service.spec.ts`: terminal rejection, in-progress log closure, and non-in-progress no-op on intervention logs
  - `work-orders.controller.integration.spec.ts`: promote route auth, validation, and success wiring

### Fixed — Work-order cancellation detail contract enforcement (April 18, 2026)

#### `fix(work-orders): require cancellation detail for EXTERNAL_DECISION and RESOLVED_OTHERWISE`
- `CancelWorkOrderDto` now enforces conditional validation: `detail` is mandatory only when reason is `EXTERNAL_DECISION` or `RESOLVED_OTHERWISE`
- Whitespace-only values are rejected at DTO level with `workOrders.cancellationDetailRequired`
- `WorkOrdersService.cancel()` now applies the same rule defensively (service-layer guard) and trims persisted `cancellationDetail`
- Added full coverage:
  - `work-orders.service.spec.ts`: required/missing detail, whitespace-only edge case, optional detail for other reasons, trimming behavior
  - `work-orders.controller.integration.spec.ts`: auth (401), role enforcement (403), validation failures (400), and success paths (200)

### Added — Notification system completeness: WO_RESUMED, LINKED_WO_CLOSED, DUE_DATE_APPROACHING, deep-linking (April 18, 2026)

#### `feat(work-orders): emit WO_RESUMED notification to contributors on hold resume`
- `OnHoldService.resume()` now emits `WO_RESUMED` to every **active contributor** technician after the work order transitions back to `IN_PROGRESS`
- The principal technician (who initiates the resume) is intentionally excluded — notification targets collaborators who were not involved in the decision
- Uses existing `notifyMany()` for batch delivery with in-app + conditional email channels
- 14 unit tests: `putOnHold` asset-status derivation per reason (MISSING_PART, EXTERNAL_CONTRACTOR, ACCESS_DENIED corrective/preventive, OTHER with/without choice), forbidden guard, supervisor notification; `resume` no-contributors no-op, active-only targeting, principal exclusion, correct `WO_RESUMED` type/entityId, state-machine guard

#### `feat(work-orders): notify requester via LINKED_WO_CLOSED on WO validation`
- `ValidationService.validate()` reads `sourceReport.reporter.id` from the eagerly-loaded `findById` result and emits `LINKED_WO_CLOSED` to the original requester when a WO was created from a problem report
- Works on both normal-path and `COULD_NOT_INTERVENE` paths — the requester is notified regardless of the technical outcome
- Summary message contains the WO reference number for traceability
- 4 new tests appended to `validation.service.spec.ts`: notify with reporter, not notify without source report, notify on CNI path too, summary contains reference number

#### `feat(work-orders): add DueDateApproachingJob for 24h technician alerts`
- New `DueDateApproachingJob` (`@Cron(EVERY_HOUR)`) queries WOs in any active status (`OPEN / ASSIGNED / IN_PROGRESS / ON_HOLD / PENDING_VALIDATION`) whose `dueDate` falls within the next 24 hours and have a `principalTechnicianId`
- Deduplication: checks the `notification` table for existing `DUE_DATE_APPROACHING` entries for the same WO within the last 23 hours — prevents re-notifying every hour for the same WO
- `DueDateApproachingJob` registered in `WorkOrdersModule` alongside the existing `PriorityEscalationJob` and `DailySummaryJob`
- 15 unit tests: cron decorator metadata, empty-case no-op, single WO notification, dedup skip, mixed new/already-notified, all three get notified, 23h dedup window boundary, workOrder query predicate (status filter, time window, principalTechnicianId not null)

#### `feat(work-orders): add ValidationReminderJob for stale pending validations`
- New `ValidationReminderJob` (`@Cron(EVERY_HOUR)`) queries work orders in `PENDING_VALIDATION` for at least 24 hours (`updatedAt <= now - 24h`)
- Deduplication: checks the `notification` table for existing `VALIDATION_REMINDER_24H` entries for the same WO within the last 23 hours — prevents hourly re-notification spam
- Uses existing `NotificationsService.notifySupervisors()` path to alert active supervisors with `entityType='WorkOrder'` and `entityId=<woId>`
- `ValidationReminderJob` registered in `WorkOrdersModule` with the other scheduled work-order jobs
- 8 unit tests: cron metadata, empty-case no-op, send path, dedup skip, mixed send/skip, 23h dedup query window, 24h stale threshold query, and error propagation on notification failure

#### `feat(web): implement notification deep-linking with entity routing`
- New pure-function module `apps/web/lib/notification-routing.ts`: `resolveNotificationRoute(notification, roles)` maps `entityType + user roles → URL string | null`; `WorkOrder` → `/supervisor/work-orders?id=X`; `ProblemReport` → `/supervisor/reports?id=X`; `PartRequest` → `/storekeeper/part-requests?id=X`; `Asset` + `ComplianceCertificate` → `/supervisor/assets?id=X`
- `notification-menu.tsx`: clicking a notification now calls `resolveNotificationRoute`, closes the dropdown, marks the notification read, and navigates via `useRouter`; notifications without a resolvable route still mark read only (backward-compatible)
- `work-order-detail-dialog.tsx`: prop type widened from `WorkOrderListItem | null` to `WorkOrderListItem | { id: string } | null` — accepts a minimal object for deep-link open; header fields guarded with `'referenceNumber' in workOrder` checks; internal `getById` query still fetches full details
- `work-orders-board.tsx`: reads `?id=` query param via `useSearchParams`; when present and auth is initialized, auto-opens the detail dialog with `{ id }` and replaces the URL to prevent re-open on refresh
- `supervisor/work-orders/page.tsx`: wraps `WorkOrdersBoard` in `<Suspense>` as required by Next.js for components using `useSearchParams`
- `apps/web/package.json`: Jest + ts-jest + `@types/jest` added as devDependencies with `jest` config block; `test` and `test:watch` scripts added
- 17 unit tests in `notification-routing.spec.ts`: null entityType/entityId, empty roles, WorkOrder/ProblemReport/PartRequest/Asset/ComplianceCertificate per role, multi-role, unknown entity type, entityId in query param

### Added — Real-time WebSocket notifications (April 18, 2026)

#### `feat(notifications): add Socket.io WebSocket gateway and real-time push`
- `NotificationsGateway` (`@WebSocketGateway`) validates JWT on connect and assigns each client to a personal `user:<id>` room
- `NotificationsService.notify()` calls `gateway.emitToUser()` after persisting the notification to DB, so every in-app notification is also pushed live without polling
- `IoAdapter` (from `@nestjs/platform-socket.io`) registered in `main.ts`
- Frontend `notification-menu.tsx` subscribes via `useSocket()` and refetches the notification list on each `notification` event
- Unit tests for gateway: JWT auth-on-connect, room join, `emitToUser`, missing/invalid token cases

### Added — Three-tier deferred report aging (April 18, 2026)

#### `feat(reports): implement three-tier deferred report aging with windowed queries`
- Replaced the single 7-day aging threshold with three tiers: 48h (warning), 7d (escalation), 14d (critical)
- `findReportsDeferredInWindow(minHours, maxHours)`: queries `deferredAt ∈ [now-maxHours, now-minHours)` — half-open window ensures each deferred report receives exactly one notification per tier, never repeated
- `DeferredReportReminderJob` iterates a TIERS constant array and dispatches tier-specific French notification titles/summaries to all supervisors
- `reports-board.tsx`: `getDeferredAgingTier()` renders a colored badge (Rappel 48h / Suivi 7j / Escalade 14j) below the DEFERRED status badge
- Test coverage: all three tiers, windowing logic, no-op for non-deferred reports, notification count accuracy

### Added — Compliance certificate soft-archive (April 18, 2026)

#### `feat(assets): soft-archive compliance certificates instead of hard delete`
- Schema: added `isArchived Boolean @default(false)`, `archivedAt DateTime?`, `archivedById String?` to `ComplianceCertificate`; named relations `CreatedCertificates` / `ArchivedCertificates`
- Migration: `20260418000000_soft_archive_compliance_certificate`
- All `findMany` queries filter `isArchived: false` (`findByAsset`, `findExpiringSoon`, `refreshStatuses`)
- `DELETE /assets/:id/certificates/:certId` now calls `archive(certId, actorId)` — preserves audit history
- 7 unit tests: archive happy path, double-archive guard (400), not-found (404), filtered queries

### Added — Duplicate active WO guard with supervisor override (April 18, 2026)

#### `feat(work-orders): duplicate active WO guard with supervisor override`
- `create()` checks for any existing WO in a non-terminal status (`ACTIVE_WO_STATUSES` constant) and throws `ConflictException` with `{ message, existingWorkOrder }` payload
- `forceCreate?: boolean` DTO field (IsBoolean, optional) allows supervisors to bypass the guard
- Frontend: 409 responses intercepted by `isDuplicateConflict()` type guard; amber warning panel displays the conflicting WO reference and a "Créer quand même" button that resubmits with `forceCreate: true`
- 12 unit tests: decommissioned asset, not found, ConflictException shape, all 6 active statuses via `it.each`, forceCreate bypass, happy path, terminal WO exclusion

### Added — Source report panel in WO detail (April 18, 2026)

#### `feat(work-orders): expose source report in WO detail view`
- `work-orders.repository.ts findById` now includes `sourceReport` (reference, description, urgencyPerception, reporter, createdAt)
- Supervisor WO detail dialog renders a muted source report card when `sourceReport` is non-null

### Added — Overdue row highlighting in supervisor board (April 18, 2026)

#### `feat(work-orders): highlight overdue rows in supervisor board`
- Rows with `dueDate < now` and non-terminal status receive a red background (`bg-red-50 dark:bg-red-950/20`)
- Due date cell renders an "En retard" label in destructive color

### Fixed — Admin audit-log endpoint rate limiting (April 17, 2026)

#### `fix(admin): add dedicated throttle on GET /admin/audit-log`
- Added endpoint-level throttling on `GET /admin/audit-log` with `@Throttle({ default: { limit: 10, ttl: 60000 } })`
- Keeps existing auth/role guards intact while reducing high-volume audit-log scraping risk via page iteration
- Added backend coverage:
  - `admin.controller.spec.ts` for pagination/filter normalization and failure propagation
  - `admin.controller.integration.spec.ts` for auth/role enforcement plus route-level 429 behavior after threshold

### Fixed — Backend TypeScript editor diagnostics cleanup (April 17, 2026)

#### `fix(backend): resolve persistent VS Code Problems without runtime behavior changes`
- Switched backend bootstrap cookie parser import to CommonJS call-compatible syntax in `apps/backend/src/main.ts`
- Added explicit `rootDir` to `apps/backend/tsconfig.json` to stabilize source/output layout diagnostics
- Removed deprecated `baseUrl` from `apps/backend/tsconfig.json`
- Removed deprecated shared defaults `moduleResolution` and `baseUrl` from `tsconfig.base.json`
- Verified no backend test regressions and confirmed `@gmao/db` build still succeeds

### Fixed — Auth session inactivity timeout enforcement (April 17, 2026)

#### `fix(auth): enforce SESSION_IDLE_TIMEOUT_HOURS for refresh token lifecycle`
- `AuthService` no longer uses a hardcoded 7-day refresh-session lifetime for active sessions.
- Refresh-token TTL is now sourced from `SystemConfig` key `SESSION_IDLE_TIMEOUT_HOURS` and applied consistently to:
  - refresh JWT `expiresIn`
  - Redis refresh-token key TTL (`rt:<userId>:<jti>`)
  - Redis token-set TTL (`rt-set:<userId>`)
  - HTTP-only `refresh_token` cookie `maxAge`
- Added resilience guard: if `SESSION_IDLE_TIMEOUT_HOURS` is missing/invalid/non-positive, auth falls back to the previous 7-day default and logs a warning.
- Added backend test coverage:
  - `auth.service.spec.ts`: configured-timeout path, rotation path, invalid-config fallback, revoked-token rejection, invalid-signature rejection
  - `auth.controller.integration.spec.ts`: `/auth/refresh` missing-cookie 401, valid-cookie 200, invalid-refresh 401

### Fixed — Certificate expiry scheduling architecture compliance (April 17, 2026)

#### `fix(assets): migrate certificate expiry job from setInterval to @nestjs/schedule`
- Replaced manual lifecycle scheduling (`OnModuleInit` + `setInterval`) in `CertificateExpiryJob` with framework-managed decorators:
  - `@Timeout(0)` for immediate startup execution
  - `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` for daily recurring execution
- Removed interval-handle lifecycle cleanup (`OnModuleDestroy`) because scheduling is now fully managed by Nest Scheduler
- Preserved business behavior: each run still refreshes certificate statuses, scans expiring certificates, writes in-app notifications, and enqueues certificate-expiry emails
- Added dedicated unit coverage for the job:
  - scheduler metadata registration (`@Cron` and `@Timeout`)
  - startup delegation path (`runOnStartup -> run`)
  - success path (status refresh + reminder processing)
  - failure path (errors are caught and logged, no throw)
  - threshold notification matrix (`60`, `30`, and `<= 7` days notify; non-threshold values are skipped)

### Added — Admin analytics dashboard (April 17, 2026)

#### `feat(admin): add admin analytics endpoints and dashboard (§6.3)`
- **Problem:** `AdminController` exposed only system-config CRUD and the audit log. No user-activity analytics (inactive accounts, login frequency) and no system-health view (BullMQ queue statuses, failed notification counts) existed anywhere in the application.
- **Backend — `AdminAnalyticsService`:**
  - `GET /admin/analytics/users` — user activity stats: total/active/inactive user counts, accounts that have never logged in, accounts inactive for 30 + and 90 + days, breakdown by role (one count per `Role` enum value), and a five-bucket login-recency distribution (< 7 d, 7–30 d, 30–90 d, > 90 d, never); all ten base counts run inside a single `$transaction` for consistency
  - `GET /admin/analytics/system` — system health stats: job counts (waiting / active / failed / completed / delayed) from all three BullMQ queues (`mail`, `report-generation`, `preventive-plan-generation`) fetched via `@InjectQueue`; notification delivery counters (email-failed total, pending-delivery count, emails sent in last 24 h) from the `Notification` table
  - Both endpoints are restricted to `Role.ADMIN` via the existing `@Roles` guard
- **Module wiring:** `AdminModule` now imports `BullModule.registerQueue()` for all three queues and registers `AdminAnalyticsService` as a provider; existing `PrismaModule` and `SystemConfigModule` imports are preserved
- **Frontend — `AdminAnalyticsBoard`:**
  - Two-section layout: *User Activity* and *System Health*, rendered with the existing `Card`, `Badge`, and Lucide icon components
  - User Activity: six KPI cards + an inline progress-bar login-recency breakdown + a by-role table; warning/danger colour variants applied on inactive counts
  - System Health: three notification KPI cards (failed, pending, sent-24h) + one `QueueCard` per BullMQ queue showing all five count fields; failed > 0 renders as a destructive red badge
  - Two independent `useQuery` calls (keys `['admin','analytics','users']` and `['admin','analytics','system']`); shared loading and error states
- **Navigation:** `Activity` icon + `nav.analytics` key added to the ADMIN sidebar module in `sidebar-nav.config.ts`
- **API client:** `adminApi.getUserAnalytics()` and `adminApi.getSystemHealth()` added to `lib/admin.api.ts` alongside the full TypeScript response types
- **i18n:** `adminAnalytics` section added to `public/locales/fr/common.json` (title, subtitle, section labels, all user-stat and system-stat keys, loading and error states — 30 + French keys, zero hardcoded strings in the component)
- **Tests:** 22 unit tests for `AdminAnalyticsService` — all pass:
  - `getUserActivityStats`: all 10 queries wrapped in one `$transaction`, positional result mapping, all 5 `loginRecency` buckets, `never === neverLoggedIn` invariant, `byRole` iterates every `Role` enum value exactly once, `isActive: true` filter enforced per role, 30-day and 90-day `lt` thresholds verified, zero-count boundary
  - `getSystemHealthStats`: all 3 queues called, correct queue-name constants in response, per-field count mapping, `?? 0` fallback for absent states, 3 notification queries in one `$transaction`, email-pending filter (`emailSent: false AND emailFailed: false`), `emailSentAt >= 24 h ago` threshold verified, `emailSent: true` guard

### Added — Daily supervisor summary email (April 17, 2026)

#### `feat(work-orders): implement daily supervisor summary email (§12.3)`
- **Problem:** `SystemConfig` stored the `DAILY_SUMMARY_HOUR` key but nothing consumed it; no cron job or email existed to send the daily digest required by spec §12.3.
- **`DailySummaryJob`** (`@Cron(EVERY_HOUR)`):
  - Reads `DAILY_SUMMARY_HOUR` from `SystemConfig` (default 17; validated to 0–23 range, falls back to 17 on invalid value)
  - Hour-gate: skips silently when the current hour does not match the configured hour, ensuring exactly one send per day regardless of process restarts
  - Collects seven work-order metrics in a single `$transaction`: `openCount` (OPEN + ASSIGNED), `inProgressCount`, `pendingValidationCount`, `onHoldCount`, `overdueCount` (active WOs past `dueDate`), `criticalCount` (active CRITICAL WOs), `closedTodayCount` (CLOSED with `closedAt >= midnight today`)
  - Fetches all active users whose `roles` array contains `'SUPERVISOR'`
  - Enqueues one `daily-summary` mail job per supervisor via `MailService.enqueue()` using `Promise.all` (parallel, not sequential)
  - Logs a summary line including metrics and supervisor count
- **`daily-summary.hbs`** Handlebars template: HTML email showing the supervisor's name, today's date (formatted `fr-FR`), and a styled seven-row metrics table with badge-like colouring for critical/overdue values
- **Mail integration:** `'daily-summary'` added to the `MailTemplate` union type in `send-mail.dto.ts`; `'[GMAO] Résumé quotidien des ordres de travail'` subject added to `SUBJECT_MAP` in `mail.processor.ts`
- **Module wiring:** `WorkOrdersModule` imports `MailModule` and registers `DailySummaryJob` as a provider; `SystemConfigModule` is already transitively available via `PrismaModule`
- **Tests:** 36 unit tests for `DailySummaryJob` — all pass (hour-gate, config resolution, no-supervisors guard, mail dispatch count, template name, recipient addresses, mail context fields, all seven metric predicates, `$transaction` wrapping, idempotency regression)

### Fixed — Next.js 15 auth redirect compatibility (April 16, 2026)

#### `fix(web): align legacy auth redirect pages with Next 15 PageProps`
- Updated `app/auth/setup/page.tsx` and `app/auth/reset-password/page.tsx` to use the Next 15 `searchParams` Promise signature
- Both legacy redirect pages are now `async`, await `searchParams`, and preserve token forwarding to `/setup` and `/reset-password`
- Removes TypeScript build failures generated from `.next/types` (`TS2344` PageProps mismatch)

### Changed — Repository hygiene for local build caches (April 16, 2026)

#### `chore(repo): untrack remaining tsbuildinfo cache artifacts`
- Removed tracked `tsconfig.tsbuildinfo` files from git index so local incremental TypeScript caches no longer pollute `git status`
- `.gitignore` already contains `*.tsbuildinfo`; this change makes the ignore rule effective for all previously tracked cache artifacts

### Added — Simultaneous maintenance authorization (April 16, 2026)

#### `feat(work-orders): add authorize-simultaneous endpoint and supervisor UI`
- **Problem:** `InterventionService.start()` correctly blocks a second work order from starting when an asset already has an `IN_PROGRESS` WO and `simultaneousMaintenanceAuthorized` is `false`. However, no mechanism existed for the supervisor to lift that block — the technician was permanently stuck.
- **Backend:** New `PATCH /work-orders/:id/authorize-simultaneous` endpoint (Supervisor only)
  - Guards: `400` if WO is already terminal (CLOSED/CANCELLED); `400` if simultaneous maintenance is already authorized (idempotency)
  - Transaction: sets `simultaneousMaintenanceAuthorized = true` and writes a `WorkOrderStatusLog` entry (`"Simultaneous maintenance authorized by supervisor"`) for full auditability
  - Notification: dispatches `SIMULTANEOUS_MAINTENANCE_AUTHORIZED` to the principal technician so they know to retry starting the WO
  - `WorkOrdersService.authorizeSimultaneousMaintenance()` logs the event via the `WorkOrdersService` logger
- **Schema/enums:** Added `SIMULTANEOUS_MAINTENANCE_AUTHORIZED` to `NotificationType` in both `packages/db/prisma/schema.prisma` and `packages/shared/src/enums/notification.enum.ts`; Prisma client and `@gmao/db` rebuilt
- **Frontend:** Supervisor work-order detail dialog gains an **"Autoriser la maintenance simultanée"** action button, visible only when the WO is `ASSIGNED` and `simultaneousMaintenanceAuthorized` is `false`
  - Clicking the button opens a confirmation panel with a yellow warning banner explaining the risk
  - `authorizeSimultaneous` API call, mutation, success/error toasts, and `queryClient.invalidateQueries` all wired following existing dialog patterns
- **i18n:** 6 new French keys added under `supervisorWorkOrders` (`actions.authorizeSim`, `actions.authorizeSimWarningTitle`, `actions.authorizeSimWarningBody`, `actions.authorizeSimConfirm`, `toasts.authorizeSimSuccess`, `toasts.authorizeSimError`)
- **Tests:** 10 unit tests covering success path (transaction shape, status-log content, notification delivery, return value), the no-principal-technician branch, both terminal-status failure modes, already-authorized guard, and DB write isolation on rejection

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
