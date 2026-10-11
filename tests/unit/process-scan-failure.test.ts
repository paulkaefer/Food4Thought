/**
 * Exhausted Inngest retries: the failure handler moves a still-processing scan to an
 * existing terminal status so polling clients stop, and it is structurally unable to
 * overwrite a scan that already completed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { mealLogEntry: { updateMany: mocks.updateMany } },
}));

import { handleProcessScanFailure } from "@/lib/jobs/process-scan-failure";

function failureEvent(mealLogEntryId?: string) {
  return {
    name: "inngest/function.failed",
    data: {
      function_id: "food4thought-process-scan",
      run_id: "run-1",
      error: { name: "Error", message: "boom" },
      event: {
        name: "scan/submitted",
        data: mealLogEntryId === undefined ? {} : { mealLogEntryId },
      },
    },
  };
}

describe("handleProcessScanFailure", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("moves a still-processing scan to a terminal status, guarded against overwriting success", async () => {
    await handleProcessScanFailure(failureEvent("meal-1"), new Error("boom"));

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      // The status predicate is the no-overwrite guarantee for completed scans.
      where: { id: "meal-1", status: "processing" },
      data: { status: "rejected_low_quality" },
    });
  });

  it("does nothing when the failure event carries no mealLogEntryId", async () => {
    await handleProcessScanFailure(failureEvent(), new Error("boom"));
    await handleProcessScanFailure({}, new Error("boom"));

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not throw when the scan already reached a terminal status", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(handleProcessScanFailure(failureEvent("meal-1"), new Error("boom"))).resolves.toBeUndefined();
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });
});
