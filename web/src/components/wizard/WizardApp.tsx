"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ArrowDown,
  ChevronDown,
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
import { cn } from "@/lib/utils";

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
    badgeClass:
      "border border-[hsl(355_30%_78%)] bg-[hsl(355_35%_94%)] text-[hsl(355_42%_28%)] dark:border-[hsl(355_25%_35%)] dark:bg-[hsl(355_22%_18%)] dark:text-[hsl(355_35%_88%)]",
  },
  meal: {
    label: "Ristorante",
    icon: UtensilsCrossed,
    badgeClass:
      "border border-[hsl(18_35%_78%)] bg-[hsl(22_40%_93%)] text-[hsl(18_45%_30%)] dark:border-[hsl(18_28%_32%)] dark:bg-[hsl(18_22%_18%)] dark:text-[hsl(28_40%_88%)]",
  },
  sleep: {
    label: "Alloggio",
    icon: BedDouble,
    badgeClass:
      "border border-[hsl(285_22%_78%)] bg-[hsl(285_28%_93%)] text-[hsl(285_35%_32%)] dark:border-[hsl(285_22%_32%)] dark:bg-[hsl(285_18%_18%)] dark:text-[hsl(285_35%_88%)]",
  },
  parking: {
    label: "Parcheggio",
    icon: ParkingCircle,
    badgeClass:
      "border border-[hsl(38_32%_72%)] bg-[hsl(38_38%_92%)] text-[hsl(28_35%_28%)] dark:border-[hsl(38_25%_30%)] dark:bg-[hsl(32_20%_17%)] dark:text-[hsl(38_32%_88%)]",
  },
  camper_stop: {
    label: "Area sosta",
    icon: ParkingCircle,
    badgeClass:
      "border border-[hsl(160_22%_72%)] bg-[hsl(160_28%_92%)] text-[hsl(160_32%_26%)] dark:border-[hsl(160_22%_30%)] dark:bg-[hsl(160_18%_16%)] dark:text-[hsl(160_30%_88%)]",
  },
  scenic: {
    label: "Panoramica",
    icon: Mountain,
    badgeClass:
      "border border-[hsl(95_28%_72%)] bg-[hsl(95_32%_92%)] text-[hsl(95_28%_26%)] dark:border-[hsl(95_22%_30%)] dark:bg-[hsl(95_18%_16%)] dark:text-[hsl(95_32%_88%)]",
  },
  fuel: {
    label: "Carburante",
    icon: Fuel,
    badgeClass:
      "border border-[hsl(42_30%_72%)] bg-[hsl(42_38%_92%)] text-[hsl(32_40%_28%)] dark:border-[hsl(42_25%_30%)] dark:bg-[hsl(38_20%_16%)] dark:text-[hsl(42_35%_88%)]",
  },
  other: {
    label: "Altro",
    icon: MapPin,
    badgeClass:
      "border border-[hsl(25_18%_76%)] bg-[hsl(30_22%_92%)] text-[hsl(25_18%_32%)] dark:border-[hsl(25_14%_30%)] dark:bg-[hsl(25_12%_18%)] dark:text-[hsl(30_20%_88%)]",
  },
};

function buildStopKey(stop: GroundedStop): string {
  return `${stop.dayIndex}:${stop.orderInDay}:${stop.placeId ?? stop.title}`;
}

function googleMapsHref(stop: GroundedStop): string {
  if (stop.mapsUrl) return stop.mapsUrl;
  const query = encodeURIComponent(stop.formattedAddress ?? stop.title);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function legBetweenLabel(leg: ItineraryLeg | undefined): string {
  if (!leg) return "→ Distanza non disponibile";
  const km = leg.distanceKm;
  const min = leg.durationMin;
  if (km == null && min == null) return "→ Distanza non disponibile";
  const kmPart = km != null ? `circa ${km} km` : "—";
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
  const [hasEntered, setHasEntered] = useState(false);
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [insertText, setInsertText] = useState("");
  const [insertLoading, setInsertLoading] = useState(false);
  const [activeStopKey, setActiveStopKey] = useState<string | null>(null);
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});
  const stopRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [themes, pace, transport, days, range, area]);

  const progress = useMemo(() => ((step + 1) / 5) * 100, [step]);

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

  useEffect(() => {
    if (!itineraryFlatRows.length) {
      setActiveStopKey(null);
      setExpandedStops({});
      return;
    }
    setActiveStopKey(itineraryFlatRows[0].key);
    setExpandedStops({});
  }, [itineraryFlatRows]);

  const onSelectStop = useCallback((key: string) => {
    setActiveStopKey(key);
    setExpandedStops((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() => {
      stopRefs.current[key]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

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
      return area !== null;
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
    return {
      preferences: { themes, pace },
      transport,
      time,
      area,
      language: "it",
    };
  }, [area, timeTab, days, range, themes, pace, transport]);

  const onGenerate = async () => {
    const body = buildRequest();
    if (!body) {
      setError("Completa data e area.");
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

  if (!hasEntered) {
    return (
      <div className="roamy-board flex min-h-screen items-center justify-center px-4 py-10">
        <section className="roamy-card w-full max-w-5xl rounded-[1.25rem] p-8 text-center sm:p-12">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Itinerari AI su misura
          </p>
          <h1 className="roamy-scribble-title text-[clamp(5rem,19vw,13rem)] leading-[0.85] text-primary drop-shadow-sm">
            Roamy
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Disegna il viaggio su una carta d’epoca: tappe, mappe e idee in un
            solo posto.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-8 rounded-full border border-[hsl(355_32%_38%)] bg-primary px-10 text-lg font-semibold text-primary-foreground shadow-md hover:bg-[hsl(355_42%_30%)]"
            onClick={() => {
              setHasEntered(true);
              setStep(0);
            }}
          >
            Entra
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="roamy-board min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[hsl(30_22%_72%)] bg-[hsl(40_42%_97%_/_0.88)] backdrop-blur-md dark:bg-[hsl(25_22%_14%_/_0.88)] dark:border-[hsl(25_14%_26%)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="roamy-scribble-title text-4xl leading-none text-primary">
              Roamy
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Itinerari con AI e mappe verificate
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full border border-[hsl(30_22%_72%)] bg-[hsl(40_44%_98%_/_0.9)] dark:border-[hsl(25_14%_28%)] dark:bg-[hsl(25_20%_18%)]"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? "Tema chiaro" : "Tema scuro"}
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
        <Progress value={progress} className="h-1 rounded-none" />
      </header>

      <main
        className={cn(
          "mx-auto px-4 py-8",
          step === 4 && result ? "max-w-7xl pb-28 lg:pb-8" : "max-w-3xl"
        )}
      >
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
                      <div className="mt-4">
                        <MapAreaPicker
                          mode={areaTab === "polygon" ? "polygon" : "radius"}
                          onAreaChange={handleAreaMap}
                        />
                      </div>
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
                    <div className="mt-4">
                      <MapAreaPicker
                        mode={areaTab === "polygon" ? "polygon" : "radius"}
                        onAreaChange={handleAreaMap}
                      />
                    </div>
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
                  <ScrollArea className="h-[min(420px,50vh)] pr-3 lg:h-[min(520px,62vh)]">
                    <div className="space-y-4">
                      {rowsByDay.map(([dayIndex, dayRows]) => (
                        <section
                          key={dayIndex}
                          className="roamy-card overflow-hidden rounded-xl border-0 bg-gradient-to-b from-[hsl(40_46%_97%)] to-[hsl(36_38%_93%)]"
                        >
                          <header className="flex flex-wrap items-center gap-2 border-b border-[hsl(30_22%_78%)] bg-[hsl(34_32%_90%_/_0.6)] px-3 py-2 dark:border-[hsl(25_14%_26%)] dark:bg-[hsl(25_18%_18%)]">
                            <Badge variant="secondary" className="text-xs">
                              Giorno {dayIndex}
                            </Badge>
                            {dayRows[0]?.weatherSummary && (
                              <span className="text-xs text-muted-foreground">
                                {dayRows[0].weatherSummary}
                              </span>
                            )}
                          </header>
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
                                    className={cn(
                                      "rounded-lg border p-3 text-sm transition-colors",
                                      isActive
                                        ? "border-primary bg-primary/5"
                                        : "bg-background"
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
                                            <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                              da verificare
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
                                      className="rounded-md border border-dashed bg-muted/30 px-3 py-2"
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
                                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <ArrowDown className="h-3.5 w-3.5" />
                                        {legBetweenLabel(
                                          result.legs?.[row.globalIndex]
                                        )}
                                      </p>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </ScrollArea>

                  <details className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
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
                  <ItineraryResultMap
                    result={result}
                    activeStopKey={activeStopKey}
                    onStopSelect={onSelectStop}
                  />
                  <div className="hidden space-y-2 rounded-lg border bg-card p-4 lg:block">
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
            <Button type="button" variant="outline" onClick={() => { setStep(0); setResult(null); }}>
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
