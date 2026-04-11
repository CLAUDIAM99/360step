const DIRECTIONS = "https://maps.googleapis.com/maps/api/directions/json";

export type LegSummary = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string | null;
};

export async function drivingDirectionsLeg(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string,
  opts?: { preferScenic?: boolean }
): Promise<LegSummary | null> {
  const q = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    key: apiKey,
  });
  if (opts?.preferScenic) {
    q.set("avoid", "highways");
  }
  const res = await fetch(`${DIRECTIONS}?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    routes?: Array<{
      overview_polyline?: { points: string };
      legs: Array<{ distance: { value: number }; duration: { value: number } }>;
    }>;
  };
  if (data.status !== "OK" || !data.routes?.[0]?.legs?.[0]) return null;
  const route = data.routes[0];
  const leg = route.legs[0];
  return {
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
    encodedPolyline: route.overview_polyline?.points ?? null,
  };
}

/** @deprecated Usa drivingDirectionsLeg per avere anche la polyline. */
export async function drivingLegSummary(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string
): Promise<Omit<LegSummary, "encodedPolyline"> | null> {
  const r = await drivingDirectionsLeg(origin, destination, apiKey);
  if (!r) return null;
  return {
    distanceMeters: r.distanceMeters,
    durationSeconds: r.durationSeconds,
  };
}
