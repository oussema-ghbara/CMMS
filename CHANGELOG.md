# Changelog

All notable changes to the GMAO project are documented here.

## [Unreleased]

### Fixed — Work order priority history visibility and archive notification specificity (April 28, 2026)

**fix(work-orders): expose and display priority change history in work order detail**
- `WorkOrdersRepository.findById()` now includes `priorityLogs` with `actor` data, ordered by `createdAt ASC`, so the full chronological priority history is available in the detail payload.
- Frontend `WorkOrderDetail` type now includes `priorityLogs: WorkOrderPriorityLogEntry[]`.
- Supervisor work order detail dialog now renders a dedicated priority history section showing from/to priority badges, actor name, timestamp, and an automatic-escalation label when `isAutoEscalation` is true.
- French i18n keys added under `supervisorWorkOrders.detail`: `priorityHistory`, `priorityHistoryDescription`, `priorityAutoEscalation`.

**fix(reports): tailor archive notifications by archive reason and persist linked replacement ref**
- `ArchiveReportDto` now accepts optional `linkedWorkOrderRef` (string, max length 30) for replacement archives.
- `ReportsService.archive()` now builds notification summaries based on the archive reason:
	- `REPLACED_BY_OTHER_WO` with `linkedWorkOrderRef` -> replacement message with the referenced WO number.
	- `REPLACED_BY_OTHER_WO` without linked ref -> fallback replacement message.
	- `MANAGEMENT_DECISION` -> management-decision specific message.
	- other reasons -> existing generic archived message.
- When reason is `REPLACED_BY_OTHER_WO` and a linked reference is provided, `replacedByWorkOrderRef` is now persisted through `updateStatus` metadata.

**tests: 15 backend unit tests (reports service) + 11 backend unit tests (work orders repository)**
- `reports.service.spec.ts`: archive notification branch coverage and metadata persistence assertions; suite passes with 15/15 tests.
- `work-orders.repository.spec.ts`: `findById` include shape and returned `priorityLogs` assertions; suite passes with 11/11 tests.

### Fixed — Problem reports list sort order and on-hold hold input validation (April 28, 2026)

**fix(reports): correct default sort order for problem reports list**
- `ReportsRepository.findAll()` was ordering results by `createdAt DESC`, which caused high-urgency reports to be buried below more recent low-urgency submissions and broke the triage workflow.
- Sort changed to `[{ urgencyPerception: 'desc' }, { createdAt: 'asc' }]`, which matches the current triage contract: higher-urgency reports are listed first and, within the same urgency tier, the oldest report appears first.

**fix(work-orders): reject supervisorAssetStatusChoice when reasonType is not OTHER**
- `OnHoldService.putOnHold()` accepted `supervisorAssetStatusChoice` for any `reasonType` and silently stored a semantically invalid value on `OnHoldPeriod` records where the field has no meaning (only applicable when `reasonType` is `OTHER`).
- A `BadRequestException('workOrders.hold.supervisorChoiceNotAllowed')` is now thrown immediately when `supervisorAssetStatusChoice` is present in the DTO and `reasonType !== OTHER`, before any state transition or database write occurs.

### Fixed — On-hold supervisor asset-status choice moved to supervisor metadata (April 28, 2026)

**fix(work-orders): move supervisor asset-status choice to supervisor hold-metadata**
- `PutOnHoldDto` no longer accepts `supervisorAssetStatusChoice`; technicians cannot propose supervisor-only asset status overrides when creating an on-hold period.
- `UpdateHoldMetadataDto` gains an optional `supervisorAssetStatusChoice?: AssetStatus` with proper `@IsEnum` validation and API documentation.
- `OnHoldService.updateHoldMetadata()` validates the presence and applicability of the supervisor choice (only allowed when the active hold's `reasonType` is `OTHER`), applies the `OnHoldPeriod` partial update, and when provided updates the related `Asset` status and writes an `AssetStatusLog` entry inside the same transaction to keep the state change atomic.


**tests: reports repository unit coverage + reports controller integration coverage**
- `reports.repository.spec.ts` — asserts `orderBy` is `[{ urgencyPerception: 'desc' }, { createdAt: 'asc' }]`, rejects the old `{ createdAt: 'desc' }` shape, and still verifies filter passthrough plus pagination.
- `reports.controller.integration.spec.ts` — verifies `GET /reports` returns 401 without auth, 403 for non-operational roles, 200 for operational roles, and 400 for invalid query values.

---

### Added — Work order document and photo attachments (April 28, 2026)

**feat(work-orders): add document upload service methods and controller endpoints**
- `DocumentsService.findByWorkOrder(workOrderId)` queries all `isCurrentVersion: true` documents for a given work order, ordered by creation date descending. Throws `NotFoundException` when the work order does not exist.
- `DocumentsService.uploadForWorkOrder(workOrderId, file, documentType, actorId)` validates the document type against a seven-type allowed set (TECHNICAL_MANUAL, SCHEMATIC, SAFETY_DATA_SHEET, SPECIFICATION_SHEET, PROCEDURE_DOCUMENT, CONTRACTOR_REPORT, PHOTO) and rejects anything outside it with `BadRequestException`. Delegates to the shared `_doUpload` method which implements automatic versioning: an existing current-version document of the same type for the same work order is archived (`isCurrentVersion=false`, `replacedById`) and the new document is created at `version+1` inside a `$transaction`.
- `assertWorkOrderExists(workOrderId)` private helper added to `DocumentsService` to keep the entity-guard pattern consistent with the existing `assertAssetExists`, `assertPartExists`, and `assertPlanExists` helpers.
- `DocumentsService` injected into `WorkOrdersController` constructor via the already-exported `AssetsModule`.
- Four endpoints added to `WorkOrdersController`, all restricted to `Role.SUPERVISOR`: `GET /work-orders/:id/documents` (list current-version documents), `POST /work-orders/:id/documents` (multipart upload using `FileInterceptor('file')` and a `documentType` body field), `GET /work-orders/:id/documents/:docId/download` (presigned download URL via `getDownloadUrl`), `DELETE /work-orders/:id/documents/:docId` (permanent delete returning 204).

**feat(web): add document attachment panel to work order detail dialog**
- `WorkOrderDocument` interface added to `apps/web/lib/work-orders.api.ts` with fields `id`, `documentType`, `fileName`, `fileSize`, `mimeType`, `version`, `isCurrentVersion`, `createdAt`, `uploadedBy`.
- `workOrdersApi.listDocuments(id)`, `uploadDocument(id, file, documentType)`, `deleteDocument(id, docId)`, and `getDocumentDownloadUrl(id, docId)` API calls added.
- Work order detail dialog (`work-order-detail-dialog.tsx`) gains a Documents section rendered immediately before the action panel, visible to supervisors on all non-null work orders. The section uses a React Query `useQuery` to fetch the document list and two `useMutation` hooks for upload and delete. Client-side validation checks that both a file and a document type are selected before submitting; errors are shown inline. Each listed document renders a file name, document type label, uploader name, and icon buttons for download and delete. Upload state (isPending) disables the submit button and shows a spinner. Download errors, upload errors, and delete errors are surfaced via `toast`.
- `FileText`, `Trash2`, and `Upload` icons imported from `lucide-react`.
- `WorkOrderDocument` type imported in the dialog for the download handler parameter.
- All user-facing strings added to `apps/web/public/locales/fr/common.json` under `supervisorWorkOrders.detail`: `documents`, `documentsDescription`, `documentsEmpty`, `documentsUploadTitle`, `documentsUploadHint`, `documentType.{TECHNICAL_MANUAL,SCHEMATIC,SAFETY_DATA_SHEET,SPECIFICATION_SHEET,PROCEDURE_DOCUMENT,CONTRACTOR_REPORT,PHOTO}`, `documentsForm.{type,typePlaceholder,file,chooseFile,upload}`, `documentsValidation.{fileRequired,typeRequired}`, `documentsActions.{download,delete}`, `documentsToasts.{uploadSuccess,uploadError,deleteSuccess,deleteError,downloadError}`.

**tests: 7 backend service unit tests + 6 controller integration tests + 19 frontend unit tests**
- `documents.service.spec.ts` — `findByWorkOrder`: returns current-version docs for existing WO; throws `NotFoundException` when WO not found. `uploadForWorkOrder`: throws `BadRequestException` for `COMPLIANCE_CERTIFICATE`; throws `NotFoundException` when WO not found; creates version-1 PHOTO document when no prior version exists (verifies `$transaction` call and `document.create` args); archives prior version and creates version 2 for `CONTRACTOR_REPORT` (verifies `document.update` with `isCurrentVersion=false`); accepts all seven allowed document types in a single loop without throwing. `workOrder` mock added to Prisma provider mock. 32 total tests in suite, 0 regressions.
- `work-orders.controller.integration.spec.ts` — `DocumentsService` mock provider added to test module. `GET /work-orders/:id/documents`: returns 401 without auth; returns 403 for TECHNICIAN role; returns 200 with empty array for SUPERVISOR. `DELETE /work-orders/:id/documents/:docId`: returns 401 without auth; returns 403 for TECHNICIAN role. `GET /work-orders/:id/documents/:docId/download`: returns presigned URL text for SUPERVISOR. 26 total tests in suite, 0 regressions.
- `lib/work-order-documents.spec.ts` (new) — `WO_ALLOWED_DOC_TYPES`: 7 types total; includes PHOTO, CONTRACTOR_REPORT, SCHEMATIC; excludes COMPLIANCE_CERTIFICATE and INSTALLATION_REPORT. `buildUploadFormData`: file appended under "file" key; documentType appended under "documentType" key; exactly 2 entries. URL helpers: `listDocumentsUrl`, `deleteDocumentUrl`, `downloadDocumentUrl` all produce correct paths. `validateDocUploadForm`: returns `fileRequired` when file is null; returns `typeRequired` when docType is empty; returns valid when both present; returns `fileRequired` (checked first) when both missing. `formatFileSize`: bytes, KB, and MB ranges. 19 tests, all passing.
- Backend total: 642 tests (29 pre-existing failures in `work-orders.service.spec.ts` unrelated to this change). Frontend total: 256 tests, all passing.

---

### Added — Per-user login frequency classification in admin analytics (April 27, 2026)

**feat(admin): add per-user login frequency list endpoint**
- `classifyLoginFrequency(lastLoginAt, ago7, ago30, ago90)` exported as a pure helper from `admin-analytics.service.ts`. Takes the user's last login timestamp and three pre-computed thresholds; returns one of five `LoginFrequencyCategory` values: `RECENT` (within 7 days), `WEEKLY` (7–30 days), `OCCASIONAL` (30–90 days), `INACTIVE` (over 90 days), `NEVER` (null lastLoginAt). The function is exported for independent unit testing without any service dependencies.
- `getUserLoginFrequencyList(page, limit)` method added to `AdminAnalyticsService`. Wraps two queries in a `$transaction`: `user.findMany` (selecting id, name, email, roles, lastLoginAt, isActive; ordered by `lastLoginAt DESC NULLS LAST` then `name ASC`; paginated via skip/take) and `user.count`. Maps each record through `classifyLoginFrequency` and serialises `lastLoginAt` to ISO string or null. Returns `UserLoginFrequencyResponse { data: UserLoginFrequencyEntry[]; total: number }`.
- `GET /admin/analytics/users/frequency` endpoint added to `AdminController` (Admin role required). Accepts optional `?page` and `?limit` query params; `page` is clamped to a minimum of 1, `limit` to a maximum of 100. Delegates directly to `getUserLoginFrequencyList`.
- `LoginFrequencyCategory`, `UserLoginFrequencyEntry`, and `UserLoginFrequencyResponse` interfaces exported from `admin-analytics.service.ts`.

**feat(web): render per-user login frequency table in admin analytics**
- `LoginFrequencyCategory`, `UserLoginFrequencyEntry`, and `UserLoginFrequencyResponse` interfaces added to `apps/web/lib/admin.api.ts`.
- `adminApi.getUserLoginFrequency(params?)` API call added, targeting `GET /admin/analytics/users/frequency`.
- `lib/login-frequency-utils.ts` introduced with two exports: `FREQUENCY_BADGE_VARIANT` (a `Record<LoginFrequencyCategory, BadgeVariant>` mapping RECENT → success, WEEKLY → default, OCCASIONAL → secondary, INACTIVE → warning, NEVER → destructive) and `formatLoginDate(iso, locale)` (returns null for null input, otherwise formats with day/month/year/hour/minute via `Intl.DateTimeFormat`).
- `UserLoginFrequencyTable` component added to `admin-analytics-board.tsx`. Fetches from the new endpoint with local `page` state; renders a table with columns Utilisateur (name + email), Rôles (badge per role), Dernière connexion (formatted date or "Jamais connecté"), Fréquence (badge coloured by category). Pagination controls (chevron buttons + range label) appear when `total > 20`. Loading and empty states handled.
- `ChevronLeft`, `ChevronRight` icons and `Button` component imported into the analytics board.
- Component rendered inside the User Activity section of `AdminAnalyticsBoard`, below the existing recency bars and by-role table.
- i18n keys added to `apps/web/public/locales/fr/common.json` under `adminAnalytics.userStats`: `loginFrequencyTable`, `loginFrequencyTableDescription`, `loginFrequencyColumns.{user,roles,lastLogin,frequency}`, `loginFrequencyCategory.{RECENT,WEEKLY,OCCASIONAL,INACTIVE,NEVER}`, `loginFrequencyNever`, `loginFrequencyEmpty`.

**tests: 16 backend unit tests + 6 controller integration tests + 10 frontend unit tests**
- `admin-analytics.service.spec.ts` — `classifyLoginFrequency`: null returns NEVER; within 7 days returns RECENT; exactly at 7-day boundary returns RECENT; 7–30 days returns WEEKLY; 30–90 days returns OCCASIONAL; over 90 days returns INACTIVE. `getUserLoginFrequencyList`: returns data and total; RECENT assigned when last login within 7 days; NEVER assigned when lastLoginAt is null; INACTIVE assigned when last login over 90 days ago; lastLoginAt serialised as ISO string; null lastLoginAt mapped to null in output; defaults to page 1 / limit 20; skip computed correctly when page > 1.
- `admin.controller.integration.spec.ts` — returns 401 when unauthenticated; returns 403 for non-admin role; returns 200 with correct payload for admin; passes page and limit to service; clamps limit to 100 maximum; clamps page to 1 minimum.
- `lib/login-frequency-utils.spec.ts` — `FREQUENCY_BADGE_VARIANT`: each of the 5 categories maps to its expected variant; covers all 5 keys. `formatLoginDate`: returns null for null input; returns a non-empty string for a valid ISO; output includes year component; formats consistently with the supplied locale.
- Backend admin suite total: 61 passing, 0 regressions. Frontend suite total: 237 passing, 0 regressions.

---

### Added — Per-plan compliance rate and per-checklist-item anomaly rate in supervisor analytics (April 27, 2026)

**feat(work-orders): extract analytics helpers for per-plan and per-checklist-item computation**
- `work-orders.analytics-helpers.ts` introduced as a pure, side-effect-free module exposing two functions: `computeCompliancePerPlan` and `computeAnomalyPerChecklistItem`. Both functions take typed input arrays and return typed result arrays, making them independently testable without a database.
- `computeCompliancePerPlan(wos: PreventiveWOForPlan[])` groups work orders by `sourcePlanId`. A work order counts as compliant when its status is `CLOSED`, both `closedAt` and `dueDate` are present, and `closedAt <= dueDate`. Entries missing `sourcePlanId` or `sourcePlan` are silently skipped. The rate is rounded to 3 decimal places; `null` is returned when a group has zero entries (unreachable under normal conditions but guarded).
- `computeAnomalyPerChecklistItem(items: ChecklistItemForPlanItem[])` groups executed checklist items by `sourcePlanItemId`. Items with `ANOMALY_DETECTED` status increment the anomaly counter. Results are sorted by anomaly rate descending so the most problematic items appear first. Rate rounded to 3 decimal places; `null` when total is zero.
- `WorkOrdersService.getAnalytics()` adds two new Prisma queries to the existing `Promise.all` batch: `preventiveWOsPerPlan` fetches preventive WOs in the period that reference a source plan (selecting `sourcePlanId`, `sourcePlan.{id,title}`, `status`, `dueDate`, `closedAt`); `checklistItemsPerPlanItem` fetches executed checklist items linked to a plan template item (selecting `sourcePlanItemId`, `sourcePlanItem.{id,description}`, `status`) restricted to closed WOs within the period.
- Both helper calls replace the previously inline computation blocks. `compliancePerPlan` and `anomalyPerChecklistItem` are added to `preventivePlanEfficiency` in the analytics return object alongside the existing global metrics.

**feat(web): add per-plan compliance and per-checklist-item anomaly tables to supervisor analytics**
- `PlanComplianceEntry` interface (`planId`, `planTitle`, `total`, `closedOnTime`, `rate: number | null`) and `ChecklistItemAnomalyEntry` interface (`itemId`, `description`, `total`, `anomalyCount`, `rate: number | null`) added to `work-orders.api.ts`.
- `WorkOrderAnalyticsResponse.preventivePlanEfficiency` extended with `compliancePerPlan: PlanComplianceEntry[]` and `anomalyPerChecklistItem: ChecklistItemAnomalyEntry[]`.
- `PlanComplianceTable` component renders a table with columns Plan, Total, Clôturés dans les délais, Taux de conformité. Badge variant: `outline` when rate >= 0.8, `destructive` otherwise.
- `ChecklistItemAnomalyTable` component renders a table with columns Item de checklist, Exécutions, Anomalies, Taux d'anomalies. Badge variants: `outline` for zero rate, `warning` for rate > 0 up to 0.2, `destructive` for rate > 0.2. Results are pre-sorted by rate descending from the backend.
- Both components rendered inside the existing preventive tab of `SupervisorAnalyticsBoard`, below the four global KPI cards.
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` imported from `@/components/ui/table` in the analytics board.
- i18n keys added to `apps/web/public/locales/fr/common.json`: `supervisorAnalytics.sections.compliancePerPlan`, `supervisorAnalytics.sections.compliancePerPlanDesc`, `supervisorAnalytics.sections.anomalyPerChecklistItem`, `supervisorAnalytics.sections.anomalyPerChecklistItemDesc`, `supervisorAnalytics.columns.plan`, `supervisorAnalytics.columns.total`, `supervisorAnalytics.columns.closedOnTime`, `supervisorAnalytics.columns.complianceRate`, `supervisorAnalytics.columns.checklistItem`, `supervisorAnalytics.columns.executions`, `supervisorAnalytics.columns.anomalies`, `supervisorAnalytics.columns.anomalyRate`.

**tests: 19 backend unit tests + 15 frontend unit tests covering all computation and display branches**
- `work-orders.analytics-helpers.spec.ts` — `computeCompliancePerPlan`: empty input; missing sourcePlanId skipped; CLOSED + closedAt <= dueDate counted as compliant; closedAt > dueDate counted as non-compliant; non-CLOSED status always non-compliant; null dueDate non-compliant; null closedAt non-compliant; multi-WO aggregation per plan (3 WOs → 0.667 rate); distinct plan entries; planTitle preserved in output. `computeAnomalyPerChecklistItem`: empty input; missing sourcePlanItemId skipped; ANOMALY_DETECTED correctly counted; all-DONE gives zero anomalyCount; distinct item entries; sort order descending by rate; description preserved; rate rounds to 3 decimal places (1/3 → 0.333).
- `lib/preventive-analytics.spec.ts` — `fmtPct`: 100%, 0%, 66.7%; `planComplianceBadgeVariant`: outline >= 0.8, destructive < 0.8, destructive for null; `checklistAnomalyBadgeVariant`: outline for 0 and null, warning for 0 < rate <= 0.2, destructive for rate > 0.2; `PlanComplianceEntry` shape: required fields, rate in [0, 1]; `ChecklistItemAnomalyEntry` shape: required fields, anomalyCount <= total, rate consistent with anomalyCount / total.
- `analytics.spec.ts` — existing type-level fixtures updated to include `compliancePerPlan: []` and `anomalyPerChecklistItem: []` and `perAsset: []` to satisfy the extended `WorkOrderAnalyticsResponse` interface.

---

### Added — Per-asset analytics breakdown and category filter in supervisor analytics (April 27, 2026)

**feat(work-orders): compute per-asset breakdown metrics in analytics**
- `WorkOrdersService.getAnalytics()` now derives per-asset metrics from already-fetched in-memory data — no additional Prisma queries.
- `perAssetMttrMap` iterates all-time corrective WOs, accumulating total repair duration and WO count per asset to compute mean time to repair.
- `perAssetDowntimeMs` sums the calendar duration (createdAt to closedAt) for corrective WOs whose `closedAt` falls within the selected period, giving total downtime per asset per period.
- The `allAssetIds` union of `failureCountInPeriod` and `costByAsset` keys defines which assets appear in the breakdown — only assets with maintenance activity in the period are included.
- Per-asset fields returned: `failureCount`, `lastFailureDate`, `downtimeHours` (rounded to 1 decimal), `mttrHours` (mean repair time, rounded to 1 decimal, null when no WOs), `mtbfDays` (mean gap between consecutive corrective WOs for that asset, null when fewer than 2 WOs exist), `partsCost`, `totalCost`.
- Results are sorted by `failureCount` descending then `totalCost` descending.
- `perAsset` field added to `assetKpis` in the analytics response.

**feat(web): add category filter and per-asset breakdown to supervisor analytics**
- `SupervisorAnalyticsBoard` gains a `categoryId` state variable initialised to `undefined` (no filter).
- Category list is fetched via `categoriesApi.list()` using a React Query `useQuery` call. The category `<select>` is rendered in the filter bar only when at least one category exists. Selecting "Toutes les catégories" clears `categoryId` back to `undefined`.
- `queryParams` memo now includes `categoryId`, so the analytics query refetches automatically when the category selection changes. The reset button also clears `categoryId`.
- `AssetBreakdownItem` interface (`assetId`, `assetName`, `failureCount`, `lastFailureDate`, `downtimeHours`, `mttrHours`, `mtbfDays`, `partsCost`, `totalCost`) added to `work-orders.api.ts`. `WorkOrderAnalyticsResponse.assetKpis` extended with `perAsset: AssetBreakdownItem[]`.
- The assets tab renders a full per-asset breakdown table below the existing top-10 cards, conditionally shown when `perAsset` is non-empty. Columns: asset name, failure count badge (destructive when >= 5), downtime (h), MTTR (h), MTBF (days), total cost. Rows with no data in a column display "—".
- i18n keys added: `supervisorAnalytics.filters.category`, `supervisorAnalytics.filters.allCategories`, `supervisorAnalytics.sections.perAssetBreakdown`, `supervisorAnalytics.sections.perAssetBreakdownDesc`, `supervisorAnalytics.columns.downtimeHours`, `supervisorAnalytics.columns.mttrHours`, `supervisorAnalytics.columns.mtbfDays`.

**tests: 7 backend unit tests covering all computation branches**
- `returns empty perAsset when no corrective WOs or cost data exist` — zero-data guard.
- `computes downtimeHours as sum of WO duration for corrective WOs closed within the period` — downtime formula and period boundary.
- `computes mttrHours as mean repair time across all corrective WOs for that asset` — multi-WO average (2h + 4h = 3h mean).
- `computes mtbfDays as mean gap between consecutive corrective WOs` — 5-day MTBF from two WOs with a 5-day gap.
- `includes total cost from costByAsset in perAsset entry` — labor + parts aggregation.
- `includes assets that appear only in costWOs (no corrective failures)` — assets with maintenance costs but no failures.
- `passes categoryId to the backend query filter and returns it in the response` — filter propagation.
- Backend total: 68 passing (work-orders service suite), 0 regressions.

---

### Added — Unit cost trend per part in inventory analytics (April 27, 2026)

**feat(inventory): add unit cost trend per part computation**
- `InventoryRepository.getUnitCostTrendPerPart(periodDays)` executes a raw SQL query that aggregates `AVG(unitCostAtTime)` from `INCOMING` stock movements where `unitCostAtTime IS NOT NULL`, grouped by `(partId, DATE_TRUNC('month', createdAt))`. Results are ordered by `partName ASC, month ASC` so the in-process grouping step receives rows in the correct sequence.
- Post-query JavaScript groups raw rows into `UnitCostTrendPartEntry[]` — one entry per part — where each entry carries `partId`, `partName`, `partReference`, and a `trend` array of `{ month: string (YYYY-MM), avgUnitCost: number }` objects. `avgUnitCost` is rounded to two decimal places via `Math.round(value * 100) / 100`.
- When no qualifying movements exist in the period, an empty array is returned.
- `InventoryService.getAnalytics()` adds `getUnitCostTrendPerPart(periodDays)` as the ninth entry in the existing `Promise.all` batch and exposes the result as `unitCostTrendPerPart` in the returned analytics object.

**feat(web): render unit cost trend per part in storekeeper analytics**
- `UnitCostTrendMonthEntry` (`{ month: string; avgUnitCost: number }`) and `UnitCostTrendPartEntry` (`{ partId, partName, partReference, trend }`) interfaces added to `apps/web/lib/inventory.api.ts`. `InventoryAnalyticsResponse` extended with `unitCostTrendPerPart: UnitCostTrendPartEntry[]`.
- `StockAnalyticsBoard` gains a new "Évolution du coût unitaire moyen par pièce" `Card` section rendered between the stock accuracy panel and the endpoint note. The table shows one row per part with columns: Pièce, Référence, first month, average unit cost at first month, last month, average unit cost at last month, trend direction icon (ArrowUp red / ArrowDown green / ArrowRight neutral), and months tracked. An empty state is shown when no qualifying movements exist in the period.
- i18n keys added to `apps/web/public/locales/fr/common.json`: `storekeeperAnalytics.sections.unitCostTrend`, `storekeeperAnalytics.sections.unitCostTrendDescription`, `storekeeperAnalytics.states.noUnitCostTrend`, `storekeeperAnalytics.columns.avgUnitCost`, `storekeeperAnalytics.columns.monthsTracked`, `storekeeperAnalytics.columns.firstMonth`, `storekeeperAnalytics.columns.lastMonth`, `storekeeperAnalytics.columns.trend`.

**tests: 8 backend unit tests + 12 frontend unit tests covering all logic branches**
- `inventory.repository.unit-cost-trend.spec.ts`: empty array when no qualifying movements; multi-part grouping into separate entries; month string format (`YYYY-MM`); `avgUnitCost` rounded to 2 decimal places; month ordering preserved (ascending); shape (`partId`, `partName`, `partReference`); single-month part is valid; zero cost string handled without throwing.
- `unit-cost-trend.spec.ts` (frontend): `computeTrendDirection` — up when last > first; down when last < first; flat when equal; flat for single data point; flat for empty trend; uses first and last values only in multi-month series; `getFirstMonth`/`getLastMonth` — correct extraction and null for empty trend; `formatCurrency` — EUR symbol present; 2-decimal rounding; zero formatted.
- Backend total: 583 passing, 0 regressions. Frontend total: 217 passing, 0 regressions.

---

### Added — Stock accuracy rate KPI in inventory analytics (April 27, 2026)

**feat(inventory): add stock accuracy rate computation**
- `InventoryRepository.getStockAccuracyRate(periodDays)` executes a single raw SQL query that counts total movements and `ADJUSTMENT`-type movements per part within the period, groups by `partId`, and orders results by adjustment ratio descending so the most problematic parts appear first. The query is bounded to 20 rows via `LIMIT 20`.
- Per-part accuracy rate is computed as `(1 − adjustments / total) × 100`, rounded to one decimal place. The global rate aggregates `adjustmentCount` and `totalMovements` across all returned parts.
- When no movements exist in the period, `globalRate` returns `100`, `totalMovements` and `adjustmentCount` return `0`, and `perPart` is an empty array.
- `InventoryService.getAnalytics()` adds `getStockAccuracyRate(periodDays)` to the existing `Promise.all` batch and exposes the result as `stockAccuracy` in the returned analytics object alongside the existing fields.

**feat(web): render stock accuracy rate in storekeeper analytics**
- `StockAccuracyPartEntry` and `StockAccuracyReport` interfaces added to `apps/web/lib/inventory.api.ts`. `InventoryAnalyticsResponse` extended with `stockAccuracy: StockAccuracyReport`.
- `StockAnalyticsBoard` gains a new "Taux de précision du stock" `Card` section rendered below the long-waiting requests panel. The section shows: a global rate figure with colour coding (green ≥ 95%, yellow 80–95%, red < 80%) and a detail line showing adjustment count over total movements; a per-part `Table` with columns Pièce, Référence, Total mouvements, Ajustements, and Taux de précision (badge coloured by the same thresholds). An empty state is shown when no movements exist in the period.
- i18n keys added to `apps/web/public/locales/fr/common.json`: `storekeeperAnalytics.sections.stockAccuracy`, `storekeeperAnalytics.sections.stockAccuracyDescription`, `storekeeperAnalytics.columns.adjustments`, `storekeeperAnalytics.columns.totalMovements`, `storekeeperAnalytics.columns.accuracyRate`, `storekeeperAnalytics.states.noStockAccuracyData`, `storekeeperAnalytics.states.globalAccuracyRate`, `storekeeperAnalytics.states.globalAccuracyDetail`.

**tests: 7 backend unit tests covering all computation branches**
- `inventory.repository.spec.ts`: `describe('InventoryRepository.getStockAccuracyRate')` — empty movements returns 100% global rate; per-part rate computed correctly (80% for 2/10 adjustments); global rate aggregated across multiple parts; 0% when all movements are adjustments; 100% when no adjustments exist; `since` date boundary derived correctly from `periodDays`; accuracy rate rounded to one decimal (1/3 → 66.7%).
- Backend total: 575 passing, 0 regressions.

---

### Fixed — idle timeout spec TypeScript timer type declarations (April 27, 2026)

**fix(test): correct timer type declarations in idle timeout spec**
- The three fake-timer tests in `use-idle-timeout.spec.ts` declared `timerId` as `ReturnType<typeof setTimeout>`, which resolves to `NodeJS.Timeout` in the Node/jsdom environment. When `jest.useFakeTimers()` is active, `setTimeout` returns a plain `number`, causing a TypeScript assignment error.
- Changed all three declarations to `number | null` and cast the `setTimeout` return with `as unknown as number` to match the fake-timer environment.
- No runtime behaviour change; tests pass and are type-correct.

---

### Added — Post-preventive corrective rate KPI in work order analytics (April 27, 2026)

**feat(work-orders): compute post-preventive corrective rate in analytics**
- `getAnalytics()` reads `POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS` from `SystemConfig` as the 18th item in the existing `Promise.all` (defaults to 7 when the key is absent or non-numeric).
- After the parallel batch resolves, a bounded follow-up query finds all corrective work orders whose `createdAt` falls within `windowDays × 24h` of any closed preventive work order's `closedAt` on the same asset. The cross-match is performed in JavaScript to avoid N+1 queries.
- `postPreventiveCorrectiveRate` = (closed preventive WOs with at least one corrective WO opened on the same asset within the window) / (total closed preventive WOs in period); `null` when no preventive WOs were closed in the period.
- `postPreventiveCorrectiveWindowDays` (the effective configured value) is returned alongside the rate so clients can render the configured window to users.
- Both fields added to `preventivePlanEfficiency` in the analytics return object.

**feat(web): add post-preventive corrective rate KPI to supervisor analytics**
- `WorkOrderAnalyticsResponse.preventivePlanEfficiency` interface extended with `postPreventiveCorrectiveRate: number | null` and `postPreventiveCorrectiveWindowDays: number`.
- Preventive tab grid changed from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4`; a fourth `KpiCard` renders the rate as a percentage (`—` when null) with a sub-label interpolating the configured window in days.
- i18n: `supervisorAnalytics.kpi.postPreventiveCorrectiveRate` and `supervisorAnalytics.kpi.postPreventiveCorrectiveRateDesc` added to `apps/web/public/locales/fr/common.json`.

**fix(web): navigate blocked part requests panel to ON_HOLD filtered list**
- The "Demandes bloquées" CTA button in the supervisor dashboard previously linked to `/supervisor/work-orders` with no filter. It now links to `/supervisor/work-orders?status=ON_HOLD`, opening the work orders board pre-filtered to the only status that produces blocked part requests.

**tests: 6 backend unit tests covering all computation branches**
- `work-orders.service.spec.ts`: new `describe` block — `null` when no closed preventive WOs exist; rate = 1 when all have a corrective follow-up within the window; rate = 0 when the corrective WO falls after the window; rate = 0.5 for a partial match; default 7-day window when config key is absent; custom window from config respected.
- All three existing analytics `describe` blocks updated: `systemConfig: { findUnique: jest.fn() }` added to each `PrismaService` mock and `mockResolvedValueOnce(null)` added in each `setupMocks` helper.
- `analytics.spec.ts`: two fixture objects updated with `postPreventiveCorrectiveRate` and `postPreventiveCorrectiveWindowDays` to match the extended TypeScript interface.
- Backend total: 568 passing, 0 regressions. Frontend total: 205 passing, 0 regressions.

---

### Added — Session idle timeout enforcement (April 26, 2026)

**feat(auth): return idle timeout hours in login and refresh responses**
- `AuthService.getIdleTimeoutHours()` reads `SESSION_IDLE_TIMEOUT_HOURS` from `SystemConfig`. On invalid or missing config it falls back to `8` hours (the documented default) and logs a warning. The previous fallback was 7 days; the corrected default aligns with the configured spec.
- Both `login()` and `refresh()` call `getIdleTimeoutHours()` once and reuse the result: refresh token JWT `expiresIn`, Redis key TTL (`SETEX`), and cookie `maxAge` are all computed as `hours × 3600`. Each successful `POST /auth/refresh` re-issues the refresh token with a fresh TTL (sliding window), so an active session never expires mid-use.
- `AuthResponseDto` and the `AuthResponse` shared type (`packages/shared/src/types/auth.types.ts`) gain `idleTimeoutHours: number`, allowing every client to know the configured timeout without a separate API call.

**feat(web): client-side session idle detection and auto-logout**
- `useIdleTimeout` hook (`hooks/use-idle-timeout.ts`): reads `idleTimeoutHours` from the Zustand auth store; registers passive listeners for `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, and `wheel` on `window`; resets a `setTimeout` on every activity event; when the timer fires (no activity for the configured hours), calls `POST /auth/logout`, clears the auth store, removes the `user_roles` cookie, and redirects to `/login?reason=idle`. API errors during logout are caught and swallowed so the redirect always completes. A minimum floor of 0.5 hours prevents misconfiguration from locking users out immediately.
- Hook mounted in `AppShell` so it is only active on protected routes.
- `auth.store.ts` gains `idleTimeoutHours: number | null` field. `setAuth` accepts an optional third argument; when provided it updates the stored value, when omitted the previous value is preserved (so a background token refresh does not lose the hours set at login).
- `use-auth-init.ts` and the axios refresh interceptor in `lib/api.ts` both forward `idleTimeoutHours` from the server response into the store.
- Login form shows the existing `auth.sessionExpired` i18n message when the URL contains `?reason=idle`.

**tests: 9 backend unit + 17 frontend unit — all branches covered**
- `auth.service.spec.ts`: `idleTimeoutHours` present in login and refresh responses; fallback to 8 hours on invalid config with exactly one logger warning; refresh token JWT, Redis TTL, and cookie maxAge all reflect the configured value; revoked token rejection unchanged; invalid signature rejection unchanged.
- `use-idle-timeout.spec.ts`: `computeTimeoutMs` (correct ms, MIN_TIMEOUT_HOURS clamp, 8-hour spec default); redirect URL contains `?reason=idle`; login form key selection for `reason=idle` vs `error=no_web_access` vs absent; `ACTIVITY_EVENTS` contains all 6 event types with no duplicates; timer fires after timeout and is cancelled by activity (fake timers); double-fire prevention; `setAuth` stores and preserves `idleTimeoutHours`; logout sequence (API call, store clear, cookie removal, redirect) completes even when the API call fails.
- Backend total: 562 passing, 0 regressions. Frontend total: 200 passing, 0 regressions.

---

### Added — Active work orders filter and supervisor dashboard improvements (April 26, 2026)

**feat(work-orders): isActive server-side filter on work order list endpoint**
- `WorkOrderQueryDto` gains `isActive?: boolean` decorated with `@IsOptional`, `@IsBoolean`, and `@Transform` (string `"true"` coerces to `true`) — matching the existing `isOverdue` pattern.
- `WorkOrdersRepository.findAll()` defines `ACTIVE_STATUSES = [ASSIGNED, IN_PROGRESS, ON_HOLD]` and spreads `{ status: { in: ACTIVE_STATUSES } }` into the Prisma `where` clause when `isActive=true`. The filter composes safely with all other existing query params (`priority`, `technicianId`, `type`, etc.).
- `WorkOrderListQuery` frontend interface gains `isActive?: boolean`; `workOrdersApi.list()` passes it as an axios query param.

**feat(web): active work orders deep-link in supervisor work orders board**
- `WorkOrdersBoard` reads `?isActive=true` from `useSearchParams` and passes it through `queryParams` to `workOrdersApi.list()`, pre-filtering the board to ASSIGNED, IN_PROGRESS, and ON_HOLD work orders on navigation from the dashboard.
- A dismissible filter badge ("OT actifs uniquement") is displayed alongside the existing technician and overdue filter badges. Clicking the clear button navigates to `/supervisor/work-orders` without the param.
- `WorkOrdersBoard` also reads `?status=<WorkOrderStatus>` from the URL on mount and pre-selects the status dropdown, enabling any caller to deep-link into a specific single-status filter.
- The reset button now clears all deep-link params (`technicianId`, `isOverdue`, `isActive`, `status`) by replacing the URL when any of them are set.
- i18n: `supervisorWorkOrders.filters.{activeFilter, clearActiveFilter}` added to `apps/web/public/locales/fr/common.json`.

**feat(web): supervisor dashboard active WOs card and recent closures panel**
- "OT actifs" summary card now links to `/supervisor/work-orders?isActive=true` instead of the unfiltered list, giving the supervisor a one-click path to all ASSIGNED, IN_PROGRESS, and ON_HOLD work orders.
- "Clôturés aujourd'hui" operational panel replaced the count-only display with an inline list. The query limit is raised from 1 to 5 so actual work order rows can be rendered. Each row (`ClosedTodayRow`) shows the asset name, the principal technician name (with a fallback label when unassigned), and the work order type as an outline badge. If more than 5 closures exist, an overflow note shows the remaining count.
- The "Voir les OT clôturés" CTA now links to `/supervisor/work-orders?status=CLOSED` so the board opens pre-filtered to closed work orders.
- i18n: `supervisorDashboard.operational.closedToday.{none, more, viewWo}` added to `apps/web/public/locales/fr/common.json`.

**tests: 9 backend unit + 19 frontend logic — all branches covered**
- `work-orders.repository.isactive.spec.ts`: no filter when `isActive` is undefined; no filter when `isActive=false`; `status.in` equals exactly `[ASSIGNED, IN_PROGRESS, ON_HOLD]`; excludes `DRAFT`, `OPEN`, `PENDING_VALIDATION`, `CLOSED`, `CANCELLED`; composition with `priority` and `assetId` filters; pagination `skip`/`take` correct when `isActive=true`; `count` query uses the same WHERE clause as `findMany`; explicit `status` param is unaffected when `isActive` is not set.
- `active-work-orders.spec.ts`: `isActive` query-param serialisation (true, false, undefined, coexistence with `isOverdue`); `readIsActiveFromSearchParams` URL-wiring (true, false, absent, arbitrary value); `readStatusFromSearchParams` (valid status, invalid status, absent, empty string); `ClosedTodayRow` technician name fallback, asset name access, type badge value, overflow count arithmetic.

---

### Fixed — requesterAnalytics frontend type missing computed fields (April 26, 2026)

**fix(web): add reportAccuracyRate and duplicateSubmissionRate to WorkOrderAnalyticsResponse**
- `WorkOrderAnalyticsResponse.requesterAnalytics` in `apps/web/lib/work-orders.api.ts` was missing `reportAccuracyRate: number | null` and `duplicateSubmissionRate: number | null`. The backend already computes and returns both fields; only the frontend type definition was incomplete, causing TypeScript errors in `SupervisorAnalyticsBoard` at the two `KpiCard` render sites.
- `analytics.spec.ts` fixtures updated: both `requesterAnalytics` object literals now include the two new fields (`reportAccuracyRate: 0.8 / null`, `duplicateSubmissionRate: 0.1 / null`); `TechnicianKpiItem` test objects updated to include `rejectionCount`, `rejectionRate`, and `rejectionRateByCategory` which had been added to the interface in a prior commit but not reflected in the test fixtures.
- Zero new functionality; strictly a type-alignment and test-fixture correction.

---

### Added — Dedicated low-stock view for storekeeper (April 26, 2026)

**feat(web): sortable below-threshold parts list at /storekeeper/low-stock**
- A new `/storekeeper/low-stock` page lists all parts currently below their minimum stock threshold, sorted by deficit severity (threshold − currentStock) descending by default. The backend endpoint `GET /stock/low` already existed and returned parts ordered by deficit; no backend changes were required.
- `LowStockView` component renders a bordered table with columns: Pièce, Référence, Emplacement, Stock actuel (destructive `Badge`), Seuil min., Déficit (displayed as −N in destructive red), and an action column. The deficit value is computed client-side from `minimumStockThreshold − currentStock`.
- Column headers for Pièce, Stock actuel, and Déficit are clickable sort buttons with ascending/descending indicators (`ArrowUp`/`ArrowDown`/`ArrowUpDown`). Clicking the active column reverses direction; clicking a new column resets to descending. Sort is performed client-side on the full list returned by the backend.
- Each row has a "Réceptionner" button that opens the existing `StockIncomingDialog`. On successful receipt the dialog already invalidates the `['storekeeper', 'low-stock']` query key, so the table refreshes automatically.
- Loading, empty ("Aucune pièce en stock bas"), and error states are handled with dedicated messages.
- A "Stock bas" navigation item (AlertTriangle icon) is added to the storekeeper sidebar between "Inventaire" and "Demandes de pièces".
- Pure logic extracted to `lib/low-stock-utils.ts`: `computeDeficit`, `sortLowStockParts`, `toggleSortDir`. All three are re-exported and used by the component.
- React Query key: `['storekeeper', 'low-stock']` — consistent with the key invalidated by `StockIncomingDialog` on stock receipt.
- i18n: `nav.lowStock`, `storekeeperLowStock.{title, subtitle, columns.*, actions.receive, states.*}` added to `apps/web/public/locales/fr/common.json`.

**tests: 15 unit tests covering all sort paths and edge cases**
- `lib/low-stock-utils.spec.ts`: `computeDeficit` with normal input and edge case (currentStock == threshold); `sortLowStockParts` by deficit desc/asc, by currentStock desc/asc, by name desc/asc; no-mutation guarantee (result is a new array); empty input; single-element input; `toggleSortDir` both directions.
- 164 frontend tests total, 0 regressions.

---

### Added — System config panel grouped sections and operational key labels (April 26, 2026)

**feat(web): system config panel rewritten with i18n, groups, and typed numeric inputs**
- `SystemConfigPanel` previously showed the 10 operational config keys (`SESSION_IDLE_TIMEOUT_HOURS`, `ESCALATION_CHECK_FREQUENCY_MINUTES`, `DAILY_SUMMARY_HOUR`, `RECURRING_FAULT_THRESHOLD_COUNT`, `RECURRING_FAULT_THRESHOLD_DAYS`, `DEFERRED_REPORT_AGING_DAYS`, `POST_PREVENTIVE_CORRECTIVE_WINDOW_DAYS`, `DEAD_STOCK_THRESHOLD_DAYS`, `REORDER_SIGNAL_THRESHOLD_COUNT`, `INACTIVE_USER_THRESHOLD_DAYS`) with their raw technical key names as labels, no descriptions, and a plain text input with no min/max constraints.
- All 14 known keys (4 password-policy + 10 operational) are now grouped into 6 named `Card` sections: "Politique de mot de passe", "Session & Sécurité", "Planification & Notifications", "Seuils — Ordres de travail", "Seuils — Inventaire", and "Seuils — Utilisateurs". An "Autres paramètres" fallback card catches any keys not present in the group definitions.
- Every non-boolean key renders a `type="number"` input with enforced `min`/`max` attributes derived from `SYSTEM_CONFIG_KEY_CONSTRAINTS` (e.g. `DAILY_SUMMARY_HOUR` is constrained 0–23; `ESCALATION_CHECK_FREQUENCY_MINUTES` is 1–1440).
- All hardcoded French strings replaced with `useTranslation` calls. Labels and descriptions for each key are loaded from `admin.systemConfig.keys.<KEY>.{label,description}` i18n paths. Group titles from `admin.systemConfig.groups.*`. Toast messages from `admin.systemConfig.{updateSuccess,updateError}`.
- Logic extracted to `lib/system-config-groups.ts`: `SYSTEM_CONFIG_GROUPS`, `SYSTEM_CONFIG_BOOLEAN_KEYS`, `SYSTEM_CONFIG_KEY_CONSTRAINTS`, `ALL_KNOWN_KEYS`. The panel imports these constants; they are independently testable.
- i18n: `admin.systemConfig.{updateSuccess, updateError, groups.*, keys.*}` — 38 new keys added to `apps/web/public/locales/fr/common.json`.

**tests: 12 unit tests covering group coverage, boolean classification, and constraint correctness**
- `lib/system-config-groups.spec.ts`: all 4 password keys present in `ALL_KNOWN_KEYS`; all 10 operational keys present; exactly 14 total with no duplicates; every group has at least one key and a non-empty `titleKey`; `SYSTEM_CONFIG_BOOLEAN_KEYS` correctly marks the 3 boolean keys and excludes the 4th password key and all 10 operational keys; every non-boolean key has a `KEY_CONSTRAINTS` entry; no boolean key has a constraint entry; all constraint ranges satisfy `min < max`; `DAILY_SUMMARY_HOUR` allows 0 as minimum; `ESCALATION_CHECK_FREQUENCY_MINUTES` maximum is 1440.
- 164 frontend tests total, 0 regressions.

---

### Added — Overdue work order filter and supervisor dashboard panel (April 26, 2026)

**feat(work-orders): isOverdue server-side filter on work order list endpoint**
- `WorkOrderQueryDto` gains `isOverdue?: boolean` decorated with `@IsOptional`, `@IsBoolean`, and `@Transform` (string `"true"` coerces to `true`, any other value to `false`) — matching the existing `isActive` pattern in `PartQueryDto`.
- `WorkOrdersRepository.findAll()` spreads `{ dueDate: { not: null, lt: new Date() }, status: { in: NON_TERMINAL_STATUSES } }` into the Prisma `where` clause when `isOverdue=true`. Non-terminal statuses: `DRAFT, OPEN, ASSIGNED, IN_PROGRESS, ON_HOLD, PENDING_VALIDATION`. Terminal states (`CLOSED`, `CANCELLED`) are excluded — matching the specification intent of "non clôturés".
- The filter composes safely with all other existing query params (`priority`, `technicianId`, `type`, etc.).
- `WorkOrderListQuery` frontend interface gains `isOverdue?: boolean`; `workOrdersApi.list()` passes it as an axios query param (serialised to `"true"` / `"false"` by axios URLSearchParams).

**feat(web): dedicated overdue work orders panel in supervisor dashboard**
- A 13th React Query entry (`isOverdue: true, limit: 5`) is added to `useQueries` in the supervisor dashboard page.
- `OverdueWorkOrderRow` component renders reference number, asset name, and a destructive badge showing days overdue (floor division of milliseconds elapsed since `dueDate`). Each row is a Next.js `Link` to `/supervisor/work-orders?id={wo.id}`, opening the WO detail dialog directly via the existing deep-link mechanism.
- The panel appears between the summary cards and the technician load section. It is conditionally rendered only when `total > 0`. When more than 5 overdue WOs exist, a "N autres OT en retard" overflow note is shown. A "Voir tous les OT en retard" button links to `/supervisor/work-orders?isOverdue=true`.
- `work-orders-board.tsx` reads `?isOverdue=true` from `useSearchParams` and passes it through `queryParams` to `workOrdersApi.list()`, pre-filtering the full board view on navigation from the dashboard.
- i18n: `supervisorDashboard.overduePanel.{title, viewAll, viewWo, daysOverdue, more}` added to `apps/web/public/locales/fr/common.json`.

**tests: 8 repository unit + 6 controller integration + 13 frontend logic — all branches covered**
- `work-orders.repository.isoverdue.spec.ts`: no filter when `isOverdue` is undefined; no filter when `isOverdue=false`; `dueDate.lt` is a `Date` instance within the test's `before`/`after` bounds; `status.in` equals the six non-terminal statuses and excludes `CLOSED` and `CANCELLED`; composition with `priority` filter; both `undefined` and `false` produce identical WHERE clauses; pagination `skip`/`take` correct when `isOverdue=true`; `count` query uses the same WHERE clause as `findMany`.
- Controller integration tests in `work-orders.controller.integration.spec.ts`: `isOverdue=true` passes `{ isOverdue: true }` to the service; `isOverdue=false` passes `{ isOverdue: false }`; absent param leaves the property undefined; non-"true" string coerces to `false` (Transform behaviour); endpoint is accessible to TECHNICIAN role; returns 401 without auth.
- `overdue-work-orders.spec.ts`: `computeDaysOverdue` formula (null dueDate, exactly 1 day, less than 24 h, 7 days, future date); `isOverdue` query-param serialisation (true, false, undefined, combined with other params); `readIsOverdueFromSearchParams` URL-wiring (true, false, absent, arbitrary value).

---

### Added — Configurable location hierarchy level names (April 25, 2026)

**feat(locations): configurable level names stored in SystemConfig**
- Spec and require that the names assigned to each level of the location hierarchy (e.g. "Étage" renamed to "Niveau") are configurable by an administrator.
- The `Location` model `level` field is an integer (1–5). Previously the frontend hardcoded the display label as "Niveau {{level}}" with no way to override it.
- Level names are now stored in `SystemConfig` using keys `LOCATION_LEVEL_1_NAME` through `LOCATION_LEVEL_5_NAME`. Existing `SystemConfigService` (globally injected) is reused — no schema change required.
- French defaults are applied when a key has never been set: Level 1 = "Bâtiment", Level 2 = "Étage", Level 3 = "Zone", Level 4 = "Salle", Level 5 = "Sous-zone".
- `LocationsService.getLevelNames()`: reads all five keys via `Promise.all`, substitutes the default for any key that returns `null`. Returns `LevelNameItem[]` (`{ level, name }`).
- `LocationsService.setLevelNames(dto, actorId)`: writes only the levels present in `dto.items` — levels not included retain their current stored value. Each write is audit-logged via `SystemConfigService.set()`.
- `UpdateLevelNamesDto`: `items: LevelNameItemDto[]` array with `@ValidateNested` + `@Type`; each item validated with `@IsInt @Min(1) @Max(5)` and `@IsString @MaxLength(50)`.
- `GET /locations/level-names` (all authenticated roles) — used by admin UI, and available to any frontend component that needs to render a level label.
- `PATCH /locations/level-names` (Admin only) — writes the supplied items and returns the full refreshed list.
- Both routes declared before the `/:id` catch-all to prevent route shadowing.

**feat(web): location level names configuration UI in admin locations board**
- `LevelNameItem` interface added to `locations.api.ts`; `locationsApi.getLevelNames()` and `locationsApi.setLevelNames()` API methods added.
- `LevelNamesCard` component added to `locations-table.tsx`: displays all five level names as `Badge` components in read mode; switches to an inline edit form (one `Input` per level) when the admin clicks the edit button; submits via `PATCH /locations/level-names`; success/error toasts in French.
- The `LocationsTable` renders `LevelNamesCard` above the existing location table and also uses the fetched `levelNames` to resolve the badge label per row, replacing the previously hardcoded `t('admin.locations.levelBadge', { level })` call with `levelLabel(level)` derived from the live config.
- `admin.locations.levelNames.{title,subtitle,levelLabel,toasts.{saveSuccess,saveError}}` i18n keys added to `apps/web/public/locales/fr/common.json`.

**tests: 7 backend + 4 frontend — all branches covered**
- Backend (`locations-level-names.service.spec.ts`): null config → French defaults for all 5 levels; partial config → configured value overrides default for the given level only; correct `SystemConfig` key derivation per level; `setLevelNames` with a full 5-item list writes 5 keys; partial `items` writes only supplied levels without touching others; post-write `getLevelNames` returns the refreshed combined state.
- Frontend (`lib/locations-level-names.spec.ts`): `getLevelNames` calls `GET /locations/level-names`; `setLevelNames` calls `PATCH /locations/level-names` with `{ items }` wrapper; both propagate network errors correctly.
- 536 backend tests / 124 frontend tests total, 0 regressions.

---

### Added — Requester analytics: report accuracy rate and duplicate submission rate (April 25, 2026)

**feat(db): add submittedDespiteWarning field to ProblemReport**
- Spec requires a "duplicate submission rate" KPI — the % of reports submitted despite the duplicate-WO warning banner. Computing this requires a persistent flag on each report recording whether the requester confirmed submission after seeing the warning.
- `ProblemReport` schema gains `submittedDespiteWarning Boolean @default(false)`. Migration `20260425145202_add_submitted_despite_warning_to_problem_report` applies a non-destructive `ALTER TABLE ADD COLUMN` with default false, leaving all existing rows unaffected.

**feat(reports): accept and persist submittedDespiteWarning on report submission**
- `CreateReportDto` gains optional `submittedDespiteWarning?: boolean` with `@IsOptional @IsBoolean` validation and `@ApiPropertyOptional` annotation.
- `ReportsRepository.create()` persists the flag with `?? false` default so callers that omit it (including all existing clients) receive correct behaviour without any contract break.

**feat(analytics): compute reportAccuracyRate and duplicateSubmissionRate for requester KPIs**
- Spec requires two previously absent KPIs: "report accuracy" (% of converted reports resulting in a RÉSOLU closure) and "duplicate submission rate" (% of reports submitted despite the duplicate warning).
- `getAnalytics()` `reportsInPeriod` query extended: `submittedDespiteWarning` selected on reports; `derivedWorkOrders` now selects `status` and `interventionLogs { result }` in addition to `id` — single additive query, no extra round-trip.
- `reportAccuracyRate`: denominator is closed conversions only (open WOs have no closure result yet); a conversion is accurate when any derived CLOSED WO has at least one `InterventionLog` with `result = InterventionResult.RESOLVED`. Returns `null` when no closed conversions exist in the period.
- `duplicateSubmissionRate`: `submittedDespiteWarning=true` count divided by total reports. Returns `null` when no reports exist in the period.
- Both values exposed in the `requesterAnalytics` object returned by `GET /work-orders/analytics`.
- Tests: 10 new unit tests covering null-denominators (no closed conversions, no reports), 0/0.5/1.0 accuracy values, non-RESOLVED closure, mixed open/closed WOs in the denominator exclusion, and a combined realistic scenario. 55/55 passing; 0 regressions.

**feat(web): render report accuracy and duplicate submission rate KPIs in analytics board**
- `SupervisorAnalyticsBoard` requester tab gains two new `KpiCard` components after the existing three: "Précision des signalements" (formatted as %) and "Taux de soumission doublon" (formatted as %). Both display '—' when the backend returns `null`.
- i18n: `reportAccuracyRate`, `reportAccuracyRateDesc`, `duplicateSubmissionRate`, `duplicateSubmissionRateDesc` added to `apps/web/public/locales/fr/common.json` under `supervisorAnalytics.kpi`.

---

### Added — Parts consumption breakdown by asset category and WO type (April 25, 2026)

**feat(inventory): add getConsumptionBreakdown() with per-part breakdown by asset category and WO type**
- Spec requires "Consommation par pièce ventilée par catégorie d'actif et type d'OT (correctif vs préventif)." The previous `getConsumptionAnalytics()` grouped only by `partId` with no join to the work order or asset hierarchy.
- `InventoryRepository.getConsumptionBreakdown(periodDays)`: single `$queryRaw` SQL joining `StockMovement → WorkOrder (LEFT) → Asset (LEFT) → AssetCategory (LEFT)`, grouped by `partId × categoryId × wo.type`; quantity and `COALESCE(unitCostAtTime, unitCost, 0) × quantity` are summed per cell; restricted to the top-20 parts by outgoing quantity via an inline subquery (no extra round-trip).
- Post-query JS builds a nested `PartConsumptionBreakdown[]` (part → `byAssetCategory[]` → `byWoType[]`); movements not linked to a WO appear under `categoryId: null / woType: null`; final array sorted descending by `totalQuantity`.
- `InventoryService.getAnalytics()` runs `getConsumptionBreakdown()` in the existing `Promise.all` and returns it as `consumptionBreakdown` alongside the unchanged `consumption` field — fully additive.
- Tests: 7 new unit tests in `inventory.repository.spec.ts` — empty result, single-row mapping, CORRECTIVE+PREVENTIVE aggregation within the same part+category, multi-category grouping, null WO/category handling, sort order, and `since` date boundary. 19 total, 0 regressions.

**feat(web): render consumption breakdown by asset category and WO type in storekeeper analytics**
- Three new interfaces in `inventory.api.ts`: `ConsumptionBreakdownWoTypeEntry`, `ConsumptionBreakdownCategoryEntry`, `PartConsumptionBreakdown`; `InventoryAnalyticsResponse` extended with `consumptionBreakdown: PartConsumptionBreakdown[]`.
- New **"Consommation par catégorie d'équipement et type d'OT"** Card in `stock-analytics-board.tsx` rendered between the top-consumption cards and the request-breakdown section: per-part bordered block with a table row per `(category × WO type)`, coloured `Badge` labels (CORRECTIVE = destructive, PREVENTIVE = secondary, NONE = outline), subtotals per category, and a grand-total row.
- i18n: `storekeeperAnalytics.sections.{consumptionBreakdown,consumptionBreakdownDescription}`, `columns.{assetCategory,woType}`, `labels.{noCategory,total,woType.{CORRECTIVE,PREVENTIVE,NONE}}` added to `apps/web/public/locales/fr/common.json`.

### Added — Same-asset same-day preventive plan conflict detection (April 25, 2026)

**feat(preventive-plans): detect same-asset same-day plan conflicts**
- `PreventivePlansRepository.findSameDayAssetConflicts()` new method groups due plans by `assetId` and identifies conflicts: 2+ plans due same day on the same asset.
- Returns `Map<assetId, conflictDetails[]>` with `{ planId, planTitle, assetName }` for each conflict.
- Added `AssetSummary` and `TechnicianSummary` type helpers for plan relation includes.
- Updated `PlanWithRelations` type to include `asset` and `defaultTechnician` relations needed for conflict context.
- 6 unit tests covering empty plans, single asset conflict, multiple independent asset conflicts, and data accuracy. All passing.

**feat(preventive-plans): notify supervisors of same-asset plan conflicts**
- `PlanSchedulerService.scheduleDuePlans()` calls `findSameDayAssetConflicts()` before enqueueing WO generation jobs.
- When conflicts detected: supervisor notification sent with title "Conflit détecté : plusieurs plans préventifs" (French).
- Message includes asset name, conflict count, and comma-separated plan titles.
- Notification entity type: Asset (enables deep-linking to conflict source).
- **Critical behavior**: All plans are still enqueued (both WOs created as specified). Notification is informational only — no WO generation is blocked.
- 6 unit tests covering no conflicts, single asset conflict, multi-asset scenarios, and all-plans-enqueued verification. All passing.

**fix(preventive-plans): wire NotificationsModule dependency**
- `PreventivePlansModule` now imports `NotificationsModule` to support supervisor conflict notifications.
- `PlanSchedulerService` can now inject `NotificationsService`.
- Total test coverage: 12 new tests (6 repository + 6 scheduler), all passing; 0 regressions.

### Fixed — Daily summary role-aware stock visibility + critical deferred report section (April 25, 2026)

**fix(work-orders): complete daily-summary payload and rendering for critical deferred + role-aware inventory**
- `DailySummaryJob` now computes and exposes additional fields required by the spec:
 - `criticalDeferredCount`: count of `ProblemReportStatus.DEFERRED` reports with `deferredAt <= now - 14 days`.
 - `criticalDeferredItems`: top 10 oldest critical deferred reports with `{ referenceNumber, assetName, deferredAt, daysDeferred }`.
 - `lowStockItems`: top 10 below-threshold parts with `{ name, referenceCode, currentStock, minimumStockThreshold }`.
- Mail context is now recipient-role aware:
 - Added `hasStorekeeperRole` flag per supervisor recipient.
 - Low-stock metrics/details are included only for supervisors who also have `STOREKEEPER` role.
 - Supervisors without storekeeper role receive `lowStockCount = 0` and `lowStockItems = []` in mail context.
- `daily-summary.hbs` updated:
 - Added dashboard row for "Signalements differes critiques (14+ jours)".
 - Added detailed table section for critical deferred reports with empty-state fallback.
 - Wrapped low-stock row/table sections in `{{#if hasStorekeeperRole}}` to avoid exposing inventory-only content to non-storekeeper supervisors.
- Tests (`daily-summary.job.spec.ts`): expanded from 48 to 53 tests with new branches for critical deferred query predicates, list mapping, and role-based context shaping.

### Fixed — pdfkit test mock CJS interop + technician rejection rate by category (April 25, 2026)

**fix(tests): correct pdfkit CommonJS mock in report-generation specs**
- Both `report-generation.service.spec.ts` and `report-generation.e2e.spec.ts` returned `{ __esModule: true, default: MockPDFDocument }` from their `jest.mock` factory. With `module: "commonjs"` in tsconfig, `import * as PDFDocument from 'pdfkit'` compiles to `const PDFDocument = require('pdfkit')`, so the factory's return value IS `PDFDocument`. Returning a namespace object instead of the class caused `new PDFDocument()` to throw `TypeError: PDFDocument is not a constructor` at runtime in Jest.
- Fix: return the class directly from the mock factory. Also switched `EventEmitter` to `require('events')` inside the factory to avoid any jest-hoisting reference edge cases.
- Impact: 11 previously failing tests now pass; 29/29 report-generation tests green; 0 regressions.

**fix(tests): add missing StorageService and ReportGenerationService mocks to work-orders.service.spec.ts**
- All 8 `beforeEach` blocks in `work-orders.service.spec.ts` were missing `StorageService` and `ReportGenerationService` provider mocks. These dependencies were added to the `WorkOrdersService` constructor in a previous session but the spec file was never updated — causing all 45 tests to fail at module instantiation.
- Added `{ provide: StorageService, useValue: { getSignedUrl: jest.fn() } }` and `{ provide: ReportGenerationService, useValue: { generatePdf: jest.fn() } }` to every `beforeEach` block.
- Added `import { StorageService }` and `import { ReportGenerationService }` at the top of the file.
- Result: 45/45 tests passing.

**feat(analytics): compute per-technician rejection rate by category**
- Spec requires "Taux de rejet : % de clôtures rejetées par le Superviseur, ventilé par catégorie de motif de rejet."
- `work-orders.service.ts`: The `techKpiWOs` Prisma select was extended to include `rejectionReason` inside `validationActions`. The `techMap` accumulator gained `rejectionsByReason: Map<string, number>` to count each `REJECTED` validation action's `ValidationRejectionReason` per technician. Null reasons (e.g., validation records from before the field was required) are silently skipped.
- Each technician KPI entry now exposes three new fields:
 - `rejectionCount` — total REJECTED validation actions in the period.
 - `rejectionRate` — `rejectionCount / closedCount` (0–1, rounded to 3 decimal places).
 - `rejectionRateByCategory` — `Record<ValidationRejectionReason, { count: number; rate: number }>`.
- Tests: 5 new unit tests in a dedicated `describe` block covering: no rejections → empty map, single reason, multi-reason accumulation (two technicians stay independent), and null-reason grace handling. 45/45 passing.

**feat(web): display technician rejection rate by category in analytics board**
- `work-orders.api.ts`: New `TechnicianRejectionCategoryEntry { count, rate }` interface; `TechnicianKpiItem` extended with `rejectionCount`, `rejectionRate`, and `rejectionRateByCategory: Record<string, TechnicianRejectionCategoryEntry>`.
- `supervisor-analytics-board.tsx`:
 - `TechRow` gains a 7th column **"Taux de rejet"**; non-zero values are rendered in `text-destructive font-medium`.
 - When a technician has at least one rejection, a muted sub-row renders per-reason tags: reason label (via existing `validationRejectionReason.*` i18n keys, safe `defaultValue` fallback), count (×N), and percentage.
 - A new **"Détail des rejets par technicien"** card appears below the performance table whenever any technician in the period has rejections. Lists each affected technician with full per-reason breakdown.
 - Minimum table width raised to `min-w-[700px]` (was 600).
- `fr/common.json`: 4 new keys added: `supervisorAnalytics.columns.{rejectionRate,rejectionCount}`, `supervisorAnalytics.sections.{technicianRejectionBreakdown,technicianRejectionBreakdownDesc}`.
- Tests (`work-orders.api.spec.ts`): 3 new tests for `getAnalytics` — full payload with multi-reason breakdown, empty breakdown, and empty `technicianKpis` array. 9/9 passing; 120 frontend tests total, 0 regressions.

### Added — Audit gap fixes: promote reason, report enrichment, daily summary, technician filter (April 25, 2026)

**fix(work-orders): allow caller-supplied reason when promoting contributor to principal**
- `PromoteTechnicianDto` gains optional `reason?: WOReassignmentReason` and `reasonDetail?: string`.
- `assignmentService.promoteTechnician()` passes caller-supplied values to the reassignment log; falls back to `TECHNICIAN_ABSENT` / `null` only when fields are omitted — removing the hardcoded strings.
- Frontend: `PromoteTechnicianPayload` updated; promote panel in WO detail dialog gains a reason select and optional free-text detail field.
- Tests: 2 new unit tests in `assignment.service.spec.ts`.

**feat(work-orders): surface isReassignmentRemnant label on intervention logs**
- `WorkOrderInterventionLog` frontend type gains `isReassignmentRemnant: boolean`.
- WO detail dialog renders an amber pill "incomplet — réassigné" inline with the technician name for force-closed log entries.

**feat(web): navigate to filtered WO list from technician load panel**
- Technician load rows on the supervisor dashboard are now Next.js Links appending `?technicianId=<id>` to `/supervisor/work-orders`.
- `WorkOrdersBoard` reads `technicianId` from URL params, passes it to the list query, and shows a dismissible amber filter chip.
- `WorkOrderListQuery` frontend type gains optional `technicianId`; no backend changes needed.
- Tests: `technician-filter.spec.ts` (4 tests); `work-orders.api.spec.ts` updated.

**feat(reports): enrich report detail with asset context data**
- `ReportsRepository.findById()` includes `asset.workOrders` (non-terminal), `asset.certificates` (EXPIRING_SOON/EXPIRED, non-archived), and `assetInterventionHistory` (last 5 closed WOs, newest first — separate query to avoid Prisma relation-filter limitation).
- Tests: 7 unit tests in new `reports.repository.spec.ts`.

**feat(web): show asset context and duplicate WO warning in report detail**
- `reports-board.tsx`: amber duplicate-WO banner when active WOs exist on the same asset; asset context card with certificate-alert badges and intervention history.
- `ReportDetailItem` gains `asset.workOrders`, `asset.certificates`, `assetInterventionHistory`; three new interfaces.
- Tests: `reports-detail-enrichment.spec.ts` (5 tests).

**feat(work-orders): extend daily summary email with overdue list, on-hold durations, and inventory alerts**
- `DailySummaryMetrics` gains `deferredReportCount`, `lowStockCount`, `overdueList` (top 10), and `onHoldItems` (top 10 with computed `holdDurationMinutes`).
- `$transaction` expanded to 8 queries; low-stock count uses a separate `findMany` + in-memory filter (Prisma column-to-column comparison limitation).
- `daily-summary.hbs` updated with detailed sections for each new data set; empty fallback messages included.
- `SendMailDto.context` broadened to `Record<string,unknown>` to support array values.
- Tests: 48 unit tests (up from 30).

### Added — Public setup email resend flow (April 24, 2026)

**feat(auth): add public resend-setup endpoint for expired onboarding links**
- Added `POST /auth/resend-setup` as a public, throttled endpoint that accepts an email address, reuses the existing setup-token mail flow, and returns `204 No Content` regardless of whether a matching inactive user exists.
- `UsersService` now exposes `resendSetupByEmail(email)` to invalidate any prior setup token for the inactive user and queue a fresh setup email through the existing Handlebars/BullMQ pipeline.
- Tests: controller integration coverage for success and validation failure, `AuthService` delegation coverage, and `UsersService` unit coverage for inactive, active, and missing-user branches.

**feat(web): add public resend setup page and login entry point**
- Added `/resend-setup` with the same Suspense/card UX used by the other auth screens, plus a legacy `/app/auth/resend-setup` redirect for compatibility.
- Login and expired-setup screens now link to the resend flow.
- `authApi.resendSetup(email)` was added alongside i18n strings for the new form and success state.
- Tests: API wrapper, resend-setup validation/helper, and middleware allowlist coverage.

### Fixed — Audit gap resolution: escalation, CRITICAL overdue, FOLLOW_UP_PROMPT, cancel notification (April 24, 2026)

**feat(work-orders): add validation insight signals for supervisor closure review**
- `WorkOrdersService.findById()` now enriches WO detail responses with three additive fields used by the supervisor validation view:
 - `contributorsWithoutLog`: active contributor assignments with no intervention log entry.
 - `timeDeviation`: computed estimate-vs-actual metrics (`estimatedDurationMinutes`, `actualDurationMinutes`, `deltaMinutes`, `deltaPercent`).
 - `hasNotableTimeDeviation`: boolean flag when the deviation is non-zero.
- This closes the two missing supervisor validation signals from the audit: contributor-without-log and notable time deviation.
- Tests: dedicated backend unit suite for all branches (missing estimate, zero estimate, contributor coverage) and controller integration assertion that `GET /work-orders/:id` exposes the new fields.

**feat(web): surface validation insight signals in supervisor WO detail dialog**
- Supervisor WO detail dialog now renders a dedicated validation-signals panel for `PENDING_VALIDATION` WOs when either condition is present:
 - one or more contributors without intervention logs,
 - notable estimate-vs-actual duration deviation.
- Added utility helpers for deterministic UI formatting of contributor names and deviation direction/magnitudes.
- Added French i18n keys for the new titles/descriptions; no hardcoded user-facing strings introduced.
- Tests: API contract test for `workOrdersApi.getById` (new fields) and utility tests covering direction/edge cases (`none`, `over`, `under`, `equal`, null percentage).

**fix(work-orders): scope priority escalation to OPEN/ASSIGNED statuses only**
- `WorkOrdersRepository.findOverdueForEscalation` previously used `status: { notIn: [CLOSED, CANCELLED] }`, which included IN_PROGRESS, ON_HOLD, and PENDING_VALIDATION — contradicting the spec clause "has not moved to En cours".
- Changed to `status: { in: [OPEN, ASSIGNED] }`. WOs that are already being worked on are never auto-escalated.
- Tests: 8 unit tests in `work-orders.repository.escalation.spec.ts` verifying status filter, CRITICAL exclusion, dueDate constraint, and select shape.

**fix(work-orders): notify supervisors when a CRITICAL WO becomes overdue**
- Overdue CRITICAL WOs were silently excluded from the escalation query with no alternative path. The spec states: "Critique en retard ne s'escalade pas davantage — it triggers an immediate notification to the Supervisor."
- Added `findOverdueCritical(now)` to `WorkOrdersRepository` — queries OPEN/ASSIGNED WOs with CRITICAL priority and `dueDate < now`.
- `autoEscalateOverduePriorities()` now runs this query first, emits `WO_OVERDUE` via `notifySupervisors()` for each result, and returns a `criticalNotified` counter alongside the existing `checked` and `escalated` values.
- Tests: 12 unit tests in `work-orders.service.escalation.spec.ts` covering zero case, CRITICAL-only path, escalation chain, mixed run, and return values.

**fix(work-orders): send FOLLOW_UP_PROMPT to supervisors, not principal technician**
- `ValidationService.validate()` was dispatching `FOLLOW_UP_PROMPT` to `principalTechnicianId` on a COULD_NOT_INTERVENE result. The spec requires the Supervisor to be prompted (to create a follow-up WO or mark the asset Out of Service); the technician has no action to take.
- Changed to `notifications.notifySupervisors(FOLLOW_UP_PROMPT, ...)`. The gate on `principalTechnicianId` was also removed — supervisors must be notified regardless.
- Tests: replaced 2 stale test cases (wrong recipient assertions) with 4 correct tests: `notifySupervisors` called with FOLLOW_UP_PROMPT; `notify()` not called with FOLLOW_UP_PROMPT; fires even when WO has no principal technician.

**fix(work-orders): notify source requester when a WO is cancelled**
- `WorkOrdersService.cancel()` notified assigned technicians but ignored the original problem report reporter. The spec states: "Le Demandeur notifié si l'OT provient d'un signalement."
- `findById` already includes `sourceReport.reporter.id` via its Prisma include. After technician notifications, `cancel()` now reads `sourceReport?.reporter?.id` and sends `LINKED_WO_CLOSED` to that user. Null-safe: no notification when the WO has no source report or the reporter is missing.
- Tests: 3 unit tests in the `WorkOrdersService.cancel` block — requester notified; skipped when no source report; skipped when reporter is null.

### Added — On-demand PDF report download for closed work orders (April 24, 2026)

**fix(work-orders): correct pdfkit CommonJS import for ESM interop**
- `ReportGenerationService` was importing `PDFDocument` as a default ES import (`import PDFDocument from 'pdfkit'`), which compiles to `pdfkit_1.default` under `module: commonjs` without `esModuleInterop`. The `pdfkit` package uses `module.exports = PDFDocument` (CJS), so `pdfkit_1.default` was `undefined` at runtime — `new PDFDocument()` threw `TypeError: pdfkit_1.default is not a constructor`.
- Fixed by switching to a namespace import: `import * as PDFDocument from 'pdfkit'`. This correctly resolves to the `module.exports` value under CommonJS compilation.

**feat(work-orders): add on-demand PDF report download endpoint**
- `WorkOrdersService.getReportUrl(id)`: fetches the WO, throws `BadRequestException('workOrders.report.notClosed')` if not CLOSED, returns a presigned MinIO URL. When `reportPdfKey` is null (WO closed before async job completed or job failed), generates the PDF synchronously on first request, uploads to the `pdfs` bucket, and persists `reportPdfKey` for subsequent calls.
- `StorageService` and `ReportGenerationService` injected into `WorkOrdersService` (already in `WorkOrdersModule` providers — no new module wiring needed).
- `GET /work-orders/:id/report` (Supervisor only) added to `WorkOrdersController` as a clean one-line delegate to `this.workOrders.getReportUrl(id)` — no service logic in the controller.
- `authorize-simultaneous.service.spec.ts` updated to pass two additional `{} as never` stubs matching the new `WorkOrdersService` constructor arity.

**feat(web): add PDF report download button to closed WO detail dialog**
- `WorkOrderDetail` interface gains `reportPdfKey: string | null` field.
- `workOrdersApi.getReportUrl(id)` API call added.
- Download button rendered in `DialogFooter` when `status === WorkOrderStatus.CLOSED`: shows spinner while request is in flight, opens the presigned URL in a new tab on success, shows `toast.error` on failure.
- i18n keys added (French): `supervisorWorkOrders.actions.downloadReport`, `supervisorWorkOrders.actions.reportNotReady`, `supervisorWorkOrders.toasts.reportDownloadError`.

### Added — Full KPI analytics and asset health recurring-failure detection (April 23, 2026)

**feat(work-orders): add full KPI analytics across 5 categories**
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

**feat(work-orders): add asset health recurring-failure panel to supervisor dashboard**
- `WorkOrdersService.getRecurringFailureAssets(thresholdCount, periodDays)`: groups CORRECTIVE WOs by asset within the lookback window, returns assets meeting or exceeding `thresholdCount` sorted descending by failure count. Returns `{ assetId, assetName, qrCode, failureCount, lastFailureDate }[]`.
- `GET /work-orders/asset-health?thresholdCount=3&periodDays=90` endpoint (Supervisor only, placed before `/:id`). Defaults: threshold = 3, period = 90 days.
- `AssetHealthItem` interface + `getAssetHealth()` API call added to `apps/web/lib/work-orders.api.ts`.
- Asset health panel added to `supervisor/page.tsx` between technician load and operational alerts sections: red border when assets are flagged; lists each at-risk asset with `Activity` icon, failure count badge, and last failure date.
- i18n keys: `supervisorDashboard.assetHealth.{title, description, none, lastFailure}`.
- **Tests (4 backend + 6 frontend):** `getRecurringFailureAssets` — empty when no WOs; asset returned when count meets threshold; excluded when below threshold; sorted descending by failure count. Frontend: `WorkOrderAnalyticsResponse` full contract, all-null nullable fields, `AssetHealthItem` shape, `TechnicianKpiItem` with data and nulls.
- **441 backend tests + 87 frontend tests total — 0 regressions.**

### Added — Technician pre-assignment, email preferences, and calendar preview (April 23, 2026)

**feat(work-orders): add technician pre-assignment and duration hints to WO creation**
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

**feat(users): add per-user email notification preferences**
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

**feat(preventive-plans): add foreseeable WO generation calendar preview**
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

### Added — Storekeeper cost analytics and on-hold long-waiting request detection (April 23, 2026)

**feat(inventory): add monthly cost trend analytics**
- `InventoryRepository.getCostTrend(periodDays)`: raw SQL query that groups `OUTGOING` stock movements by calendar month and computes `SUM(quantity × COALESCE(unitCostAtTime, unitCost, 0))`. Returns `[{ month: "YYYY-MM", totalCost: number }]` ordered ASC — suitable for a month-over-month trend table.
- `InventoryCostTrendItem` interface added to `apps/web/lib/inventory.api.ts`.
- `StockAnalyticsBoard` gains a "Évolution des dépenses en pièces" section: table of monthly spending rows with currency formatting; empty state shown when no OUTGOING movements exist in the period.

**feat(inventory): add long-waiting requests on blocked work orders**
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

**feat(documents): implement automatic versioning on document upload**
- `DocumentsService` now implements version archiving via a private `_doUpload()` helper called by all upload paths (asset, part, plan).
- On each upload: queries for an existing `isCurrentVersion: true` document with the same `entityType + entityId + documentType`; if found, marks it `isCurrentVersion = false` and sets `replacedById = newDocId` inside a Prisma `$transaction` that atomically creates the new record; new document receives `version = old.version + 1`. First upload always creates `version = 1`.
- New `getVersionHistory(docId)`: finds all documents sharing the same `entityType`, `entityId`, and `documentType`, returned in `version desc` order.
- Existing asset document upload (`upload()`) now delegates to `_doUpload()` — asset documents gain versioning without any API surface change.
- **Tests (25 in `documents.service.spec.ts`):** version-1 creation when no prior doc; version-2 creation + archiving of prior current version; `replacedById` wired correctly; `$transaction` used; `getVersionHistory` queries all chain docs; `NotFoundException` on missing entity (asset, part, plan); `BadRequestException` for disallowed types per entity; `ForbiddenException` on delete of certificate-owned doc; `getDownloadUrl` returns presigned URL.

**feat(inventory): add document attachments to part catalog**
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

**feat(preventive-plans): add document attachments to preventive plans**
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

**feat(notifications): add notifyAdmins() to NotificationsService**
- `NotificationsService.notifyAdmins(type, title, summary, entityType?, entityId?)` added — symmetric to `notifySupervisors()`: queries all active `ADMIN` users and calls `notifyMany()` with the full fan-out; `entityType` and `entityId` are optional to accommodate system-level notifications that have no specific entity.
- **Tests (3):** active ADMIN users queried; `notifyMany` called with correct `recipientId`/type/title/summary/entityType/entityId per admin; no-op (empty `notifyMany` call) when no active admins exist; `entityType`/`entityId` passed through as `undefined` when omitted.

**feat(job-logger): emit SCHEDULED_JOB_FAILED to admins on cron job failure**
- `JobLoggerService` now injects `@Optional() NotificationsService | null` as a second constructor argument. The `@Optional()` decorator preserves backward compatibility: all existing unit tests that instantiate the service with only `PrismaService` continue to pass without modification.
- `recordFailure()` calls the private `notifyAdminsJobFailed(jobName, message)` after persisting the failure log. That helper checks the `Notification` table for a recent `SCHEDULED_JOB_FAILED` entry within the last 23 hours (`entityType='ScheduledJob'`, `entityId=jobName`) and skips if one exists — preventing hourly spam when a job fails persistently.
- Notification summary includes the job name and the (possibly truncated) error message.
- No modification to any of the 6 existing cron job files — the notification is fired transparently from the shared logger.
- **Tests (8 new, 2 updated existing):** dedup skip when recent notification found; sends when no dedup entry; dedup query uses correct `type`/`entityType`/`entityId`/23h window; notification summary contains job name; notification summary contains error message; error message truncated to 500 chars before inclusion; `@Optional()` null-safety — no crash, no notification when `notifications=null`; DB errors in `recordFailure` still swallowed.

**feat(admin): add FailedNotificationDetectorJob for email delivery failure alerting**
- New `@Cron(EVERY_HOUR)` job at `apps/backend/src/admin/failed-notification-detector.job.ts`, registered in `AdminModule`.
- `doRun()` counts `Notification` rows with `emailFailed: true` created within the last 23 hours. If count > 0, checks a dedup entry (`NOTIFICATION_DELIVERY_FAILED`, `entityType='system'`, `entityId='email-delivery'`) within the same 23h window; if not found, emits `NOTIFICATION_DELIVERY_FAILED` to all active admins via `notifyAdmins()` with the failure count in the summary.
- Job execution wrapped with `jobLogger.recordStart`/`recordSuccess`/`recordFailure`, making it visible in the admin scheduled-job health panel.
- Does NOT query dedup when `failedCount === 0` (short-circuits early to avoid an unnecessary `findFirst`).
- **Tests (15):** `run()` calls `recordStart`/`recordSuccess` on success; `run()` calls `recordFailure` and re-throws on error; `doRun()` skips `notifyAdmins` when `failedCount=0`; count query uses `emailFailed=true` with 23h `gte` window; notifies when count > 0 and no dedup entry; summary contains the failure count; dedup skip when recent `NOTIFICATION_DELIVERY_FAILED` exists; dedup query uses correct type/entityType/entityId/window; `findFirst` not called when count is 0.
- **367 backend tests total — 0 regressions.**

### Added — Supervisor dashboard operational panels and validation queue (April 22, 2026)

**feat(backend): add closedAfter/closedBefore date filters to work-order list query**
- `WorkOrderQueryDto` gains two optional `@IsDateString()` fields: `closedAfter` and `closedBefore` (both documented via Swagger `@ApiPropertyOptional`).
- `WorkOrdersRepository.findAll` translates the params to a `closedAt: { gte, lte }` Prisma predicate using only the provided bounds; absent params produce no `closedAt` key in the `where` clause — all existing callers are unaffected.
- Used by the supervisor dashboard "Clôturés aujourd'hui" panel to count WOs closed since UTC midnight.
- **Tests (8):** `closedAfter` → `gte` Date object; `closedBefore` → `lte` Date object; combined range → both keys in same `closedAt` object; absent params → no `closedAt`; `status` filter still applied alongside `closedAfter`; `search` still applied alongside `closedAfter`; param stored as a `Date` instance (not a string); empty query → no `closedAt` key.

**feat(assets): add certificate alerts endpoint for supervisor dashboard**
- New `CertificatesService.findAlerts()` method: queries all non-archived `EXPIRING_SOON` and `EXPIRED` compliance certificates with their parent asset (`id`, `name`), ordered by `expirationDate` ascending. Returns `CertificateAlertItem[]` (exported interface).
- New `GET /assets/certificates/alerts` route in `AssetsController` (Supervisor only). Declared before the generic `GET /assets/:id` handler to prevent NestJS routing the literal segment `certificates` as an asset ID.
- **Tests (5):** only EXPIRING_SOON/EXPIRED queried; archived certs excluded; Prisma rows mapped to `CertificateAlertItem`; EXPIRED status preserved; empty list returned when none; results ordered by `expirationDate asc`. (341 backend tests total, 0 regressions.)

**feat(web): add operational panels to supervisor dashboard**
- New `lib/date-utils.ts` module: `elapsedSince(isoDate)` returns a short human-readable elapsed duration ("3h", "2j"); `todayStartIso()` returns the ISO-8601 UTC midnight timestamp for today. Both utilities are pure functions and covered by dedicated tests.
- `CertificateAlertItem` interface + `assetsApi.getCertificateAlerts()` added to `assets.api.ts`.
- `closedAfter?: string` and `closedBefore?: string` added to `WorkOrderListQuery` in `work-orders.api.ts`.
- Supervisor dashboard (`supervisor/page.tsx`) gains a second row of three operational panels below the existing summary cards:
 1. **Clôturés aujourd'hui** — live count of WOs with `status=CLOSED&closedAfter=<UTC-midnight>`; links to work-orders board.
 2. **Demandes bloquées** — fetches up to 100 PENDING part requests and counts those where `workOrder.status === ON_HOLD`; amber border when count > 0; links to work-orders board.
 3. **Certificats à risque** — lists up to 4 EXPIRING_SOON/EXPIRED certs inline with asset name, expiration date, and colored badge; shows overflow count; links to assets page.
- The "À valider" summary card CTA now navigates to `/supervisor/validation-queue` instead of the general work-orders board.
- **Tests (10):** `elapsedSince` boundary at 0h / Nh / 23h59m / 24h / 2j / 7j; `todayStartIso` produces UTC midnight of today; ISO-8601 format; always in the past. (37 frontend tests total, 0 regressions.)

**feat(web): add dedicated validation queue view for supervisors**
- New `ValidationQueueBoard` component (`components/supervisor/validation-queue-board.tsx`): paginated table filtered to `PENDING_VALIDATION` WOs with columns — reference (monospace), asset + location path, principal technician, type badge, priority badge, time-in-queue (from `elapsedSince`). Clicking a row opens the existing `WorkOrderDetailDialog` where the supervisor can approve or reject closure. Empty state, error state, and pagination controls included.
- New route `app/(protected)/supervisor/validation-queue/page.tsx` with page title and subtitle.
- Supervisor sidebar gains a "File de validation" nav item (ShieldCheck icon) pointing to `/supervisor/validation-queue`.
- **i18n:** `nav.validationQueue`, `validationQueue.{title,subtitle,total,columns.*,states.*}` keys added to `common.json`.

### Added — COULD_NOT_INTERVENE follow-up WO flow and technician load panel (April 22, 2026)

**feat(db): add FOLLOW_UP to WorkOrderSource enum with migration**
- `WorkOrderSource.FOLLOW_UP` added to `packages/db/prisma/schema.prisma` and to the `@gmao/shared` `WorkOrderSource` enum in `packages/shared/src/enums/work-order.enum.ts`.
- Migration `20260422000001_add_follow_up_source`: `ALTER TYPE "WorkOrderSource" ADD VALUE 'FOLLOW_UP';` — additive, safe to apply with zero downtime.

**feat(work-orders): add follow-up WO creation from COULD_NOT_INTERVENE closures**
- New `CreateFollowUpDto` (`apps/backend/src/work-orders/dto/create-follow-up.dto.ts`): `type`, `priority`, `description` (required) + `internalNotes`, `estimatedDurationMinutes`, `dueDate` (optional). `assetId` is intentionally excluded — inherited from the original WO to enforce unambiguous cross-reference.
- `WorkOrdersRepository.create()` gains an optional 7th parameter `followUpFromId?: string` passed to `tx.workOrder.create`. `findById` include now fetches `followUpFrom: { id, referenceNumber }` and `followUps: [{ id, referenceNumber }]` self-relations.
- `WorkOrdersService.createFollowUp(originalWoId, dto, actorId)`: validates original WO status is `CLOSED` (throws `BadRequestException('workOrders.followUp.originalMustBeClosed')` otherwise); inherits `assetId`; calls `repo.create` with `sourceType=FOLLOW_UP` and `followUpFromId=originalWoId`.
- New `GET /work-orders/technician-load` endpoint declared before `GET /:id` to avoid route shadowing. `TechnicianLoadItem` interface exported from the service.
- New `POST /work-orders/:id/follow-up` controller action (Supervisor only).
- **Tests (9):** happy path verifies `repo.create` receives `FOLLOW_UP` source + `followUpFromId`; non-CLOSED guard throws `BadRequestException`; `assetId` inherited (not from DTO); asset not-found propagates; 5 `getTechnicianLoad` tests (empty, aggregation, CRITICAL detection, sort order, hasCritical=false). (350 backend tests total, 0 regressions.)

**feat(web): add follow-up WO prompt and cross-reference display in validation dialog**
- `WorkOrderCrossRef`, `CreateFollowUpPayload`, and `TechnicianLoadItem` interfaces added to `lib/work-orders.api.ts`; `WorkOrderDetail` extended with `followUpFrom: WorkOrderCrossRef | null` and `followUps: WorkOrderCrossRef[]`; `createFollowUp()` and `getTechnicianLoad()` API methods added.
- `work-order-detail-dialog.tsx` uses a `useRef` (`pendingFollowUpCtxRef`) to capture the pre-mutation context (originalWoId, referenceNumber, assetId, description, priority) immediately before `validateMutation.mutate()` fires. In `onSuccess`, if the ref is set, a yellow-bordered prompt panel replaces the validation panel, offering "Ignorer" and "Créer un OT de suivi" buttons.
- Cross-reference section in the detail card shows `followUpFrom.referenceNumber` and a list of `followUps` references when present.
- **i18n:** `supervisorWorkOrders.followUp.{promptTitle,promptBody,dismiss,create,descriptionPrefix}`, `supervisorWorkOrders.toasts.{followUpCreated,followUpError}`, `supervisorWorkOrders.detail.{followUpChain,followUpFrom,followUps}` keys added to `fr/common.json`.
- **Tests (10):** `follow-up-utils.spec.ts` — `buildFollowUpDescription` prefix formatting (3 tests); `resolveNotificationRoute` for `FOLLOW_UP_PROMPT` notifications (3 tests); `TechnicianLoadItem` sort/hasCritical display logic (4 tests). (47 frontend tests total, 0 regressions.)

**feat(web): add technician load panel to supervisor dashboard**
- `TechnicianLoadItem` type imported from `lib/work-orders.api.ts`.
- New `TechnicianLoadRow` sub-component renders technician name, open WO count, and a destructive "CRITIQUE" badge when `hasCritical=true`.
- `supervisor/page.tsx` adds an 11th `useQueries` entry calling `getTechnicianLoad()`; the result is rendered as a card panel sorted descending by `openWoCount`; empty state shows a checkmark message.
- **i18n:** `supervisorDashboard.technicianLoad.{title,woCount,criticalLabel,none}` keys added to `fr/common.json`.

### Added — Scheduled job health monitoring and QR code print (April 21, 2026)

**feat(admin): track scheduled job execution health with per-job cron log**
- New `ScheduledJobLog` Prisma model (`jobName UNIQUE`, `lastRunAt`, `lastSuccessAt`, `lastFailureAt`, `lastErrorMessage`, `updatedAt`) with migration `20260421000000_scheduled_job_log`.
- New `JobLoggerService` in `apps/backend/src/job-logger/` (dedicated module): `recordStart()`, `recordSuccess()`, `recordFailure()` (message truncated to 500 chars), `getAll()`. All log methods swallow DB errors so a failing log write never interrupts a cron job.
- All 6 existing cron jobs (`ValidationReminderJob`, `DueDateApproachingJob`, `ContractorDateOverdueJob`, `AccessRetryApproachingJob`, `DailySummaryJob`, `PriorityEscalationJob`) now wrap their execution in a try/catch that calls `recordStart` / `recordSuccess` / `recordFailure`. Logic extracted to a private `doRun()` to keep the `run()` shell clean.
- `JobLoggerModule` imported in both `WorkOrdersModule` (for the cron jobs) and `AdminModule` (for analytics read-path) — no circular dependency.
- `AdminAnalyticsService.getSystemHealthStats()` fetches job logs in parallel via `Promise.all` and merges them as `scheduledJobs: ScheduledJobStatus[]` in the response.
- Admin analytics board now shows a "Tâches planifiées" section: per-job table with status badge (healthy / failed / unknown), last run, last success, last failure timestamp, and last error message.
- **Tests:** 9 `job-logger.service.spec.ts` tests; 2 new `admin-analytics.service.spec.ts` tests; 3 lifecycle-logging tests added to each of the 6 existing job spec files; new `priority-escalation.job.spec.ts` with 6 tests. 328 backend tests total (0 regressions).

**feat(web): render QR code image with print action in asset detail dialog**
- Added `react-qr-code ^2.0.15` dependency to `apps/web`.
- New pure-function library `apps/web/lib/qr-print.ts`: `buildQrPrintHtml(options, svgMarkup)` generates an XSS-safe standalone print HTML document (escapes `<`/`>` in `assetName` and `identifier`, embeds SVG verbatim, includes `window.print()` auto-trigger); `openQrPrintWindow()` opens a `_blank` popup and writes the HTML.
- `asset-detail-dialog.tsx` now renders a `<QRCode>` SVG component (size 120, level M) beside the QR identifier and exposes a "Imprimer le QR" print button that extracts the SVG from the DOM and calls `openQrPrintWindow()`.
- i18n: `supervisorAssets.detail.printQrCode` and `supervisorAssets.detail.qrCodeAriaLabel` added to `common.json`.
- **Tests:** 10 `qr-print.spec.ts` tests covering asset name/identifier inclusion, SVG injection, XSS escaping, auto-print script, HTML document structure, print media query, SVG dimensions, and `lang="fr"` attribute. 27 frontend tests total (0 regressions).

### Fixed + Added — Checklist source attribution, WO detail cost summary, and checklist display (April 20, 2026)

**fix(work-orders): fix checklist anomaly-WO source attribution**
- Auto-corrective WOs created from checklist anomalies were tagged `sourceType: PREVENTIVE_PLAN`, making them indistinguishable from plan-generated WOs in analytics. Added `WorkOrderSource.CHECKLIST_ANOMALY` to the Prisma schema, `@gmao/shared` enum, and migration `20260420143130_add_checklist_anomaly_source`.
- `ChecklistService.completeItem()` now uses `WorkOrderSource.CHECKLIST_ANOMALY` and propagates `sourcePlanId` from the parent WO, so the link to the originating preventive plan is preserved.
- `@gmao/db` rebuilt to distribute the updated enum to consumers.
- 12 new unit tests in `checklist.service.spec.ts` covering: wrong WO status, unassigned actor, missing item, wrong WO binding, already-completed guard, missing `anomalyDescription`, mandatory item NOT_APPLICABLE guard, missing `notApplicableReason`, DONE without auto-create, ANOMALY + auto-create with/without `sourcePlanId`, and ANOMALY without auto-create.

**feat(work-orders): expose computed cost summary on WO detail endpoint**
- `GET /work-orders/:id` now computes `costSummary` (laborCost, partsCost, contractorCost, totalCost) via `calculateWorkOrderCostSummary` and returns it merged into the WO detail response. No new DB query — the data was already included (intervention logs with `hourlyRateAtTime`/`activeDurationMinutes`, stock movements with `unitCostAtTime`/`quantity`).
- 2 new integration tests: zero-cost WO returns all-zero summary; WO with 120min @ 30/h + 2 parts @ 15 + 100 contractor = 190 total.

**fix(web): fix checklist status display and expose cost summary in WO detail dialog**
- **Ghost field removed:** `completedNote: string | null` did not exist in the Prisma schema and was always `undefined` at runtime. Replaced with `anomalyDescription: string | null` and `notApplicableReason: string | null` (the actual DB fields).
- **Status badge fix:** The checklist item badge in the supervisor WO detail dialog was checking for `COMPLETED` and `SKIPPED` — values that do not exist in `ChecklistItemStatus`. Now correctly switches on `DONE`, `ANOMALY_DETECTED`, `NOT_APPLICABLE`, and `PENDING` with appropriate badge variants (`success`, `destructive`, `secondary`, `outline`).
- **i18n key pattern fixed:** The badge label was built from a broken string concatenation (`checklist${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`) which produced wrong keys for multi-word statuses. Replaced with `checklistStatus.<STATUS>` nested object keys in `common.json`.
- **Anomaly/notApplicable sub-text:** Checklist items now show `anomalyDescription` in destructive color and `notApplicableReason` in muted color when set.
- **Cost summary section:** WO detail dialog renders a four-cell grid (labor / parts / contractor / total) when `costSummary` is present, using `Intl.NumberFormat('fr-FR')` formatting.
- **Type updates:** `WorkOrderDetail` gains `costSummary: WorkOrderCostSummaryDetail`; `WorkOrderAnalyticsResponse` also typed; `WorkOrderCostSummaryDetail` interface extracted.
- **i18n additions:** `checklistStatus.{PENDING,DONE,ANOMALY_DETECTED,NOT_APPLICABLE}`, `checklistAnomalyDescription`, `checklistNotApplicableReason`, `costSummary`, `costSummaryDescription`, `costLabor`, `costParts`, `costContractor`, `costTotal` keys added to `common.json`.

### Fixed + Added — On-hold supervisor management, hold-metadata endpoint, and hold scheduler jobs (April 20, 2026)

**fix(work-orders): separate hold management actor responsibilities**
- **Actor fix:** `ResolveHoldDto` no longer accepts `resolutionNote` — the supervisor's resolution plan note is not the technician's responsibility. `OnHoldService.resume()` removes the `supervisorResolutionNote` write from the resume transaction; the field must be set exclusively via the new supervisor endpoint before the technician resumes.
- **New endpoint:** `PATCH /work-orders/:id/hold-metadata` (Supervisor only) — `UpdateHoldMetadataDto` accepts `expectedResolutionDate?: string`, `retryDate?: string`, `resolutionNote?: string`; all fields are optional and only provided fields are written. Returns the updated `WorkOrder`.
- `OnHoldService.updateHoldMetadata()` validates that the WO is `ON_HOLD`, finds the most-recent unresolved `OnHoldPeriod` (`resumedAt: null`), and applies a partial update. Empty DTO is a safe no-op (no DB write).
- Guards: `BadRequestException` when WO is not `ON_HOLD`; `NotFoundException` when no active hold period exists.

**feat(work-orders): add ContractorDateOverdueJob and AccessRetryApproachingJob schedulers**
- **`ContractorDateOverdueJob`** (`@Cron(EVERY_HOUR)`): queries `OnHoldPeriod` rows where `reasonType = EXTERNAL_CONTRACTOR`, `resumedAt = null`, and `expectedResolutionDate < now`; emits `CONTRACTOR_DATE_OVERDUE` to all supervisors for each matching WO; 23-hour deduplication window prevents hourly re-notification.
- **`AccessRetryApproachingJob`** (`@Cron(EVERY_HOUR)`): queries `OnHoldPeriod` rows where `reasonType = ACCESS_DENIED`, `resumedAt = null`, and `retryDate ∈ [now, now+24h]`; emits `ACCESS_RETRY_APPROACHING` to all supervisors; formatted retry date included in the notification summary; 23-hour deduplication window.
- Both jobs registered in `WorkOrdersModule` alongside the existing hold-related jobs.
- 8 unit tests each: cron metadata, no-op, send, dedup skip, mixed send/skip, hold query predicate, dedup query window, error propagation.

**feat(web): supervisor hold management UI with hold-metadata endpoint wiring**
- **Frontend type fix:** `WorkOrderOnHoldPeriod` interface corrected — removed the wrong `reason`/`note` fields (which were always `undefined` at runtime; the DB columns are `reasonType` and `detail`); added all missing fields: `reasonType`, `detail`, `expectedResolutionDate`, `retryDate`, `supervisorAssetStatusChoice`, `supervisorResolutionNote`.
- **API client:** `workOrdersApi.updateHoldMetadata(id, payload)` wraps `PATCH /work-orders/:id/hold-metadata`.
- **Hold period display:** On-hold period cards in the supervisor WO detail dialog now render `reasonType` (translated via `supervisorWorkOrders.holdReasonType.*`), `detail`, `expectedResolutionDate`, `retryDate`, and `supervisorResolutionNote`.
- **Supervisor management form:** When the WO is `ON_HOLD`, a collapsible inline form ("Mettre à jour les informations de mise en attente") allows the supervisor to set any combination of `expectedResolutionDate`, `retryDate`, and `resolutionNote` and save via `PATCH /hold-metadata`.
- **i18n:** All new UI strings added to `apps/web/public/locales/fr/common.json` under `supervisorWorkOrders.holdReasonType.*`, `supervisorWorkOrders.labels.*`, `supervisorWorkOrders.actions.*`, and `supervisorWorkOrders.toasts.*`.

### Added — Work-order cost summary in analytics and PDF reports (April 18, 2026)

**feat(work-orders): compute labor, parts, and contractor cost for closed work orders**
- Added a shared work-order cost calculator that rolls up contractor cost, labor cost from intervention logs, and parts cost from outgoing stock movements
- `GET /work-orders/analytics` now includes a `costSummary` payload for the requested period
- PDF generation for closed work orders now renders a dedicated cost section with parts, labor, contractor, and total cost values
- Added coverage:
 - `work-orders.service.spec.ts`: analytics cost summary calculation
 - `work-orders.controller.integration.spec.ts`: analytics endpoint payload shape
 - `report-generation.service.spec.ts`: PDF cost section rendering and computed totals

### Fixed — Work-order promotion guard and intervention-log cleanup (April 18, 2026)

**fix(work-orders): reject promote on terminal WOs and close the previous principal log on in-progress promotion**
- `AssignmentService.promote()` now reuses the shared terminal-state guard, so `CLOSED` and `CANCELLED` work orders cannot be promoted
- When promotion happens on an `IN_PROGRESS` work order, the old principal's open `InterventionLog` is closed with the same reassignment-remnant semantics used by the reassignment flow
- Added full coverage:
 - `assignment.service.spec.ts`: terminal rejection, in-progress log closure, and non-in-progress no-op on intervention logs
 - `work-orders.controller.integration.spec.ts`: promote route auth, validation, and success wiring

### Fixed — Work-order cancellation detail contract enforcement (April 18, 2026)

**fix(work-orders): require cancellation detail for EXTERNAL_DECISION and RESOLVED_OTHERWISE**
- `CancelWorkOrderDto` now enforces conditional validation: `detail` is mandatory only when reason is `EXTERNAL_DECISION` or `RESOLVED_OTHERWISE`
- Whitespace-only values are rejected at DTO level with `workOrders.cancellationDetailRequired`
- `WorkOrdersService.cancel()` now applies the same rule defensively (service-layer guard) and trims persisted `cancellationDetail`
- Added full coverage:
 - `work-orders.service.spec.ts`: required/missing detail, whitespace-only edge case, optional detail for other reasons, trimming behavior
 - `work-orders.controller.integration.spec.ts`: auth (401), role enforcement (403), validation failures (400), and success paths (200)

### Added — Notification system completeness: WO_RESUMED, LINKED_WO_CLOSED, DUE_DATE_APPROACHING, deep-linking (April 18, 2026)

**feat(work-orders): emit WO_RESUMED notification to contributors on hold resume**
- `OnHoldService.resume()` now emits `WO_RESUMED` to every **active contributor** technician after the work order transitions back to `IN_PROGRESS`
- The principal technician (who initiates the resume) is intentionally excluded — notification targets collaborators who were not involved in the decision
- Uses existing `notifyMany()` for batch delivery with in-app + conditional email channels
- 14 unit tests: `putOnHold` asset-status derivation per reason (MISSING_PART, EXTERNAL_CONTRACTOR, ACCESS_DENIED corrective/preventive, OTHER with/without choice), forbidden guard, supervisor notification; `resume` no-contributors no-op, active-only targeting, principal exclusion, correct `WO_RESUMED` type/entityId, state-machine guard

**feat(work-orders): notify requester via LINKED_WO_CLOSED on WO validation**
- `ValidationService.validate()` reads `sourceReport.reporter.id` from the eagerly-loaded `findById` result and emits `LINKED_WO_CLOSED` to the original requester when a WO was created from a problem report
- Works on both normal-path and `COULD_NOT_INTERVENE` paths — the requester is notified regardless of the technical outcome
- Summary message contains the WO reference number for traceability
- 4 new tests appended to `validation.service.spec.ts`: notify with reporter, not notify without source report, notify on CNI path too, summary contains reference number

**feat(work-orders): add DueDateApproachingJob for 24h technician alerts**
- New `DueDateApproachingJob` (`@Cron(EVERY_HOUR)`) queries WOs in any active status (`OPEN / ASSIGNED / IN_PROGRESS / ON_HOLD / PENDING_VALIDATION`) whose `dueDate` falls within the next 24 hours and have a `principalTechnicianId`
- Deduplication: checks the `notification` table for existing `DUE_DATE_APPROACHING` entries for the same WO within the last 23 hours — prevents re-notifying every hour for the same WO
- `DueDateApproachingJob` registered in `WorkOrdersModule` alongside the existing `PriorityEscalationJob` and `DailySummaryJob`
- 15 unit tests: cron decorator metadata, empty-case no-op, single WO notification, dedup skip, mixed new/already-notified, all three get notified, 23h dedup window boundary, workOrder query predicate (status filter, time window, principalTechnicianId not null)

**feat(work-orders): add ValidationReminderJob for stale pending validations**
- New `ValidationReminderJob` (`@Cron(EVERY_HOUR)`) queries work orders in `PENDING_VALIDATION` for at least 24 hours (`updatedAt <= now - 24h`)
- Deduplication: checks the `notification` table for existing `VALIDATION_REMINDER_24H` entries for the same WO within the last 23 hours — prevents hourly re-notification spam
- Uses existing `NotificationsService.notifySupervisors()` path to alert active supervisors with `entityType='WorkOrder'` and `entityId=<woId>`
- `ValidationReminderJob` registered in `WorkOrdersModule` with the other scheduled work-order jobs
- 8 unit tests: cron metadata, empty-case no-op, send path, dedup skip, mixed send/skip, 23h dedup query window, 24h stale threshold query, and error propagation on notification failure

**feat(web): implement notification deep-linking with entity routing**
- New pure-function module `apps/web/lib/notification-routing.ts`: `resolveNotificationRoute(notification, roles)` maps `entityType + user roles → URL string | null`; `WorkOrder` → `/supervisor/work-orders?id=X`; `ProblemReport` → `/supervisor/reports?id=X`; `PartRequest` → `/storekeeper/part-requests?id=X`; `Asset` + `ComplianceCertificate` → `/supervisor/assets?id=X`
- `notification-menu.tsx`: clicking a notification now calls `resolveNotificationRoute`, closes the dropdown, marks the notification read, and navigates via `useRouter`; notifications without a resolvable route still mark read only (backward-compatible)
- `work-order-detail-dialog.tsx`: prop type widened from `WorkOrderListItem | null` to `WorkOrderListItem | { id: string } | null` — accepts a minimal object for deep-link open; header fields guarded with `'referenceNumber' in workOrder` checks; internal `getById` query still fetches full details
- `work-orders-board.tsx`: reads `?id=` query param via `useSearchParams`; when present and auth is initialized, auto-opens the detail dialog with `{ id }` and replaces the URL to prevent re-open on refresh
- `supervisor/work-orders/page.tsx`: wraps `WorkOrdersBoard` in `<Suspense>` as required by Next.js for components using `useSearchParams`
- `apps/web/package.json`: Jest + ts-jest + `@types/jest` added as devDependencies with `jest` config block; `test` and `test:watch` scripts added
- 17 unit tests in `notification-routing.spec.ts`: null entityType/entityId, empty roles, WorkOrder/ProblemReport/PartRequest/Asset/ComplianceCertificate per role, multi-role, unknown entity type, entityId in query param

### Added — Real-time WebSocket notifications (April 18, 2026)

**feat(notifications): add Socket.io WebSocket gateway and real-time push**
- `NotificationsGateway` (`@WebSocketGateway`) validates JWT on connect and assigns each client to a personal `user:<id>` room
- `NotificationsService.notify()` calls `gateway.emitToUser()` after persisting the notification to DB, so every in-app notification is also pushed live without polling
- `IoAdapter` (from `@nestjs/platform-socket.io`) registered in `main.ts`
- Frontend `notification-menu.tsx` subscribes via `useSocket()` and refetches the notification list on each `notification` event
- Unit tests for gateway: JWT auth-on-connect, room join, `emitToUser`, missing/invalid token cases

### Added — Three-tier deferred report aging (April 18, 2026)

**feat(reports): implement three-tier deferred report aging with windowed queries**
- Replaced the single 7-day aging threshold with three tiers: 48h (warning), 7d (escalation), 14d (critical)
- `findReportsDeferredInWindow(minHours, maxHours)`: queries `deferredAt ∈ [now-maxHours, now-minHours)` — half-open window ensures each deferred report receives exactly one notification per tier, never repeated
- `DeferredReportReminderJob` iterates a TIERS constant array and dispatches tier-specific French notification titles/summaries to all supervisors
- `reports-board.tsx`: `getDeferredAgingTier()` renders a colored badge (Rappel 48h / Suivi 7j / Escalade 14j) below the DEFERRED status badge
- Test coverage: all three tiers, windowing logic, no-op for non-deferred reports, notification count accuracy

### Added — Compliance certificate soft-archive (April 18, 2026)

**feat(assets): soft-archive compliance certificates instead of hard delete**
- Schema: added `isArchived Boolean @default(false)`, `archivedAt DateTime?`, `archivedById String?` to `ComplianceCertificate`; named relations `CreatedCertificates` / `ArchivedCertificates`
- Migration: `20260418000000_soft_archive_compliance_certificate`
- All `findMany` queries filter `isArchived: false` (`findByAsset`, `findExpiringSoon`, `refreshStatuses`)
- `DELETE /assets/:id/certificates/:certId` now calls `archive(certId, actorId)` — preserves audit history
- 7 unit tests: archive happy path, double-archive guard (400), not-found (404), filtered queries

### Added — Duplicate active WO guard with supervisor override (April 18, 2026)

**feat(work-orders): duplicate active WO guard with supervisor override**
- `create()` checks for any existing WO in a non-terminal status (`ACTIVE_WO_STATUSES` constant) and throws `ConflictException` with `{ message, existingWorkOrder }` payload
- `forceCreate?: boolean` DTO field (IsBoolean, optional) allows supervisors to bypass the guard
- Frontend: 409 responses intercepted by `isDuplicateConflict()` type guard; amber warning panel displays the conflicting WO reference and a "Créer quand même" button that resubmits with `forceCreate: true`
- 12 unit tests: decommissioned asset, not found, ConflictException shape, all 6 active statuses via `it.each`, forceCreate bypass, happy path, terminal WO exclusion

### Added — Source report panel in WO detail (April 18, 2026)

**feat(work-orders): expose source report in WO detail view**
- `work-orders.repository.ts findById` now includes `sourceReport` (reference, description, urgencyPerception, reporter, createdAt)
- Supervisor WO detail dialog renders a muted source report card when `sourceReport` is non-null

### Added — Overdue row highlighting in supervisor board (April 18, 2026)

**feat(work-orders): highlight overdue rows in supervisor board**
- Rows with `dueDate < now` and non-terminal status receive a red background (`bg-red-50 dark:bg-red-950/20`)
- Due date cell renders an "En retard" label in destructive color

### Fixed — Admin audit-log endpoint rate limiting (April 17, 2026)

**fix(admin): add dedicated throttle on GET /admin/audit-log**
- Added endpoint-level throttling on `GET /admin/audit-log` with `@Throttle({ default: { limit: 10, ttl: 60000 } })`
- Keeps existing auth/role guards intact while reducing high-volume audit-log scraping risk via page iteration
- Added backend coverage:
 - `admin.controller.spec.ts` for pagination/filter normalization and failure propagation
 - `admin.controller.integration.spec.ts` for auth/role enforcement plus route-level 429 behavior after threshold

### Fixed — Backend TypeScript editor diagnostics cleanup (April 17, 2026)

**fix(backend): resolve persistent VS Code Problems without runtime behavior changes**
- Switched backend bootstrap cookie parser import to CommonJS call-compatible syntax in `apps/backend/src/main.ts`
- Added explicit `rootDir` to `apps/backend/tsconfig.json` to stabilize source/output layout diagnostics
- Removed deprecated `baseUrl` from `apps/backend/tsconfig.json`
- Removed deprecated shared defaults `moduleResolution` and `baseUrl` from `tsconfig.base.json`
- Verified no backend test regressions and confirmed `@gmao/db` build still succeeds

### Fixed — Auth session inactivity timeout enforcement (April 17, 2026)

**fix(auth): enforce SESSION_IDLE_TIMEOUT_HOURS for refresh token lifecycle**
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

**fix(assets): migrate certificate expiry job from setInterval to @nestjs/schedule**
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

**feat(admin): add admin analytics endpoints and dashboard**
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

**feat(work-orders): implement daily supervisor summary email**
- **Problem:** `SystemConfig` stored the `DAILY_SUMMARY_HOUR` key but nothing consumed it; no cron job or email existed to send the daily digest required by spec
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

**fix(web): align legacy auth redirect pages with Next 15 PageProps**
- Updated `app/auth/setup/page.tsx` and `app/auth/reset-password/page.tsx` to use the Next 15 `searchParams` Promise signature
- Both legacy redirect pages are now `async`, await `searchParams`, and preserve token forwarding to `/setup` and `/reset-password`
- Removes TypeScript build failures generated from `.next/types` (`TS2344` PageProps mismatch)

### Changed — Repository hygiene for local build caches (April 16, 2026)

**chore(repo): untrack remaining tsbuildinfo cache artifacts**
- Removed tracked `tsconfig.tsbuildinfo` files from git index so local incremental TypeScript caches no longer pollute `git status`
- `.gitignore` already contains `*.tsbuildinfo`; this change makes the ignore rule effective for all previously tracked cache artifacts

### Added — Simultaneous maintenance authorization (April 16, 2026)

**feat(work-orders): add authorize-simultaneous endpoint and supervisor UI**
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

**fix(work-orders): enforce assetStatusOverride when technician could not intervene**
- `ValidationService.validate()` previously set the asset to `OPERATIONAL` unconditionally, even when the technician submitted `result: COULD_NOT_INTERVENE` — marking an unrepaired asset as back in service
- The service now reads the most recent **completed** intervention log (i.e. with `endedAt IS NOT NULL` and `result IS NOT NULL`) before deciding the post-validation asset status:
 - **Normal results** (RESOLVED, PARTIALLY_RESOLVED, NEEDS_FOLLOW_UP, or no log): asset → `OPERATIONAL` as before
 - **COULD_NOT_INTERVENE**: `assetStatusOverride` is **mandatory**; missing it raises `400 BadRequestException` with an explicit message; the chosen status is applied and logged
- A `FOLLOW_UP_PROMPT` in-app notification is dispatched to all active supervisors on the CNI path
- The WO status log label records `"COULD_NOT_INTERVENE acknowledged — asset set to <status>"` for full auditability
- New DTO `ValidateWorkOrderDto` with `assetStatusOverride?: AssetStatus` wired into `PATCH /work-orders/:id/validate`
- Frontend validate panel detects CNI from `detail.interventionLogs`: shows a **red warning banner** and a mandatory asset-status select (OUT_OF_SERVICE / IN_MAINTENANCE / OPERATIONAL — risk accepted); Confirm button is disabled until a choice is made
- 7 new French i18n keys added for the warning banner, status-select label, placeholder and per-option labels

### Fixed — Inventory part creation conflict handling (April 16, 2026)

**fix(inventory): return 409 on duplicate part reference codes**
- `POST /parts` now maps both the repository precheck and Prisma unique-constraint failures to `409 Conflict`
- Duplicate `referenceCode` values no longer surface as opaque 500 errors during concurrent or repeated creates
- Added backend unit coverage for the repository conflict paths and an HTTP integration test for the controller response

### Fixed — Stability and seed reliability hardening (April 16, 2026)

**fix(web): gate supervisor dashboard queries on auth initialization**
- Added `enabled: isInitialized` on all supervisor dashboard summary queries
- Prevents early unauthenticated requests, refresh-token race conditions, and dashboard bootstrap failures after full page reloads

**fix(i18n): restore French accents in supervisor dashboard copy**
- Restored missing accent marks in `supervisorDashboard` French translations (subtitle, error state, and card labels)

**fix(backend): cast advisory lock arguments for PostgreSQL overload resolution**
- Explicitly cast advisory lock parameters to `int` in reference-number generation queries
- Prevents `pg_advisory_xact_lock(bigint, bigint)` resolution errors that could fail WO/PR creation under runtime bindings

**fix(db): make seed execution robust with generated Prisma client mapping**
- Updated `packages/db/tsconfig.seed.json` with `baseUrl` and `paths` so `@prisma/client` resolves to `packages/db/src/generated/client` during seed compilation
- Seed data now includes a broader baseline fixture set (users, assets, plans, reports, work orders, inventory movements, notifications) while remaining idempotent

**chore(repo): stop tracking TypeScript incremental cache artifacts**
- Added `*.tsbuildinfo` to `.gitignore`
- Removed tracked `apps/web/tsconfig.tsbuildinfo` from version control

### Added — Automatic PDF report generation for closed work orders (April 16, 2026)

**feat(work-orders): generate and store PDF reports on validation**
- Added `WorkOrder.reportPdfKey` to persist the generated PDF storage key
- Introduced a dedicated PDF generation service, BullMQ queue, and processor for closed work orders
- Validation now enqueues PDF generation asynchronously after a successful closure
- PDFs are uploaded to MinIO and stored under the `reports/` prefix

### Fixed — Supervisor work-order loading and equipment selection (April 16, 2026)

**fix(web-supervisor): wait for auth init before loading work orders**
- Supervisor work-order list now waits for auth initialization before firing its query
- Create work-order equipment selection now uses a backend-valid asset query limit and waits for auth initialization
- Prevents premature request failures and empty equipment dropdowns during app startup

### Added — Automatic work order priority escalation (April 16, 2026)

**feat(work-orders): add automatic priority escalation job scheduler**
- New hourly Cron job (`PriorityEscalationJob`) evaluates and escalates overdue work orders
- Escalation follows strict priority chain: LOW → MEDIUM → HIGH → CRITICAL
- Escalation is scoped to OPEN and ASSIGNED statuses only — IN_PROGRESS, ON_HOLD, and PENDING_VALIDATION are excluded
- CRITICAL WOs are not escalated further; overdue CRITICAL WOs trigger a separate `WO_OVERDUE` supervisor notification
- Full audit trail preserved via `WorkOrderPriorityLog` with `isAutoEscalation=true` flag
- Supervisor notifications sent via `NotificationType.WO_AUTO_ESCALATED` for every escalated work order
- System escalations logged explicitly as "automatic system escalation" per spec

### Fixed — Reference number integrity under concurrency (April 13, 2026)

**fix(backend): eliminate WO/PR reference race conditions with tx-level locks**
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

**feat(web-supervisor): asset certificate full CRUD in asset-detail-dialog**
- Asset certificates were displayed read-only despite the backend fully supporting create/update/delete
- Added **Add certificate** button (header of Certificates section) opening a new `CertificateFormDialog`
- Each certificate row now has inline **Edit** (pencil) and **Delete** (trash) icon buttons
- `CertificateFormDialog` handles both create and edit: `certificateType` select (with conditional `otherType` field), issuing authority, issue/expiration dates, optional file attachment (PDF/JPG/PNG)
- Form uses `react-hook-form` + Zod validation; `OTHER` type enforces `otherType` non-empty via `.refine()`
- File upload sends multipart/form-data via `FormData`; axios omits Content-Type so the browser sets the boundary automatically
- All certificate action buttons hidden when asset is DECOMMISSIONED

**feat(web-supervisor): asset document upload + delete in asset-detail-dialog**
- Asset documents were displayed read-only despite backend supporting upload and delete
- Added **Upload** button (header of Documents section) opening a new `DocumentUploadDialog`
- Each document row now has a **Delete** icon button with a loading spinner while in-flight
- `DocumentUploadDialog`: `documentType` select (all 8 types), mandatory file picker with clear button
- Document type label is now translated in the document row (was previously showing the raw enum value)
- Upload and delete buttons hidden when asset is DECOMMISSIONED

**feat(web-storekeeper): part-return dialog wired into inventory catalog**
- `POST /stock/returns` existed in the backend and in the API client but had zero UI entry point
- Added **Return** (↩) icon button per catalog row, opening a new `StockReturnDialog`
- Dialog shows current stock + projected stock after return, quantity field (min 1), and a searchable dropdown of cancelled work orders (fetched via `workOrdersApi.list({ status: CANCELLED })`)
- Live text filter narrows the WO list by reference number or asset name
- On success, invalidates `storekeeper.inventory` and `storekeeper.low-stock` query caches

**fix(web): add missing API client methods to assetsApi**
- `assetsApi` lacked five methods that the backend fully supports:
 `createCertificate`, `updateCertificate`, `deleteCertificate`, `uploadDocument`, `deleteDocument`
- All multipart methods build `FormData` internally; callers pass plain objects + optional `File`

**feat(web-i18n): add all French translations for new dialogs**
- New keys: `supervisorAssets.certificate.*` (form, validation, toasts)
- New keys: `supervisorAssets.document.*` (form, validation, toasts)
- New keys: `supervisorAssets.documentType.*` (all 8 DocumentType enum values)
- New key: `storekeeperInventory.actions.returnStock`
- New section: `storekeeperInventory.return.*` (dialog, form, validation, toasts)

### Added + Fixed — Admin audit & i18n hardening (April 9, 2026)

**feat(backend): add actionType filter to GET /admin/audit-log**
- Endpoint previously accepted only `targetType` as a query filter
- Added `@Query('actionType')` parameter; both filters are spread into the Prisma `where` clause and are independently optional
- Swagger `@ApiQuery` decorator added for `actionType`
- Admins can now query e.g. `?actionType=USER_DEACTIVATED` to isolate specific audit events

**feat(web-admin): add actionType filter dropdown to AuditLogTable**
- Second filter select added alongside the existing "target type" dropdown
- Dropdown lists all 15 known action types with human-readable French labels sourced from i18n (`admin.auditLog.actionTypes.*`)
- Selecting either filter resets pagination to page 1 to avoid stale offsets
- `adminApi.getAuditLog` updated to forward the new `actionType` param

**fix(web-admin): convert AuditLogTable to full i18n**
- All hardcoded French strings removed: column headers, "Avant"/"Après" diff labels, empty state, total count, filter placeholders
- `AuditChangeDetail` now receives labels as props so the component has no hardcoded locale
- New i18n keys added: `admin.auditLog.columns.*`, `admin.auditLog.filters.*`, `admin.auditLog.detail.*`, `admin.auditLog.states.*`, `admin.auditLog.actionTypes.*`, `admin.auditLog.total`

**fix(web-admin): convert UsersTable and UserFormDialog to full i18n**
- Both components previously bypassed the i18n system entirely despite `categories-table` and `locations-table` using `useTranslation` throughout
- All hardcoded strings replaced: role labels (driven by `t('admin.users.roles.ROLE')`), column headers, filter selects, status badges, toast messages, confirm-dialog text, form field labels/placeholders/errors
- New i18n keys added: `admin.users.filters.*`, `admin.users.columns.*`, `admin.users.status.*`, `admin.users.roles.*`, `admin.users.states.*`, `admin.users.actions.*`, `admin.users.toasts.*`, `admin.users.deactivateDialog.*`, `admin.users.form.*`

### Fixed — Admin UI audit & hardening (April 9, 2026)

**fix(web-admin): replace window.confirm with ConfirmDialog in LocationsTable**
- Removed `window.confirm` (blocking, inconsistent with app UI)
- Introduced reusable `components/ui/confirm-dialog.tsx` built on the existing `Dialog` primitive
- Supports: title, description, destructive/default variant, loading state (blocks close while pending), cancel/confirm labels
- LocationsTable now uses `ConfirmDialog` for delete — shows location name and context in the modal

**fix(web-admin): add deactivate confirmation dialog in UsersTable**
- Deactivating a user now opens a `ConfirmDialog` warning that all active sessions will be revoked
- Previously the mutation fired immediately on button click with no confirmation
- Dialog shows the user's full name and blocks closure while the mutation is in-flight

**fix(web-admin): repair AuditLog targetType filter**
- Filter dropdown was built via `useMemo` from the **current page's data only** — if page 1 had only `SystemConfig` entries, `User` and `Asset` were invisible options
- Replaced with a hardcoded `KNOWN_TARGET_TYPES` constant derived from the actual backend services that write to the audit log (`UsersService`, `SystemConfigService`, `AssetsService`)
- Removed unused `useMemo` import

**fix(backend+web): clear hourlyRate when TECHNICIAN role is removed**
- Editing a Technician user, unchecking the TECHNICIAN role, and saving silently preserved `hourlyRate` in the database
- `UserFormDialog.onSubmit` now derives `effectiveHourlyRate: null` when TECHNICIAN is not in the selected roles
- `UpdateUserDto` updated with `@ValidateIf((_, value) => value !== null)` so `null` is accepted and treated as a clear operation
- `UpdateUserPayload` shared type already typed `number | null` — backend DTO now matches

### Added — Admin master data UI: locations and categories (April 8, 2026)

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
- `pnpm --filter web lint`
- `pnpm --filter web type-check`

### Added — Web authentication: account setup and password recovery (April 8, 2026)

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
- Password confirmation validation (client-side)
- Invalid/expired token error handling with clear UX
- Suspense boundaries for dynamic `useSearchParams()` (Next.js 15 compatibility)
- Loading states and success feedback with auto-redirect
- Backend password policy validation integration
- Full French i18n support (no hardcoded text)
- Production build verified (zero errors)

**Testing:**
- Setup flow: Admin invites user → user sets password → account active
- Reset flow: User requests reset → clicks email link → sets new password
- Forgot flow: User clicks "Oublié ?" → enters email → receives reset email
- Edge cases: Invalid tokens, password mismatch, missing params

## Previous Releases

### [Completed Backend — March 2025]

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
- Smoke test covers auth, work orders, preventive plans, reports
- Swagger API docs available
- PostgreSQL + Redis + MinIO + MailHog infrastructure verified

### [Completed Web Frontend — March 2025]

**Modules shipped:**
- Admin: users management, system config, audit log, analytics dashboard
- Storekeeper: inventory catalog, stock operations, part requests, analytics
- Supervisor: reports, work orders, preventive plans, assets, dashboard
- Notifications: top bar with unread badge, live push, deep-linking
