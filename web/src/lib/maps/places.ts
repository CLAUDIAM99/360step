import type { LatLngBounds } from "@/lib/maps/bounds";
import { pointInBounds, pointInPolygonRing } from "@/lib/maps/polygon-geometry";

const TEXT_SEARCH =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";

export type PlaceSearchHit = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
};

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Raggio (m) che copre gli angoli del bbox (bias Places Text Search). */
function radiusMetersForBounds(b: LatLngBounds): number {
  const cLat = (b.north + b.south) / 2;
  const cLng = (b.east + b.west) / 2;
  const corners: [number, number][] = [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
  ];
  let max = 0;
  for (const [lng, lat] of corners) {
    max = Math.max(max, haversineMeters(cLat, cLng, lat, lng));
  }
  return Math.min(50_000, Math.max(500, Math.round(max * 1.12)));
}

function hitMatchesArea(
  lat: number,
  lng: number,
  bounds: LatLngBounds,
  polygonRing?: [number, number][]
): boolean {
  if (polygonRing?.length) {
    return pointInPolygonRing(lng, lat, polygonRing);
  }
  return pointInBounds(lat, lng, bounds);
}

export async function textSearchPlaces(
  query: string,
  apiKey: string,
  options?: {
    bounds?: LatLngBounds;
    /** Se impostato, si accetta solo un risultato dentro il poligono utente. */
    polygonRing?: [number, number][];
  }
): Promise<PlaceSearchHit | null> {
  const q = new URLSearchParams({
    query,
    key: apiKey,
  });
  if (options?.bounds) {
    const b = options.bounds;
    const latSpan = Math.abs(b.north - b.south);
    const lngSpan = Math.abs(b.east - b.west);
    const maxSpan = Math.max(latSpan, lngSpan);
    /**
     * Aree grandi (es. Scozia): location+radius (max 50 km) esclude quasi tutti i candidati
     * rispetto al centro del bbox. Usa bias paese + filtro poligono sui risultati.
     */
    const useLocalBias = maxSpan < 0.38;
    if (useLocalBias) {
      q.set(
        "location",
        `${(b.north + b.south) / 2},${(b.east + b.west) / 2}`
      );
      q.set("radius", String(radiusMetersForBounds(b)));
    } else if (b.south >= 49 && b.north <= 61 && b.west >= -11 && b.east <= 2.5) {
      q.set("region", "uk");
    } else if (b.south >= 35.5 && b.north <= 48 && b.west >= 6 && b.east <= 19) {
      q.set("region", "it");
    }
  }
  const res = await fetch(`${TEXT_SEARCH}?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      name: string;
      place_id: string;
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return null;
  }
  const list = data.results ?? [];
  const bounds = options?.bounds;
  const ring = options?.polygonRing;
  for (const r of list) {
    const lat = r.geometry.location.lat;
    const lng = r.geometry.location.lng;
    if (bounds && !hitMatchesArea(lat, lng, bounds, ring)) {
      continue;
    }
    return {
      name: r.name,
      placeId: r.place_id,
      lat,
      lng,
      formattedAddress: r.formatted_address,
    };
  }
  return null;
}

export function mapsPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
}
