"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleMap, LoadScript, Marker, Polyline } from "@react-google-maps/api";
import type { ItineraryResult, StopType } from "@/lib/itinerary/schema";
import { MAP_MARKER_MUTED_HEX, dayItineraryHex } from "@/lib/itinerary/colors";

const mapContainerStyle = { width: "100%", height: "min(400px, 50vh)" };

const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

function stopKey(
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32"><path fill="${hex}" stroke="${stroke}" stroke-width="${strokeWidth}" d="M12 2C7 2 3 6 3 11c0 7 9 17 9 17s9-10 9-17c0-5-4-9-9-9z"/><circle cx="12" cy="11" r="4.1" fill="#ffffff"/><text x="12" y="12.6" font-size="5.2" text-anchor="middle" fill="#2a1810" font-family="Arial, sans-serif" font-weight="700">${symbol}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type FocusedDay = "all" | number;

type Props = {
  result: ItineraryResult;
  activeStopKey: string | null;
  /** Giorno evidenziato sulla mappa; gli altri sono attenuati. */
  focusedDay: FocusedDay;
  onStopSelect: (stopKey: string) => void;
};

export function ItineraryResultMap({
  result,
  activeStopKey,
  focusedDay,
  onStopSelect,
}: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const sortedDays = useMemo(
    () => [...result.days].sort((a, b) => a.dayIndex - b.dayIndex),
    [result.days]
  );

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
    if (!map) return;
    fitBoundsForFocus(map, focusedDay);
  }, [map, focusedDay, fitBoundsForFocus]);

  useEffect(() => {
    if (!map || !activeStopKey) return;
    const point = coordinateByKey.get(activeStopKey);
    if (!point) return;
    map.panTo(point);
    if ((map.getZoom() ?? 0) < 11) map.setZoom(11);
  }, [activeStopKey, coordinateByKey, map]);

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
          {sortedDays.flatMap((day) => {
            const ordered = [...day.stops].sort(
              (a, b) => a.orderInDay - b.orderInDay
            );
            const out: ReactNode[] = [];
            const dayDimmed =
              focusedDay !== "all" && focusedDay !== day.dayIndex;

            for (let i = 0; i < ordered.length - 1; i++) {
              const a = ordered[i];
              const b = ordered[i + 1];
              if (
                a.lat == null ||
                a.lng == null ||
                b.lat == null ||
                b.lng == null
              ) {
                continue;
              }
              const keyA = stopKey(
                day.dayIndex,
                a.orderInDay,
                a.title,
                a.placeId
              );
              const keyB = stopKey(
                day.dayIndex,
                b.orderInDay,
                b.title,
                b.placeId
              );
              const edgeTouchesActive =
                activeStopKey != null &&
                (activeStopKey === keyA || activeStopKey === keyB);
              const edgeIsActive =
                !dayDimmed &&
                focusedDay === "all" &&
                edgeTouchesActive;
              const edgeIsActiveFocusedDay =
                !dayDimmed &&
                focusedDay !== "all" &&
                edgeTouchesActive;

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

              out.push(
                <Polyline
                  key={`pl-${day.dayIndex}-${i}`}
                  path={[
                    { lat: a.lat, lng: a.lng },
                    { lat: b.lat, lng: b.lng },
                  ]}
                  options={{
                    strokeColor: dayItineraryHex(day.dayIndex),
                    strokeOpacity,
                    strokeWeight,
                    zIndex,
                  }}
                />
              );
            }

            ordered.forEach((s, i) => {
              if (s.lat == null || s.lng == null) return;
              const key = stopKey(
                day.dayIndex,
                s.orderInDay,
                s.title,
                s.placeId
              );
              const stopInFocus =
                focusedDay === "all" || focusedDay === day.dayIndex;
              const isActive =
                activeStopKey === key &&
                stopInFocus &&
                !dayDimmed;
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
            });
            return out;
          })}
        </GoogleMap>
      </div>
    </LoadScript>
  );
}
