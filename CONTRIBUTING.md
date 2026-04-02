# Contributing

## Setup

Follow the first-time setup in README.md exactly. The project will not start without all infrastructure containers running.

## Before writing code

1. Pull latest master.
2. Create a branch: `git checkout -b feat/your-feature`.
3. Check CONTEXT.md for current module status and architecture rules.
4. Read the relevant section of the functional spec before implementing anything.

## Code rules

- TypeScript strict mode. No `any` without a comment.
- All shared domain types (enums, DTOs) go in `packages/shared`. Never duplicate across apps.
- No hardcoded strings — i18n keys only (when web/mobile are started).
- No business logic in controllers. Controllers validate input and delegate.
- No synchronous email sends. Always `mailService.enqueue()`.
- No inline SQL. Everything goes through Prisma.
- Every failure path must be explicit. No silent catch blocks.

## Adding a backend module

1. Create `apps/backend/src/<module>/` with: `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `<module>.repository.ts`.
2. Add DTOs in `<module>/dto/`.
3. Register the module in `app.module.ts`.
4. Export services that other modules need.

## Database changes

Never edit an applied migration.
```bash
cd packages/db
# Edit prisma/schema.prisma
pnpm db:migrate   # generates and applies a new migration
pnpm db:generate  # regenerates the Prisma client
```

## Commits

Follow Conventional Commits. One logical change per commit. Do not bundle unrelated changes.
```
feat(backend): add intervention log endpoint
fix(backend): correct certificate expiry status derivation
chore(infra): add healthcheck to redis service
```

## Pull requests

- One concern per PR.
- All checks must pass before merging.
- Describe what changed and why, not how (the code shows how).
