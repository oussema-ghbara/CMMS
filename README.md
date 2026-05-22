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
| Web | Next.js |
| Database | PostgreSQL via Prisma ORM |
| Cache / Queue | Redis |
| File storage | MinIO |
| Dev email | MailHog + Nodemailer |

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
| MailHog | http://localhost:8025 |
| Backend API | http://localhost:3000/api/v1 |
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

