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
  FileDown,
  Fuel,
  GripVertical,
  Loader2,
  MapPin,
  Moon,
  ParkingCircle,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  Sun,
  Trash2,
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
import {
  ItineraryResultMap,
  type LegSegmentMapInfo,
  type MapLayerVisibility,
} from "@/components/wizard/ItineraryResultMap";
import { ItineraryStopDetailDialog } from "@/components/wizard/ItineraryStopDetailDialog";
import { downloadItineraryPdf } from "@/components/wizard/itinerary-pdf";
import { PlaceAutocompleteField } from "@/components/wizard/PlaceAutocompleteInput";
import {
  ItineraryResultSchema,
  type GenerateItineraryRequest,
  type GeminiPlan,
  type GroundedStop,
  type ItineraryLeg,
  type ItineraryResult,
  type RebalancingSuggestion,
  type StopType,
  type EnergyProfile,
  type Pace,
  type Transport,
  type TripTheme,
  type GeographicArea,
} from "@/lib/itinerary/schema";
import {
  itineraryAnalytics,
  reconcileItineraryLegs,
} from "@/lib/itinerary/legs-reconcile";
import { estimateDailyLoads } from "@/lib/itinerary/day-estimates";
import { evaluateItineraryHealth } from "@/lib/itinerary/health";
import {
  buildRebalancingSuggestions,
} from "@/lib/itinerary/rebalance";
import {
  STOP_TYPE_BADGE_CLASS,
  dayItineraryHex,
  dayListAccentClass,
} from "@/lib/itinerary/colors";
import { haversineKm } from "@/lib/geo/distance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AuthBar } from "@/components/AuthBar";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { onAuthStateChanged, type User } from "firebase/auth";

function dayCountFromTime(
  tab: "days" | "dates",
  days: number,
  range?: DateRange
): number {
  if (tab === "days") return days;
  if (!range?.from || !range?.to) return 0;
  const ms = range.to.getTime() - range.from.getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

type NearbyParkingRow = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
  distanceKm: number;
};

const INTRO_SESSION_KEY = "roamy-intro-done";
/** Allineato alla durata CSS dell’animazione hero + main (vedi classi intro). */
const INTRO_TRANSITION_MS = 1450;

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
const ITINERARY_SAVE_KEY = "roamy-itinerary-save-v1";
const ITINERARY_SAVE_VERSION = 1;

const MIME_STOP_DRAG = "application/x-roamy-stop";

function linesToList(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
}

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

function firstStopKey(it: ItineraryResult): string | null {
  const sortedDays = [...it.days].sort((a, b) => a.dayIndex - b.dayIndex);
  const day0 = sortedDays[0];
  if (!day0?.stops.length) return null;
  const s = [...day0.stops].sort((a, b) => a.orderInDay - b.orderInDay)[0];
  return buildStopKey(s);
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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dark, setDark] = useState(false);
  const [step, setStep] = useState(0);
  const [themes, setThemes] = useState<TripTheme[]>(["scenic", "food"]);
  const [pace, setPace] = useState<Pace>("balanced");
  const [energyProfile, setEnergyProfile] = useState<EnergyProfile>("balanced");
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
  const [returnToHubEachNight, setReturnToHubEachNight] = useState(false);
  const [accommodationAsBase, setAccommodationAsBase] = useState(true);
  const [reuseAccommodationUntilChanged, setReuseAccommodationUntilChanged] =
    useState(true);
  const [preferScenicRoutes, setPreferScenicRoutes] = useState(false);
  const [bookedAccommodationsByDay, setBookedAccommodationsByDay] = useState<
    Record<number, string>
  >({});
  const [hardConstraintsText, setHardConstraintsText] = useState("");
  const [softWishesText, setSoftWishesText] = useState("");
  const [mapLayers, setMapLayers] = useState<MapLayerVisibility>({
    showConfirmedStops: true,
    showOptionalStops: true,
    showRoute: true,
    showAccommodations: true,
  });
  /** Giorni espansi nella lista step 4 (default: tutti aperti). */
  const [dayListOpen, setDayListOpen] = useState<Record<number, boolean>>({});
  const [enterPhase, setEnterPhase] = useState<"idle" | "animating" | "done">(
    "idle"
  );
  const wizardPanelRef = useRef<HTMLElement | null>(null);

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

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genPhase, setGenPhase] = useState("");
  const [genModalError, setGenModalError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [tourPlaying, setTourPlaying] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);
  const [legMapInfo, setLegMapInfo] = useState<LegSegmentMapInfo | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [parkingDialogOpen, setParkingDialogOpen] = useState(false);
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingRows, setParkingRows] = useState<NearbyParkingRow[]>([]);
  const [parkingErr, setParkingErr] = useState<string | null>(null);

  const [rebalanceDialogOpen, setRebalanceDialogOpen] = useState(false);
  const [rebalanceBusy, setRebalanceBusy] = useState(false);
  const [rebalanceErr, setRebalanceErr] = useState<string | null>(null);
  const [rebalanceSuggestion, setRebalanceSuggestion] =
    useState<RebalancingSuggestion | null>(null);
  const [rebalancePreview, setRebalancePreview] = useState<ItineraryResult | null>(
    null
  );
  const [rebalancePreviewDelta, setRebalancePreviewDelta] = useState<{
    riskLevelBefore: "low" | "moderate" | "high";
    riskLevelAfter: "low" | "moderate" | "high";
    averageLoadScoreBefore: number;
    averageLoadScoreAfter: number;
    overloadDaysBefore: number;
    overloadDaysAfter: number;
  } | null>(null);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState("Itinerario");
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [folderId, setFolderId] = useState<string>("");
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
  }, []);

  const rebalanceMiniDiff = useMemo(() => {
    if (!result || !rebalancePreview || !rebalanceSuggestion) return null;
    const beforeByDay = new Map(
      result.days.map((d) => [
        d.dayIndex,
        [...d.stops].sort((a, b) => a.orderInDay - b.orderInDay),
      ])
    );
    const afterByDay = new Map(
      rebalancePreview.days.map((d) => [
        d.dayIndex,
        [...d.stops].sort((a, b) => a.orderInDay - b.orderInDay),
      ])
    );

    const dayIndexes = Array.from(
      new Set([...beforeByDay.keys(), ...afterByDay.keys()])
    ).sort((a, b) => a - b);

    const touchedDays: number[] = [];
    for (const dayIndex of dayIndexes) {
      const b = beforeByDay.get(dayIndex) ?? [];
      const a = afterByDay.get(dayIndex) ?? [];
      const bKeys = b.map((s) => `${s.type}|${s.placeId ?? s.title}`);
      const aKeys = a.map((s) => `${s.type}|${s.placeId ?? s.title}`);
      if (bKeys.join("||") !== aKeys.join("||")) touchedDays.push(dayIndex);
    }

    const beforeHealthByDay = new Map(
      (result.dayHealth ?? []).map((h) => [h.dayIndex, h])
    );
    const afterHealthByDay = new Map(
      (rebalancePreview.dayHealth ?? []).map((h) => [h.dayIndex, h])
    );

    const affected = touchedDays.slice(0, 3);
    return {
      touchedDays,
      affectedDays: affected.map((dayIndex) => ({
        dayIndex,
        beforeScore: beforeHealthByDay.get(dayIndex)?.loadScore,
        afterScore: afterHealthByDay.get(dayIndex)?.loadScore,
        beforeIssues: beforeHealthByDay.get(dayIndex)?.issues.length ?? 0,
        afterIssues: afterHealthByDay.get(dayIndex)?.issues.length ?? 0,
      })),
      changeLabel:
        rebalanceSuggestion.type === "move_stop"
          ? `Sposta “${rebalanceSuggestion.stopTitle ?? "tappa"}” dal giorno ${rebalanceSuggestion.fromDayIndex} al giorno ${rebalanceSuggestion.toDayIndex ?? "?"}.`
          : rebalanceSuggestion.type === "mark_optional"
            ? `Rende opzionale “${rebalanceSuggestion.stopTitle ?? "tappa"}” nel giorno ${rebalanceSuggestion.fromDayIndex}.`
            : "Suggerimento informativo (nessuna applicazione automatica).",
    };
  }, [result, rebalancePreview, rebalanceSuggestion]);

  const reconciledResult = useMemo(
    () => (result ? reconcileItineraryLegs(result) : null),
    [result]
  );

  const apiUrl = useCallback((path: string) => {
    if (typeof window === "undefined") return path;
    try {
      return new URL(path, window.location.origin).toString();
    } catch {
      return path;
    }
  }, []);

  const openSaveDialog = useCallback(async () => {
    if (!reconciledResult) return;
    if (!authUser) {
      setSaveErr("Accedi per salvare l’itinerario nel tuo account.");
      setSaveDialogOpen(true);
      return;
    }
    setSaveErr(null);
    setSaveBusy(true);
    setSaveTitle(reconciledResult.summary?.slice(0, 80) || "Itinerario");
    try {
      const token = await authUser.getIdToken();
      const url = apiUrl("/api/folders");
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "web/src/components/wizard/WizardApp.tsx:openSaveDialog",
          message: "Fetching folders",
          data: { url, origin: typeof window !== "undefined" ? window.location.origin : null },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { folders?: Array<{ id: string; name: string }>; error?: string };
      if (!res.ok) throw new Error(data.error || "Errore caricamento cartelle");
      setFolders((data.folders ?? []).map((f) => ({ id: String(f.id), name: String(f.name) })));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "web/src/components/wizard/WizardApp.tsx:openSaveDialog",
          message: "Fetch folders failed",
          data: { message: String(msg).slice(0, 200) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setSaveErr(
        msg === "The string did not match the expected pattern."
          ? "Errore rete: URL non valido o bloccato dal browser. Prova un altro browser (Safari/Chrome) o disattiva blocchi/tracker per questo sito."
          : msg
      );
    } finally {
      setSaveBusy(false);
      setSaveDialogOpen(true);
    }
  }, [reconciledResult, authUser, apiUrl]);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setSaveErr(null);
    setSaveBusy(true);
    try {
      const token = await authUser?.getIdToken();
      if (!token) throw new Error("Token non disponibile (sei loggato?)");
      const url = apiUrl("/api/folders");
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "web/src/components/wizard/WizardApp.tsx:createFolder",
          message: "Creating folder",
          data: { url, nameLen: name.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { id?: string; name?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Errore creazione cartella");
      const id = String(data.id);
      setFolders((p) => [{ id, name }, ...p]);
      setFolderId(id);
      setNewFolderName("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "web/src/components/wizard/WizardApp.tsx:createFolder",
          message: "Create folder failed",
          data: { message: String(msg).slice(0, 200) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setSaveErr(
        msg === "The string did not match the expected pattern."
          ? "Errore rete: URL non valido o bloccato dal browser. Prova un altro browser (Safari/Chrome) o disattiva blocchi/tracker per questo sito."
          : msg
      );
    } finally {
      setSaveBusy(false);
    }
  }, [newFolderName, authUser, apiUrl]);

  const saveItinerary = useCallback(async () => {
    if (!reconciledResult) return;
    setSaveErr(null);
    setSaveBusy(true);
    try {
      const token = await authUser?.getIdToken();
      if (!token) throw new Error("Token non disponibile (sei loggato?)");
      const url = apiUrl("/api/itineraries");
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "web/src/components/wizard/WizardApp.tsx:saveItinerary",
          message: "Saving itinerary",
          data: { url, hasFolderId: Boolean(folderId.trim()), titleLen: saveTitle.trim().length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: saveTitle.trim() || "Itinerario",
          folderId: folderId.trim() || undefined,
          itinerary: reconciledResult,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Errore salvataggio");
      setSaveDialogOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "web/src/components/wizard/WizardApp.tsx:saveItinerary",
          message: "Save itinerary failed",
          data: { message: String(msg).slice(0, 200) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setSaveErr(
        msg === "The string did not match the expected pattern."
          ? "Errore rete: URL non valido o bloccato dal browser. Prova un altro browser (Safari/Chrome) o disattiva blocchi/tracker per questo sito."
          : msg
      );
    } finally {
      setSaveBusy(false);
    }
  }, [reconciledResult, saveTitle, folderId, authUser, apiUrl]);

  const openRebalancePreview = useCallback(
    async (s: RebalancingSuggestion) => {
      if (!result) return;
      setRebalanceErr(null);
      setRebalanceBusy(true);
      setRebalanceSuggestion(s);
      setRebalancePreview(null);
      setRebalancePreviewDelta(null);
      setRebalanceDialogOpen(true);
      try {
        const res = await fetch("/api/itinerary/rebalance/propose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itinerary: result,
            suggestion: s,
            ctx: {
              transport,
              pace,
              energyProfile,
              preferScenicRoutes,
            },
          }),
        });
        const data = (await res.json()) as
          | {
              error?: string;
              afterPreview?: ItineraryResult;
              delta?: unknown;
            }
          | ItineraryResult;
        if (!res.ok || (data as { error?: string }).error) {
          throw new Error(
            (data as { error?: string }).error ?? "Errore preview riequilibrio"
          );
        }
        const parsed = (data as { afterPreview?: ItineraryResult; delta?: unknown })
          .afterPreview;
        if (parsed) {
          setRebalancePreview(parsed);
        }
        const delta = (data as { delta?: typeof rebalancePreviewDelta }).delta as
          | typeof rebalancePreviewDelta
          | undefined;
        if (delta) setRebalancePreviewDelta(delta);
      } catch (e) {
        setRebalanceErr(e instanceof Error ? e.message : "Errore preview");
      } finally {
        setRebalanceBusy(false);
      }
    },
    [result, transport, pace, energyProfile, preferScenicRoutes]
  );

  const applyRebalanceConfirmed = useCallback(async () => {
    if (!result || !rebalanceSuggestion) return;
    setRebalanceErr(null);
    setRebalanceBusy(true);
    try {
      const res = await fetch("/api/itinerary/rebalance/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary: result,
          suggestion: rebalanceSuggestion,
          ctx: {
            transport,
            pace,
            energyProfile,
            preferScenicRoutes,
          },
        }),
      });
      const data = (await res.json()) as ItineraryResult | { error?: string };
      if (!res.ok || (data as { error?: string }).error) {
        throw new Error(
          (data as { error?: string }).error ?? "Errore apply riequilibrio"
        );
      }
      const out = ItineraryResultSchema.safeParse(data);
      if (!out.success) throw new Error("Risposta apply non valida");
      setResult(out.data);
      setRebalanceDialogOpen(false);
    } catch (e) {
      setRebalanceErr(e instanceof Error ? e.message : "Errore apply");
    } finally {
      setRebalanceBusy(false);
    }
  }, [
    result,
    rebalanceSuggestion,
    transport,
    pace,
    energyProfile,
    preferScenicRoutes,
  ]);

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
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(d.themes)) setThemes(d.themes as TripTheme[]);
        if (typeof d.pace === "string") setPace(d.pace as Pace);
        if (typeof d.energyProfile === "string") {
          setEnergyProfile(d.energyProfile as EnergyProfile);
        }
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
        if (typeof d.returnToHubEachNight === "boolean")
          setReturnToHubEachNight(d.returnToHubEachNight);
        if (typeof d.accommodationAsBase === "boolean") {
          setAccommodationAsBase(d.accommodationAsBase);
        }
        if (typeof d.reuseAccommodationUntilChanged === "boolean") {
          setReuseAccommodationUntilChanged(d.reuseAccommodationUntilChanged);
        }
        if (d.bookedAccommodationsByDay && typeof d.bookedAccommodationsByDay === "object") {
          setBookedAccommodationsByDay(d.bookedAccommodationsByDay as Record<number, string>);
        }
        if (typeof d.preferScenicRoutes === "boolean")
          setPreferScenicRoutes(d.preferScenicRoutes);
        if (typeof d.hardConstraintsText === "string")
          setHardConstraintsText(d.hardConstraintsText);
        if (typeof d.softWishesText === "string")
          setSoftWishesText(d.softWishesText);
      }
      const itRaw = localStorage.getItem(ITINERARY_SAVE_KEY);
      if (itRaw) {
        const j = JSON.parse(itRaw) as {
          version?: number;
          result?: unknown;
        };
        if (
          j.version === ITINERARY_SAVE_VERSION &&
          j.result != null &&
          typeof j.result === "object"
        ) {
          const parsed = ItineraryResultSchema.safeParse(j.result);
          if (parsed.success) {
            setResult(parsed.data);
            setActiveStopKey(firstStopKey(parsed.data));
            setStep(4);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const payload = {
      themes,
      pace,
      energyProfile,
      transport,
      days,
      range:
        range?.from && range?.to
          ? { from: range.from.toISOString(), to: range.to.toISOString() }
          : undefined,
      area,
      tripStartQuery,
      tripEndQuery,
      returnToHubEachNight,
      accommodationAsBase,
      reuseAccommodationUntilChanged,
      bookedAccommodationsByDay,
      preferScenicRoutes,
      hardConstraintsText,
      softWishesText,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [
    themes,
    pace,
    energyProfile,
    transport,
    days,
    range,
    area,
    tripStartQuery,
    tripEndQuery,
    returnToHubEachNight,
    accommodationAsBase,
    reuseAccommodationUntilChanged,
    bookedAccommodationsByDay,
    preferScenicRoutes,
    hardConstraintsText,
    softWishesText,
  ]);

  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(
        ITINERARY_SAVE_KEY,
        JSON.stringify({
          version: ITINERARY_SAVE_VERSION,
          result,
        })
      );
    } catch {
      /* ignore */
    }
  }, [result]);

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
    if (!reconciledResult) {
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
    const sortedDays = [...reconciledResult.days].sort(
      (a, b) => a.dayIndex - b.dayIndex
    );
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
  }, [reconciledResult]);

  const rowsByDay = useMemo(() => {
    const byDay = new Map<number, (typeof itineraryFlatRows)[number][]>();
    for (const row of itineraryFlatRows) {
      const current = byDay.get(row.dayIndex) ?? [];
      current.push(row);
      byDay.set(row.dayIndex, current);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  }, [itineraryFlatRows]);

  const tourEligibleRows = useMemo(
    () =>
      itineraryFlatRows.filter(
        (r) =>
          r.stop.lat != null &&
          r.stop.lng != null &&
          Number.isFinite(r.stop.lat) &&
          Number.isFinite(r.stop.lng)
      ),
    [itineraryFlatRows]
  );

  const activeStop = useMemo(() => {
    if (!reconciledResult || !activeStopKey) return null;
    return findStopByKey(reconciledResult, activeStopKey);
  }, [reconciledResult, activeStopKey]);

  const tripAnalytics = useMemo(
    () => (reconciledResult ? itineraryAnalytics(reconciledResult) : null),
    [reconciledResult]
  );

  const dayLoadByDay = useMemo(() => {
    if (!reconciledResult) return new Map<number, ReturnType<typeof estimateDailyLoads>[number]>();
    const rows = estimateDailyLoads(reconciledResult);
    return new Map(rows.map((r) => [r.dayIndex, r]));
  }, [reconciledResult]);

  const itineraryHealth = useMemo(() => {
    if (!reconciledResult) return null;
    return evaluateItineraryHealth({
      itinerary: reconciledResult,
      pace,
      energyProfile,
    });
  }, [reconciledResult, pace, energyProfile]);

  const rebalancingSuggestions = useMemo(() => {
    if (!reconciledResult || !itineraryHealth) return [] as RebalancingSuggestion[];
    if (reconciledResult.rebalancingSuggestions?.length) {
      return reconciledResult.rebalancingSuggestions;
    }
    return buildRebalancingSuggestions(reconciledResult, itineraryHealth.dayHealth);
  }, [reconciledResult, itineraryHealth]);

  const weatherFeasibilityWarnings = useMemo(() => {
    if (!reconciledResult) return [] as { dayIndex: number }[];
    const badCodes = new Set([61, 80, 95, 71]);
    return reconciledResult.days
      .filter((day) => {
        const outdoor = day.stops.some(
          (s) => s.type === "visit" || s.type === "scenic"
        );
        const code = day.weatherCode;
        const precip = day.weatherPrecipProbMax;
        const wind = day.weatherWindKmhMax;
        const badWeather =
          (code != null && badCodes.has(code)) ||
          (precip != null && precip >= 70) ||
          (wind != null && wind >= 55);
        return outdoor && badWeather;
      })
      .map((d) => ({ dayIndex: d.dayIndex }));
  }, [reconciledResult]);

  useEffect(() => {
    if (!reconciledResult) return;
    const next: Record<number, boolean> = {};
    for (const d of reconciledResult.days) {
      next[d.dayIndex] = false;
    }
    setDayListOpen(next);
  }, [reconciledResult]);

  useEffect(() => {
    if (!itineraryFlatRows.length) {
      setActiveStopKey(null);
      setExpandedStops({});
      setMapFocusedDay("all");
    }
  }, [itineraryFlatRows.length]);

  const onSelectStop = useCallback((key: string | null) => {
    if (key == null) {
      setActiveStopKey(null);
      return;
    }
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
    const hardList = linesToList(hardConstraintsText);
    const softList = linesToList(softWishesText);
    return {
      preferences: {
        themes,
        pace,
        energyProfile,
        ...(hardList.length ? { hardConstraints: hardList } : {}),
        ...(softList.length ? { softWishes: softList } : {}),
      },
      transport,
      time,
      area,
      startPlaceQuery,
      endPlaceQuery: endRaw.length > 0 ? endRaw : undefined,
      returnToHubEachNight,
      accommodationAsBase,
      reuseAccommodationUntilChanged,
      preferScenicRoutes,
      bookedAccommodations:
        (() => {
          const count = dayCountFromTime(timeTab, days, range);
          if (count <= 0) return undefined;
          const out = Array.from({ length: count })
            .map((_, i) => {
              const dayIndex = i + 1;
              const q = (bookedAccommodationsByDay[dayIndex] ?? "").trim();
              if (!q) return null;
              return { dayIndex, query: q, label: "Alloggio" };
            })
            .filter(Boolean) as { dayIndex: number; query: string; label: string }[];
          return out.length ? out : undefined;
        })(),
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
    energyProfile,
    transport,
    corridorStart,
    corridorEnd,
    tripStartQuery,
    tripEndQuery,
    returnToHubEachNight,
    accommodationAsBase,
    reuseAccommodationUntilChanged,
    preferScenicRoutes,
    bookedAccommodationsByDay,
    hardConstraintsText,
    softWishesText,
  ]);

  const onGenerate = async () => {
    const body = buildRequest();
    if (!body) {
      setError(
        "Completa date, area e luogo di partenza (almeno 2 caratteri)."
      );
      return;
    }
    setGenerateModalOpen(true);
    setGenModalError(null);
    setGenProgress(6);
    setGenPhase("Pianificazione con l’AI…");
    setGenerating(true);
    setError(null);
    try {
      const planRes = await fetch("/api/itinerary/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const planJson = (await planRes.json()) as GeminiPlan & { error?: string };
      if (!planRes.ok) {
        throw new Error(planJson.error || "Errore pianificazione");
      }
      setGenProgress(44);
      setGenPhase("Luoghi, distanze e mappa…");
      const groundRes = await fetch("/api/itinerary/ground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, plan: planJson }),
      });
      const data = (await groundRes.json()) as ItineraryResult & {
        error?: string;
      };
      if (!groundRes.ok) {
        throw new Error(data.error || "Errore grounding");
      }
      setGenProgress(100);
      setGenPhase("Completato");
      setResult(data as ItineraryResult);
      setActiveStopKey(firstStopKey(data as ItineraryResult));
      setExpandedStops({});
      setMapFocusedDay("all");
      setStep(4);
      setGenerateModalOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore";
      setGenModalError(msg);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const openParkingForRow = useCallback(async (rowKey: string) => {
    if (!reconciledResult) return;
    const stop = findStopByKey(reconciledResult, rowKey);
    if (!stop?.lat || !stop?.lng) {
      setParkingErr("Coordinate non disponibili per questa tappa.");
      setParkingRows([]);
      setParkingDialogOpen(true);
      return;
    }
    setParkingDialogOpen(true);
    setParkingLoading(true);
    setParkingErr(null);
    setParkingRows([]);
    try {
      const res = await fetch(
        `/api/places/nearby-parking?lat=${stop.lat}&lng=${stop.lng}&radiusM=1800`
      );
      const j = (await res.json()) as {
        results?: NearbyParkingRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || "Ricerca fallita");
      setParkingRows(j.results ?? []);
    } catch (e) {
      setParkingErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setParkingLoading(false);
    }
  }, [reconciledResult]);

  const moveStopInDay = useCallback(
    (dayIndex: number, fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      setResult((prev) => {
        if (!prev) return prev;
        const day = prev.days.find((d) => d.dayIndex === dayIndex);
        if (!day) return prev;
        const sorted = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
        const fi = sorted.findIndex((s) => buildStopKey(s) === fromKey);
        const ti = sorted.findIndex((s) => buildStopKey(s) === toKey);
        if (fi < 0 || ti < 0) return prev;
        const next = [...sorted];
        const [item] = next.splice(fi, 1);
        next.splice(ti, 0, item);
        const newStops = next.map((s, i) => ({ ...s, orderInDay: i }));
        return {
          ...prev,
          days: prev.days.map((d) =>
            d.dayIndex === dayIndex ? { ...d, stops: newStops } : d
          ),
          legs: undefined,
          revision: (prev.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    []
  );

  const deleteStopByKey = useCallback((key: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const target = findStopByKey(prev, key);
      if (!target) return prev;
      const days = prev.days.map((d) => {
        if (d.dayIndex !== target.dayIndex) return d;
        const kept = d.stops
          .filter((s) => buildStopKey(s) !== key)
          .map((s, i) => ({ ...s, orderInDay: i }));
        return { ...d, stops: kept };
      });
      return {
        ...prev,
        days,
        legs: undefined,
        revision: (prev.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
    });
    setActiveStopKey((k) => (k === key ? null : k));
  }, []);

  const toggleStopOptionalByKey = useCallback((key: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const days = prev.days.map((d) => ({
        ...d,
        stops: d.stops.map((s) => {
          if (buildStopKey(s) !== key) return s;
          const nextStatus =
            s.stopStatus === "optional" ? undefined : ("optional" as const);
          return { ...s, stopStatus: nextStatus };
        }),
      }));
      return {
        ...prev,
        days,
        revision: (prev.revision ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const startNewTrip = useCallback(() => {
    setResult(null);
    setStep(0);
    setActiveStopKey(null);
    setTourPlaying(false);
    setCameraTarget(null);
    setLegMapInfo(null);
    setInsertText("");
    setError(null);
    setStopDetailOpen(false);
    try {
      localStorage.removeItem(ITINERARY_SAVE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const TOUR_MS = 5200;
  useEffect(() => {
    if (tourPlaying && tourEligibleRows.length === 0) {
      setTourPlaying(false);
      setCameraTarget(null);
    }
  }, [tourPlaying, tourEligibleRows.length]);

  useEffect(() => {
    if (!tourPlaying || tourEligibleRows.length === 0) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 9000 : TOUR_MS;
    const id = window.setInterval(() => {
      setTourIndex((i) => (i + 1) % tourEligibleRows.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [tourPlaying, tourEligibleRows.length]);

  useEffect(() => {
    if (!tourPlaying || tourEligibleRows.length === 0) return;
    const row = tourEligibleRows[tourIndex];
    if (!row) return;
    onSelectStop(row.key);
    setMapFocusedDay(row.dayIndex);
    setCameraTarget({
      lat: row.stop.lat!,
      lng: row.stop.lng!,
      zoom: 14,
    });
  }, [tourPlaying, tourIndex, tourEligibleRows, onSelectStop]);

  useEffect(() => {
    if (tourEligibleRows.length === 0) return;
    setTourIndex((i) =>
      i >= tourEligibleRows.length ? 0 : i
    );
  }, [tourEligibleRows.length]);

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
          preferences: {
            themes,
            pace,
            energyProfile,
            ...(linesToList(hardConstraintsText).length
              ? { hardConstraints: linesToList(hardConstraintsText) }
              : {}),
            ...(linesToList(softWishesText).length
              ? { softWishes: linesToList(softWishesText) }
              : {}),
          },
          language: "it",
          returnToHubEachNight,
          accommodationAsBase,
          reuseAccommodationUntilChanged,
          preferScenicRoutes,
          bookedAccommodations:
            (() => {
              const count = dayCountFromTime(timeTab, days, range);
              if (count <= 0) return undefined;
              const out = Array.from({ length: count })
                .map((_, i) => {
                  const dayIndex = i + 1;
                  const q = (bookedAccommodationsByDay[dayIndex] ?? "").trim();
                  if (!q) return null;
                  return { dayIndex, query: q, label: "Alloggio" };
                })
                .filter(Boolean) as { dayIndex: number; query: string; label: string }[];
              return out.length ? out : undefined;
            })(),
          ...(startQ.length >= 2 ? { startPlaceQuery: startQ } : {}),
          ...(endQ ? { endPlaceQuery: endQ } : {}),
        }),
      });
      const data = (await res.json()) as ItineraryResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "Errore inserimento tappa");
      const next = data as ItineraryResult;
      setResult(next);
      const keep =
        activeStopKey && findStopByKey(next, activeStopKey)
          ? activeStopKey
          : firstStopKey(next);
      setActiveStopKey(keep);
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
      <div className="fixed left-4 top-4 z-50 md:left-8 md:top-8">
        <AuthBar />
      </div>
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
            "roamy-intro-hero relative flex min-h-[min(100dvh,880px)] flex-col justify-center px-4 pb-16 pt-12 md:pb-24 md:pt-16",
            "transition-[transform,opacity,filter] [transition-duration:1450ms] will-change-[transform,opacity]",
            "[transition-timing-function:cubic-bezier(0.33,0.84,0.44,1)] motion-reduce:transition-none",
            enterPhase === "animating" &&
              "-translate-y-[28vh] scale-[1.02] opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100 motion-reduce:blur-none"
          )}
        >
          <div className="mx-auto w-full max-w-3xl text-center">
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
          "roamy-intro-main mx-auto w-full scroll-mt-6 px-4 pb-16",
          "origin-[center_bottom] transition-[transform,opacity] [transition-duration:1500ms] will-change-transform",
          "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          step === 4 && result ? "max-w-7xl pb-28 lg:pb-8" : "max-w-3xl",
          enterPhase === "idle" &&
            "pointer-events-none translate-y-[100dvh] scale-[0.98] opacity-0 pt-2 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100",
          enterPhase === "animating" &&
            "translate-y-0 scale-100 opacity-100 pt-2 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100",
          enterPhase === "done" &&
            "translate-y-0 scale-100 opacity-100 pt-8 md:pt-12"
        )}
      >
        <div className="mx-auto mb-6 w-full max-w-3xl px-0">
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
              <Label className="mb-2 mt-4 block">Energia giornaliera</Label>
              <RadioGroup
                value={energyProfile}
                onValueChange={(v) => setEnergyProfile(v as EnergyProfile)}
                className="flex flex-wrap gap-3"
              >
                {(
                  [
                    ["low", "Bassa (no stress)"],
                    ["balanced", "Media"],
                    ["high", "Alta"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={v}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <RadioGroupItem value={v} id={`energy-${v}`} />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
            <CardContent className="space-y-3 border-t border-border/60 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="hard-constraints">
                  Vincoli rigidi (uno per riga, opzionale)
                </Label>
                <textarea
                  id="hard-constraints"
                  value={hardConstraintsText}
                  onChange={(e) => setHardConstraintsText(e.target.value)}
                  placeholder="Es. senza glutine · no autostrada · accessibilità carrozzina"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="soft-wishes">
                  Desideri flessibili (uno per riga, opzionale)
                </Label>
                <textarea
                  id="soft-wishes"
                  value={softWishesText}
                  onChange={(e) => setSoftWishesText(e.target.value)}
                  placeholder="Es. mercatini locali · meno guida possibile"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
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
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                    <Checkbox
                      id="hub-night"
                      checked={returnToHubEachNight}
                      onCheckedChange={(v) =>
                        setReturnToHubEachNight(v === true)
                      }
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="hub-night"
                        className="text-sm font-medium leading-snug"
                      >
                        Rientro ogni sera alla base
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Ogni giorno parte e torna al punto di partenza (utile per
                        una sosta fissa o camper).
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                    <Checkbox
                      id="acc-base"
                      checked={accommodationAsBase}
                      onCheckedChange={(v) => {
                        const on = v === true;
                        setAccommodationAsBase(on);
                        if (on) setReturnToHubEachNight(false);
                      }}
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="acc-base"
                        className="text-sm font-medium leading-snug"
                      >
                        Alloggio come base (partenza e rientro)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Ogni giorno inizia e finisce dall’alloggio (ultimo “sleep”
                        del giorno).
                      </p>
                    </div>
                  </div>
                  {accommodationAsBase && (
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                      <Checkbox
                        id="acc-reuse"
                        checked={reuseAccommodationUntilChanged}
                        onCheckedChange={(v) =>
                          setReuseAccommodationUntilChanged(v === true)
                        }
                      />
                      <div className="space-y-0.5">
                        <Label
                          htmlFor="acc-reuse"
                          className="text-sm font-medium leading-snug"
                        >
                          Stesso alloggio per più giorni
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Se un giorno non hai un alloggio inserito, riuso l’ultimo
                          alloggio noto dei giorni precedenti.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded-lg border border-border/70 bg-muted/25 p-3 text-sm dark:bg-muted/15">
                    <p className="font-medium text-foreground">
                      Alloggi prenotati (opzionale)
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Inserisci l’alloggio per notte (uno per giorno). Verrà forzato
                      come ultima tappa “Alloggio” del giorno.
                    </p>
                    <div className="mt-3 space-y-2">
                      {Array.from({
                        length: Math.max(1, dayCountFromTime(timeTab, days, range)),
                      }).map((_, i) => {
                        const dayIndex = i + 1;
                        return (
                          <div key={dayIndex} className="space-y-1">
                            <Label htmlFor={`acc-${dayIndex}`}>
                              Giorno {dayIndex} · alloggio
                            </Label>
                            <Input
                              id={`acc-${dayIndex}`}
                              value={bookedAccommodationsByDay[dayIndex] ?? ""}
                              onChange={(e) =>
                                setBookedAccommodationsByDay((p) => ({
                                  ...p,
                                  [dayIndex]: e.target.value,
                                }))
                              }
                              placeholder="Es. Hotel X, Via…, oppure link Google Maps"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                    <Checkbox
                      id="scenic-routes"
                      checked={preferScenicRoutes}
                      onCheckedChange={(v) =>
                        setPreferScenicRoutes(v === true)
                      }
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="scenic-routes"
                        className="text-sm font-medium leading-snug"
                      >
                        Percorsi panoramici (meno autostrada)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Le distanze su mappa useranno strade secondarie quando
                        possibile (solo con chiave Maps server).
                      </p>
                    </div>
                  </div>
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
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                  <Checkbox
                    id="hub-night-fb"
                    checked={returnToHubEachNight}
                    onCheckedChange={(v) =>
                      setReturnToHubEachNight(v === true)
                    }
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="hub-night-fb"
                      className="text-sm font-medium leading-snug"
                    >
                      Rientro ogni sera alla base
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Ogni giorno parte e torna al punto di partenza (utile per
                      una sosta fissa o camper).
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                  <Checkbox
                    id="acc-base-fb"
                    checked={accommodationAsBase}
                    onCheckedChange={(v) => {
                      const on = v === true;
                      setAccommodationAsBase(on);
                      if (on) setReturnToHubEachNight(false);
                    }}
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="acc-base-fb"
                      className="text-sm font-medium leading-snug"
                    >
                      Alloggio come base (partenza e rientro)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Ogni giorno inizia e finisce dall’alloggio (ultimo “sleep”
                      del giorno).
                    </p>
                  </div>
                </div>
                {accommodationAsBase && (
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                    <Checkbox
                      id="acc-reuse-fb"
                      checked={reuseAccommodationUntilChanged}
                      onCheckedChange={(v) =>
                        setReuseAccommodationUntilChanged(v === true)
                      }
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="acc-reuse-fb"
                        className="text-sm font-medium leading-snug"
                      >
                        Stesso alloggio per più giorni
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se un giorno non hai un alloggio inserito, riuso l’ultimo
                        alloggio noto dei giorni precedenti.
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/25 p-3 text-sm dark:bg-muted/15">
                  <p className="font-medium text-foreground">
                    Alloggi prenotati (opzionale)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inserisci l’alloggio per notte (uno per giorno). Verrà forzato
                    come ultima tappa “Alloggio” del giorno.
                  </p>
                  <div className="mt-3 space-y-2">
                    {Array.from({
                      length: Math.max(1, dayCountFromTime(timeTab, days, range)),
                    }).map((_, i) => {
                      const dayIndex = i + 1;
                      return (
                        <div key={dayIndex} className="space-y-1">
                          <Label htmlFor={`acc-fb-${dayIndex}`}>
                            Giorno {dayIndex} · alloggio
                          </Label>
                          <Input
                            id={`acc-fb-${dayIndex}`}
                            value={bookedAccommodationsByDay[dayIndex] ?? ""}
                            onChange={(e) =>
                              setBookedAccommodationsByDay((p) => ({
                                ...p,
                                [dayIndex]: e.target.value,
                              }))
                            }
                            placeholder="Es. Hotel X, Via…, oppure link Google Maps"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-3 dark:bg-muted/15">
                  <Checkbox
                    id="scenic-routes-fb"
                    checked={preferScenicRoutes}
                    onCheckedChange={(v) =>
                      setPreferScenicRoutes(v === true)
                    }
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="scenic-routes-fb"
                      className="text-sm font-medium leading-snug"
                    >
                      Percorsi panoramici (meno autostrada)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Richiede chiave Google Maps lato server per le distanze.
                    </p>
                  </div>
                </div>
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

        {step === 4 && reconciledResult && (
          <Card className="roamy-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display">Il tuo itinerario</CardTitle>
                  <CardDescription className="sr-only">
                    Tappe, mappa e distanze tra una tappa e l&apos;altra.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={startNewTrip}
                  >
                    Nuovo viaggio
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void openSaveDialog()}
                  >
                    Salva
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={tourPlaying ? "secondary" : "outline"}
                    disabled={tourEligibleRows.length === 0}
                    onClick={() => {
                      if (tourPlaying) {
                        setTourPlaying(false);
                        setCameraTarget(null);
                      } else {
                        setTourIndex(0);
                        setTourPlaying(true);
                      }
                    }}
                  >
                    {tourPlaying ? (
                      <>
                        <Pause className="h-4 w-4" /> Pausa tour
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Tour
                      </>
                    )}
                  </Button>
                  {tourPlaying && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTourIndex(
                            (i) =>
                              (i - 1 + tourEligibleRows.length) %
                              tourEligibleRows.length
                          )
                        }
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setTourIndex(
                            (i) => (i + 1) % tourEligibleRows.length
                          )
                        }
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pdfBusy}
                    onClick={async () => {
                      setPdfBusy(true);
                      try {
                        await downloadItineraryPdf(reconciledResult);
                      } finally {
                        setPdfBusy(false);
                      }
                    }}
                  >
                    {pdfBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {tourPlaying && tourEligibleRows.length > 0 && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm shadow-sm">
                  <p className="font-medium text-foreground">
                    {tourEligibleRows[tourIndex]?.stop.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tappa {tourIndex + 1} di {tourEligibleRows.length} · Giorno{" "}
                    {tourEligibleRows[tourIndex]?.dayIndex}
                  </p>
                </div>
              )}
              {weatherFeasibilityWarnings.length > 0 && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
                >
                  <p className="font-medium">Attenzione meteo / outdoor</p>
                  <p className="mt-1 text-xs opacity-90">
                    Giorni{" "}
                    {weatherFeasibilityWarnings.map((w) => w.dayIndex).join(", ")}
                    : pioggia, vento o neve previsti in giornate con tappe
                    all&apos;aperto. Valuta backup coperti o spostamenti.
                  </p>
                </div>
              )}
              {tripAnalytics && (
                <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm dark:bg-muted/20">
                  <p className="font-semibold text-foreground">Riepilogo viaggio</p>
                  <ul className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                    <li>
                      Distanza stimata:{" "}
                      <span className="font-medium text-foreground">
                        {tripAnalytics.totalKm} km
                      </span>
                    </li>
                    <li>
                      Tempo di guida:{" "}
                      <span className="font-medium text-foreground">
                        {tripAnalytics.totalHoursDrive} h
                        {tripAnalytics.hasPartialTimes ? " (parziale)" : ""}
                      </span>
                    </li>
                    <li>
                      {tripAnalytics.dayCount} giorni · {tripAnalytics.stopCount}{" "}
                      tappe
                    </li>
                    <li>
                      Tratti in linea d’aria: {tripAnalytics.legsAirOnly}
                    </li>
                  </ul>
                </div>
              )}
              {itineraryHealth && (
                <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm dark:bg-muted/20">
                  <p className="font-semibold text-foreground">Stato energia viaggio</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rischio{" "}
                    <span className="font-medium text-foreground">
                      {itineraryHealth.tripHealthSummary.riskLevel}
                    </span>{" "}
                    · media carico {itineraryHealth.tripHealthSummary.averageLoadScore}/100 · giorni critici{" "}
                    {itineraryHealth.tripHealthSummary.overloadDays}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Budget attivo: max {itineraryHealth.budget.maxStops} tappe, ~
                    {Math.round(itineraryHealth.budget.maxDriveMinutes / 60)}h guida, ~
                    {Math.round(itineraryHealth.budget.maxTotalMinutes / 60)}h carico.
                  </p>
                </div>
              )}
              {rebalancingSuggestions.length > 0 && (
                <div className="rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-sm">
                  <p className="font-semibold text-foreground">
                    Suggerimenti di riequilibrio
                  </p>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {rebalancingSuggestions.slice(0, 4).map((s) => (
                      <li key={s.id} className="rounded-md border border-border/60 p-2">
                        <p className="font-medium text-foreground">{s.stopTitle ?? "Riequilibrio giornata"}</p>
                        <p>{s.reason}</p>
                        <p className="mt-0.5">{s.expectedImpact}</p>
                        {s.type !== "split_day_hint" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 px-2 text-[11px]"
                            onClick={() => void openRebalancePreview(s)}
                          >
                            Applica suggerimento
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Dialog
                open={rebalanceDialogOpen}
                onOpenChange={(v) => {
                  if (!v) {
                    setRebalanceErr(null);
                    setRebalanceSuggestion(null);
                    setRebalancePreview(null);
                    setRebalancePreviewDelta(null);
                  }
                  setRebalanceDialogOpen(v);
                }}
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Conferma riequilibrio</DialogTitle>
                    <DialogDescription>
                      Anteprima dell’impatto prima di modificare l’itinerario.
                    </DialogDescription>
                  </DialogHeader>
                  {rebalanceErr && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {rebalanceErr}
                    </p>
                  )}
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-foreground">
                      {rebalanceSuggestion?.stopTitle ?? "Riequilibrio giornata"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rebalanceSuggestion?.reason}
                    </p>
                    {rebalancePreviewDelta && (
                      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs">
                        <p className="font-medium text-foreground">Impatto stimato</p>
                        <p className="text-muted-foreground">
                          Rischio: {rebalancePreviewDelta.riskLevelBefore} →{" "}
                          {rebalancePreviewDelta.riskLevelAfter}
                        </p>
                        <p className="text-muted-foreground">
                          Media carico: {rebalancePreviewDelta.averageLoadScoreBefore}
                          /100 → {rebalancePreviewDelta.averageLoadScoreAfter}/100
                        </p>
                        <p className="text-muted-foreground">
                          Giorni critici: {rebalancePreviewDelta.overloadDaysBefore} →{" "}
                          {rebalancePreviewDelta.overloadDaysAfter}
                        </p>
                      </div>
                    )}
                    {rebalanceBusy && (
                      <p className="text-xs text-muted-foreground">
                        Calcolo anteprima…
                      </p>
                    )}
                    {rebalancePreview?.tripHealthSummary && (
                      <p className="text-xs text-muted-foreground">
                        Dopo: rischio{" "}
                        <span className="font-medium text-foreground">
                          {rebalancePreview.tripHealthSummary.riskLevel}
                        </span>{" "}
                        · media carico{" "}
                        {rebalancePreview.tripHealthSummary.averageLoadScore}/100
                      </p>
                    )}
                    {rebalanceMiniDiff && (
                      <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-xs">
                        <p className="font-medium text-foreground">Cosa cambia</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {rebalanceMiniDiff.changeLabel}
                        </p>
                        {rebalanceMiniDiff.affectedDays.length > 0 && (
                          <ul className="mt-2 space-y-1 text-muted-foreground">
                            {rebalanceMiniDiff.affectedDays.map((d) => (
                              <li key={d.dayIndex}>
                                Giorno {d.dayIndex}: carico{" "}
                                {d.beforeScore != null ? `${d.beforeScore}/100` : "n/d"} →{" "}
                                {d.afterScore != null ? `${d.afterScore}/100` : "n/d"} · warning{" "}
                                {d.beforeIssues} → {d.afterIssues}
                              </li>
                            ))}
                          </ul>
                        )}
                        {rebalanceMiniDiff.touchedDays.length > 3 && (
                          <p className="mt-1 text-muted-foreground">
                            + altri {rebalanceMiniDiff.touchedDays.length - 3} giorni toccati
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRebalanceDialogOpen(false)}
                      disabled={rebalanceBusy}
                    >
                      Annulla
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void applyRebalanceConfirmed()}
                      disabled={rebalanceBusy || !rebalanceSuggestion}
                    >
                      Applica
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Salva itinerario</DialogTitle>
                    <DialogDescription>
                      Salva nel tuo account, dentro una cartella.
                    </DialogDescription>
                  </DialogHeader>
                  {saveErr && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {saveErr}
                    </p>
                  )}
                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <Label htmlFor="save-title">Titolo</Label>
                      <Input
                        id="save-title"
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="folder">Cartella</Label>
                      <select
                        id="folder"
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                      >
                        <option value="">Senza cartella</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-folder">Nuova cartella</Label>
                      <div className="flex gap-2">
                        <Input
                          id="new-folder"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Es. Estate 2026"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void createFolder()}
                          disabled={saveBusy || !newFolderName.trim()}
                        >
                          Crea
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSaveDialogOpen(false)}
                      disabled={saveBusy}
                    >
                      Chiudi
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void saveItinerary()}
                      disabled={saveBusy || !authReady || !authUser}
                    >
                      {saveBusy ? "Salvo…" : "Salva"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
                        aria-selected={mapFocusedDay === "all"}
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
                          aria-selected={mapFocusedDay === dayIndex}
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
                            onClick={() => {
                              setMapFocusedDay(dayIndex);
                              setDayListOpen((p) => ({
                                ...p,
                                [dayIndex]: !(p[dayIndex] ?? false),
                              }));
                            }}
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
                            {(() => {
                              const load = dayLoadByDay.get(dayIndex);
                              const health = itineraryHealth?.dayHealth.find(
                                (h) => h.dayIndex === dayIndex
                              );
                              if (!load) return null;
                              const h =
                                Math.round((load.totalMinutes / 60) * 10) / 10;
                              return (
                                <span
                                  className={cn(
                                    "text-xs",
                                    load.overload
                                      ? "font-medium text-amber-700 dark:text-amber-400"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  ~{h}h carico stim.
                                  {load.overload ? " · intenso" : ""}
                                  {health && health.issues.length > 0
                                    ? ` · warning ${health.issues.length}`
                                    : ""}
                                </span>
                              );
                            })()}
                          </button>
                          {(dayListOpen[dayIndex] ?? false) && (
                          <ul className="space-y-2 p-3">
                            {(() => {
                              const health = itineraryHealth?.dayHealth.find(
                                (h) => h.dayIndex === dayIndex
                              );
                              if (!health || health.issues.length === 0) return null;
                              return (
                                <li className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
                                  <p className="font-medium">
                                    Carico giorno {dayIndex}: {health.loadScore}/100
                                  </p>
                                  <p className="mt-1 opacity-90">
                                    {health.suggestions
                                      .map((s) => s.title)
                                      .slice(0, 2)
                                      .join(" · ")}
                                  </p>
                                </li>
                              );
                            })()}
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
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    try {
                                      const raw =
                                        e.dataTransfer.getData(MIME_STOP_DRAG);
                                      if (!raw) return;
                                      const parsed = JSON.parse(raw) as {
                                        fromKey: string;
                                        dayIndex: number;
                                      };
                                      if (parsed.dayIndex !== dayIndex) return;
                                      moveStopInDay(
                                        dayIndex,
                                        parsed.fromKey,
                                        row.key
                                      );
                                    } catch {
                                      /* ignore */
                                    }
                                  }}
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
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData(
                                            MIME_STOP_DRAG,
                                            JSON.stringify({
                                              fromKey: row.key,
                                              dayIndex: row.dayIndex,
                                            })
                                          );
                                          e.dataTransfer.effectAllowed =
                                            "move";
                                        }}
                                        className="mt-0.5 shrink-0 cursor-grab rounded-md border border-border/60 bg-muted/40 p-1 text-muted-foreground active:cursor-grabbing"
                                        aria-label="Riordina trascinando"
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onSelectStop(row.key);
                                          toggleExpanded(row.key);
                                        }}
                                        className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
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
                                          {row.stop.stopStatus === "optional" && (
                                            <Badge
                                              variant="outline"
                                              className="text-[10px]"
                                            >
                                              Opzionale
                                            </Badge>
                                          )}
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
                                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      )}
                                    </button>
                                    </div>

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
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="w-full sm:w-auto"
                                          disabled={
                                            row.stop.lat == null ||
                                            row.stop.lng == null
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void openParkingForRow(row.key);
                                          }}
                                        >
                                          <ParkingCircle className="h-3.5 w-3.5" />
                                          Parcheggi vicini
                                        </Button>
                                        {row.stop.aiRationale && (
                                          <p className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-muted-foreground">
                                            <span className="font-medium text-foreground">
                                              Perché questa tappa:{" "}
                                            </span>
                                            {row.stop.aiRationale}
                                          </p>
                                        )}
                                        {row.stop.notes && (
                                          <p className="text-muted-foreground">
                                            {row.stop.notes}
                                          </p>
                                        )}
                                        <div className="flex flex-wrap gap-2 pt-1">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleStopOptionalByKey(row.key);
                                            }}
                                          >
                                            {row.stop.stopStatus === "optional"
                                              ? "Conferma tappa"
                                              : "Segna opzionale"}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteStopByKey(row.key);
                                            }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Elimina
                                          </Button>
                                        </div>
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
                                            reconciledResult.legs?.[row.globalIndex],
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
                      <p>{reconciledResult.summary}</p>
                      {reconciledResult.bestPeriodNote && (
                        <p className="text-xs">{reconciledResult.bestPeriodNote}</p>
                      )}
                    </div>
                  </details>
                </div>

                <div className="min-w-0 space-y-4">
                  {tripAnalytics && (
                    <div
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs",
                        tripAnalytics.legsAirOnly > 0
                          ? "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                          : "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                      )}
                    >
                      {tripAnalytics.legsAirOnly > 0 ? (
                        <>
                          Mappa e itinerario parzialmente allineati: {tripAnalytics.legsAirOnly} tratte sono stimate in linea d&apos;aria.
                        </>
                      ) : (
                        <>Mappa e itinerario allineati: tutte le tratte hanno stima stradale.</>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 rounded-xl border border-border/70 bg-muted/25 px-3 py-2 text-xs dark:bg-muted/15">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={mapLayers.showConfirmedStops}
                        onCheckedChange={(v) =>
                          setMapLayers((m) => ({
                            ...m,
                            showConfirmedStops: v === true,
                          }))
                        }
                      />
                      Tappe confermate
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={mapLayers.showOptionalStops}
                        onCheckedChange={(v) =>
                          setMapLayers((m) => ({
                            ...m,
                            showOptionalStops: v === true,
                          }))
                        }
                      />
                      Opzionali
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={mapLayers.showRoute}
                        onCheckedChange={(v) =>
                          setMapLayers((m) => ({
                            ...m,
                            showRoute: v === true,
                          }))
                        }
                      />
                      Tratte
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={mapLayers.showAccommodations}
                        onCheckedChange={(v) =>
                          setMapLayers((m) => ({
                            ...m,
                            showAccommodations: v === true,
                          }))
                        }
                      />
                      Alloggi
                    </label>
                  </div>
                  <div className="rounded-xl ring-1 ring-border/80 ring-offset-2 ring-offset-background dark:ring-offset-background">
                    <ItineraryResultMap
                      result={reconciledResult}
                      activeStopKey={activeStopKey}
                      focusedDay={mapFocusedDay}
                      onStopSelect={onSelectStop}
                      cameraTarget={cameraTarget}
                      activeStopTitle={activeStop?.title ?? null}
                      onOpenStopDetail={() => setStopDetailOpen(true)}
                      layerVisibility={mapLayers}
                      onLegSegmentClick={(info) => {
                        setLegMapInfo(info);
                        onSelectStop(info.keyA);
                      }}
                    />
                  </div>
                  {legMapInfo && (
                    <div className="rounded-lg border border-border/70 bg-card/90 px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium text-foreground">
                        Giorno {legMapInfo.dayIndex}: {legMapInfo.fromTitle} →{" "}
                        {legMapInfo.toTitle}
                      </p>
                      <p className="text-muted-foreground">
                        {legMapInfo.distanceKm != null
                          ? `circa ${legMapInfo.distanceKm} km`
                          : "Distanza n/d"}
                        {legMapInfo.durationMin != null
                          ? ` · ${legMapInfo.durationMin} min`
                          : ""}
                        {legMapInfo.airDistanceOnly ? " (linea d’aria)" : ""}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 px-2"
                        onClick={() => setLegMapInfo(null)}
                      >
                        Chiudi
                      </Button>
                    </div>
                  )}
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
                      {activeStop.aiRationale && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Perché:{" "}
                          </span>
                          {activeStop.aiRationale}
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
              disabled={!canNext || generating}
              onClick={onGenerate}
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
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

        <Dialog
          open={generateModalOpen}
          onOpenChange={(open) => {
            if (!generating) {
              setGenerateModalOpen(open);
              if (!open) setGenModalError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generazione itinerario</DialogTitle>
              <DialogDescription>
                {genModalError
                  ? genModalError
                  : "Attendi mentre prepariamo il tuo viaggio."}
              </DialogDescription>
            </DialogHeader>
            {!genModalError && (
              <>
                <p className="text-sm text-muted-foreground">{genPhase}</p>
                <Progress value={genProgress} className="h-2" />
              </>
            )}
            {genModalError && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setGenerateModalOpen(false);
                  setGenModalError(null);
                }}
              >
                Chiudi
              </Button>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={parkingDialogOpen} onOpenChange={setParkingDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Parcheggi vicini</DialogTitle>
              <DialogDescription>
                Risultati nelle vicinanze della tappa selezionata.
              </DialogDescription>
            </DialogHeader>
            {parkingLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {parkingErr && (
              <p className="text-sm text-destructive">{parkingErr}</p>
            )}
            {!parkingLoading && !parkingErr && parkingRows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nessun parcheggio trovato nelle vicinanze.
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {parkingRows.map((p) => (
                <li
                  key={p.placeId}
                  className="rounded-lg border border-border/70 p-3 text-sm"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.formattedAddress} · ~{p.distanceKm} km
                  </p>
                  <a
                    className="mt-2 inline-block text-xs font-medium text-primary underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.lat},${p.lng}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apri in Maps
                  </a>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>

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
