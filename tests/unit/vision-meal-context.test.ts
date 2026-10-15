import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/ingestion/local-photo-storage", () => ({
  LocalPhotoStorage: class {
    async read() {
      return { bytes: Buffer.from("fake-image"), contentType: "image/jpeg" };
    }
  },
}));

import { OpenAiFoodVisionProvider } from "@/lib/services/vision/openai-adapter";
import { VisionProviderError } from "@/lib/services/vision/provider";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

function openAiResponse(payload: unknown) {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
    }),
    { status: 200 },
  );
}

const baseAnalysis = {
  contentClassification: "food",
  isLowQuality: false,
  foodCandidates: [
    {
      name: "grilled steak",
      confidence: 0.9,
      portionMinGrams: 150,
      portionMaxGrams: 250,
      hasAmbiguousAlternative: false,
      hasHiddenIngredients: false,
    },
  ],
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalKey;
  }
});

describe("OpenAI vision adapter meal context", () => {
  it("parses meal-level context from the analysis response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(openAiResponse({
      ...baseAnalysis,
      mealContext: {
        preparation: "grilled",
        accompaniments: "mashed potatoes, green beans",
        cuisineClues: "steakhouse plating",
        observations: "dark glossy sauce on the steak",
      },
    }));

    const result = await new OpenAiFoodVisionProvider().analyze("photo-id");

    expect(result.mealContext).toEqual({
      preparation: "grilled",
      accompaniments: "mashed potatoes, green beans",
      cuisineClues: "steakhouse plating",
      observations: "dark glossy sauce on the steak",
    });
    expect(result.foodCandidates).toHaveLength(1);
  });

  it("stays compatible with responses that omit mealContext or return null", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(openAiResponse(baseAnalysis));
    const without = await new OpenAiFoodVisionProvider().analyze("photo-id");
    expect(without.mealContext).toBeUndefined();

    globalThis.fetch = vi.fn().mockResolvedValue(openAiResponse({ ...baseAnalysis, mealContext: null }));
    const withNull = await new OpenAiFoodVisionProvider().analyze("photo-id");
    expect(withNull.mealContext).toBeUndefined();
  });

  it("asks for meal context in the same single vision request, visible evidence only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse(baseAnalysis));
    globalThis.fetch = fetchMock;

    await new OpenAiFoodVisionProvider().analyze("photo-id");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      input: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const text = prompt.input[0].content.find((part) => part.type === "input_text")?.text ?? "";
    expect(text).toContain("mealContext");
    expect(text).toContain("visible");
    expect(text).toContain("Never state hidden or unseen ingredients as fact");
  });

  it("still rejects malformed analysis output", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }],
      }), { status: 200 }),
    );

    await expect(new OpenAiFoodVisionProvider().analyze("photo-id")).rejects.toThrow(VisionProviderError);
  });
});
