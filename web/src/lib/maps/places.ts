import type { LatLngBounds } from "@/lib/maps/bounds";

const TEXT_SEARCH =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";

export type PlaceSearchHit = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
};

export async function textSearchPlaces(
  query: string,
  apiKey: string,
  options?: { bounds?: LatLngBounds }
): Promise<PlaceSearchHit | null> {
  const q = new URLSearchParams({
    query,
    key: apiKey,
  });
  if (options?.bounds) {
    const b = options.bounds;
    q.set(
      "location",
      `${(b.north + b.south) / 2},${(b.east + b.west) / 2}`
    );
    const latSpan = Math.abs(b.north - b.south);
    const lngSpan = Math.abs(b.east - b.west);
    const radius = Math.max(
      1000,
      Math.min(50000, Math.round((latSpan + lngSpan) * 50 * 1000))
    );
    q.set("radius", String(radius));
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
  if (
    (data.status !== "OK" && data.status !== "ZERO_RESULTS") ||
    !data.results?.[0]
  ) {
    return null;
  }
  const r = data.results[0];
  return {
    name: r.name,
    placeId: r.place_id,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
  };
}

export function mapsPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
}
