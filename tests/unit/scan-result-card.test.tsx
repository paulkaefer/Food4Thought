// @vitest-environment jsdom
/**
 * USDA match correction feedback: the applied match and a pending dropdown selection are
 * visibly distinct, nutrition changes only after a successful Apply, failures surface
 * beside the match controls (including already-confirmed items), and a processing envelope
 * is never rendered as a result banner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScanResultCard } from "@/components/meal/scan-result-card";
import type { ApiEnvelope } from "@/lib/api/envelope";

const APPLIED_CANDIDATE = { fdcId: 111, description: "Sauce, pasta, cooked", dataType: "survey_fndds" };
const PENDING_CANDIDATE = { fdcId: 222, description: "Pasta, dry, enriched", dataType: "sr_legacy" };

/** Mirrors the reported real-world card: applied "Sauce, pasta (your choice)". */
const baseItem = {
  id: "item-1",
  name: "spaghetti pasta",
  identificationStatus: "confirmed",
  calories: 53,
  proteinG: 1,
  carbsG: 8,
  fatG: 2,
  nutritionIsApproximate: false,
  uncertaintyReason: null,
  dataSource: "visual_estimate",
  allergenLabels: [],
  usdaFdcId: APPLIED_CANDIDATE.fdcId,
  usdaDescription: APPLIED_CANDIDATE.description,
  usdaMatchSource: "user_selected",
  usdaCandidates: [APPLIED_CANDIDATE, PENDING_CANDIDATE],
};

const result: ApiEnvelope = {
  status: "identified",
  message: "Nom nom — here's what we found!",
  isFunEstimate: false,
  data: { mealLogEntry: { id: "meal-1" } },
};

function renderCard() {
  render(<ScanResultCard result={result} foodItems={[baseItem]} />);
}

function matchSelect(): HTMLSelectElement {
  return screen.getByLabelText("Change USDA match") as HTMLSelectElement;
}

afterEach(() => vi.unstubAllGlobals());

describe("ScanResultCard — USDA match feedback", () => {
  it("distinguishes the applied match from a pending dropdown selection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    // Applied state: the persisted match is named and the dropdown rests at its placeholder.
    expect(screen.getByText(/USDA match: Sauce, pasta \(your choice\)/)).toBeTruthy();
    expect(matchSelect().value).toBe("");
    expect(screen.queryByText(/Pending selection/)).toBeNull();

    fireEvent.change(matchSelect(), { target: { value: String(PENDING_CANDIDATE.fdcId) } });

    // Pending state is explicit, displayed nutrition is untouched, nothing was sent.
    expect(await screen.findByText(/Pending selection/)).toBeTruthy();
    expect(screen.getAllByText(/53 Calories/).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the pending selection and updates nutrition after a successful Apply", async () => {
    const updatedItem = {
      ...baseItem,
      calories: 120,
      proteinG: 4,
      carbsG: 22,
      fatG: 1,
      usdaFdcId: PENDING_CANDIDATE.fdcId,
      usdaDescription: PENDING_CANDIDATE.description,
      usdaMatchSource: "user_selected",
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        status: "identified",
        message: "Ingredient updated.",
        isFunEstimate: false,
        data: { foodItem: updatedItem, remainingFlags: [] },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.change(matchSelect(), { target: { value: String(PENDING_CANDIDATE.fdcId) } });
    fireEvent.click(screen.getByRole("button", { name: "Apply match" }));

    expect(await screen.findByText(/Ingredient confirmed/)).toBeTruthy();
    // Pending state cleared: dropdown returns to the placeholder and the hint disappears.
    expect(matchSelect().value).toBe("");
    expect(screen.queryByText(/Pending selection/)).toBeNull();
    // Nutrition now reflects the newly applied record.
    expect(screen.queryByText(/53 Calories/)).toBeNull();
    expect(screen.getAllByText(/120 Calories/).length).toBeGreaterThan(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/meal-log-entries/meal-1/food-items/item-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toMatchObject({
      confirmedName: "spaghetti pasta",
      usdaFdcId: PENDING_CANDIDATE.fdcId,
    });
  });

  it("shows an Apply error beside the match controls and leaves nutrition unchanged", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({
        status: "error",
        message: "That USDA record is unavailable right now; the meal was not changed.",
        isFunEstimate: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.change(matchSelect(), { target: { value: String(PENDING_CANDIDATE.fdcId) } });
    fireEvent.click(screen.getByRole("button", { name: "Apply match" }));

    const errorText = await screen.findByText(/unavailable right now/);
    expect(errorText.getAttribute("role")).toBe("alert");
    // Not successful and nothing changed: no confirmation text, applied match and
    // nutrition still reflect the previously applied record.
    expect(screen.queryByText(/Ingredient confirmed/)).toBeNull();
    expect(screen.getAllByText(/53 Calories/).length).toBeGreaterThan(0);
    expect(screen.getByText(/USDA match: Sauce, pasta \(your choice\)/)).toBeTruthy();
    // The failed choice stays visible as pending rather than looking applied.
    expect(matchSelect().value).toBe(String(PENDING_CANDIDATE.fdcId));
  });

  it("never renders the processing message as a result banner", () => {
    render(
      <ScanResultCard
        result={{ status: "processing", message: "Scanning your plate... hang tight!", isFunEstimate: false }}
        foodItems={[]}
      />,
    );
    expect(screen.queryByText(/hang tight/)).toBeNull();
  });
});
