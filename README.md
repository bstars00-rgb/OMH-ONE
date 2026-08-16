# OHMY ONE

**One place to request, approve, analyze and operate.**

An AI-native approval, HR, expense, procurement and business-trip platform, built to replace an approval process running through Microsoft Teams Approval.

> **Prototype.** Every employee, vendor and figure in the seeded dataset is fictional.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/bstars00-rgb/OMH-ONE?quickstart=1)

---

## See it running

**From GitHub, no local setup:** click the badge above. A Codespace installs the
dependencies, creates the database, seeds twelve months of demo data and starts
the app — then opens it on a shareable URL. First boot takes a couple of minutes;
reopening is instant.

**Locally:**

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and sign in with any account below (password `demo1234`).

That is the whole setup. There is no database to install, no container to start, and no API key to obtain — the first boot creates an embedded PostgreSQL database, applies the migrations and seeds twelve months of demo data automatically.

### Why not GitHub Pages

Pages serves static files, with no server process. This app has no static routes:
all 28 render per request, sign-in is a cookie-backed server session, and
approvals, the form builder and the AI layer are server actions against a live
database. Publishing it to Pages would mean deleting the parts that make it an
ERP. Codespaces runs the real thing; `.github/workflows/deploy.yml` publishes to
Vercel once the three secrets in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) exist.

### Demo accounts

| Email | Person | Roles | Sign in as them to see |
|---|---|---|---|
| `aiden@ohmyhotel.com` | Aiden Park, Managing Director | Director | The full backlog, executive analytics, management AI |
| `admin@ohmyhotel.com` | Ethan Park, IT Manager | Super Admin, Admin, Manager | Workflow builder, policy engine, users, settings |
| `mia@ohmyhotel.com` | Mia Song, HR Manager | HR, Manager | Leave administration, team calendar, HR requests |
| `finance@ohmyhotel.com` | Olivia Chen, Finance Manager | Finance, Manager | Budgets, procurement, expense review |
| `vicky@ohmyhotel.com` | Vicky Nguyen, SCM Manager | Manager | Department-scoped approvals |
| `employee@ohmyhotel.com` | Bryant Vo, SCM Specialist | Employee | The requester experience, and how little is visible |
| `auditor@ohmyhotel.com` | Sena Ko, Financial Analyst | Auditor | Company-wide read-only; every action button absent |

All 30 seeded employees have an account at `firstname.lastname@ohmyhotel.com` with the same password.

---

## What it does

| Module | Capability |
|---|---|
| **Approvals** | One engine for all six request types. Conditional multi-step routing, approve / reject / return / withdraw, SLA tracking, full timeline and audit trail |
| **Leave** | Working-day calculation with public holidays, live balance, team collision detection, absence calendar |
| **Business trips** | Multi-traveller, cost breakdown by category, FX capture, travel analytics, comparison against previous trips to the same city |
| **Procurement** | Line items, vendors, quotation rules, budget commitment, price-history comparison per item |
| **Expenses** | Multi-line claims, receipt structuring, duplicate detection by receipt hash, trip linking |
| **AI** | Request summary, policy review, risk detection, form generation from one sentence, natural-language querying, management brief, per-request copilot |
| **Analytics** | Dashboard, executive view, spend / approval / leave / travel / procurement analysis, SLA and bottleneck reporting |
| **Admin** | Workflow builder, policy engine, users and roles, organization, system settings |
| **Reports** | Ten preset CSV exports, permission-scoped and audit-logged |
| **Language** | Full English and Korean, switchable from the header or the login screen — every screen, form, validation message, AI finding and workflow outcome |

### The parts worth looking at

**Approvals are one engine, not six.** Every leave request, trip, purchase, expense, HR and general approval owns a row in a single `requests` table plus a row in its own detail table. The inbox, SLA clock, timeline, comments, audit log and analytics are written once against that base table. Adding a seventh request type needs a detail table and a form — no changes to approvals, permissions or reporting.

**Routing is derived, not hard-coded.** Submitting a request evaluates each workflow step's condition against the request's own facts and materializes the steps that apply, bound to concrete people. A step routed to the requester is dropped, so self-approval is structurally impossible; consecutive steps resolving to the same person collapse into one decision. Editing a workflow never rewrites requests already in flight.

**Aggregates cannot drift.** Submitting moves value into `committed`; approving moves it to `spent`; rejecting or withdrawing releases it — all in the same transaction as the status change. The same three-state movement applies to leave balances. The Budgets page and the approvals that produced it cannot disagree.

**Korean is not a translation layer bolted on top.** Every message is an `{ en, ko }` pair, so a one-language message is a TypeScript error rather than a silent English fallback inside a Korean screen. The AI provider takes a locale context and composes each finding as a whole sentence per language — Korean is SOV with particles, so assembling one from English-ordered fragments produces something no Korean reader would accept. Domain errors and Zod schemas carry message keys rather than prose, and the server action resolves them, because only the server can read the locale cookie. `npm run i18n:audit` checks placeholder parity, duplicate keys, dead keys and enum-derived key families.

**AI figures are database queries, not generated text.** The default provider computes every number it states: hotel rates against the policy table, trip cost against the average of prior approved trips to that city, unit price against prior purchases of the same item, receipt hashes against every other claim, leave against the actual balance and the team's calendar. Only the sentence construction is templated. Setting `AI_PROVIDER=anthropic` improves the prose, not the correctness of the findings.

**The AI never writes SQL.** Natural-language questions are classified into one of eleven fixed intents with parameters drawn from closed enums, validated by a schema, and executed by hand-written parameterized queries — each wrapped in the asker's own row-level predicate. An unrecognized question says so instead of guessing.

---

## Verify it yourself

```bash
npm run check
```

Runs typecheck, lint and a production build. All three are clean.

```bash
npm run dev:test          # terminal 1 — dev server with the test-login endpoint
npm run test              # terminal 2 — route sweep + security assertions
```

- **`test:routes`** signs in as each of the seven roles and requests all 27 pages and 10 report endpoints — 259 checks.
- **`test:rbac`** asserts that permissions actually restrict *data*: an employee sees strictly fewer rows than a director, exports are scoped the same way as the UI, an auditor can read everything but create nothing, a request id guessed in the URL is refused, and unauthenticated API calls are rejected.

`npm run db:inspect` prints the seeded dataset's shape — status mix, spend by month, budget utilisation, leave balances, approval turnaround by role — so the demo figures can be checked against the database directly.

---

## Architecture

```
Next.js 16 (App Router, Server Components, Server Actions)
      │
      ├── src/app/          routes; every page re-checks the session and its capability
      ├── src/components/   UI primitives, charts, request and admin components
      ├── src/features/     (module-specific UI lives under components/requests/*)
      ├── src/lib/
      │     ├── db/         Drizzle schema + client (PGlite or Postgres)
      │     ├── ai/         provider interface, deterministic + model providers,
      │     │               context assembly, safe query layer, insight engine
      │     ├── workflow/    materialization, transitions, priority scoring
      │     ├── auth/        scrypt hashing, JWT session
      │     └── rbac.ts     capability matrix + row-level SQL predicate
      ├── src/server/
      │     ├── actions/    server actions — every one re-authorizes
      │     ├── queries/    read models, all visibility-scoped
      │     └── services/   approval engine, reservations, request creation
      └── database/         migrations, seed, RLS policies
```

### Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Drizzle ORM · PostgreSQL · Recharts · Radix primitives · Zod · jose

### Database

One PostgreSQL schema, two runtimes:

- **Local** — [PGlite](https://pglite.dev): real PostgreSQL compiled to WebAssembly, persisted to `./.pgdata`. Identical SQL semantics, zero install.
- **Production** — Supabase Postgres or any Postgres 14+ via `DATABASE_URL`.

Migrations in `database/migrations/` are plain Postgres SQL generated from the schema; the same file runs against both.

```bash
npm run db:generate   # schema.ts → SQL migration
npm run db:setup      # apply migrations, seed if empty
npm run db:reset      # delete local data, migrate, reseed
```

---

## Deploy

### 1. Database (Supabase)

1. Create a Supabase project.
2. Copy the connection string from **Project Settings → Database → Connection string → Transaction pooler**.
3. Apply the schema and seed:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:setup
   ```
   Or paste `database/migrations/0000_init.sql` into the Supabase SQL editor.
4. Apply the Row Level Security backstop:
   ```bash
   psql "$DATABASE_URL" -f database/rls.sql
   ```

### 2. Application (Vercel)

1. Push to GitHub and import the repository in Vercel.
2. Set the environment variables below.
3. Deploy.

```bash
DATABASE_URL=postgresql://...       # setting this switches the driver to Postgres
AUTH_SECRET=...                     # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
AI_PROVIDER=mock                    # or `anthropic` with AI_API_KEY
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
AUTO_SEED=false                     # after the first deploy
```

See `.env.example` for the full list. `ENABLE_TEST_LOGIN` must never be set in production — the endpoint returns 404 there regardless.

---

## Security

- **Every page, server action and route handler re-checks the session and its capability.** Navigation hiding is cosmetic; the page enforces.
- **Row-level visibility is a SQL predicate**, folded into every request query — an unauthorized row is never fetched, let alone rendered.
- **Decision authority is separate from permission.** Holding `request.approve` is not enough; the session must be the named approver of the *current* step. Admin delegation is recorded in the audit log.
- **Concurrent decisions are serialized.** Every approval runs in a transaction that re-reads and locks the step, so two approvers acting at once produce one decision and one "already decided" message.
- **Passwords are scrypt with a per-user salt.** Sessions are HS256 JWTs in an httpOnly, SameSite=Lax cookie, validated against the database on every page load so a revoked role or deleted account stops working immediately.
- **The audit log is append-only.** No update or delete policy exists, even for administrators.
- **Exports are audit-logged** and scoped identically to the UI.

Verified by `npm run test:rbac` — see the assertion list in `scripts/rbac-test.ts`.

---

## Known limitations

These are deliberate scope decisions, not defects. Each names the seam where the real implementation attaches.

| Limitation | Detail |
|---|---|
| **Receipt OCR is inference, not reading** | Without a vision API key there is no image to read. Merchant, date, amount and category are inferred from the filename and any pasted text, flagged as AI-filled with a low confidence, and the whole downstream flow works. `AnthropicProvider.extractExpense` performs real extraction when a key is set. |
| **Attachment bytes are not stored** | File metadata, hashing and access control are real; the bytes are not persisted. `attachments.storage_path` is the seam for S3 or Supabase Storage. |
| **Notifications are in-app only** | `NotificationService` delivery is implemented against the database. Teams, Outlook and Slack are adapters against the same interface; none are built. |
| **Organization structure is read-only in the UI** | Offices, departments, teams and cost centres are seeded and edited in the database. Everything downstream reads them live, so changing a department head immediately changes routing. |
| **No unattended auto-approval** | A product rule, not an omission — AI recommends, humans decide. |
| **Auth is credential-based, not Supabase Auth** | Keeps the prototype runnable with no external service. `database/rls.sql` contains the policies for a Supabase Auth deployment. |
| **PGlite is single-writer** | Fine for the demo; a second process cannot open the same data directory. Point `DATABASE_URL` at a server for concurrent access. |

---

## Roadmap

The schema already carries the dimensions these need — `cost_centers` and `budgets` for accounting, `vendors` as a standalone entity for contracts and AP, `requests` accepting a new type without engine changes.

**Next:** external notification transports · attachment storage · organization editing in the UI · batch approval for low-risk items · recommendation-quality tracking from the existing feedback votes.

**Later:** Accounting / AP / AR · invoicing · contract management · asset register · payroll · attendance · recruitment · inventory · CRM.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md) | Problem, principle, scope, critical flows, acceptance |
| [`docs/USER_ROLES.md`](docs/USER_ROLES.md) | Capability matrix, row-level visibility, demo accounts |
| [`docs/INFORMATION_ARCHITECTURE.md`](docs/INFORMATION_ARCHITECTURE.md) | Navigation, page anatomy, URL conventions |
| [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) | Schema, the universal-request decision, money handling, indexes |
| [`docs/WORKFLOW_RULES.md`](docs/WORKFLOW_RULES.md) | Statuses, materialization, conditions, SLA, priority scoring |
| [`docs/AI_ARCHITECTURE.md`](docs/AI_ARCHITECTURE.md) | Provider abstraction, context assembly, safe query layer, failure behaviour |
| [`docs/UI_SYSTEM.md`](docs/UI_SYSTEM.md) | Tokens, density, components, states, accessibility |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture decisions and their trade-offs |
| [`docs/QA_SCORECARD.md`](docs/QA_SCORECARD.md) | Test results and the final quality score |
| [`PROJECT_STATE.md`](PROJECT_STATE.md) | Phase status and next actions |
| [`TODO.md`](TODO.md) | Open items by severity |
