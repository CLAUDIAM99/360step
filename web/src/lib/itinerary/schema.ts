import { z } from "zod";

export const TransportSchema = z.enum(["camper", "car", "moto", "transit"]);
export type Transport = z.infer<typeof TransportSchema>;

export const PaceSchema = z.enum(["relaxed", "balanced", "intense"]);
export type Pace = z.infer<typeof PaceSchema>;

export const EnergyProfileSchema = z.enum(["low", "balanced", "high"]);
export type EnergyProfile = z.infer<typeof EnergyProfileSchema>;

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
    energyProfile: EnergyProfileSchema.optional().default("balanced"),
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
  /**
   * Se true: ogni giorno parte e termina dall’alloggio (tappa sleep).
   * La base del giorno è l’ULTIMO stop di tipo "sleep" in quel giorno.
   */
  accommodationAsBase: z.boolean().optional().default(false),
  /**
   * Se true e un giorno non ha un alloggio ("sleep"), riusa l’ultimo alloggio
   * noto dei giorni precedenti (utile quando si resta più notti nello stesso posto).
   */
  reuseAccommodationUntilChanged: z.boolean().optional().default(true),
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

export const DayHealthIssueCodeSchema = z.enum([
  "too_dense",
  "too_fragmented",
  "too_much_drive",
  "low_recovery_margin",
]);
export type DayHealthIssueCode = z.infer<typeof DayHealthIssueCodeSchema>;

export const DayHealthSuggestionSchema = z.object({
  id: z.string(),
  issueCode: DayHealthIssueCodeSchema,
  title: z.string(),
  explanation: z.string(),
  effect: z.string().optional(),
});
export type DayHealthSuggestion = z.infer<typeof DayHealthSuggestionSchema>;

export const DayHealthSchema = z.object({
  dayIndex: z.number().int(),
  loadScore: z.number().min(0).max(100),
  stopCount: z.number().int().nonnegative(),
  transitions: z.number().int().nonnegative(),
  visitMinutes: z.number().nonnegative(),
  driveMinutes: z.number().nonnegative(),
  totalMinutes: z.number().nonnegative(),
  recoveryMinutes: z.number().nonnegative(),
  issues: z.array(DayHealthIssueCodeSchema),
  suggestions: z.array(DayHealthSuggestionSchema),
});
export type DayHealth = z.infer<typeof DayHealthSchema>;

export const TripHealthSummarySchema = z.object({
  riskLevel: z.enum(["low", "moderate", "high"]),
  overloadDays: z.number().int().nonnegative(),
  warningDays: z.number().int().nonnegative(),
  averageLoadScore: z.number().min(0).max(100),
});
export type TripHealthSummary = z.infer<typeof TripHealthSummarySchema>;

export const RebalancingSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum(["move_stop", "mark_optional", "split_day_hint"]),
  reason: z.string(),
  fromDayIndex: z.number().int(),
  toDayIndex: z.number().int().optional(),
  stopKey: z.string().optional(),
  stopTitle: z.string().optional(),
  expectedImpact: z.string(),
});
export type RebalancingSuggestion = z.infer<typeof RebalancingSuggestionSchema>;

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
  dayHealth: z.array(DayHealthSchema).optional(),
  tripHealthSummary: TripHealthSummarySchema.optional(),
  rebalancingSuggestions: z.array(RebalancingSuggestionSchema).optional(),
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
    energyProfile: EnergyProfileSchema.optional().default("balanced"),
    hardConstraints: z.array(z.string().max(200)).max(12).optional(),
    softWishes: z.array(z.string().max(200)).max(12).optional(),
  }),
  startPlaceQuery: z.string().min(2).optional(),
  endPlaceQuery: z.string().optional(),
  returnToHubEachNight: z.boolean().optional(),
  accommodationAsBase: z.boolean().optional(),
  reuseAccommodationUntilChanged: z.boolean().optional(),
  preferScenicRoutes: z.boolean().optional(),
  language: z.enum(["it", "en"]).default("it"),
});

export type InsertStopRequest = z.infer<typeof InsertStopRequestSchema>;

export const RebalanceProposeRequestSchema = z.object({
  itinerary: ItineraryResultSchema,
  suggestion: RebalancingSuggestionSchema,
  ctx: z.object({
    transport: TransportSchema,
    pace: PaceSchema.optional().default("balanced"),
    energyProfile: EnergyProfileSchema.optional().default("balanced"),
    preferScenicRoutes: z.boolean().optional().default(false),
  }),
});
export type RebalanceProposeRequest = z.infer<typeof RebalanceProposeRequestSchema>;

export const RebalanceProposeResponseSchema = z.object({
  before: ItineraryResultSchema,
  afterPreview: ItineraryResultSchema,
  delta: z.object({
    riskLevelBefore: TripHealthSummarySchema.shape.riskLevel,
    riskLevelAfter: TripHealthSummarySchema.shape.riskLevel,
    averageLoadScoreBefore: z.number().min(0).max(100),
    averageLoadScoreAfter: z.number().min(0).max(100),
    overloadDaysBefore: z.number().int().nonnegative(),
    overloadDaysAfter: z.number().int().nonnegative(),
  }),
  explanation: z.string(),
});
export type RebalanceProposeResponse = z.infer<typeof RebalanceProposeResponseSchema>;

export const RebalanceApplyRequestSchema = RebalanceProposeRequestSchema;
export type RebalanceApplyRequest = z.infer<typeof RebalanceApplyRequestSchema>;
