import { z } from "zod";

export const TransportSchema = z.enum(["camper", "car", "moto", "transit"]);
export type Transport = z.infer<typeof TransportSchema>;

export const PaceSchema = z.enum(["relaxed", "balanced", "intense"]);
export type Pace = z.infer<typeof PaceSchema>;

export const TripThemeSchema = z.enum([
  "scenic",
  "food",
  "culture",
  "nature",
  "sea",
  "villages",
  "relax",
  "adventure",
  "nightlife",
]);
export type TripTheme = z.infer<typeof TripThemeSchema>;

export const GEOGRAPHIC_AREA_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("polygon"),
    geojson: z.object({
      type: z.literal("Polygon"),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    }),
  }),
  z.object({
    kind: z.literal("radius"),
    centerLat: z.number(),
    centerLng: z.number(),
    radiusKm: z.number().min(1).max(500),
  }),
  z.object({
    kind: z.literal("corridor"),
    startQuery: z.string().min(1),
    endQuery: z.string().min(1),
    viaQueries: z.array(z.string()).optional(),
  }),
]);

export type GeographicArea = z.infer<typeof GEOGRAPHIC_AREA_SCHEMA>;

export const TIME_SPEC_SCHEMA = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("days_only"),
    days: z.number().int().min(1).max(21),
  }),
  z.object({
    mode: z.literal("date_range"),
    startDate: z.string(),
    endDate: z.string(),
  }),
]);

export type TimeSpec = z.infer<typeof TIME_SPEC_SCHEMA>;

/** Richiesta lato client → API generate */
export const GenerateItineraryRequestSchema = z.object({
  preferences: z.object({
    themes: z.array(TripThemeSchema).min(1),
    pace: PaceSchema,
  }),
  transport: TransportSchema,
  time: TIME_SPEC_SCHEMA,
  area: GEOGRAPHIC_AREA_SCHEMA,
  language: z.enum(["it", "en"]).default("it"),
});

export type GenerateItineraryRequest = z.infer<
  typeof GenerateItineraryRequestSchema
>;

const STOP_TYPE_VALUES = [
  "visit",
  "meal",
  "sleep",
  "parking",
  "camper_stop",
  "scenic",
  "fuel",
  "other",
] as const;

export const StopTypeSchema = z.preprocess((val) => {
  if (val == null || val === "") return "other";
  if (typeof val !== "string") return "other";
  const t = val.toLowerCase().trim();
  return STOP_TYPE_VALUES.includes(t as (typeof STOP_TYPE_VALUES)[number])
    ? t
    : "other";
}, z.enum(STOP_TYPE_VALUES));
export type StopType = z.infer<typeof StopTypeSchema>;

/** Output Gemini (prima del grounding) */
export const GeminiPlannedStopSchema = z.object({
  title: z.string(),
  type: StopTypeSchema,
  searchQuery: z.string(),
  dayIndex: z.coerce.number().int().min(1),
  orderInDay: z.coerce.number().int().min(0),
  notes: z.string().nullish(),
});

export const GeminiPlanSchema = z.object({
  summary: z.string(),
  bestPeriodNote: z.string().nullish(),
  days: z
    .array(
      z.object({
        dayIndex: z.coerce.number().int().min(1),
        label: z.string().nullish(),
        stops: z.array(GeminiPlannedStopSchema),
      })
    )
    .min(1),
});

export type GeminiPlan = z.infer<typeof GeminiPlanSchema>;

/** Tappa dopo grounding Maps */
export const GroundedStopSchema = z.object({
  title: z.string(),
  type: StopTypeSchema,
  dayIndex: z.number().int(),
  orderInDay: z.number().int(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  placeId: z.string().optional(),
  formattedAddress: z.string().optional(),
  mapsUrl: z.string().optional(),
  websiteUri: z.string().optional(),
  notes: z.string().optional(),
  groundingStatus: z.enum(["ok", "approximate", "not_found"]),
});

export const ItineraryDaySchema = z.object({
  dayIndex: z.number().int(),
  label: z.string().optional(),
  weatherSummary: z.string().optional(),
  stops: z.array(GroundedStopSchema),
});

export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

/** Tratto tra tappa i e i+1 (ordine globale giorno → orderInDay). */
export const ItineraryLegSchema = z.object({
  distanceKm: z.number().optional(),
  durationMin: z.number().optional(),
});

export type ItineraryLeg = z.infer<typeof ItineraryLegSchema>;

export const ItineraryResultSchema = z.object({
  id: z.string(),
  summary: z.string(),
  bestPeriodNote: z.string().optional(),
  transport: TransportSchema,
  days: z.array(ItineraryDaySchema),
  createdAt: z.string(),
  /** Lunghezza = numero tappe totali − 1, ordine di visita. */
  legs: z.array(ItineraryLegSchema).optional(),
});

export type ItineraryResult = z.infer<typeof ItineraryResultSchema>;
export type GroundedStop = z.infer<typeof GroundedStopSchema>;

export const InsertStopRequestSchema = z.object({
  itinerary: ItineraryResultSchema,
  newStopDescription: z.string().min(3),
  transport: TransportSchema,
  area: GEOGRAPHIC_AREA_SCHEMA,
  time: TIME_SPEC_SCHEMA,
  preferences: z.object({
    themes: z.array(TripThemeSchema).min(1),
    pace: PaceSchema,
  }),
  language: z.enum(["it", "en"]).default("it"),
});

export type InsertStopRequest = z.infer<typeof InsertStopRequestSchema>;
