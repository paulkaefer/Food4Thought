// @vitest-environment jsdom
/**
 * Scan-page polling wiring: processing responses past 15 s keep polling (and never render
 * the "hang tight" copy as a result banner), long scans get a non-terminal notice, and
 * polling stops on terminal status and unmount.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ScanPage from "@/app/scan/page";
import type { ApiEnvelope } from "@/lib/api/envelope";

vi.mock("@/lib/services/ingestion/optimize-image", () => ({
  optimizeMealPhoto: vi.fn(async (file: File) => file),
}));

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

/** Mock fetch: POST submits the scan; GET returns queued poll bodies (last one repeats). */
function installFetchMock(pollBodies: ApiEnvelope[]) {
  let pollIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/scans" && init?.method === "POST") {
      return {
        ok: true,
        status: 202,
        json: async () => ({ ...PROCESSING, data: { jobId: "job-1" } }),
      } as Response;
    }
    const body = pollBodies[Math.min(pollIndex, pollBodies.length - 1)];
    pollIndex += 1;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function uploadPhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["fake-jpeg"], "plate.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

function pollCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes("/api/v1/scans/job-1")).length;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("ScanPage polling", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps polling past 15 s and never shows the processing message as a result banner", async () => {
    const fetchMock = installFetchMock([PROCESSING]);
    render(<ScanPage />);
    await uploadPhoto();

    await advance(30000);

    expect(pollCount(fetchMock)).toBeGreaterThan(15);
    expect(screen.getByText("Scanning...")).toBeTruthy();
    expect(screen.queryByText(/hang tight/)).toBeNull();
  });

  it("shows a clear, non-terminal notice when processing takes unusually long", async () => {
    installFetchMock([PROCESSING]);
    render(<ScanPage />);
    await uploadPhoto();

    await advance(22000);

    expect(screen.getByText(/taking longer than usual/)).toBeTruthy();
    expect(screen.getByText("Scanning...")).toBeTruthy();
    expect(screen.queryByText(/hang tight/)).toBeNull();
  });

  it("stops polling once the scan reaches a terminal status", async () => {
    const fetchMock = installFetchMock([PROCESSING, PROCESSING, IDENTIFIED]);
    render(<ScanPage />);
    await uploadPhoto();

    await advance(5000);

    expect(screen.getByText(/Nom nom/)).toBeTruthy();
    expect(screen.queryByText("Scanning...")).toBeNull();
    const pollsAtResult = pollCount(fetchMock);

    await advance(10000);
    expect(pollCount(fetchMock)).toBe(pollsAtResult);
  });

  it("stops polling when the page unmounts", async () => {
    const fetchMock = installFetchMock([PROCESSING]);
    const { unmount } = render(<ScanPage />);
    await uploadPhoto();

    await advance(2100);
    const pollsBeforeUnmount = pollCount(fetchMock);
    expect(pollsBeforeUnmount).toBeGreaterThan(1);

    act(() => unmount());
    await advance(10000);
    expect(pollCount(fetchMock)).toBe(pollsBeforeUnmount);
  });
});
