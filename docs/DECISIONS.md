# Architecture Decisions

Each entry states the decision, the reason, what it costs, and what was rejected.

---

## 1. One PostgreSQL schema, two runtimes (PGlite locally, Supabase in production)

**Decision.** `src/lib/db/schema.ts` is a single Drizzle `pg-core` schema. Locally it runs against PGlite — real PostgreSQL compiled to WebAssembly, persisted to `./.pgdata`. In production the same schema points at Supabase via `DATABASE_URL`.

**Why.** The brief asked for Supabase PostgreSQL *and* for a prototype that runs immediately. A SQLite fallback would have meant two dialects, two migration sets, and behaviour that differs exactly where it matters (window functions, `jsonb`, `filter (where …)`, `date_trunc`) — all of which the analytics layer uses heavily. PGlite gives identical SQL semantics with no install.

**Cost.** PGlite is single-writer: a second process cannot open the same data directory, so `npm run db:reset` requires stopping the dev server. Acceptable for a demo; irrelevant once `DATABASE_URL` points at a server.

**Rejected.** SQLite with a compatibility layer (two dialects to maintain, analytics queries would have had to be rewritten). Requiring Docker (defeats zero-setup).

---

## 2. A universal `requests` base table

**Decision.** Every approvable object owns a row in `requests` plus a row in its own detail table.

**Why.** The approval engine, inbox, SLA clock, timeline, comments, attachments, audit log, notifications and analytics are written **once**. Adding a seventh request type is a detail table and a form.

**Cost.** Every detail read is a join, and `requests.amount_base` duplicates the detail total. Accepted: the join is on an indexed primary key, and the denormalized amount is what makes the inbox and every analytics query a single-table scan rather than a six-way union.

**Rejected.** A table per type with its own approval columns — six copies of the approval logic and six versions of every report.

---

## 3. RBAC as a SQL predicate, not a view filter

**Decision.** `requestVisibility(session)` returns a predicate that is `AND`-ed into every request query. Unauthorized rows are never fetched.

**Why.** A filter applied after fetching is one forgotten `.filter()` away from a leak, and it still pulls the data into memory. Pushing it into the query makes the safe path the default path.

**Cost.** The predicate must exist in two forms — Drizzle expressions for the query builder, and alias-aware raw SQL (`visibilitySql`) for the hand-written analytics aggregates. They must be kept in agreement; both are in `src/lib/rbac.ts`, adjacent, with a comment saying so.

**This cost was not theoretical.** The first version had only the Drizzle form. Embedded in a raw statement that aliased the table as `r`, it emitted `"requests"."requester_id"`, which Postgres could not resolve — every analytics page 500'd for every role except those with unrestricted visibility. The route smoke test caught it: 40 failures across four roles. `visibilitySql` exists because of that bug.

---

## 4. Custom credential auth rather than Supabase Auth

**Decision.** scrypt password hashing, HS256 JWT in an httpOnly cookie, validated against the database on every page load.

**Why.** The prototype had to run with no external service. Supabase Auth would have made "npm install && npm run dev" depend on a network account.

**Cost.** No password reset, MFA or social login. `database/rls.sql` carries the equivalent policies for a Supabase Auth deployment, so the migration path is a swap of the session layer, not a rewrite.

**Refinement made during QA.** The first version trusted the signed cookie. A signature proves we issued the token; it does not prove the account still exists or still holds the same roles. `requireLiveSession()` now re-reads the user and roles from the database on every page load, so a revoked role applies on the next navigation and a deleted account is signed out immediately.

---

## 5. AI computes from the database; only the prose is generated

**Decision.** `MockAIProvider` is the default and computes every figure it states — policy thresholds, budget position, historical trip averages, prior unit prices, receipt-hash matches, leave balances, team collisions. `AnthropicProvider` reuses those computations and replaces only the sentences.

**Why.** An approver acts on these numbers. A number that a model produced by pattern-matching is not auditable and cannot be reconciled against the ledger. Compliance arithmetic must be arithmetic.

**Consequence.** The demo works with no API key and no network, and turning on a real model changes the writing quality, not the correctness of the findings. It also means "AI unavailable" degrades prose, never analysis.

---

## 6. The AI selects an intent; it never writes SQL

**Decision.** Natural-language questions are classified into one of eleven fixed intents with parameters from closed enums, validated by Zod, and executed by hand-written parameterized queries carrying the asker's visibility predicate.

**Why.** Model-generated SQL against a live business database is an injection surface and an exfiltration surface at once. With a closed intent set, the worst outcome of a successful prompt injection is a wrong *sentence* — it cannot read another department's rows, write anything, or approve a request.

**Cost.** The assistant can only answer what an intent covers. It says so explicitly rather than guessing, which is the correct failure mode for a system reporting financial figures.

---

## 7. Reservations move in the same transaction as the status change

**Decision.** Submitting moves value into `budgets.committed` and `leave_balances.pending`; approving moves it to `spent` / `used`; rejecting, returning or withdrawing releases it. All inside the transaction that changes the status.

**Why.** A nightly recalculation job would let the Budgets page and the approvals disagree between runs — the exact class of error that destroys trust in a finance system.

**Cost.** Every status transition touches more rows. Negligible at this scale, and it makes the aggregates a derivable consequence of the approvals rather than a parallel record.

---

## 8. The database is the clock

**Decision.** SLA remaining time and overdue flags are computed in SQL (`extract(epoch from (due_at - now()))`), not from `Date.now()` during render.

**Why.** Two reasons, one found by the linter and one worse. The lint rule flags impure calls during render; the real problem is that a value computed at render time differs between the server render and any client re-render, and between one component and another on the same page. A row could show "2h left" in the table and "1h left" in the panel beside it.

**Cost.** A little more SQL per query. In exchange, every time figure on a page comes from one clock and they cannot disagree.

---

## 9. Materialize approval steps at submission

**Decision.** Workflow steps are templates. Submitting evaluates their conditions and writes concrete, person-bound steps into `approval_steps`.

**Why.** An administrator editing a workflow must not rewrite the approval history of requests already in flight. Materialization makes the route a fact recorded at submission time.

**Corollary.** Three rules are applied while materializing: a step routed to the requester is dropped (self-approval is structurally impossible, not merely discouraged); consecutive steps resolving to the same person collapse; and if everything collapses, a single Director step is retained so nothing reaches `APPROVED` without a human decision.

---

## 10. Radix for overlays; everything else built in-repo

**Decision.** Four Radix primitives (dialog, dropdown, tooltip, popover). Everything else — buttons, inputs, tables, badges, charts wrappers — is written here.

**Why.** Focus trapping, escape handling, ARIA wiring and return-focus are genuinely hard to get right and easy to get subtly wrong. The rest is styling, where a dependency costs more than it saves.

**Rejected.** A full component library (opinionated styling to fight, large surface). Hand-rolled overlays (accessibility regressions nobody notices until a keyboard user does).

---

## 11. A gated test-login endpoint

**Decision.** `/api/test-login` issues a session for a seeded account without a password, and returns 404 unless `NODE_ENV !== 'production'` **and** `ENABLE_TEST_LOGIN=1`.

**Why.** Driving Next.js Server Actions from a test script is brittle — it depends on an internal action-id protocol that changes between versions. Without a stable way to sign in, the 259-check route sweep and the 12 security assertions could not exist, and the RBAC bug in §3 would have shipped.

**Cost.** An authentication bypass exists in the codebase. Mitigated by two independent gates, a 404 that never touches the database, and an explicit note in `.env.example` and the README. The alternative — no automated proof that permissions work — was worse.

---

## 12. Deliberate omissions

| Not built | Reason | Seam |
|---|---|---|
| Receipt OCR | Needs a vision API key | `AIProvider.extractExpense`; the whole downstream flow is real |
| Attachment storage | Bytes add no product insight here | `attachments.storage_path` |
| Email / Teams / Slack | Transport, not product logic | Notification records already written to the database |
| Unattended auto-approval | Product rule: AI recommends, humans decide | — |
| Organization editing UI | Read-only view; downstream reads are live | Seeded and edited in the database |

Each is stated in the README rather than hidden behind a button that does nothing.
