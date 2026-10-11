import { beforeEach, describe, expect, it, vi } from "vitest";

const inngestMock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/jobs/client", () => ({ inngest: inngestMock }));

import { scheduleVocabularyDiscovery } from "@/lib/services/nutrition/schedule-discovery";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("scheduleVocabularyDiscovery", () => {
  it("schedules a durable vocabulary/discover Inngest event for the confirmed name", async () => {
    inngestMock.send.mockResolvedValue({});

    await expect(scheduleVocabularyDiscovery("steak")).resolves.toBeUndefined();
    expect(inngestMock.send).toHaveBeenCalledWith({
      name: "vocabulary/discover",
      data: { description: "steak" },
    });
  });

  it("never throws when scheduling fails — corrections stay successful", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    inngestMock.send.mockRejectedValue(new Error("Inngest offline"));

    await expect(scheduleVocabularyDiscovery("steak")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});
