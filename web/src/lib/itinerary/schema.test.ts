import { describe, it, expect } from "vitest";
import {
  GenerateItineraryRequestSchema,
  ItineraryResultSchema,
} from "./schema";

describe("GenerateItineraryRequestSchema", () => {
  it("accetta richiesta minima valida", () => {
    const parsed = GenerateItineraryRequestSchema.safeParse({
      preferences: { themes: ["food", "culture"], pace: "balanced" },
      transport: "car",
      time: { mode: "days_only", days: 3 },
      area: {
        kind: "radius",
        centerLat: 45,
        centerLng: 9,
        radiusKm: 30,
      },
      language: "it",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("ItineraryResultSchema", () => {
  it("valida itinerario con tappe", () => {
    const parsed = ItineraryResultSchema.safeParse({
      id: "x",
      summary: "Test",
      transport: "car",
      days: [
        {
          dayIndex: 1,
          stops: [
            {
              title: "Luogo",
              type: "visit",
              dayIndex: 1,
              orderInDay: 0,
              groundingStatus: "ok",
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });
});
