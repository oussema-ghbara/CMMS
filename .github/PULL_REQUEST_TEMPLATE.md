## What this changes

<!-- One paragraph. What does this PR do and why. Reference the spec section if applicable (e.g. §4.3). -->

## Type of change

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — no behavior change
- [ ] chore — tooling, deps, config
- [ ] docs

## Checklist

**Backend**
- [ ] TypeScript compiles (`pnpm --filter @gmao/backend build`)
- [ ] No `any` without an explanatory comment
- [ ] No business logic in controllers — controllers validate input and delegate
- [ ] New Prisma changes have a new migration (no edits to applied migrations)
- [ ] New env variables added to `.env.example`
- [ ] Unit tests added or updated (`pnpm --filter @gmao/backend test`)

**Web**
- [ ] No hardcoded strings — all labels use i18n keys in `fr/common.json`
- [ ] `useSearchParams` usages are wrapped in `<Suspense>`
- [ ] Unit tests added or updated (`pnpm --filter @gmao/web test`)

**General**
- [ ] Tested manually against the running dev environment
- [ ] CONTEXT.md updated if a module's feature scope changed
