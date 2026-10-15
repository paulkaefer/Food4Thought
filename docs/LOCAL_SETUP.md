# Local Setup Guide — Food4Thought

This guide takes a developer who has never seen Food4Thought from a clean GitHub clone to a
running app with a successful first meal-photo scan. It works on **Windows (PowerShell)**,
**macOS, and Linux** — where commands differ, both forms are shown.

By default the app runs in **stub mode**: fully offline, deterministic, no external accounts.
Real AI results (OpenAI photo analysis, USDA nutrition) are optional add-ons covered in
[Step 9](#step-9-optional--enable-real-ai-services).

> Companion documents: [reconstruction spec](../specs/local-reconstruction/spec.md) ·
> [plan](../specs/local-reconstruction/plan.md) · [task checklist](../specs/local-reconstruction/tasks.md)

---

## What you need before you start

| Tool | Minimum version | Check command |
|---|---|---|
| Git | any current | `git --version` |
| Node.js | **20.12 or newer** (any 20/22/24 LTS) | `node --version` |
| npm | bundled with Node.js | `npm --version` |
| PostgreSQL | any version supported by Prisma 5 (14+ recommended) | `psql --version` |

Why Node 20.12+: the database seed script loads your `.env.local` with `process.loadEnvFile`,
which was added in Node 20.12. Older Node versions will fail at the seed step. `package.json`
declares `"engines": { "node": ">=20.12" }`, so npm warns if you install on an older runtime.

**No third-party accounts are required for the default setup.**

---

## Step 1 — Clone the repository

**What:** Download the code.
**Why:** Everything runs from this local copy.

```powershell
git clone https://github.com/scottzastrow/Food4Thought.git
cd Food4Thought
```

**Expected result:** you are in the project root (it contains `package.json`, `app/`, `prisma/`).

**Troubleshooting:** if `git` is not recognized, install Git first (Windows: https://git-scm.com/download/win).

---

## Step 2 — Install dependencies

**What:** Download all npm packages.
**Why:** the app is built from these; the flag avoids an unrelated peer-dependency conflict.

```powershell
npm install --legacy-peer-deps
```

(Same command on macOS/Linux.)

**Why `--legacy-peer-deps`:** the `inngest` package declares an optional SvelteKit peer that
conflicts with this project's Vite-based tooling. The flag tells npm to ignore that conflict; it
does not affect the app.

**Expected result:** `added ... packages` with no `ERESOLVE` errors. `npm audit` may report
advisories against dev tooling and the pinned Next.js 14 line — see "Known findings" in the
[README](../README.md).

**Troubleshooting:** `ERESOLVE` errors mean the flag was omitted — re-run with it.

---

## Step 3 — Create your environment file

**What:** Create your private, git-ignored configuration.
**Why:** secrets and machine-specific paths live here and are never committed.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env.local
```

**macOS/Linux:**

```bash
cp .env.example .env.local
```

Now edit `.env.local` and set the two **required** values:

```dotenv
DATABASE_URL="postgresql://YOUR_POSTGRES_USER:YOUR_POSTGRES_PASSWORD@localhost:5432/food4thought"
PHOTO_STORAGE_DIR="./data/photos"
```

Leave every optional value empty for now — that keeps you in stub mode.

**Expected result:** `.env.local` exists next to `.env.example`. (`git status` must **not** list
it — it is git-ignored.)

**Troubleshooting:** if your PostgreSQL password contains `@`, `%`, or `#`, percent-encode it in
the URL (e.g. `@` → `%40`).

---

## Step 4 — Start PostgreSQL and create the database

**What:** A running PostgreSQL server and an empty database named `food4thought`.
**Why:** all app data (users, meals, nutrition) lives here; the name must match `DATABASE_URL`.

**Windows:** install PostgreSQL from https://www.postgresql.org/download/windows/ (the installer
registers it as a service that starts automatically). Then, in PowerShell:

```powershell
createdb -U postgres food4thought
```

**macOS (Homebrew):**

```bash
brew install postgresql@16
brew services start postgresql@16
createdb food4thought
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt install postgresql
sudo systemctl enable --now postgresql
sudo -u postgres createdb food4thought
```

**Expected result:** `createdb` prints nothing and exits successfully (the database now exists).

**Troubleshooting:**
- `createdb: command not found` — PostgreSQL's `bin` directory is not on your PATH (common on
  Windows; use the "SQL Shell (psql)" shortcut and run `CREATE DATABASE food4thought;` instead).
- `connection refused` — the server is not running; start the service for your platform.
- Prefer Docker? `docker run -d --name f4t-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`
  works too; use `postgresql://postgres:postgres@localhost:5432/food4thought` and create the
  database with `docker exec -it f4t-pg createdb -U postgres food4thought`.

---

## Step 5 — Apply database migrations

**What:** Create all tables, enums, and constraints.
**Why:** the checked-in migrations are the single source of truth for the schema.

```powershell
npx prisma generate
npx prisma migrate deploy
```

(Same on macOS/Linux.)

**Expected result:** `prisma generate` prints "Generated Prisma Client"; `migrate deploy` lists
the four migrations as applied (`..._init`, `..._add_food_vocabulary`,
`..._add_food_mapping_candidate`, `..._add_food_item_usda_match`).

**Troubleshooting:**
- `Environment variable not found: DATABASE_URL` — the Prisma CLI reads `.env`, not `.env.local`.
  If you only created `.env.local`, either also copy it to `.env`, or run the command with the
  variable set for the session:
  PowerShell: `$env:DATABASE_URL="postgresql://..."` then re-run.
  macOS/Linux: `DATABASE_URL="postgresql://..." npx prisma migrate deploy`.
- `P1001: Can't reach database server` — PostgreSQL is not running, or the host/port in
  `DATABASE_URL` is wrong.

---

## Step 6 — Seed the demo user

**What:** Create the one demo user profile the app currently uses.
**Why:** `POST /api/v1/scans` hardcodes this user until real authentication exists. On a fresh
database, skipping this step makes the first photo upload fail with a Prisma **P2003**
foreign-key error.

```powershell
npm run db:seed
```

(Same on macOS/Linux.)

**Expected result:** `[seed] demo user profile ready (id=00000000-0000-0000-0000-000000000001)`.
The seed is idempotent — run it as many times as you like; an existing record is never modified.

**Troubleshooting:** `Environment variable not found: DATABASE_URL` means your Node version is
older than 20.12 or `.env.local`/`.env` is missing — check `node --version` and Step 3.

---

## Step 7 — Start the app (terminal 1)

**What:** Run the Next.js dev server.

```powershell
npm run dev
```

**Expected result:** `Ready in ...` and the app answers at `http://localhost:3000`.

---

## Step 8 — Start the Inngest dev server (terminal 2)

**What:** Run the local background-job server in a **second** terminal.
**Why:** photo analysis runs as a durable background job (so slow AI calls never block the web
request). Without this server, uploads are accepted but never processed.

```powershell
npx inngest-cli dev
```

(Same on macOS/Linux. The first run downloads the CLI, which needs internet once.)

**Expected result:** the dev server UI at `http://localhost:8288` shows the app
`food4thought` with two functions (`process-scan`, `discover-vocabulary`) connected via
`http://localhost:3000/api/inngest`.

**Troubleshooting:** if no app appears, confirm `npm run dev` is running first, then restart the
Inngest dev server. No `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` are needed locally — those are
only for Inngest Cloud in production.

---

## Step 9 (optional) — Enable real AI services

Everything below is **optional**. With none of it set, the app still works end-to-end with
deterministic stubs and labeled approximate nutrition.

| Capability | Variables to set in `.env.local` | Where to get the credential |
|---|---|---|
| Real nutrition data (USDA FoodData Central) | `USDA_FDC_API_KEY` | Free key: https://fdc.nal.usda.gov/api-key-signup |
| Real photo analysis (OpenAI vision) | `VISION_PROVIDER="openai"` + `OPENAI_API_KEY` (optional `OPENAI_VISION_MODEL`, default `gpt-4.1-mini`) | Paid key: https://platform.openai.com/api-keys |
| AI-assisted USDA match selection | `USDA_MATCH_SELECTOR="openai"` + `OPENAI_API_KEY` (optional `OPENAI_MATCH_MODEL`) | Same OpenAI key |
| Admin review UI (`/admin/food-mappings`) | `ADMIN_REVIEW_TOKEN` — any shared secret you invent | You choose it |
| Restaurant nutrition provider | `RESTAURANT_NUTRITION_API_BASE_URL` + `RESTAURANT_NUTRITION_API_KEY` | Vendor-specific; unset = offline behavior |

Notes:

- The two OpenAI toggles are independent — you can enable real photo analysis without AI match
  selection, or vice versa.
- Keys are used **server-side only** (in the background job and route handlers); they never
  reach the browser.
- Restart `npm run dev` after editing `.env.local`.

---

## Step 10 — First-photo acceptance test

**What:** Prove the whole pipeline works.

1. Open `http://localhost:3000/scan`.
2. Upload any clear food photo (JPEG, PNG, or WebP, ≤ 2 MB).
3. Watch the result page poll until processing finishes.

**Expected result in stub mode (default):** the scan completes and shows the deterministic stub
result — an "apple" item with a 182 g portion — with its nutrition source clearly labeled
(approximate generic estimate when no USDA key is set; real USDA data when it is).

**Expected result with real AI enabled:** the identified foods come from your actual photo, with
USDA-sourced nutrition when `USDA_FDC_API_KEY` is set.

**Also try (negative path):** upload a PDF or any non-image — you should get a friendly
rejection message, an HTTP 4xx response, and no crash.

**Troubleshooting:**
- Scan stuck on "processing" — the Inngest dev server (Step 8) is not running.
- `P2003` foreign-key error in the server log — the demo user is missing; run Step 6.
- `PHOTO_STORAGE_DIR must be configured` — Step 3 was skipped or the dev server needs a restart.
- Upload rejected for size — photos must be ≤ 2 MB (enforced in `LocalPhotoStorage`).

---

## Photo storage — what to know

Uploaded photos are written to `PHOTO_STORAGE_DIR` (default convention `./data/photos`, already
git-ignored) with owner-only permissions. Two rules are enforced in code:

- the directory must **not** be inside `public/` (meal photos are private and must never be
  statically served), and
- only JPEG/PNG/WebP ≤ 2 MB are accepted.

The directory is created automatically on first upload. To wipe local data, stop the app and
delete the directory (PowerShell: `Remove-Item -Recurse data\photos`; macOS/Linux:
`rm -rf data/photos`).

---

## Verifying your installation

```powershell
npm test              # unit + integration + contract tests (Vitest)
npx tsc --noEmit      # TypeScript type check
npm run lint          # ESLint
npm run build         # production build
npm run e2e           # optional: Playwright e2e (app must be running;
                      # first time: npx playwright install)
```

All four non-e2e checks are expected to pass on a clean clone.

---

## Production deployment (boundary summary)

Local reconstruction does not require this, but for completeness: production uses the same
codebase behind HTTPS (the reference deployment targets AWS Lightsail + nginx per
[ADR-002](adr/ADR-002-portable-deployment-and-self-hosting.md)), `npm run build` + `npm start`,
a production PostgreSQL database, `prisma migrate deploy`, `npm run db:seed`, and **Inngest
Cloud** with `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` pointing at the public
`/api/inngest` endpoint. Production credentials are the operator's own — never a developer's
local keys.
