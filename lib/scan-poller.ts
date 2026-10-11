import type { ApiEnvelope } from "@/lib/api/envelope";

/** Options for startScanPoller. Timing knobs and fetcher are injectable for tests. */
export interface ScanPollerOptions {
  jobId: string;
  /** Called exactly once, with the first non-processing envelope (terminal result or error). */
  onResult: (body: ApiEnvelope) => void;
  /** Called on every still-processing poll: true once the scan is unusually long-running. */
  onSlowChange?: (slow: boolean) => void;
  fetcher?: (jobId: string) => Promise<ApiEnvelope>;
  now?: () => number;
  /** Interval while the scan is fresh (SC-001 expects ~5s under normal conditions). */
  fastIntervalMs?: number;
  /** Interval once the scan outlives slowAfterMs — less chatter for long-running scans. */
  slowIntervalMs?: number;
  /** Elapsed time after which polling switches from fast to slow. */
  slowAfterMs?: number;
  /** Elapsed time after which the UI is told the scan is taking unusually long. */
  slowNoticeAfterMs?: number;
}

const defaultFetcher = async (jobId: string): Promise<ApiEnvelope> => {
  const res = await fetch(`/api/v1/scans/${jobId}`);
  return (await res.json()) as ApiEnvelope;
};

/**
 * Polls a scan job until it reaches a terminal (non-processing) status, then stops.
 *
 * - No fixed timeout: a still-processing response is never reported as a result.
 * - The next poll is scheduled only after the current request settles, so requests
 *   never overlap and the cadence is bounded below by fastIntervalMs.
 * - Transient network errors keep polling at the slow cadence instead of stranding
 *   the scan UI.
 * - The returned cancel function stops polling immediately (unmount, new upload).
 */
export function startScanPoller(options: ScanPollerOptions): () => void {
  const {
    jobId,
    onResult,
    onSlowChange,
    fetcher = defaultFetcher,
    now = () => Date.now(),
    fastIntervalMs = 700,
    slowIntervalMs = 3000,
    slowAfterMs = 15000,
    slowNoticeAfterMs = 20000,
  } = options;

  const started = now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (ms: number) => {
    timer = setTimeout(() => void poll(), ms);
  };

  const poll = async (): Promise<void> => {
    if (cancelled) return;
    let body: ApiEnvelope;
    try {
      body = await fetcher(jobId);
    } catch {
      if (!cancelled) schedule(slowIntervalMs);
      return;
    }
    if (cancelled) return;
    if (body.status === "processing") {
      const elapsed = now() - started;
      onSlowChange?.(elapsed >= slowNoticeAfterMs);
      schedule(elapsed < slowAfterMs ? fastIntervalMs : slowIntervalMs);
      return;
    }
    onResult(body);
  };

  void poll();

  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}
