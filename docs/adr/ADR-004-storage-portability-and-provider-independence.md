# ADR-004: Storage Portability and Provider Independence

- **Status:** Accepted
- **Date:** 2026-10-10
- **Scope:** Food4Thought photo storage
- **Related:** ADR-002 (portable deployment), ADR-003 (image processing, storage, and lifecycle)

## Context

Food4Thought currently stores photographs through Vercel Blob with public URLs. The application must run on Windows development machines and on a persistent Linux/AWS Lightsail installation, while remaining suitable for self-hosting and possible future shared/object storage. Filesystem storage is portable across operating systems but introduces responsibilities for backups, access controls, persistent volumes, and multi-instance deployments.

## Decision

1. Define a server-side `PhotoStorage` abstraction supporting `save`, `read`, and `delete` operations. Use opaque, provider-neutral photo identifiers in application records and job events; never persist machine-specific absolute paths or provider URLs as the canonical identifier.
2. Implement a **private local filesystem adapter first**, with a configurable storage root outside web-served directories. It must work with Windows and Linux path handling, create required directories safely, and reject path traversal or untrusted file paths.
3. Do not expose photographs through public static paths. Any client-facing image endpoint must enforce authorization before returning content. Server-side vision analysis reads through the storage abstraction, not by assuming a public URL.
4. Remove the Vercel Blob runtime dependency once the upload, processing, and display paths have migrated. Do not keep a second storage implementation without an actual deployment requirement.
5. Document persistent-volume configuration, permissions, backups, retention/deletion behavior, and migration procedures for local and Lightsail installations. Deletion must remove the underlying image where appropriate, not only its database record.
6. Preserve the interface boundary so a future S3-compatible or other shared-storage adapter can be introduced if multi-instance deployment becomes necessary. Do not implement that adapter speculatively.
7. Migrate existing `beforePhotoUrl`/`afterPhotoUrl` usage deliberately. Database field names and legacy records may require a compatible transition or schema migration; do not reinterpret existing public URLs as opaque IDs without a migration plan.

## Consequences

- Single-instance Windows and Linux deployments can operate without a cloud photo-storage account.
- Application code remains independent of storage provider details.
- Local storage requires explicit backup, disaster recovery, access-control, and capacity planning.
- Multiple app instances will require shared storage or an object-storage adapter.
- Integration tests must verify save/read/delete, path safety, access control, and end-to-end scan behavior; existing unit tests alone are insufficient.

## Implementation sequence

1. Introduce the storage interface and local adapter, with tests.
2. Update upload and background processing to use photo identifiers and storage reads.
3. Update display and deletion flows with authorization and lifecycle handling.
4. Remove `@vercel/blob` and its lockfile entry, update environment examples and deployment documentation.
5. Verify on Windows locally before configuring Lightsail.
