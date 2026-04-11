"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GoogleMap, LoadScript, Marker, Polyline } from "@react-google-maps/api";
import type { ItineraryResult, StopType } from "@/lib/itinerary/schema";

const mapContainerStyle = { width: "100%", height: "min(400px, 50vh)" };

const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

const TYPE_COLORS: Record<StopType, string> = {
  visit: "#2563eb",
  meal: "#dc2626",
  sleep: "#7c3aed",
  parking: "#0891b2",
  camper_stop: "#0d9488",
  scenic: "#16a34a",
  fuel: "#f97316",
  other: "#6b7280",
};

function stopKey(dayIndex: number, orderInDay: number, title: string, placeId?: string) {
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
  const stroke = active ? "#111827" : "#ffffff";
  const strokeWidth = active ? 1.8 : 1.1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 24 32"><path fill="${hex}" stroke="${stroke}" stroke-width="${strokeWidth}" d="M12 2C7 2 3 6 3 11c0 7 9 17 9 17s9-10 9-17c0-5-4-9-9-9z"/><circle cx="12" cy="11" r="4.1" fill="#ffffff"/><text x="12" y="12.6" font-size="5.2" text-anchor="middle" fill="#111827" font-family="Arial, sans-serif" font-weight="700">${symbol}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type Props = {
  result: ItineraryResult;
  activeStopKey: string | null;
  onStopSelect: (stopKey: string) => void;
};

export function ItineraryResultMap({
  result,
  activeStopKey,
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

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      setMap(map);
      const bounds = new google.maps.LatLngBounds();
      let has = false;
      for (const day of sortedDays) {
        for (const s of day.stops) {
          if (s.lat != null && s.lng != null) {
            bounds.extend({ lat: s.lat, lng: s.lng });
            has = true;
          }
        }
      }
      if (has) {
        map.fitBounds(bounds, 56);
      }
    },
    [sortedDays]
  );

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
        <p className="text-xs text-[hsl(25_35%_32%)] dark:text-[hsl(35_25%_78%)]">
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
              const edgeIsActive =
                activeStopKey != null &&
                (activeStopKey ===
                  stopKey(day.dayIndex, a.orderInDay, a.title, a.placeId) ||
                  activeStopKey ===
                    stopKey(day.dayIndex, b.orderInDay, b.title, b.placeId));
              out.push(
                <Polyline
                  key={`pl-${day.dayIndex}-${i}`}
                  path={[
                    { lat: a.lat, lng: a.lng },
                    { lat: b.lat, lng: b.lng },
                  ]}
                  options={{
                    strokeColor: TYPE_COLORS[b.type],
                    strokeOpacity: edgeIsActive ? 0.98 : 0.75,
                    strokeWeight: edgeIsActive ? 6 : 4,
                    zIndex: edgeIsActive ? 120 : 40,
                  }}
                />
              );
            }

            ordered.forEach((s, i) => {
              if (s.lat == null || s.lng == null) return;
              const key = stopKey(day.dayIndex, s.orderInDay, s.title, s.placeId);
              const isActive = activeStopKey === key;
              out.push(
                <Marker
                  key={`m-${day.dayIndex}-${i}-${s.title}`}
                  position={{ lat: s.lat, lng: s.lng }}
                  title={s.title}
                  zIndex={isActive ? 300 : 100}
                  onClick={() => onStopSelect(key)}
                  icon={{
                    url: markerIconDataUrl(
                      TYPE_COLORS[s.type],
                      typeSymbol(s.type),
                      isActive
                    ),
                    scaledSize:
                      typeof google !== "undefined"
                        ? new google.maps.Size(isActive ? 34 : 30, isActive ? 46 : 40)
                        : undefined,
                    anchor:
                      typeof google !== "undefined"
                        ? new google.maps.Point(isActive ? 17 : 15, isActive ? 46 : 40)
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
