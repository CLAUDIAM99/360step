"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleMap,
  InfoWindow,
  LoadScript,
  Marker,
  Polyline,
} from "@react-google-maps/api";
import { Info, Maximize2, Minimize2 } from "lucide-react";
import type {
  GroundedStop,
  ItineraryResult,
  StopType,
} from "@/lib/itinerary/schema";
import { MAP_MARKER_MUTED_HEX, dayItineraryHex } from "@/lib/itinerary/colors";
import {
  decodeGooglePolyline,
  greatCircleSample,
} from "@/lib/maps/polyline";
import {
  easeOutCubic,
  lerp,
  shortestLngDelta,
} from "@/lib/maps/smooth-camera";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

export function stopKey(
  dayIndex: number,
  orderInDay: number,
  title: string,
  placeId?: string
) {
  return `${dayIndex}:${orderInDay}:${placeId ?? title}`;
}

function typeSymbol(type: StopType): string {
  switch (type) {
    case "meal":
      return "R";
    case "parking":
      return "P";
    case "sleep":
      return "S";
    case "camper_stop":
      return "C";
    case "fuel":
      return "F";
    case "scenic":
      return "V";
    default:
      return "T";
  }
}

function markerIconDataUrl(hex: string, symbol: string, active: boolean): string {
  const stroke = active ? "#2a1810" : "#faf6f2";
  const strokeWidth = active ? 1.8 : 1.1;
  const isSleep = symbol === "S";
  const baseShape = isSleep
    ? `<rect x="4" y="3" width="16" height="16" rx="4" fill="${hex}" stroke="${stroke}" stroke-width="${strokeWidth}"/><path d="M8 12h8v4H8z" fill="#ffffff"/><path d="M8 10h5v2H8z" fill="#ffffff"/>`
    : `<path fill="${hex}" stroke="${stroke}" stroke-width="${strokeWidth}" d="M12 2C7 2 3 6 3 11c0 7 9 17 9 17s9-10 9-17c0-5-4-9-9-9z"/><circle cx="12" cy="11" r="4.1" fill="#ffffff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32">${baseShape}<text x="12" y="12.6" font-size="5.2" text-anchor="middle" fill="#2a1810" font-family="Arial, sans-serif" font-weight="700">${symbol}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type FocusedDay = "all" | number;

export type LegSegmentMapInfo = {
  dayIndex: number;
  keyA: string;
  keyB: string;
  fromTitle: string;
  toTitle: string;
  distanceKm?: number;
  durationMin?: number;
  airDistanceOnly?: boolean;
};

export type MapLayerVisibility = {
  showConfirmedStops: boolean;
  showOptionalStops: boolean;
  showRoute: boolean;
  showAccommodations: boolean;
};

const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  showConfirmedStops: true,
  showOptionalStops: true,
  showRoute: true,
  showAccommodations: true,
};

function stopMatchesLayer(
  stop: GroundedStop,
  layers: MapLayerVisibility
): boolean {
  if (stop.type === "sleep" && !layers.showAccommodations) return false;
  const optional = stop.stopStatus === "optional";
  if (optional) return layers.showOptionalStops;
  return layers.showConfirmedStops;
}

type Props = {
  result: ItineraryResult;
  activeStopKey: string | null;
  /** Giorno evidenziato sulla mappa; gli altri sono attenuati. */
  focusedDay: FocusedDay;
  onStopSelect: (stopKey: string | null) => void;
  /** Tour / focus esplicito (prevale sul pan solo marker). */
  cameraTarget?: { lat: number; lng: number; zoom: number } | null;
  onLegSegmentClick?: (info: LegSegmentMapInfo) => void;
  activeStopTitle?: string | null;
  onOpenStopDetail?: () => void;
  /** Filtri confermati / opzionali e tratte. */
  layerVisibility?: Partial<MapLayerVisibility>;
};

export function ItineraryResultMap({
  result,
  activeStopKey,
  focusedDay,
  onStopSelect,
  cameraTarget = null,
  onLegSegmentClick,
  activeStopTitle,
  onOpenStopDetail,
  layerVisibility: layerVisibilityProp,
}: Props) {
  const layers = useMemo(
    () => ({ ...DEFAULT_MAP_LAYERS, ...layerVisibilityProp }),
    [layerVisibilityProp]
  );
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Mostra CTA dettaglio nel callout solo dopo tap su Info. */
  const [calloutDetailOpen, setCalloutDetailOpen] = useState(false);
  const cameraAnimRef = useRef<number | null>(null);

  const mapContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: fullscreen ? "min(85vh, 900px)" : "min(400px, 50vh)",
    }),
    [fullscreen]
  );

  const sortedDays = useMemo(
    () => [...result.days].sort((a, b) => a.dayIndex - b.dayIndex),
    [result.days]
  );

  const globalStops = useMemo(() => {
    const flat = sortedDays.flatMap((d) => d.stops);
    return [...flat].sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.orderInDay - b.orderInDay;
    });
  }, [sortedDays]);

  const legPaths = useMemo(() => {
    const legs = result.legs ?? [];
    const out: {
      path: { lat: number; lng: number }[];
      dayIndex: number;
      keyA: string;
      keyB: string;
      fromTitle: string;
      toTitle: string;
      distanceKm?: number;
      durationMin?: number;
      airDistanceOnly?: boolean;
      stopA: GroundedStop;
      stopB: GroundedStop;
    }[] = [];
    for (let i = 0; i < globalStops.length - 1; i++) {
      const a = globalStops[i];
      const b = globalStops[i + 1];
      if (
        a.lat == null ||
        a.lng == null ||
        b.lat == null ||
        b.lng == null
      ) {
        continue;
      }
      const keyA = stopKey(a.dayIndex, a.orderInDay, a.title, a.placeId);
      const keyB = stopKey(b.dayIndex, b.orderInDay, b.title, b.placeId);
      const leg = legs[i];
      let path: { lat: number; lng: number }[];
      if (leg?.encodedPolyline) {
        path = decodeGooglePolyline(leg.encodedPolyline);
      } else {
        path = greatCircleSample(
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
          42
        );
      }
      if (path.length >= 2) {
        out.push({
          path,
          dayIndex: a.dayIndex,
          keyA,
          keyB,
          fromTitle: a.title,
          toTitle: b.title,
          distanceKm: leg?.distanceKm,
          durationMin: leg?.durationMin,
          airDistanceOnly: leg?.airDistanceOnly,
          stopA: a,
          stopB: b,
        });
      }
    }
    return out;
  }, [globalStops, result.legs]);

  const centerDefault = useMemo(() => {
    for (const day of sortedDays) {
      for (const s of day.stops) {
        if (s.lat != null && s.lng != null) {
          return { lat: s.lat, lng: s.lng };
        }
      }
    }
    return { lat: 45.46, lng: 9.19 };
  }, [sortedDays]);

  const coordinateByKey = useMemo(() => {
    const data = new Map<string, google.maps.LatLngLiteral>();
    for (const day of sortedDays) {
      const ordered = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
      for (const stop of ordered) {
        if (stop.lat == null || stop.lng == null) continue;
        data.set(
          stopKey(day.dayIndex, stop.orderInDay, stop.title, stop.placeId),
          { lat: stop.lat, lng: stop.lng }
        );
      }
    }
    return data;
  }, [sortedDays]);

  const fitBoundsForFocus = useCallback(
    (m: google.maps.Map, focus: FocusedDay) => {
      const bounds = new google.maps.LatLngBounds();
      let has = false;
      if (focus === "all") {
        for (const day of sortedDays) {
          for (const s of day.stops) {
            if (s.lat != null && s.lng != null) {
              bounds.extend({ lat: s.lat, lng: s.lng });
              has = true;
            }
          }
        }
      } else {
        const day = sortedDays.find((d) => d.dayIndex === focus);
        if (day) {
          for (const s of day.stops) {
            if (s.lat != null && s.lng != null) {
              bounds.extend({ lat: s.lat, lng: s.lng });
              has = true;
            }
          }
        }
      }
      if (has) {
        m.fitBounds(bounds, 56);
      }
    },
    [sortedDays]
  );

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
  }, []);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!map || cameraTarget) return;
    fitBoundsForFocus(map, focusedDay);
  }, [map, focusedDay, fitBoundsForFocus, cameraTarget]);

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const id = window.setTimeout(() => {
      google.maps.event.trigger(map, "resize");
      if (!cameraTarget) {
        fitBoundsForFocus(map, focusedDay);
      }
    }, fullscreen ? 180 : 0);
    return () => window.clearTimeout(id);
  }, [fullscreen, map, focusedDay, fitBoundsForFocus, cameraTarget]);

  useEffect(() => {
    setCalloutDetailOpen(false);
  }, [activeStopKey]);

  useEffect(() => {
    if (!map || !cameraTarget) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      map.panTo({ lat: cameraTarget.lat, lng: cameraTarget.lng });
      map.setZoom(cameraTarget.zoom);
      return;
    }
    const startCenter = map.getCenter();
    const startZoom = map.getZoom() ?? 10;
    if (!startCenter) {
      map.panTo({ lat: cameraTarget.lat, lng: cameraTarget.lng });
      map.setZoom(cameraTarget.zoom);
      return;
    }
    const fromLat = startCenter.lat();
    const fromLng = startCenter.lng();
    const fromZ = startZoom;
    const toLat = cameraTarget.lat;
    const toLng = cameraTarget.lng;
    const toZ = cameraTarget.zoom;
    const dLng = shortestLngDelta(fromLng, toLng);
    const durationMs = 820;
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const e = easeOutCubic(t);
      const lat = lerp(fromLat, toLat, e);
      const lng = fromLng + dLng * e;
      const zoom = lerp(fromZ, toZ, e);
      map.setCenter({ lat, lng });
      map.setZoom(zoom);
      if (t < 1) {
        cameraAnimRef.current = requestAnimationFrame(tick);
      } else {
        cameraAnimRef.current = null;
      }
    };

    if (cameraAnimRef.current != null) {
      cancelAnimationFrame(cameraAnimRef.current);
    }
    cameraAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (cameraAnimRef.current != null) {
        cancelAnimationFrame(cameraAnimRef.current);
        cameraAnimRef.current = null;
      }
    };
  }, [map, cameraTarget]);

  useEffect(() => {
    if (!map || !activeStopKey || cameraTarget) return;
    const point = coordinateByKey.get(activeStopKey);
    if (!point) return;
    map.panTo(point);
    if ((map.getZoom() ?? 0) < 11) map.setZoom(11);
  }, [activeStopKey, coordinateByKey, map, cameraTarget]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, []);

  if (!apiKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Imposta{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
        per vedere la mappa dell&apos;itinerario.
      </p>
    );
  }

  return (
    <LoadScript
      googleMapsApiKey={apiKey}
      loadingElement={
        <p className="text-sm text-muted-foreground">Carico mappa…</p>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Se la mappa non carica, prova a disattivare blocchi annunci per questo
          sito (spesso bloccano{" "}
          <code className="rounded bg-muted px-1">maps.googleapis.com</code>
          ).
        </p>
        <div
          ref={wrapRef}
          className={cn(
            "relative rounded-xl border border-border/80 bg-card/40",
            fullscreen && "min-h-[70vh]"
          )}
        >
          <div className="absolute right-2 top-2 z-[1] flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full bg-background/95 shadow-md backdrop-blur-sm"
              onClick={toggleFullscreen}
              aria-label={
                fullscreen ? "Esci da schermo intero" : "Schermo intero mappa"
              }
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={centerDefault}
            zoom={10}
            onLoad={onMapLoad}
            options={{
              mapId: MAP_ID,
              streetViewControl: false,
              gestureHandling: "greedy",
            }}
          >
            {legPaths.map((seg, idx) => {
              if (
                !layers.showRoute ||
                !stopMatchesLayer(seg.stopA, layers) ||
                !stopMatchesLayer(seg.stopB, layers)
              ) {
                return null;
              }
              const dayDimmed =
                focusedDay !== "all" && focusedDay !== seg.dayIndex;
              const edgeTouchesActive =
                activeStopKey != null &&
                (activeStopKey === seg.keyA || activeStopKey === seg.keyB);
              const edgeIsActive =
                !dayDimmed && focusedDay === "all" && edgeTouchesActive;
              const edgeIsActiveFocusedDay =
                !dayDimmed && focusedDay !== "all" && edgeTouchesActive;

              let strokeOpacity: number;
              let strokeWeight: number;
              let zIndex: number;

              if (dayDimmed) {
                strokeOpacity = 0.18;
                strokeWeight = 3;
                zIndex = 10;
              } else if (focusedDay === "all") {
                strokeOpacity = edgeIsActive ? 0.98 : 0.78;
                strokeWeight = edgeIsActive ? 6 : 4;
                zIndex = edgeIsActive ? 120 : 40;
              } else {
                strokeOpacity = edgeIsActiveFocusedDay ? 0.98 : 0.85;
                strokeWeight = edgeIsActiveFocusedDay ? 6 : 4;
                zIndex = edgeIsActiveFocusedDay ? 120 : 35;
              }

              return (
                <Polyline
                  key={`pl-g-${idx}`}
                  path={seg.path}
                  options={{
                    strokeColor: dayItineraryHex(seg.dayIndex),
                    strokeOpacity,
                    strokeWeight,
                    zIndex,
                    clickable: true,
                  }}
                  onClick={() =>
                    onLegSegmentClick?.({
                      dayIndex: seg.dayIndex,
                      keyA: seg.keyA,
                      keyB: seg.keyB,
                      fromTitle: seg.fromTitle,
                      toTitle: seg.toTitle,
                      distanceKm: seg.distanceKm,
                      durationMin: seg.durationMin,
                      airDistanceOnly: seg.airDistanceOnly,
                    })
                  }
                />
              );
            })}

            {sortedDays.flatMap((day) => {
              const ordered = [...day.stops].sort(
                (a, b) => a.orderInDay - b.orderInDay
              );
              const out: ReactNode[] = [];
              const dayDimmed =
                focusedDay !== "all" && focusedDay !== day.dayIndex;

              ordered.forEach((s, i) => {
                if (s.lat == null || s.lng == null) return;
                if (!stopMatchesLayer(s, layers)) return;
                const key = stopKey(
                  day.dayIndex,
                  s.orderInDay,
                  s.title,
                  s.placeId
                );
                const stopInFocus =
                  focusedDay === "all" || focusedDay === day.dayIndex;
                const isActive =
                  activeStopKey === key && stopInFocus && !dayDimmed;
                const fillHex = dayDimmed
                  ? MAP_MARKER_MUTED_HEX
                  : dayItineraryHex(day.dayIndex);
                const zMarker = dayDimmed ? 30 : isActive ? 300 : 100;
                out.push(
                  <Marker
                    key={`m-${day.dayIndex}-${i}-${s.title}`}
                    position={{ lat: s.lat, lng: s.lng }}
                    title={s.title}
                    zIndex={zMarker}
                    onClick={() => onStopSelect(key)}
                    icon={{
                      url: markerIconDataUrl(
                        fillHex,
                        typeSymbol(s.type),
                        isActive
                      ),
                      scaledSize:
                        typeof google !== "undefined"
                          ? new google.maps.Size(
                              isActive ? 34 : dayDimmed ? 26 : 30,
                              isActive ? 46 : dayDimmed ? 34 : 40
                            )
                          : undefined,
                      anchor:
                        typeof google !== "undefined"
                          ? new google.maps.Point(
                              isActive ? 17 : dayDimmed ? 13 : 15,
                              isActive ? 46 : dayDimmed ? 34 : 40
                            )
                          : undefined,
                    }}
                  />
                );
                if (isActive && activeStopTitle && activeStopKey === key) {
                  out.push(
                    <InfoWindow
                      key={`iw-${key}`}
                      position={{ lat: s.lat, lng: s.lng }}
                      onCloseClick={() => onStopSelect(null)}
                    >
                      <div className="max-w-[220px] space-y-2 p-1 font-sans text-gray-900">
                        <div className="flex items-start gap-1.5">
                          <p className="m-0 flex-1 text-sm font-semibold leading-tight">
                            {activeStopTitle}
                          </p>
                          {onOpenStopDetail ? (
                            <button
                              type="button"
                              className="mt-0.5 inline-flex shrink-0 rounded-md border border-gray-300 bg-white p-1 text-gray-800 hover:bg-gray-50"
                              title="Apri dettagli"
                              aria-label="Informazioni sulla tappa"
                              onClick={() =>
                                setCalloutDetailOpen((v) => !v)
                              }
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <p className="m-0 text-xs text-gray-600">
                          {typeSymbol(s.type)} · Giorno {day.dayIndex}
                        </p>
                        {onOpenStopDetail && calloutDetailOpen ? (
                          <button
                            type="button"
                            className="w-full rounded-md bg-[#B3123F] px-2 py-1.5 text-xs font-medium text-white"
                            onClick={() => onOpenStopDetail()}
                          >
                            Per saperne di più
                          </button>
                        ) : null}
                      </div>
                    </InfoWindow>
                  );
                }
              });
              return out;
            })}
          </GoogleMap>
        </div>
      </div>
    </LoadScript>
  );
}
