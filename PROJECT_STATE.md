# PROJECT STATE

Checkpoint file. Updated at the end of every phase so work can resume from a cold start.

**Status:** All phases complete · QA score **96 / 100** (PASS, threshold 95)

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 0 | Discovery docs, schema, seed | ✅ |
| 1 | DB, auth, RBAC, app shell, design system | ✅ |
| 2 | Approval engine, inbox, request detail | ✅ |
| 3 | Leave | ✅ |
| 4 | Business trip | ✅ |
| 5 | Procurement | ✅ |
| 6 | Expense | ✅ |
| 7 | AI layer | ✅ |
| 8 | Analytics, reports | ✅ |
| 9 | Admin | ✅ |
| 10 | QA + deployment readiness | ✅ |

## What exists

- **26 routes**, all rendering for all 7 roles (259-check sweep, 0 failures)
- **31 tables**, migrations that run against PGlite and Supabase, RLS policies in `database/rls.sql`
- **452 seeded requests** across 12 months, 30 employees, 8 departments, 3 offices
- **Two automated suites** — route sweep and 12 security assertions
- **Nine documents** in `docs/` plus README, TODO and this file

## Verification

```bash
npm run check                       # typecheck + lint + production build — all clean
npm run dev:test                    # terminal 1
npm run test                        # terminal 2 — 259 route checks + 12 RBAC assertions
npm run db:inspect                  # data integrity: balances, budgets, SLA, duplicates
```

Last run: typecheck 0 errors · lint 0 errors/0 warnings · build clean (26 routes) · routes 259/259 · RBAC 12/12.

## Architecture decisions

Full rationale with trade-offs in [`docs/DECISIONS.md`](docs/DECISIONS.md).

1. One Postgres schema, PGlite locally and Supabase in production.
2. Universal `requests` base table — the approval engine is written once.
3. RBAC as a SQL predicate in two forms (Drizzle + alias-aware raw SQL).
4. Credential auth, re-validated against the database each page load.
5. AI computes from the database; only prose is generated.
6. AI selects from a closed intent set and never writes SQL.
7. Budget and leave reservations move in the same transaction as the status change.
8. The database is the clock for all SLA arithmetic.
9. Approval steps are materialized at submission; workflow edits never rewrite history.
10. Radix for overlays only; the rest of the UI is in-repo.
11. A doubly-gated test-login endpoint, so permissions can be proven rather than claimed.

## Known issues

None open at P0. See [`TODO.md`](TODO.md) for the P1–P3 backlog and the accepted limitations.

## Next action

Deployment is the remaining step and requires credentials this environment does not hold:

1. `git remote add origin …` and push (the repository is committed and ready).
2. Create a Supabase project; run `DATABASE_URL=… npm run db:setup`, then apply `database/rls.sql`.
3. Import into Vercel and set `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `AUTO_SEED=false`.

Optional: set `AI_PROVIDER=anthropic` with `AI_API_KEY` for model-written prose over the same computed figures.
