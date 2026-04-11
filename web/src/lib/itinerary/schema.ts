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
    /** Vincoli testuali non negoziabili (es. “celiachia”, “no autostrada”). */
    hardConstraints: z.array(z.string().max(200)).max(12).optional(),
    /** Desideri “morbidi” che l’AI può bilanciare. */
    softWishes: z.array(z.string().max(200)).max(12).optional(),
  }),
  transport: TransportSchema,
  time: TIME_SPEC_SCHEMA,
  area: GEOGRAPHIC_AREA_SCHEMA,
  /** Luogo di partenza: la prima tappa del giorno 1 deve partire da qui. */
  startPlaceQuery: z.string().min(2),
  /** Ultima tappa desiderata (ultimo giorno), opzionale. */
  endPlaceQuery: z.string().optional(),
  /**
   * Se true: ogni giorno parte e termina alla stessa base (punto di partenza del giorno 1).
   * Utile per itinerari “a raggiera” con rientro serale.
   */
  returnToHubEachNight: z.boolean().optional().default(false),
  /** Preferisci strade secondarie / panoramiche (Directions con avoid highways). */
  preferScenicRoutes: z.boolean().optional().default(false),
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
  /** Breve motivazione della proposta (trasparente per l’utente). */
  aiRationale: z.string().nullish(),
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

/** Grounding: piano Gemini già ottenuto + stesso contesto della richiesta generate. */
export const GroundItineraryRequestSchema =
  GenerateItineraryRequestSchema.extend({
    plan: GeminiPlanSchema,
  });

export type GroundItineraryRequest = z.infer<typeof GroundItineraryRequestSchema>;

/** Tappa dopo grounding Maps */
export const StopStatusSchema = z.enum(["confirmed", "optional"]);
export type StopStatus = z.infer<typeof StopStatusSchema>;

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
  stopStatus: StopStatusSchema.optional(),
  aiRationale: z.string().optional(),
});

export const ItineraryDaySchema = z.object({
  dayIndex: z.number().int(),
  label: z.string().optional(),
  weatherSummary: z.string().optional(),
  /** Codice WMO da Open-Meteo (se date fisse). */
  weatherCode: z.number().optional(),
  /** Probabilità precipitazione giornaliera massima (%). */
  weatherPrecipProbMax: z.number().optional(),
  /** Vento massimo stimato (km/h). */
  weatherWindKmhMax: z.number().optional(),
  stops: z.array(GroundedStopSchema),
});

export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

/** Tratto tra tappa i e i+1 (ordine globale giorno → orderInDay). */
export const ItineraryLegSchema = z.object({
  distanceKm: z.number().optional(),
  durationMin: z.number().optional(),
  /** Overview polyline Google Directions (per disegno curvo in mappa). */
  encodedPolyline: z.string().optional(),
  /** Distanza stimata in linea d’aria (es. fallback se Directions non disponibile). */
  airDistanceOnly: z.boolean().optional(),
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
  /** Identificativo stabile del viaggio (collaborazione / sync futuri). */
  tripId: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
  updatedAt: z.string().optional(),
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
    hardConstraints: z.array(z.string().max(200)).max(12).optional(),
    softWishes: z.array(z.string().max(200)).max(12).optional(),
  }),
  startPlaceQuery: z.string().min(2).optional(),
  endPlaceQuery: z.string().optional(),
  returnToHubEachNight: z.boolean().optional(),
  preferScenicRoutes: z.boolean().optional(),
  language: z.enum(["it", "en"]).default("it"),
});

export type InsertStopRequest = z.infer<typeof InsertStopRequestSchema>;
