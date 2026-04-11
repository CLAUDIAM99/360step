"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Loader2, Moon, Sun } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { MapAreaPicker } from "@/components/wizard/MapAreaPicker";
import type {
  GenerateItineraryRequest,
  ItineraryResult,
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

const defaultArea = (): GeographicArea => ({
  kind: "radius",
  centerLat: 45.4642,
  centerLng: 9.19,
  radiusKm: 50,
});

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [insertText, setInsertText] = useState("");
  const [insertLoading, setInsertLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">
              Roamy
            </p>
            <p className="text-xs text-muted-foreground">
              Itinerari con AI e mappe verificate
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? "Tema chiaro" : "Tema scuro"}
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
        <Progress value={progress} className="h-1 rounded-none" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && (
          <p
            className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        {step === 0 && (
          <Card>
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
          <Card>
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
          <Card>
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
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Dove?</CardTitle>
              <CardDescription>
                Disegna un’area sulla mappa, oppure un cerchio con raggio, oppure
                indica partenza e arrivo (con eventuali tappe intermedie).
              </CardDescription>
            </CardHeader>
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
                    <Label htmlFor="cs">Partenza</Label>
                    <Input
                      id="cs"
                      value={corridorStart}
                      onChange={(e) => setCorridorStart(e.target.value)}
                      placeholder="Città o indirizzo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cv">Tappe intermedie (opzionale)</Label>
                    <Input
                      id="cv"
                      value={corridorVia}
                      onChange={(e) => setCorridorVia(e.target.value)}
                      placeholder="Separate da virgola"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ce">Arrivo</Label>
                    <Input
                      id="ce"
                      value={corridorEnd}
                      onChange={(e) => setCorridorEnd(e.target.value)}
                      placeholder="Città o indirizzo"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {step === 4 && result && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Il tuo itinerario</CardTitle>
              <CardDescription>{result.summary}</CardDescription>
              {result.bestPeriodNote && (
                <p className="text-sm text-muted-foreground">
                  {result.bestPeriodNote}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <ScrollArea className="h-[min(480px,55vh)] pr-4">
                <div className="space-y-6">
                  {result.days.map((day) => (
                    <div key={day.dayIndex}>
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary">
                          Giorno {day.dayIndex}
                        </Badge>
                        {day.weatherSummary && (
                          <span className="text-xs text-muted-foreground">
                            {day.weatherSummary}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-3">
                        {day.stops.map((s, i) => (
                          <li
                            key={`${s.dayIndex}-${i}-${s.title}`}
                            className="rounded-lg border p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{s.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {s.type}
                                  {s.groundingStatus === "not_found" &&
                                    " · da verificare"}
                                </p>
                                {s.formattedAddress && (
                                  <p className="mt-1 text-xs">
                                    {s.formattedAddress}
                                  </p>
                                )}
                              </div>
                              {s.mapsUrl && (
                                <a
                                  href={s.mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-primary underline"
                                >
                                  Maps
                                </a>
                              )}
                            </div>
                            {s.notes && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {s.notes}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      <Separator className="my-4" />
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="space-y-2">
                <Label htmlFor="insert">Aggiungi una tappa</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="insert"
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
