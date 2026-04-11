const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";

export type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId?: string;
};

export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<GeocodeResult | null> {
  const q = new URLSearchParams({
    address,
    key: apiKey,
  });
  const res = await fetch(`${GEOCODE}?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    results?: Array<{
      formatted_address: string;
      place_id: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };
  if (data.status !== "OK" || !data.results?.[0]) return null;
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
    placeId: r.place_id,
  };
}
