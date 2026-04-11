"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Fuel,
  Loader2,
  MapPin,
  Moon,
  ParkingCircle,
  Sun,
  UtensilsCrossed,
  BedDouble,
  Mountain,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { LoadScript } from "@react-google-maps/api";
import { MapAreaPicker } from "@/components/wizard/MapAreaPicker";
import { ItineraryResultMap } from "@/components/wizard/ItineraryResultMap";
import { ItineraryStopDetailDialog } from "@/components/wizard/ItineraryStopDetailDialog";
import { PlaceAutocompleteField } from "@/components/wizard/PlaceAutocompleteInput";
import type {
  GenerateItineraryRequest,
  GroundedStop,
  ItineraryLeg,
  ItineraryResult,
  StopType,
  Pace,
  Transport,
  TripTheme,
  GeographicArea,
} from "@/lib/itinerary/schema";
import {
  STOP_TYPE_BADGE_CLASS,
  dayItineraryHex,
  dayListAccentClass,
} from "@/lib/itinerary/colors";
import { haversineKm } from "@/lib/geo/distance";
import { cn } from "@/lib/utils";

const INTRO_SESSION_KEY = "roamy-intro-done";
const INTRO_TRANSITION_MS = 520;

const THEME_OPTIONS: { id: TripTheme; label: string }[] = [
  { id: "scenic", label: "Paesaggistico" },
  { id: "food", label: "Food & vino" },
  { id: "culture", label: "Cultura & musei" },
  { id: "nature", label: "Natura & trekking" },
  { id: "sea", label: "Mare & costa" },
  { id: "villages", label: "Borghi & piccoli centri" },
  { id: "relax", label: "Relax" },
  { id: "adventure", label: "Avventura" },
  { id: "nightlife", label: "Vita notturna" },
];

const STORAGE_KEY = "roamy-wizard-draft-v1";

type StopTypeMeta = {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
};

const STOP_TYPE_META: Record<StopType, StopTypeMeta> = {
  visit: {
    label: "Tappa",
    icon: MapPin,
    badgeClass: STOP_TYPE_BADGE_CLASS.visit,
  },
  meal: {
    label: "Ristorante",
    icon: UtensilsCrossed,
    badgeClass: STOP_TYPE_BADGE_CLASS.meal,
  },
  sleep: {
    label: "Alloggio",
    icon: BedDouble,
    badgeClass: STOP_TYPE_BADGE_CLASS.sleep,
  },
  parking: {
    label: "Parcheggio",
    icon: ParkingCircle,
    badgeClass: STOP_TYPE_BADGE_CLASS.parking,
  },
  camper_stop: {
    label: "Area sosta",
    icon: ParkingCircle,
    badgeClass: STOP_TYPE_BADGE_CLASS.camper_stop,
  },
  scenic: {
    label: "Panoramica",
    icon: Mountain,
    badgeClass: STOP_TYPE_BADGE_CLASS.scenic,
  },
  fuel: {
    label: "Carburante",
    icon: Fuel,
    badgeClass: STOP_TYPE_BADGE_CLASS.fuel,
  },
  other: {
    label: "Altro",
    icon: MapPin,
    badgeClass: STOP_TYPE_BADGE_CLASS.other,
  },
};

function buildStopKey(stop: GroundedStop): string {
  return `${stop.dayIndex}:${stop.orderInDay}:${stop.placeId ?? stop.title}`;
}

function findStopByKey(
  itinerary: ItineraryResult,
  key: string
): GroundedStop | null {
  for (const d of itinerary.days) {
    for (const s of d.stops) {
      if (buildStopKey(s) === key) return s;
    }
  }
  return null;
}

function dayIndexFromStopKey(key: string): number | null {
  const n = Number(key.split(":")[0]);
  return Number.isFinite(n) ? n : null;
}

function googleMapsHref(stop: GroundedStop): string {
  if (stop.mapsUrl) return stop.mapsUrl;
  const query = encodeURIComponent(stop.formattedAddress ?? stop.title);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function legBetweenLabel(
  leg: ItineraryLeg | undefined,
  from: GroundedStop,
  to: GroundedStop | undefined
): string {
  let km = leg?.distanceKm;
  let airOnly = leg?.airDistanceOnly === true;
  if (
    (km == null || Number.isNaN(km)) &&
    from.lat != null &&
    from.lng != null &&
    to?.lat != null &&
    to?.lng != null
  ) {
    km = Math.round(haversineKm(
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng }
    ) * 10) / 10;
    airOnly = true;
  }
  const min = leg?.durationMin;
  if (km == null && min == null) return "→ Distanza non disponibile";
  const kmBase = km != null ? `circa ${km} km` : "—";
  const kmPart =
    airOnly && min == null ? `${kmBase} (linea d’aria)` : kmBase;
  const minPart = min != null ? `${min} min` : null;
  return minPart ? `→ ${kmPart} · ${minPart}` : `→ ${kmPart}`;
}

const defaultArea = (): GeographicArea => ({
  kind: "radius",
  centerLat: 45.4642,
  centerLng: 9.19,
  radiusKm: 50,
});

const MAPS_PUBLIC_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function WizardApp() {
  const [dark, setDark] = useState(false);
  const [step, setStep] = useState(0);
  const [themes, setThemes] = useState<TripTheme[]>(["scenic", "food"]);
  const [pace, setPace] = useState<Pace>("balanced");
  const [transport, setTransport] = useState<Transport>("car");
  const [timeTab, setTimeTab] = useState<"days" | "dates">("days");
  const [days, setDays] = useState(3);
  const [range, setRange] = useState<DateRange | undefined>();
  const [areaTab, setAreaTab] = useState<"polygon" | "radius" | "corridor">(
    "radius"
  );
  const [area, setArea] = useState<GeographicArea | null>(defaultArea());
  const [corridorStart, setCorridorStart] = useState("Milano");
  const [corridorEnd, setCorridorEnd] = useState("Genova");
  const [corridorVia, setCorridorVia] = useState("");
  /** Partenza / arrivo finale per Area disegnata e Raggio (A→B usa corridor). */
  const [tripStartQuery, setTripStartQuery] = useState("");
  const [tripEndQuery, setTripEndQuery] = useState("");
  /** Giorni espansi nella lista step 4 (default: tutti aperti). */
  const [dayListOpen, setDayListOpen] = useState<Record<number, boolean>>({});
  const [enterPhase, setEnterPhase] = useState<"idle" | "animating" | "done">(
    "idle"
  );
  const wizardPanelRef = useRef<HTMLElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [insertText, setInsertText] = useState("");
  const [insertLoading, setInsertLoading] = useState(false);
  const [activeStopKey, setActiveStopKey] = useState<string | null>(null);
  const [stopDetailOpen, setStopDetailOpen] = useState(false);
  const [mapFocusedDay, setMapFocusedDay] = useState<"all" | number>("all");
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});
  const stopRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const daySectionRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useLayoutEffect(() => {
    try {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(INTRO_SESSION_KEY)
      ) {
        setEnterPhase("done");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(d.themes)) setThemes(d.themes as TripTheme[]);
      if (typeof d.pace === "string") setPace(d.pace as Pace);
      if (typeof d.transport === "string")
        setTransport(d.transport as Transport);
      if (typeof d.days === "number") setDays(d.days);
      const rangeDraft = d.range as { from?: string; to?: string } | undefined;
      if (rangeDraft?.from && rangeDraft?.to) {
        setRange({
          from: new Date(rangeDraft.from),
          to: new Date(rangeDraft.to),
        });
      }
      if (d.area) setArea(d.area as GeographicArea);
      if (typeof d.tripStartQuery === "string")
        setTripStartQuery(d.tripStartQuery);
      if (typeof d.tripEndQuery === "string") setTripEndQuery(d.tripEndQuery);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const payload = {
      themes,
      pace,
      transport,
      days,
      range:
        range?.from && range?.to
          ? { from: range.from.toISOString(), to: range.to.toISOString() }
          : undefined,
      area,
      tripStartQuery,
      tripEndQuery,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [themes, pace, transport, days, range, area, tripStartQuery, tripEndQuery]);

  const progress = useMemo(() => ((step + 1) / 5) * 100, [step]);

  const onEnterApp = useCallback(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      try {
        sessionStorage.setItem(INTRO_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setEnterPhase("done");
      return;
    }
    setEnterPhase("animating");
    window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setEnterPhase("done");
    }, INTRO_TRANSITION_MS);
  }, []);

  const itineraryFlatRows = useMemo(() => {
    if (!result) {
      return [] as {
        key: string;
        stop: GroundedStop;
        dayIndex: number;
        weatherSummary: string | undefined;
        globalIndex: number;
        hasNext: boolean;
      }[];
    }
    const rows: {
      key: string;
      stop: GroundedStop;
      dayIndex: number;
      weatherSummary: string | undefined;
      globalIndex: number;
      hasNext: boolean;
    }[] = [];
    const sortedDays = [...result.days].sort((a, b) => a.dayIndex - b.dayIndex);
    let globalIndex = 0;
    for (const day of sortedDays) {
      const stops = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
      stops.forEach((s, i) => {
        rows.push({
          key: buildStopKey(s),
          stop: s,
          dayIndex: day.dayIndex,
          weatherSummary: i === 0 ? day.weatherSummary : undefined,
          globalIndex,
          hasNext: false,
        });
        globalIndex += 1;
      });
    }
    return rows.map((row, index) => ({
      ...row,
      globalIndex: index,
      hasNext: index < rows.length - 1,
    }));
  }, [result]);

  const rowsByDay = useMemo(() => {
    const byDay = new Map<number, (typeof itineraryFlatRows)[number][]>();
    for (const row of itineraryFlatRows) {
      const current = byDay.get(row.dayIndex) ?? [];
      current.push(row);
      byDay.set(row.dayIndex, current);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  }, [itineraryFlatRows]);

  const activeStop = useMemo(() => {
    if (!result || !activeStopKey) return null;
    return findStopByKey(result, activeStopKey);
  }, [result, activeStopKey]);

  useEffect(() => {
    if (!result) return;
    const next: Record<number, boolean> = {};
    for (const d of result.days) {
      next[d.dayIndex] = false;
    }
    setDayListOpen(next);
  }, [result]);

  useEffect(() => {
    if (!itineraryFlatRows.length) {
      setActiveStopKey(null);
      setExpandedStops({});
      setMapFocusedDay("all");
      return;
    }
    setActiveStopKey(itineraryFlatRows[0].key);
    setExpandedStops({});
    setMapFocusedDay("all");
  }, [itineraryFlatRows]);

  const onSelectStop = useCallback((key: string) => {
    setActiveStopKey(key);
    setExpandedStops((prev) => ({ ...prev, [key]: true }));
    const day = dayIndexFromStopKey(key);
    if (mapFocusedDay !== "all" && day != null) {
      setMapFocusedDay(day);
    }
    requestAnimationFrame(() => {
      stopRefs.current[key]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [mapFocusedDay]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedStops((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleTheme = (id: TripTheme) => {
    setThemes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleAreaMap = useCallback((next: GeographicArea | null) => {
    if (next) setArea(next);
  }, []);

  useEffect(() => {
    if (areaTab === "polygon") {
      setArea(null);
      return;
    }
    if (areaTab === "radius") {
      setArea((prev) =>
        prev?.kind === "radius" ? prev : defaultArea()
      );
      return;
    }
    setArea({
      kind: "corridor",
      startQuery: corridorStart,
      endQuery: corridorEnd,
      viaQueries: corridorVia
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }, [areaTab, corridorStart, corridorEnd, corridorVia]);

  const canNext = useMemo(() => {
    if (step === 0) return themes.length > 0;
    if (step === 2) {
      if (timeTab === "days") return days >= 1 && days <= 21;
      return Boolean(range?.from && range?.to);
    }
    if (step === 3) {
      if (areaTab === "corridor") {
        return corridorStart.trim().length > 1 && corridorEnd.trim().length > 1;
      }
      return (
        area !== null && tripStartQuery.trim().length >= 2
      );
    }
    return true;
  }, [
    step,
    themes.length,
    timeTab,
    days,
    range,
    areaTab,
    corridorStart,
    corridorEnd,
    area,
    tripStartQuery,
  ]);

  const buildRequest = useCallback((): GenerateItineraryRequest | null => {
    if (!area) return null;
    const time =
      timeTab === "days"
        ? { mode: "days_only" as const, days }
        : range?.from && range?.to
          ? {
              mode: "date_range" as const,
              startDate: format(range.from, "yyyy-MM-dd"),
              endDate: format(range.to, "yyyy-MM-dd"),
            }
          : null;
    if (!time) return null;
    const startPlaceQuery =
      areaTab === "corridor"
        ? corridorStart.trim()
        : tripStartQuery.trim();
    if (startPlaceQuery.length < 2) return null;
    const endRaw =
      areaTab === "corridor" ? corridorEnd.trim() : tripEndQuery.trim();
    return {
      preferences: { themes, pace },
      transport,
      time,
      area,
      startPlaceQuery,
      endPlaceQuery: endRaw.length > 0 ? endRaw : undefined,
      language: "it",
    };
  }, [
    area,
    areaTab,
    timeTab,
    days,
    range,
    themes,
    pace,
    transport,
    corridorStart,
    corridorEnd,
    tripStartQuery,
    tripEndQuery,
  ]);

  const onGenerate = async () => {
    const body = buildRequest();
    if (!body) {
      setError(
        "Completa date, area e luogo di partenza (almeno 2 caratteri)."
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ItineraryResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Errore generazione");
      }
      setResult(data as ItineraryResult);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  };

  const onInsertStop = async () => {
    if (!result || !insertText.trim() || !area) return;
    const time =
      timeTab === "days"
        ? { mode: "days_only" as const, days }
        : range?.from && range?.to
          ? {
              mode: "date_range" as const,
              startDate: format(range.from, "yyyy-MM-dd"),
              endDate: format(range.to, "yyyy-MM-dd"),
            }
          : null;
    if (!time) return;
    setInsertLoading(true);
    setError(null);
    try {
      const startQ =
        areaTab === "corridor"
          ? corridorStart.trim()
          : tripStartQuery.trim();
      const endQ =
        (areaTab === "corridor" ? corridorEnd.trim() : tripEndQuery.trim()) ||
        undefined;
      const res = await fetch("/api/itinerary/insert-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary: result,
          newStopDescription: insertText.trim(),
          transport,
          area,
          time,
          preferences: { themes, pace },
          language: "it",
          ...(startQ.length >= 2 ? { startPlaceQuery: startQ } : {}),
          ...(endQ ? { endPlaceQuery: endQ } : {}),
        }),
      });
      const data = (await res.json()) as ItineraryResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Errore inserimento tappa");
      setResult(data as ItineraryResult);
      setInsertText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setInsertLoading(false);
    }
  };

  const showIntroLayer = enterPhase !== "done";

  return (
    <div className="roamy-board min-h-screen">
      <div className="fixed right-4 top-4 z-50 md:right-8 md:top-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full border border-border/80 bg-card/90 shadow-sm backdrop-blur-sm"
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? "Tema chiaro" : "Tema scuro"}
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>
      </div>

      {showIntroLayer && (
        <section
          id="roamy-hero"
          className={cn(
            "relative flex min-h-[min(100dvh,880px)] flex-col justify-center px-4 pb-16 pt-12 transition-all duration-500 ease-out motion-reduce:transition-none md:pb-24 md:pt-16",
            enterPhase === "animating" &&
              "-translate-y-12 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
          )}
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground md:text-sm">
              Itinerari AI su misura
            </p>
            <h1 className="roamy-scribble-title text-[clamp(4rem,14vw,9.5rem)] leading-[0.88] text-primary drop-shadow-sm">
              Roamy
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-balance text-sm text-muted-foreground md:text-base">
              Tappe, mappe e idee in un solo flusso fluido.
            </p>
            <div className="mx-auto mt-12 max-w-xs">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full rounded-full text-base font-semibold shadow-lg"
                onClick={onEnterApp}
              >
                Entra
              </Button>
            </div>
          </div>
        </section>
      )}

      <main
        ref={wizardPanelRef}
        id="wizard-flow"
        className={cn(
          "mx-auto scroll-mt-6 px-4 pb-16 pt-2 transition-all duration-500 ease-out motion-reduce:transition-none",
          step === 4 && result ? "max-w-7xl pb-28 lg:pb-8" : "max-w-3xl",
          enterPhase === "idle" &&
            "pointer-events-none translate-y-6 opacity-0",
          enterPhase === "animating" && "translate-y-0 opacity-100",
          enterPhase === "done" && "translate-y-0 opacity-100"
        )}
      >
        <div className="mx-auto mb-6 max-w-3xl px-0">
          <Progress value={progress} className="h-1.5 rounded-full bg-muted" />
        </div>

        {error && (
          <p
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        {step === 0 && (
          <Card className="roamy-card">
            <CardHeader>
              <CardTitle className="font-display">Cosa ti interessa?</CardTitle>
              <CardDescription>
                Seleziona uno o più temi. Useremo queste preferenze per
                proporre tappe coerenti.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {THEME_OPTIONS.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/50",
                    themes.includes(t.id) && "border-primary bg-primary/5"
                  )}
                >
                  <Checkbox
                    checked={themes.includes(t.id)}
                    onCheckedChange={() => toggleTheme(t.id)}
                  />
                  <span className="text-sm font-medium">{t.label}</span>
                </label>
              ))}
            </CardContent>
            <CardContent className="pt-0">
              <Label className="mb-2 block">Ritmo</Label>
              <RadioGroup
                value={pace}
                onValueChange={(v) => setPace(v as Pace)}
                className="flex flex-wrap gap-3"
              >
                {(
                  [
                    ["relaxed", "Rilassato"],
                    ["balanced", "Equilibrato"],
                    ["intense", "Intenso"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={v}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <RadioGroupItem value={v} id={`pace-${v}`} />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="roamy-card">
            <CardHeader>
              <CardTitle className="font-display">Come viaggi?</CardTitle>
              <CardDescription>
                Camper, auto, moto o mezzi pubblici: adattiamo soste,
                parcheggi e suggerimenti.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={transport}
                onValueChange={(v) => setTransport(v as Transport)}
                className="grid gap-2"
              >
                {(
                  [
                    ["camper", "Camper"],
                    ["car", "Auto"],
                    ["moto", "Moto"],
                    ["transit", "Mezzi pubblici"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={v}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem value={v} id={`tr-${v}`} />
                    <span>{label}</span>
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="roamy-card">
            <CardHeader>
              <CardTitle className="font-display">Quando?</CardTitle>
              <CardDescription>
                Date fisse (con meteo) oppure solo numero di giorni: l’AI
                suggerirà anche il periodo migliore se non hai date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs
                value={timeTab}
                onValueChange={(v) => setTimeTab(v as "days" | "dates")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="days">Solo giorni</TabsTrigger>
                  <TabsTrigger value="dates">Date nel calendario</TabsTrigger>
                </TabsList>
                <TabsContent value="days" className="mt-4 space-y-2">
                  <Label htmlFor="days-only">Giorni di viaggio</Label>
                  <Input
                    id="days-only"
                    type="number"
                    min={1}
                    max={21}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value) || 1)}
                  />
                </TabsContent>
                <TabsContent value="dates" className="mt-4">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={range}
                    onSelect={setRange}
                    locale={it}
                    className="rounded-md border"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="roamy-card">
            <CardHeader>
              <CardTitle className="font-display">Dove?</CardTitle>
              <CardDescription>
                Disegna un’area sulla mappa, oppure un cerchio con raggio, oppure
                indica partenza e arrivo (con eventuali tappe intermedie).
              </CardDescription>
            </CardHeader>
            {MAPS_PUBLIC_KEY ? (
              <LoadScript
                googleMapsApiKey={MAPS_PUBLIC_KEY}
                libraries={["places"]}
                loadingElement={
                  <p className="px-6 py-4 text-sm text-muted-foreground">
                    Carico Google Maps e suggerimenti luoghi…
                  </p>
                }
              >
                <CardContent>
                  <Tabs
                    value={areaTab}
                    onValueChange={(v) =>
                      setAreaTab(v as "polygon" | "radius" | "corridor")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="polygon">Area disegnata</TabsTrigger>
                      <TabsTrigger value="radius">Raggio</TabsTrigger>
                      <TabsTrigger value="corridor">A → B</TabsTrigger>
                    </TabsList>
                    {(areaTab === "polygon" || areaTab === "radius") && (
                      <>
                        <div className="mt-4">
                          <MapAreaPicker
                            mode={areaTab === "polygon" ? "polygon" : "radius"}
                            onAreaChange={handleAreaMap}
                          />
                        </div>
                        <div className="mt-4 space-y-3 border-t border-border pt-4">
                          <PlaceAutocompleteField
                            id="trip-start"
                            label="Luogo di partenza (obbligatorio)"
                            placeholder="Prima tappa: città o indirizzo di partenza"
                            value={tripStartQuery}
                            onChange={setTripStartQuery}
                          />
                          <PlaceAutocompleteField
                            id="trip-end"
                            label="Ultima tappa desiderata (opzionale)"
                            placeholder="Dove vuoi concludere il viaggio"
                            value={tripEndQuery}
                            onChange={setTripEndQuery}
                          />
                        </div>
                      </>
                    )}
                    <TabsContent value="corridor" className="mt-4 space-y-3">
                      <PlaceAutocompleteField
                        id="cs"
                        label="Partenza"
                        placeholder="Inizia a digitare: città o indirizzo"
                        value={corridorStart}
                        onChange={setCorridorStart}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="cv">Tappe intermedie (opzionale)</Label>
                        <Input
                          id="cv"
                          value={corridorVia}
                          onChange={(e) => setCorridorVia(e.target.value)}
                          placeholder="Separate da virgola"
                        />
                      </div>
                      <PlaceAutocompleteField
                        id="ce"
                        label="Arrivo"
                        placeholder="Inizia a digitare: città o indirizzo"
                        value={corridorEnd}
                        onChange={setCorridorEnd}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </LoadScript>
            ) : (
              <CardContent>
                <Tabs
                  value={areaTab}
                  onValueChange={(v) =>
                    setAreaTab(v as "polygon" | "radius" | "corridor")
                  }
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="polygon">Area disegnata</TabsTrigger>
                    <TabsTrigger value="radius">Raggio</TabsTrigger>
                    <TabsTrigger value="corridor">A → B</TabsTrigger>
                  </TabsList>
                  {(areaTab === "polygon" || areaTab === "radius") && (
                    <>
                      <div className="mt-4">
                        <MapAreaPicker
                          mode={areaTab === "polygon" ? "polygon" : "radius"}
                          onAreaChange={handleAreaMap}
                        />
                      </div>
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        <div className="space-y-1">
                          <Label htmlFor="trip-start-fb">
                            Luogo di partenza (obbligatorio)
                          </Label>
                          <Input
                            id="trip-start-fb"
                            value={tripStartQuery}
                            onChange={(e) => setTripStartQuery(e.target.value)}
                            placeholder="Città o indirizzo di partenza"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="trip-end-fb">
                            Ultima tappa desiderata (opzionale)
                          </Label>
                          <Input
                            id="trip-end-fb"
                            value={tripEndQuery}
                            onChange={(e) => setTripEndQuery(e.target.value)}
                            placeholder="Opzionale"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  <TabsContent value="corridor" className="mt-4 space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="cs-fallback">Partenza</Label>
                      <Input
                        id="cs-fallback"
                        value={corridorStart}
                        onChange={(e) => setCorridorStart(e.target.value)}
                        placeholder="Città o indirizzo"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cv-fallback">Tappe intermedie (opzionale)</Label>
                      <Input
                        id="cv-fallback"
                        value={corridorVia}
                        onChange={(e) => setCorridorVia(e.target.value)}
                        placeholder="Separate da virgola"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ce-fallback">Arrivo</Label>
                      <Input
                        id="ce-fallback"
                        value={corridorEnd}
                        onChange={(e) => setCorridorEnd(e.target.value)}
                        placeholder="Città o indirizzo"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                <p className="mt-3 text-xs text-muted-foreground">
                  Per mappa e suggerimenti luoghi serve{" "}
                  <code className="rounded bg-muted px-1">
                    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                  </code>
                  .
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {step === 4 && result && (
          <Card className="roamy-card">
            <CardHeader className="pb-2">
              <CardTitle className="font-display">Il tuo itinerario</CardTitle>
              <CardDescription className="sr-only">
                Tappe, mappa e distanze tra una tappa e l&apos;altra.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0 space-y-4">
                  <div
                    className="rounded-xl border border-border/80 bg-muted/35 p-2 dark:bg-muted/25"
                    role="tablist"
                    aria-label="Filtra giorni sulla mappa"
                  >
                    <div className="flex flex-wrap gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <Button
                        type="button"
                        role="tab"
                        size="sm"
                        variant={mapFocusedDay === "all" ? "default" : "outline"}
                        aria-pressed={mapFocusedDay === "all"}
                        className="shrink-0 rounded-full"
                        onClick={() => setMapFocusedDay("all")}
                      >
                        Tutti i giorni
                      </Button>
                      {rowsByDay.map(([dayIndex]) => (
                        <Button
                          key={dayIndex}
                          type="button"
                          role="tab"
                          size="sm"
                          variant={
                            mapFocusedDay === dayIndex ? "default" : "outline"
                          }
                          aria-pressed={mapFocusedDay === dayIndex}
                          className="shrink-0 rounded-full"
                          onClick={() => {
                            setMapFocusedDay(dayIndex);
                            requestAnimationFrame(() => {
                              daySectionRefs.current[dayIndex]?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            });
                          }}
                        >
                          Giorno {dayIndex}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <ScrollArea className="h-[min(420px,50vh)] pr-3 lg:h-[min(520px,62vh)]">
                    <div className="space-y-4">
                      {rowsByDay.map(([dayIndex, dayRows]) => (
                        <section
                          key={dayIndex}
                          ref={(el) => {
                            daySectionRefs.current[dayIndex] = el;
                          }}
                          style={{
                            borderLeftColor: dayItineraryHex(dayIndex),
                          }}
                          className={cn(
                            "overflow-hidden rounded-xl border border-border/70 bg-card/50 shadow-sm transition-opacity dark:bg-card/40",
                            "pl-0",
                            dayListAccentClass(dayIndex),
                            mapFocusedDay !== "all" &&
                              mapFocusedDay !== dayIndex &&
                              "opacity-45"
                          )}
                        >
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2.5 text-left dark:bg-muted/30"
                            onClick={() =>
                              setDayListOpen((p) => ({
                                ...p,
                                [dayIndex]: !(p[dayIndex] ?? false),
                              }))
                            }
                            aria-expanded={dayListOpen[dayIndex] ?? false}
                          >
                            {dayListOpen[dayIndex] ?? false ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <Badge variant="secondary" className="text-xs">
                              Giorno {dayIndex}
                            </Badge>
                            {dayRows[0]?.weatherSummary && (
                              <span className="text-xs text-muted-foreground">
                                {dayRows[0].weatherSummary}
                              </span>
                            )}
                          </button>
                          {(dayListOpen[dayIndex] ?? false) && (
                          <ul className="space-y-2 p-3">
                            {dayRows.map((row) => {
                              const typeMeta = STOP_TYPE_META[row.stop.type];
                              const TypeIcon = typeMeta.icon;
                              const expanded = !!expandedStops[row.key];
                              const isActive = activeStopKey === row.key;
                              return (
                                <li
                                  key={row.key}
                                  ref={(el) => {
                                    stopRefs.current[row.key] = el;
                                  }}
                                  className="space-y-2"
                                >
                                  <div
                                    style={{
                                      borderLeftColor: dayItineraryHex(dayIndex),
                                    }}
                                    className={cn(
                                      "rounded-lg border border-l-[3px] p-3 text-sm transition-colors",
                                      isActive
                                        ? "border-primary bg-primary/5"
                                        : "bg-background",
                                      mapFocusedDay !== "all" &&
                                        mapFocusedDay !== dayIndex &&
                                        "opacity-45"
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSelectStop(row.key);
                                        toggleExpanded(row.key);
                                      }}
                                      className="flex w-full items-start justify-between gap-3 text-left"
                                    >
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-medium">
                                            {row.stop.title}
                                          </span>
                                          <span
                                            className={cn(
                                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                                              typeMeta.badgeClass
                                            )}
                                          >
                                            <TypeIcon className="h-3.5 w-3.5" />
                                            {typeMeta.label}
                                          </span>
                                          {row.stop.groundingStatus === "not_found" && (
                                            <span className="text-[11px] text-muted-foreground">
                                              da verificare · tratto mappa può mancare
                                            </span>
                                          )}
                                        </div>
                                        {row.stop.formattedAddress && (
                                          <p className="text-xs text-muted-foreground">
                                            {row.stop.formattedAddress}
                                          </p>
                                        )}
                                      </div>
                                      {expanded ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </button>

                                    {expanded && (
                                      <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                                        <a
                                          href={googleMapsHref(row.stop)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 font-medium text-primary underline"
                                        >
                                          <MapPin className="h-3.5 w-3.5" />
                                          Apri su Google Maps
                                        </a>
                                        {row.stop.notes && (
                                          <p className="text-muted-foreground">
                                            {row.stop.notes}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {row.hasNext && (
                                    <div
                                      style={{
                                        borderColor: dayItineraryHex(row.dayIndex),
                                        backgroundColor: `color-mix(in srgb, ${dayItineraryHex(row.dayIndex)} 12%, transparent)`,
                                      }}
                                      className="rounded-md border border-dashed px-3 py-2"
                                      onClick={() => onSelectStop(row.key)}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          onSelectStop(row.key);
                                        }
                                      }}
                                    >
                                      <p
                                        className="flex items-center gap-2 text-xs font-medium"
                                        style={{ color: dayItineraryHex(row.dayIndex) }}
                                      >
                                        <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-90" />
                                        <span className="text-foreground/90">
                                          {legBetweenLabel(
                                            result.legs?.[row.globalIndex],
                                            row.stop,
                                            itineraryFlatRows[row.globalIndex + 1]
                                              ?.stop
                                          )}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          )}
                        </section>
                      ))}
                    </div>
                  </ScrollArea>

                  <details className="rounded-xl border border-dashed border-border/80 bg-background/60 p-4 text-sm shadow-inner dark:bg-background/30">
                    <summary className="cursor-pointer font-medium text-foreground">
                      Dettagli itinerario
                    </summary>
                    <div className="mt-3 space-y-2 text-muted-foreground">
                      <p>{result.summary}</p>
                      {result.bestPeriodNote && (
                        <p className="text-xs">{result.bestPeriodNote}</p>
                      )}
                    </div>
                  </details>
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl ring-1 ring-border/80 ring-offset-2 ring-offset-background dark:ring-offset-background">
                    <ItineraryResultMap
                      result={result}
                      activeStopKey={activeStopKey}
                      focusedDay={mapFocusedDay}
                      onStopSelect={onSelectStop}
                    />
                  </div>
                  {activeStop && (
                    <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm">
                      <p className="text-sm font-semibold leading-tight">
                        {activeStop.title}
                      </p>
                      {activeStop.formattedAddress && (
                        <p className="text-xs text-muted-foreground">
                          {activeStop.formattedAddress}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={!activeStop.placeId}
                          onClick={() => setStopDetailOpen(true)}
                        >
                          Per saperne di più
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={googleMapsHref(activeStop)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Apri in Maps
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                  <ItineraryStopDetailDialog
                    open={stopDetailOpen}
                    onOpenChange={setStopDetailOpen}
                    stop={activeStop}
                  />
                  <div className="hidden space-y-2 rounded-xl border border-border/60 bg-muted/25 p-4 shadow-sm dark:bg-muted/20 lg:block">
                    <Label htmlFor="insert-desktop">
                      Aggiungi una tappa da non perdere
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="insert-desktop"
                        value={insertText}
                        onChange={(e) => setInsertText(e.target.value)}
                        placeholder="Es. cantina in collina, museo X…"
                      />
                      <Button
                        type="button"
                        onClick={onInsertStop}
                        disabled={insertLoading || !insertText.trim()}
                      >
                        {insertLoading && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Inserisci con AI
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
                <div className="mx-auto max-w-7xl space-y-2">
                  <Label htmlFor="insert-mobile" className="text-xs">
                    Aggiungi una tappa
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="insert-mobile"
                      value={insertText}
                      onChange={(e) => setInsertText(e.target.value)}
                      placeholder="Es. cantina, museo…"
                    />
                    <Button
                      type="button"
                      onClick={onInsertStop}
                      disabled={insertLoading || !insertText.trim()}
                      className="shrink-0"
                    >
                      {insertLoading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Inserisci
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 flex flex-wrap justify-between gap-3">
          {step > 0 && step < 4 && (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
              Indietro
            </Button>
          )}
          {step < 3 && (
            <Button
              type="button"
              className="ml-auto"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              Avanti
            </Button>
          )}
          {step === 3 && (
            <Button
              type="button"
              className="ml-auto"
              disabled={!canNext || loading}
              onClick={onGenerate}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Genera itinerario
            </Button>
          )}
          {step === 4 && result && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  sessionStorage.removeItem(INTRO_SESSION_KEY);
                } catch {
                  /* ignore */
                }
                setEnterPhase("idle");
                setStep(0);
                setResult(null);
                requestAnimationFrame(() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                });
              }}
            >
              Nuovo itinerario
            </Button>
          )}
        </div>

        <footer className="mt-12 space-y-3 border-t pt-8 text-xs text-muted-foreground">
          <p>
            Roamy usa modelli AI e dati Google Maps / Open-Meteo. Verifica
            sempre indirizzi, orari e viabilità prima di partire. Nessuna
            garanzia su disponibilità di parcheggi o aree sosta.
          </p>
        </footer>
      </main>
    </div>
  );
}
