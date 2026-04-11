const DIRECTIONS = "https://maps.googleapis.com/maps/api/directions/json";

export type LegSummary = {
  distanceMeters: number;
  durationSeconds: number;
};

export async function drivingLegSummary(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string
): Promise<LegSummary | null> {
  const q = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    key: apiKey,
  });
  const res = await fetch(`${DIRECTIONS}?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    routes?: Array<{
      legs: Array<{ distance: { value: number }; duration: { value: number } }>;
    }>;
  };
  if (data.status !== "OK" || !data.routes?.[0]?.legs?.[0]) return null;
  const leg = data.routes[0].legs[0];
  return {
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
  };
}
