"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { GoogleMap, LoadScript, Marker, Polyline } from "@react-google-maps/api";
import type { ItineraryResult } from "@/lib/itinerary/schema";

const mapContainerStyle = { width: "100%", height: "min(400px, 50vh)" };

const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

const DAY_PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be185d",
];

function colorForDay(dayIndex: number): string {
  return DAY_PALETTE[(dayIndex - 1 + DAY_PALETTE.length * 10) % DAY_PALETTE.length];
}

function markerIconDataUrl(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 24 32"><path fill="${hex}" stroke="#fff" stroke-width="1" d="M12 2C7 2 3 6 3 11c0 7 9 17 9 17s9-10 9-17c0-5-4-9-9-9z"/><circle cx="12" cy="11" r="3" fill="#fff"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type Props = {
  result: ItineraryResult;
};

export function ItineraryResultMap({ result }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
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
        <p className="text-xs text-amber-800 dark:text-amber-200/90">
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
            const color = colorForDay(day.dayIndex);
            const path: google.maps.LatLngLiteral[] = [];
            for (const s of ordered) {
              if (s.lat != null && s.lng != null) {
                path.push({ lat: s.lat, lng: s.lng });
              }
            }
            const out: ReactNode[] = [];
            if (path.length >= 2) {
              out.push(
                <Polyline
                  key={`pl-${day.dayIndex}`}
                  path={path}
                  options={{
                    strokeColor: color,
                    strokeOpacity: 0.85,
                    strokeWeight: 4,
                  }}
                />
              );
            }
            ordered.forEach((s, i) => {
              if (s.lat == null || s.lng == null) return;
              out.push(
                <Marker
                  key={`m-${day.dayIndex}-${i}-${s.title}`}
                  position={{ lat: s.lat, lng: s.lng }}
                  title={s.title}
                  icon={{
                    url: markerIconDataUrl(color),
                    scaledSize:
                      typeof google !== "undefined"
                        ? new google.maps.Size(28, 38)
                        : undefined,
                    anchor:
                      typeof google !== "undefined"
                        ? new google.maps.Point(14, 38)
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
