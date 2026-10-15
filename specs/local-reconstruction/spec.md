# Feature Specification: Local Reconstruction and Installation

**Date:** 2026-10-12
**Status:** SpecKit-lite reconstruction audit (documentation only — the original application was
not built with SpecKit, and no SpecKit tooling is required to consume these documents).

## Objective

Make Food4Thought reproducible from a clean GitHub clone by a first-time developer using their
own credentials, on Windows, macOS, or Linux — with deterministic offline behavior by default and
clearly documented opt-ins for real AI services and production deployment.

## Scope boundaries

- Documentation and reproducibility only. No application business-logic, Prisma schema, migration,
  or production-configuration changes.
- Three operating modes are documented and kept distinct:
  1. **Stub mode (default)** — local development with deterministic stub providers; no external
     accounts or API keys required; no network calls from the scan pipeline.
  2. **Real-services mode** — local development against the developer's own OpenAI and/or USDA
     FoodData Central credentials.
  3. **Production mode** — HTTPS deployment with Inngest Cloud keys (see ADR-002 for the hosting
     decision; deployment runbooks are out of scope here).

## Assumptions (verified against the repository)

- The repository is cloned from `github.com/scottzastrow/Food4Thought` and contains everything
  needed except credentials and a PostgreSQL server.
- `.env.example` is the sanitized source of truth for environment variables; no real secrets are
  committed (`.env`, `.env.local`, `.env*.local`, and `data/` are git-ignored).
- The scan pipeline defaults to deterministic stubs when `VISION_PROVIDER` and
  `USDA_MATCH_SELECTOR` are unset (`lib/jobs/process-scan.ts`); without `USDA_FDC_API_KEY`,
  nutrition falls back to labeled approximate estimates.
- `POST /api/v1/scans` associates uploads with the hardcoded demo user
  (`DEV_USER_ID = 00000000-0000-0000-0000-000000000001`), created by the idempotent seed
  (`npm run db:seed`).
- Meal photos are stored on the local filesystem via `LocalPhotoStorage`; the directory must be
  outside `public/` and is created on first upload.

## Requirements

- **FR-REC-01:** A prerequisites list naming every required tool and its minimum verified version
  (Git, Node.js, npm, PostgreSQL) must exist.
- **FR-REC-02:** Every environment variable read by the application (`process.env.*`) must be
  documented as required or optional, with its default behavior when unset.
- **FR-REC-03:** The installation sequence must be linear, numbered, and copy-pasteable for
  Windows PowerShell, with Linux/macOS equivalents where commands differ.
- **FR-REC-04:** Database setup must cover PostgreSQL database creation, `prisma migrate deploy`,
  and the idempotent demo-user seed (`npm run db:seed`), including the P2003 failure that occurs
  when the seed is skipped.
- **FR-REC-05:** Each step must state what to do, why it matters, the command, the expected
  result, and basic troubleshooting.
- **FR-REC-06:** Optional credentials (OpenAI, USDA, admin token, restaurant provider, Inngest
  Cloud keys) must be clearly separated from required ones, with instructions for obtaining them.
- **FR-REC-07:** A first-photo acceptance test must let a developer confirm end-to-end success in
  both stub mode and real-services mode.
- **FR-REC-08:** The README must link prominently to the installation guide and these
  SpecKit-lite documents.
- **FR-REC-09:** The local Inngest dev server requirement (`npx inngest-cli dev` in a second
  terminal) must be documented, including that no Inngest keys are needed locally.

## Acceptance criteria

- **SC-REC-01:** Every command in the guide exists in the repository (npm scripts) or is a
  standard tool command; every path referenced exists or is created by a documented step.
- **SC-REC-02:** Every `process.env` variable in `app/` and `lib/` appears in the guide's
  environment-variable table and in `.env.example`.
- **SC-REC-03:** A developer following only the guide reaches a running app at
  `http://localhost:3000`, submits a meal photo, and observes a completed scan — in stub mode
  without any third-party account.
- **SC-REC-04:** `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass on
  the audited revision.
- **SC-REC-05:** Steps that cannot be validated without a clean machine, a second database, or
  third-party credentials are explicitly listed as not validated in the final report.
