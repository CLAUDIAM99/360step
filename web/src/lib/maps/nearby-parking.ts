import { haversineKm } from "@/lib/geo/distance";

const NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

export type NearbyParkingHit = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
  distanceKm: number;
};

type NearbyResponse = {
  results?: {
    place_id?: string;
    name?: string;
    vicinity?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }[];
  status: string;
  error_message?: string;
};

export async function nearbyParking(
  lat: number,
  lng: number,
  apiKey: string,
  radiusM = 1500
): Promise<NearbyParkingHit[]> {
  const u = new URL(NEARBY_URL);
  u.searchParams.set("location", `${lat},${lng}`);
  u.searchParams.set("radius", String(Math.min(5000, Math.max(200, radiusM))));
  u.searchParams.set("type", "parking");
  u.searchParams.set("key", apiKey);

  const res = await fetch(u.toString());
  const data = (await res.json()) as NearbyResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(
      data.error_message || `Nearby Search: ${data.status}`
    );
  }
  const out: NearbyParkingHit[] = [];
  for (const r of data.results ?? []) {
    const pid = r.place_id;
    const name = r.name?.trim();
    const loc = r.geometry?.location;
    if (!pid || !name || loc?.lat == null || loc?.lng == null) continue;
    const d = haversineKm({ lat, lng }, { lat: loc.lat, lng: loc.lng });
    out.push({
      name,
      placeId: pid,
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: r.vicinity ?? name,
      distanceKm: Math.round(d * 10) / 10,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, 8);
}
