# Deployment

OHMY ONE is a server-rendered application with a database, session authentication and server actions. That determines which hosts can run it.

---

## Why GitHub Pages cannot host this

GitHub Pages serves static files only — no server process, no database, no request handling.

Making the app fit would mean setting `output: 'export'` and removing:

| Removed | What stops working |
|---|---|
| Server Actions | Every form. Submit, approve, reject, return, comment, all admin editing |
| Route Handlers | Search, CSV export, session issuing |
| Session cookies | Login, roles, all permission enforcement |
| Database | Requests, approvals, budgets, audit log — all of it |
| AI layer | Review, policy checks, assistant (all query the database) |

What would remain is a set of static pages with no data behind them. The prototype's whole claim — that it is a working system rather than a mockup — would be gone. **Do not switch Pages on for this repository.**

---

## Option 1 — Vercel (recommended)

Vercel is built for Next.js and runs this app unchanged. Free tier is sufficient for a prototype.

### Fastest path: no database setup

The app boots against embedded PostgreSQL and seeds itself. This works for a demo, but the filesystem is ephemeral — data resets when the instance recycles.

1. <https://vercel.com/new> → **Import** `bstars00-rgb/OMH-ONE`
2. Framework preset: **Next.js** (auto-detected). Leave the build command alone.
3. Add one environment variable:

   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | run `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |

4. **Deploy**. Sign in with `aiden@ohmyhotel.com` / `demo1234`.

### Durable path: with Supabase

Data survives restarts and multiple instances share one database.

1. Create a project at <https://supabase.com>.
2. **Project Settings → Database → Connection string → Transaction pooler**. Copy it.
3. Locally, apply schema and demo data:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:setup
   ```
4. Apply the Row Level Security backstop in the Supabase SQL editor: paste `database/rls.sql`.
5. In Vercel, set:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooler connection string |
   | `AUTH_SECRET` | a generated secret |
   | `AUTO_SEED` | `false` |
   | `NEXT_PUBLIC_APP_URL` | your deployment URL |

6. Redeploy.

> Never set `ENABLE_TEST_LOGIN` in production. The endpoint returns 404 when `NODE_ENV=production` regardless, but do not add the variable.

---

## Option 2 — GitHub Codespaces

Runs the real application in a browser, from the repository, with no deployment and no account beyond GitHub.

1. Open the repo → green **Code** button → **Codespaces** → **Create codespace on main**
2. Wait for setup. `.devcontainer/devcontainer.json` installs dependencies and seeds the database automatically.
3. Run:
   ```bash
   npm run dev
   ```
4. Codespaces forwards port 3000 and opens a preview. Sign in with the demo accounts.

Useful for showing the prototype to someone without deploying anything.

---

## Option 3 — Run locally

```bash
git clone https://github.com/bstars00-rgb/OMH-ONE.git
cd OMH-ONE
npm install
npm run dev
```

<http://localhost:3000> — the database is created and seeded on first boot.

---

## What CI does

`.github/workflows/ci.yml` runs on every push:

1. Typecheck, lint, production build
2. Migrations and seed against embedded PostgreSQL
3. 259-check route sweep across all seven roles
4. 12 security assertions proving permissions restrict data

CI failing means the deployment would be broken — it is the gate, not the deployment mechanism.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | **Yes, in production** | Signs the session cookie. A dev fallback exists locally. |
| `DATABASE_URL` | No | Setting it switches from embedded PGlite to PostgreSQL |
| `DB_DRIVER` | No | `pglite` (default) or `postgres` |
| `AUTO_SEED` | No | `false` to skip first-boot demo data |
| `AI_PROVIDER` | No | `mock` (default, no key needed) or `anthropic` |
| `AI_API_KEY` | Only with `anthropic` | Improves prose; findings stay database-computed |
| `NEXT_PUBLIC_APP_URL` | No | Absolute URLs in links |
| `ENABLE_TEST_LOGIN` | **Never in production** | Test-only session endpoint |
