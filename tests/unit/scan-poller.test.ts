/**
 * Scan-job poller: no fixed timeout (a still-processing response is never a result),
 * fast-then-slow cadence, no overlapping requests, and immediate cancellation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScanPoller } from "@/lib/scan-poller";
import type { ApiEnvelope } from "@/lib/api/envelope";

const PROCESSING: ApiEnvelope = {
  status: "processing",
  message: "Scanning your plate... hang tight!",
  isFunEstimate: false,
};
const IDENTIFIED: ApiEnvelope = {
  status: "identified",
  message: "Nom nom — here's what we found!",
  isFunEstimate: false,
  data: { mealLogEntry: { id: "meal-1", foodItems: [] } },
};

describe("startScanPoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps polling past 15 s while the scan remains processing", async () => {
    const fetcher = vi.fn().mockResolvedValue(PROCESSING);
    const onResult = vi.fn();
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult });

    await vi.advanceTimersByTimeAsync(30000);

    expect(onResult).not.toHaveBeenCalled();
    // The old 15 s cap would have stopped at ~22 requests; polling must continue.
    expect(fetcher.mock.calls.length).toBeGreaterThan(22);
    cancel();
  });

  it("polls fast initially, then slows down for long-running scans", async () => {
    const fetcher = vi.fn().mockResolvedValue(PROCESSING);
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult: vi.fn() });

    // First 14 s at the fast cadence (~700 ms): ~21 requests.
    await vi.advanceTimersByTimeAsync(14000);
    const callsAt14s = fetcher.mock.calls.length;
    expect(callsAt14s).toBeGreaterThanOrEqual(19);
    expect(callsAt14s).toBeLessThanOrEqual(22);

    // The next 14 s at the slow cadence (~3000 ms): only a handful more.
    await vi.advanceTimersByTimeAsync(14000);
    const extra = fetcher.mock.calls.length - callsAt14s;
    expect(extra).toBeGreaterThanOrEqual(4);
    expect(extra).toBeLessThanOrEqual(6);
    cancel();
  });

  it("flags unusually long processing without treating it as a result", async () => {
    const fetcher = vi.fn().mockResolvedValue(PROCESSING);
    const onSlowChange = vi.fn();
    const onResult = vi.fn();
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult, onSlowChange });

    await vi.advanceTimersByTimeAsync(22000);

    expect(onSlowChange).toHaveBeenCalledWith(true);
    expect(onResult).not.toHaveBeenCalled();
    cancel();
  });

  it("stops polling on a terminal status", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(PROCESSING)
      .mockResolvedValueOnce(PROCESSING)
      .mockResolvedValue(IDENTIFIED);
    const onResult = vi.fn();
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult });

    await vi.advanceTimersByTimeAsync(5000);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(IDENTIFIED);
    const callsAtResult = fetcher.mock.calls.length;

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher.mock.calls.length).toBe(callsAtResult);
    cancel();
  });

  it("never overlaps requests: the next poll waits for the current one to settle", async () => {
    let resolvePending: ((body: ApiEnvelope) => void) | null = null;
    const fetcher = vi.fn(
      () =>
        new Promise<ApiEnvelope>((resolve) => {
          resolvePending = resolve;
        }),
    );
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult: vi.fn() });

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolvePending!(PROCESSING);
    await vi.advanceTimersByTimeAsync(800);
    expect(fetcher).toHaveBeenCalledTimes(2);
    cancel();
  });

  it("stops immediately when cancelled", async () => {
    const fetcher = vi.fn().mockResolvedValue(PROCESSING);
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult: vi.fn() });

    await vi.advanceTimersByTimeAsync(1400);
    const callsBeforeCancel = fetcher.mock.calls.length;
    expect(callsBeforeCancel).toBeGreaterThan(1);

    cancel();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetcher.mock.calls.length).toBe(callsBeforeCancel);
  });

  it("keeps polling at the slow cadence through transient network errors", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue(PROCESSING);
    const onResult = vi.fn();
    const cancel = startScanPoller({ jobId: "job-1", fetcher, onResult });

    await vi.advanceTimersByTimeAsync(1); // first poll rejects
    await vi.advanceTimersByTimeAsync(30000);

    expect(onResult).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.length).toBeGreaterThan(5);
    cancel();
  });
});
