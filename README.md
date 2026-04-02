# GMAO — Système de Gestion de la Maintenance Assistée par Ordinateur

## Prerequisites
- Node.js v22+
- pnpm v10+ (`npm install -g pnpm`)
- Docker + Docker Compose

## First-time setup
```bash
# 1. Clone
git clone https://github.com/oussema-ghbara/gmao.git
cd gmao

# 2. Environment
cp .env.example .env
# Edit .env with your values

# 3. Start infrastructure
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Generate Prisma client
cd packages/db && pnpm db:generate && cd ../..

# 6. Seed database
cd packages/db && npx prisma db seed && cd ../..

# 7. Start backend
pnpm --filter @gmao/backend dev
```

## Dev accounts (after seed)
| Email | Password | Roles |
|---|---|---|
| admin@gmao.local | Admin1234! | ADMIN |
| supervisor@gmao.local | Admin1234! | SUPERVISOR, STOREKEEPER |
| tech@gmao.local | Admin1234! | TECHNICIAN |

## API
- Base URL: `http://localhost:3001/api/v1`
- Swagger docs: `http://localhost:3001/api/docs`
- MailHog UI: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

## Stack
- Backend: NestJS + TypeScript
- Web: Next.js (not started)
- Mobile: Expo React Native (not started)
- Database: PostgreSQL via Prisma ORM
- Cache/Queue: Redis + BullMQ
- File storage: MinIO
- Dev email: MailHog
