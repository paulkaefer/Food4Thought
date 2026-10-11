import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { foodVocabulary: db },
}));

import { findVerifiedFoodMapping, proposeFoodMapping } from "@/lib/services/nutrition/food-vocabulary";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("FoodVocabulary verification boundary", () => {
  it("does not return a proposed mapping as verified", async () => {
    db.findUnique.mockResolvedValue({
      id: "1", normalizedDescription: "fried bacon pieces",
      foodDescription: "fried bacon pieces", usdaFdcId: 123,
      usdaDescription: "Bacon, cooked", usdaDataType: "SR Legacy",
      verificationStatus: "proposed",
    });
    expect(await findVerifiedFoodMapping("fried bacon pieces")).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns a verified mapping and updates usage time", async () => {
    db.findUnique.mockResolvedValue({
      id: "1", normalizedDescription: "fried bacon pieces",
      foodDescription: "fried bacon pieces", usdaFdcId: 123,
      usdaDescription: "Bacon, cooked", usdaDataType: "SR Legacy",
      verificationStatus: "verified",
    });
    db.update.mockResolvedValue({});
    expect(await findVerifiedFoodMapping("Fried Bacon Pieces!")).toMatchObject({
      usdaFdcId: 123, normalizedDescription: "fried bacon pieces",
    });
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("creates proposals without granting verification", async () => {
    db.create.mockResolvedValue({});
    await proposeFoodMapping({
      foodDescription: "Fried bacon pieces", usdaFdcId: 123,
      usdaDescription: "Bacon, cooked", usdaDataType: "SR Legacy",
    });
    expect(db.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        normalizedDescription: "fried bacon pieces",
        verificationStatus: "proposed",
      }),
    });
  });

  it("ignores duplicate proposals without overwriting the existing decision", async () => {
    db.create.mockRejectedValue({ code: "P2002" });
    await expect(proposeFoodMapping({
      foodDescription: "Fried bacon pieces", usdaFdcId: 123,
      usdaDescription: "Bacon, cooked", usdaDataType: "SR Legacy",
    })).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("propagates unexpected database errors", async () => {
    db.create.mockRejectedValue(new Error("Database unavailable"));
    await expect(proposeFoodMapping({
      foodDescription: "Fried bacon pieces", usdaFdcId: 123,
      usdaDescription: "Bacon, cooked", usdaDataType: "SR Legacy",
    })).rejects.toThrow("Database unavailable");
  });
});
