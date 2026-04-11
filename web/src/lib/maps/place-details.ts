const DETAILS =
  "https://maps.googleapis.com/maps/api/place/details/json";

export type PlaceDetailsPayload = {
  name: string;
  formattedAddress?: string;
  editorialSummary?: string;
  photoRefs: string[];
};

/** Place Details (legacy) — richiede Places API abilitata sulla chiave. */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<PlaceDetailsPayload | null> {
  const fields = ["name", "formatted_address", "photo", "reviews"].join(",");
  const q = new URLSearchParams({
    place_id: placeId,
    fields,
    key: apiKey,
  });
  const res = await fetch(`${DETAILS}?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    result?: {
      name?: string;
      formatted_address?: string;
      photos?: Array<{ photo_reference: string }>;
      reviews?: Array<{ text?: string; author_name?: string }>;
    };
  };
  if (data.status !== "OK" || !data.result) return null;
  const r = data.result;
  const editorialSummary = r.reviews?.[0]?.text;
  return {
    name: r.name ?? "Luogo",
    formattedAddress: r.formatted_address,
    editorialSummary,
    photoRefs: (r.photos ?? []).slice(0, 8).map((p) => p.photo_reference),
  };
}
