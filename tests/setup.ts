import { vi } from "vitest";

/**
 * Integration tests exercise the real nutrition pipeline, which reads
 * process.env.USDA_FDC_API_KEY. If a developer shell (or CI) has a real key
 * set, tests would make live USDA calls and assert against network-dependent
 * results. Blank the key so nutrition lookups deterministically exercise the
 * approximate/unavailable fallback paths. USDA client behavior itself is
 * covered by unit tests that pass an explicit key (usda-fdc-id, usda-name-match).
 */
vi.stubEnv("USDA_FDC_API_KEY", "");
