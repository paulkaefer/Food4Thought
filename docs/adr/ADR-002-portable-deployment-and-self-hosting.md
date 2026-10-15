# ADR-002: Portable Deployment and Local Self-Hosting

**Status:** Accepted for fork implementation
**Date:** 2026-10-08
**Scope:** scottzastrow/Food4Thought fork only
**Origin:** Builds on ADR-001 and the upstream Next.js/TypeScript architecture.

## Context
Food4Thought needs a public demonstration at food4thought.vergotek.com on an existing AWS Lightsail Ubuntu server, while allowing other developers to clone the public repository and run the application locally with their own AI API credentials and PostgreSQL instance. The upstream application was planned for Vercel and uses PostgreSQL/Prisma, Vercel Blob, and Inngest. Hosting assumptions must not prevent local development or require the public deployment to use Vercel.

## Decision
1. Retain one Next.js/TypeScript codebase and Prisma/PostgreSQL data model for both Lightsail and local environments. Do not create a separate application fork for self-hosting.
2. Deploy the public application on AWS Lightsail behind nginx and HTTPS, subject to capacity, security, and integration verification. PostgreSQL may run privately on Lightsail or a separately managed host; final placement will be chosen during deployment planning.
3. Support a documented local setup with a developer-controlled PostgreSQL database and their own OpenAI and USDA credentials. Use environment-based configuration, a sanitized .env.example, and repeatable Prisma migrations.
4. Keep credentials exclusively server-side; never commit keys or expose them to browsers. The public deployment uses its own server credentials, not local developers' credentials.
5. Preserve the existing provider interfaces and stub mode for offline development and automated testing.
6. Evaluate Vercel Blob and Inngest for portable operation before deployment. Document any storage or background-job adapters needed for local operation or Lightsail; do not assume that switching hosting automatically replaces these services.
7. Add request limits, cost controls, upload validation, and appropriate operational logging before opening paid AI calls to anonymous public traffic.
8. Document setup, prerequisites, migration, and start commands for both environments. Avoid environment-specific application logic where configuration or adapters suffice.

## Consequences
- A single repository can support a public demo and independent local experimentation.
- Local developers may still need to configure photo storage and background-job services unless local adapters are supplied and documented.
- Lightsail requires operational management for the Node process, PostgreSQL placement, TLS, backups, and service reliability.
- Public API usage creates cost and abuse risks that must be addressed before launch.
- Production and local databases are independent; no developer data or secrets are shared by default.

## Alternatives considered
- Vercel-only hosting: rejected as the exclusive deployment target; the project requires Lightsail deployment.
- MySQL migration: deferred/rejected for the initial implementation; PostgreSQL already matches the Prisma schema and existing design.
- Separate codebases for local and production: rejected; creates avoidable divergence.
- Rewriting the application in another language: rejected; no demonstrated need.

## Follow-up work
- Audit the current scan pipeline, Blob usage, Inngest execution, and configuration.
- Decide how photo storage and background processing work in local self-hosted mode.
- Create the implementation plan and deployment documentation before production rollout.
