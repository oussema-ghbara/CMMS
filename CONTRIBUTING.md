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

## Adding features to the web app

1. Create a new page under `apps/web/app/(protected)/` or `apps/web/app/(auth)/` as appropriate
2. Use existing components from `apps/web/components/ui/` (shadcn/ui)
3. Create API wrappers in `apps/web/lib/` following existing patterns (e.g., `users.api.ts`)
4. Use i18n keys from `apps/web/public/locales/fr/common.json` — no hardcoded strings
5. For dynamic query parameters (useSearchParams), wrap in Suspense boundary to avoid hydration errors
6. Follow existing state management patterns (Zustand for auth, React Query for data)

## Authentication flows (web)

### Login page
- Path: `/auth/login`
- Component: `components/auth/login-form.tsx`
- Features: Email + password, "Oublié ?" link to password recovery
- API: `api.post('/auth/login')` via `lib/api.ts`

### Password recovery (forgot password)
- Path: `/auth/forgot-password`
- Component: `app/(auth)/forgot-password/forgot-content.tsx` (wrapped with Suspense)
- Features: Email input, success confirmation
- API: `authApi.forgotPassword(email)` via `lib/auth.api.ts`

### Public setup resend
- Path: `/resend-setup`
- Component: `app/(auth)/resend-setup/resend-setup-content.tsx` (wrapped with Suspense)
- Features: Email input, success confirmation, redirects back to login
- API: `authApi.resendSetup(email)` via `lib/auth.api.ts`

### Password reset
- Path: `/auth/reset-password?token=...`
- Component: `app/(auth)/reset-password/reset-content.tsx` (wrapped with Suspense)
- Features: New password + confirmation, token validation, error handling
- API: `authApi.resetPassword(token, password)` via `lib/auth.api.ts`

### Account setup (new user onboarding)
- Path: `/auth/setup?token=...`
- Component: `app/(auth)/setup/setup-content.tsx` (wrapped with Suspense)
- Features: Set initial password + confirmation, token validation, account activation
- API: `authApi.setup(token, password)` via `lib/auth.api.ts`

All auth pages:
- Handle loading states (Suspense fallback)
- Display validation errors (password mismatch, invalid token)
- Show success feedback with auto-redirect to login
- Support French i18n via `useTranslation()`
