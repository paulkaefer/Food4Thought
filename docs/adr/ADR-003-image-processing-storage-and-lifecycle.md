# ADR-003: Image Processing, Storage, and Lifecycle

- Status: Accepted as initial implementation baseline; parameters subject to empirical testing
- Date: 2026-10-08
- Scope: Food4Thought photo ingestion, storage, analysis, and deletion
- Related: ADR-001 (AI vision and nutrition); ADR-002 (portable deployment and self-hosting)

## Context

Modern smartphone images may be several megabytes and much larger than needed for food recognition. The existing scan route accepts a multipart photo, validates it, stores it using Vercel Blob with public access, records the returned URL, and dispatches an Inngest scan event. The storage implementation currently requires a Vercel token. Our target is a portable deployment on AWS Lightsail or a local machine, with controlled storage growth and appropriate photo privacy.

## Decision

1. **Optimize in the browser before upload.** Preserve orientation and aspect ratio; do not upscale. Start with a maximum longest edge of **1536 pixels**, JPEG or WebP as supported, and approximately **80–85% encoding quality**. Aim for roughly **200–600 KB** for typical meal images, but treat that as a goal, not a rejection threshold. Remove unnecessary metadata, including location metadata. Keep the original on the user's device rather than uploading it.
2. **Enforce server-side validation independently.** Start with a **2 MB maximum for the optimized upload**. Validate actual image type, dimensions, and decoding; reject malformed files and oversized payloads. Apply appropriate request-body limits to avoid excessive memory consumption. Never trust browser validation alone.
3. **Store optimized photos privately.** Introduce a provider boundary for photo storage. The first portable implementation may use a private filesystem outside the web-served directory, with stable opaque identifiers; keep the Vercel Blob adapter optional. PostgreSQL stores image references and metadata, not image bytes. Do not make photos publicly accessible merely to support AI analysis.
4. **Support controlled AI access.** The server-side vision adapter must read private images through an authenticated internal path or provider interface; do not assume a public URL. Do not send oversized originals to OpenAI. Preserve the ability to retry at higher detail if testing demonstrates a need, without silently retaining originals on the server.
5. **Define lifecycle and operational safeguards.** Keep the optimized image for meal-journal display pending a separate explicit retention/deletion policy. Ensure user deletion removes associated stored photos, address orphan cleanup and failed uploads, and document backup, capacity monitoring, permissions, and restore procedures for local/Lightsail storage.
6. **Measure recognition quality before tightening settings.** Compare representative photos at 768, 1024, and 1536 pixels against original-resolution baselines for missed foods, ambiguous ingredients, and portion uncertainty. Revisit image settings if results degrade.

## Consequences

- Reduced upload bandwidth, persistent storage, and unnecessary image transfer to AI.
- Browser processing improves efficiency but is not a security boundary; server checks remain mandatory.
- Private local storage requires explicit backup, access-control, capacity, and cleanup responsibilities.
- Existing scan and vision interfaces may need adaptation from public URLs to secure image references.
- Upload limits and compression parameters are configurable engineering defaults, not guarantees of recognition accuracy.

## Implementation sequence

1. Inspect the existing upload validation, browser capture/upload component, and photo consumers.
2. Implement and test browser-side normalization/compression and previews.
3. Harden server upload validation and request-size handling.
4. Add private portable storage and secure vision retrieval, preserving adapter boundaries.
5. Add lifecycle cleanup and operational documentation.
6. Run image-quality/recognition tests and adjust defaults based on evidence.
