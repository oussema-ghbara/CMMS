# GMAO

Computerized Maintenance Management System — PFE project.

Turborepo monorepo. TypeScript throughout. NestJS backend, Next.js web, Expo mobile (not started).

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

# terminal 1 (backend)
PORT=3000 APP_URL=http://localhost:3001 pnpm --filter @gmao/backend dev

# terminal 2 (web)
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 pnpm --filter @gmao/web dev
```

Swagger is available at http://localhost:3000/api/docs when backend runs on port 3000.

## Resuming work
```bash
docker compose up -d

# terminal 1
PORT=3000 APP_URL=http://localhost:3001 pnpm --filter @gmao/backend dev

# terminal 2
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 pnpm --filter @gmao/web dev
```

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
| Backend API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/docs |
| Frontend | http://localhost:3001 |

## Database
```bash
# After schema changes — never edit applied migrations
cd packages/db
pnpm db:migrate      # create and apply new migration
pnpm db:generate     # regenerate Prisma client after schema change
npx prisma db seed   # seed dev accounts and system config (idempotent)
npx prisma studio    # visual DB browser
```

## Authentication flows

### Login
- Email + password authentication via `/auth/login`
- JWT token refresh supported via `/auth/refresh` with secure refresh token cookie
- Logout clears all sessions via `/auth/logout`

### Account setup (new users)
- Admin invites new users — backend sends setup email
- User clicks setup link → set password on `/auth/setup?token=...`
- Account activation and password validation via `/auth/setup`
- Setup tokens expire after 24 hours

### Password recovery
- User forgot password → click "Oublié ?" on login form
- Password reset request via `/auth/forgot-password` (fire-and-forget)
- User clicks reset link in email → set new password on `/auth/reset-password?token=...`
- Reset tokens expire after 24 hours
- Both endpoints support password policy validation

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
| NotificationsModule | done — in-app notifications, unread count, mark-read endpoints |
| WorkOrdersModule | done — state machine, assignments, intervention, on-hold, validation, checklist |
| InventoryModule | done — parts catalog, stock movements, part requests, analytics |
| PreventivePlansModule | done — plan CRUD, checklist templates, BullMQ WO generator, daily scheduler |
| ReportsModule | done — problem report lifecycle, comments, conversion, defer/reopen, reject, archive |
| AdminModule | done — system config endpoints and paginated audit log |

## Storekeeper module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!` (has STOREKEEPER role)
- Validate page:
  - `http://localhost:3001/storekeeper`
  - `http://localhost:3001/storekeeper/part-requests`
  - `http://localhost:3001/storekeeper/analytics`

Expected behavior:

- Inventory catalog loads with search, status filter, pagination, create/edit dialogs, and activate/deactivate actions
- Low-stock rows show a visible warning badge when stock is below the minimum threshold
- Low-stock banner appears when at least one part is below threshold and can be dismissed
- "Receptionner" action records incoming deliveries (optional supplier reference, date, and unit cost update)
- "Ajuster" action supports positive/negative stock corrections with reason and validation (including OTHER detail requirement)
- Adjustment form blocks submissions that would produce negative resulting stock
- "Historique" action opens a movement timeline with movement type, signed quantity, resulting balance, actor, and timestamp
- Queue table loads when requests exist
- Empty state appears when queue is empty
- Status filter works
- Fulfill action updates request status and quantity fulfilled
- Reject action stores rejection reason/detail
- Analytics page loads KPI cards (request volume, fulfilment rate, average processing time, dead-stock count)
- Analytics filters apply and reset correctly for period and dead-stock windows
- Analytics sections render correctly (top consumption by quantity/cost, request breakdown, replenishment signals, dead stock)
- Analytics page shows explicit loading/error/empty states

## Supervisor reports module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!` (has SUPERVISOR role)
- Validate page:
  - `http://localhost:3001/supervisor/reports`

Expected behavior:

- Reports list loads with search, status filter, urgency filter, and pagination
- Detail dialog opens for each report with summary, comments, and linked work orders
- Comment posting works and acknowledged comments are visibly marked
- Supervisor actions are available according to report status:
  - PENDING: convert, reject, defer, archive
  - DEFERRED: reopen, archive
- Action results update both detail and list states without page reload
- Empty and error states render correctly when applicable

## Supervisor work orders module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!` (has SUPERVISOR role)
- Validate page:
  - `http://localhost:3001/supervisor/work-orders`

Expected behavior:

- Work orders list loads with search, status/type/priority filters, and pagination
- **"Nouvel ordre de travail"** button opens a create dialog — fill asset, type, priority, description and submit to create a DRAFT work order
- Row click or the eye icon opens the detail dialog showing: general info, assignments, checklist, validation history, status history
- Contextual actions appear in the detail dialog based on current status:
  - `DRAFT` → **Publier** — moves to OPEN
  - `OPEN` → **Assigner un technicien** — select principal + optional contributors, moves to ASSIGNED
  - `PENDING_VALIDATION` → **Valider la clôture** (moves to CLOSED) or **Rejeter la clôture** (select reason, moves back to IN_PROGRESS)
  - Any non-terminal → **Annuler l'ordre de travail** — select cancellation reason, permanently cancels
- Priority can still be updated inline from the pencil icon in the row for non-terminal work orders
- All actions refresh the list without a page reload
- Terminal work orders (`CLOSED`, `CANCELLED`) show no action buttons in the detail dialog
- Empty and error states render correctly when applicable

## Supervisor preventive plans module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!` (has SUPERVISOR role)
- Validate page:
  - `http://localhost:3001/supervisor/preventive-plans`

Expected behavior:

- Preventive plans list loads with asset search, asset filter, status filter, and pagination
- Plan creation works with asset selection, frequency configuration, and optional default technician
- Plan edit works for existing plans without changing the target asset
- Plan detail dialog shows asset, frequency, next generation date, duration, status, and checklist summary
- Activate/deactivate actions update plan status without a page reload
- Trigger-now action is available for active plans and shows success feedback
- Checklist item add/edit/delete actions persist and refresh the detail view
- Checklist reorder works with drag-and-drop and arrow controls
- Empty and error states render correctly when applicable

## Supervisor assets module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!` (has SUPERVISOR role)
- Validate page:
  - `http://localhost:3001/supervisor/assets`

Expected behavior:

- Assets list loads with search, status/criticality/category filters, and pagination
- Asset create/edit dialog supports all main fields (identity, technical details, hierarchy)
- Asset detail dialog shows technical data, certificates, children, and status history
- Status transition actions work according to current status (operational/out-of-service/decommission)
- Empty and error states render correctly when applicable

## Notifications and top bar testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `supervisor@gmao.local` / `Admin1234!`
- Validate the protected layout on any supervisor page, for example:
  - `http://localhost:3001/supervisor`
  - `http://localhost:3001/supervisor/reports`

Expected behavior:

- The top bar shows a balanced left title area and a right-side notification trigger
- The unread badge hides at zero, shows a single value correctly, and collapses large counts to `99+`
- Opening the bell dropdown fetches the current notification list for the signed-in user
- Clicking one notification marks it read and updates the unread count immediately
- Clicking "Tout marquer comme lu" clears the unread badge and marks remaining unread items as read
- Refreshing the page preserves the badge state from the backend
- Empty state renders when the user has no notifications

API checks:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/notifications
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/notifications/count/unread
curl -X PATCH -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/notifications/<id>/read
curl -X PATCH -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/notifications/mark-all-read
```

## Admin module testing

After backend and web are both running:

- Open http://localhost:3001/login
- Login with `admin@gmao.local` / `Admin1234!`
- Validate pages:
  - `http://localhost:3001/admin`
  - `http://localhost:3001/admin/locations`
  - `http://localhost:3001/admin/categories`
  - `http://localhost:3001/admin/system-config`
  - `http://localhost:3001/admin/audit-log`

Expected behavior:

- Users page supports list filters, create, edit, deactivate/reactivate, and resend setup email for never-logged-in inactive users
- Locations page supports create/update/delete of locations with hierarchy (parent selection), and deletion is blocked when a location has children or assigned assets
- Categories page supports create/update and activate/deactivate actions with status filter
- System config updates persist and produce visible success/error feedback
- Audit log supports pagination and target-type filtering

API checks (replace token with a real bearer token):

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/admin/system-config
curl -X PATCH -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"value":"10"}' http://localhost:3000/api/v1/admin/system-config/PASSWORD_MIN_LENGTH
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/v1/admin/audit-log?page=1&limit=25"
```

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

## Smoke tests

Run the backend smoke test after starting the API and seeding the database:

```bash
pnpm smoke:backend
```

This covers auth, work orders, preventive plans, and the report module lifecycle.
