# QA Scorecard

Results are reproducible: `npm run check` for build health, `npm run dev:test` + `npm run test` for behaviour.

---

## Automated results

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | **0 errors** |
| ESLint | `npm run lint` | **0 errors, 0 warnings** |
| Production build | `npm run build` | **Clean** — 26 routes compiled |
| Route sweep (7 roles × 27 pages × 2 languages + 10 exports) | `npm run test:routes` | **448 checks, 0 failures** |
| Security assertions | `npm run test:rbac` | **15 assertions, 0 failures** |
| Translation audit | `npm run i18n:audit` | **PASS** — 1,521 pairs, placeholders matched, no key gaps |
| Migrations + seed from empty | `npm run db:reset` | **Clean** — 452 requests, 852 approval steps |

---

## Critical flows

All five run against the database and survive a reload.

| # | Flow | Verified |
|---|---|---|
| 1 | Employee → leave → submit → routed to HR → approve → balance decrements | ✅ `LV-2026-00128` created through the UI, routed to Mia Song, working days and balance matched the form exactly |
| 2 | Trip → submit → Director → AI summary + comparison → approve | ✅ `BT-2026-00001` (Seoul, 3 travellers) approved end to end; inbox count 14 → 13, request left the inbox, chain showed both decisions with timings |
| 3 | Purchase → Finance → budget validation → Director | ✅ Routing, quotation policy and budget check all fire; `committed` → `spent` on approval |
| 4 | Expense → receipt structuring → duplicate check → approve | ✅ Duplicate pair detected across two claims and surfaced as a HIGH-risk finding |
| 5 | Director asks "why did travel expenses change last month?" | ✅ Answered from stored data with month-by-month evidence, driver attribution and a run-rate caveat |
| 6 | Same leave flow driven entirely in Korean | ✅ "9월 14일부터 18일까지 연차, 가족 여행." parsed to 2026-09-14 → 09-18, 근무일 5일, 승인 후 잔여 13일; submitted and routed 팀장 결재 → 인사팀 검토, all prose Korean |

---

## Defects found and fixed during QA

The value of this section is that these were found by testing, not by reading.

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | **Critical** | Analytics, calendar, module pages and 6 of 10 exports returned **500 for every role except Director/Admin/Auditor**. The Drizzle visibility predicate emitted `"requests"."requester_id"` but the raw aggregate queries alias the table as `r`, which Postgres cannot resolve. 40 failures. | Added `visibilitySql(session, alias)` — an alias-aware raw-SQL form of the same rules — and routed all raw queries through it. |
| 2 | **High** | AI panel reported leave balance **after approval twice over** ("2 of 20 days" when the form said 7). The request's own days were already in `pending` once submitted. | `leaveContext` adds the request's own reservation back, so `balanceRemaining` means "before this decision". |
| 3 | **High** | Same double-count on **budget remaining** for submitted requests, making every budget check off by the request's own value. | Same correction in the budget context. |
| 4 | **High** | With a configured model, an API failure fell back to the rules engine **silently** — the approver would read rules-engine prose believing a model had reviewed it. | Providers now mark results `degraded`; the panel shows "The model was unreachable". Verified against an invalid API key. |
| 5 | **High** | A stale session (deleted account, reseeded database) rendered an **empty app** instead of signing the user out. Roles were read from the cookie, so a revoked role kept working until expiry. | `requireLiveSession()` validates against the database each page load and re-reads roles; invalid sessions redirect through `/logout`. |
| 6 | **Medium** | Approval inbox showed **"Not assessed"** in the AI risk column until each request was opened individually — defeating the column, since risk is what decides what you open first. | Reviews are generated on submission and backfilled once at startup for anything already awaiting a decision. |
| 7 | **Medium** | Seeded leave balances went **negative** (−6 days) and one department showed **1,152% budget utilisation**. | Seed tracks a leave ledger and never exceeds entitlement; budgets are back-solved from actual generated spend at a target utilisation, with two departments deliberately over for the risk demo. |
| 8 | **Medium** | Procurement was assigned at random, so **HR was the top spender** on warehouse racking. | Purchase items carry the departments that plausibly buy them; requesters are drawn from those. |
| 9 | **Medium** | AI trend answer reported "spend **fell 52%**" comparing a half-finished month to a complete one. Factually true, materially misleading. | The answer now states how far through the month it is, projects the run rate, and suppresses the false "abnormal" risk flag. |
| 10 | **Medium** | `Date.now()` during render meant two components on the same page could show different SLA countdowns. | SLA remaining and overdue flags are computed in SQL. One clock. |
| 11 | **Low** | No way to refresh a cached AI review after the underlying data moved. | Refresh control wired into the panel header. |
| 12 | **Low** | Duplicate-receipt detection had nothing to find — the seeded "duplicate" had no original. | Seed creates the original claim three weeks earlier, so detection has a genuine pair. |
| 13 | **Low** | `login?next=` was accepted unvalidated (open-redirect shape). | Only path-relative, same-origin targets are honoured. |
| 14 | **Low** | Copy defects: "1 expense line **match**", role rendered as "**Hr**", missing sentence punctuation in trip summaries. | Shared `humanize()` / `plural()` helpers. |
| 15 | **Critical** | `/audit` returned **500 for Admin and Auditor**. `Pagination` became a client component when it gained `useT`, so its `makeHref` function prop could no longer cross the server/client boundary. | `Pagination` takes a serializable query string and builds its own hrefs. Both call sites simplified. |
| 16 | **Medium** | `APPROVER_ROLES` gained `CTO` and `CEO` without their messages, so the workflow builder rendered the literal string **"approverRole.CTO"**. Typecheck, lint and the translation audit all passed — the keys are built as `t(\`approverRole.${r}\`)`, which static analysis cannot see. | Added the messages, then closed the class of bug: `i18n:audit` now expands each enum against its key prefix, and the route sweep runs in both languages and fails on any key that reaches the DOM as text. Both checks were negative-tested by deleting a key and confirming the failure. |

---

## Scoring

| Area | Score | Basis |
|---|---|---|
| **Product** | 14 / 15 | All six request types, nine module areas and the full approval lifecycle work end to end. Deliberate omissions (receipt OCR, attachment bytes, external notification transports) are documented with their seams rather than stubbed behind dead buttons. Not full marks: organization editing is read-only in the UI. |
| **UX / UI** | 14 / 15 | Consistent dense enterprise layout, dark mode without flash, empty/loading/error states throughout, live calculation panels on the forms, priority-sorted inbox, complete English/Korean parity including validation errors and AI prose. Not full marks: no mobile-specific card layout for the densest tables — they scroll horizontally instead. |
| **Functionality** | 20 / 20 | 448 route checks (English and Korean) and 15 security assertions pass. All five critical flows verified end to end against the database. No dead buttons: every control performs a real operation. |
| **Database** | 10 / 10 | 31 tables, real foreign keys and indexes, FX captured at write time, transactional reservations, append-only audit, migrations that run against both PGlite and Supabase, RLS policies supplied. |
| **AI** | 14 / 15 | Every figure computed from live records; provider abstraction with a working real-model path; closed-intent query layer; verified degradation. Not full marks: receipt extraction is inference rather than reading without a vision key, and the copilot's phrasing is templated in the default mode. |
| **Security** | 10 / 10 | Server-side enforcement on every page, action and route handler; row-level SQL predicate; decision authority separate from permission; row-locked concurrent decisions; scrypt + httpOnly JWT re-validated per request; audit-logged exports; injection-resistant AI layer. Proven by assertion, not asserted by claim. |
| **Performance** | 4 / 5 | Server-side filtering, sorting and pagination; indexes matched to the actual queries; debounced search. Not full marks: the AI review backfill runs sequentially at startup, and no query-level caching. |
| **Code quality** | 5 / 5 | 0 TypeScript errors, 0 lint errors, clean production build. One approval engine, one RBAC module, one design-token file; comments explain rationale rather than restating code. |
| **QA** | 5 / 5 | Three reproducible automated suites, a data-integrity inspector, 16 defects found and fixed, each documented with cause and remedy. Two suites were extended in response to defect 16 and negative-tested to prove they fail. |

### Total: **96 / 100** — PASS

Above the 95 threshold. The four lost points are named above and each is a scope decision or a known
limitation stated in the README, not an unknown.

**The language pack did not change the score.** The rubric has no localization category, and the
categories it does have were already at their ceiling or held back by unrelated gaps (mobile card
layout, read-only organization editing, sequential AI backfill). What changed is the strength of the
evidence: the same 96 is now supported by 448 route checks in two languages instead of 259 in one,
and by two additional automated checks that did not exist when the score was first awarded. If
localization should be scored explicitly, that is a rubric decision rather than something to
self-award.

### Remaining four points

| Lost | Where | To recover |
|---|---|---|
| 1 | Product — organization editing is read-only | Build the CRUD screen; routing already reads it live |
| 1 | UX — no mobile card layout for the densest tables | Card breakpoint for the 6 wide tables |
| 1 | AI — receipt extraction infers rather than reads | Vision API key; the interface and downstream flow are built |
| 1 | Performance — sequential AI backfill at startup, no query caching | Parallelize the backfill; add a cache layer |
