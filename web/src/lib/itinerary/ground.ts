import { randomUUID } from "crypto";
import {
  boundsFromArea,
  widenBounds,
  type LatLngBounds,
} from "@/lib/maps/bounds";
import { geocodeAddress } from "@/lib/maps/geocode";
import { mapsPlaceUrl, textSearchPlaces } from "@/lib/maps/places";
import { drivingLegSummary } from "@/lib/maps/routes";
import { fetchForecastForRange } from "@/lib/weather/open-meteo";
import {
  MAX_GROUNDING_CALLS_PER_REQUEST,
  MAX_PLANNED_STOPS,
} from "@/lib/limits";
import type {
  GeminiPlan,
  GeographicArea,
  GroundedStop,
  ItineraryLeg,
  ItineraryResult,
  Transport,
  GenerateItineraryRequest,
  ItineraryDay,
} from "@/lib/itinerary/schema";

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function resolveAreaBounds(
  area: GeographicArea,
  apiKey: string
): Promise<LatLngBounds> {
  if (area.kind === "corridor") {
    const a = await geocodeAddress(area.startQuery, apiKey);
    const b = await geocodeAddress(area.endQuery, apiKey);
    if (!a || !b) {
      return boundsFromArea(area);
    }
    const north = Math.max(a.lat, b.lat) + 0.5;
    const south = Math.min(a.lat, b.lat) - 0.5;
    const east = Math.max(a.lng, b.lng) + 0.5;
    const west = Math.min(a.lng, b.lng) - 0.5;
    return { north, south, east, west };
  }
  // Poligono: niente allargamento — evita di includere luoghi fuori dall’area disegnata.
  if (area.kind === "polygon") {
    return boundsFromArea(area);
  }
  return widenBounds(boundsFromArea(area), 1.1);
}

function sortStops(stops: GroundedStop[]): GroundedStop[] {
  return [...stops].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.orderInDay - b.orderInDay;
  });
}

export async function groundGeminiPlan(
  plan: GeminiPlan,
  ctx: {
    area: GeographicArea;
    transport: Transport;
    time: GenerateItineraryRequest["time"];
    mapsApiKey: string;
  }
): Promise<ItineraryResult> {
  let calls = 0;
  const bounds = await resolveAreaBounds(ctx.area, ctx.mapsApiKey);

  const flatStops = plan.days.flatMap((d) => d.stops);
  if (flatStops.length > MAX_PLANNED_STOPS) {
    throw new Error("Troppe tappe pianificate");
  }

  const grounded: GroundedStop[] = [];

  for (const s of flatStops) {
    if (calls >= MAX_GROUNDING_CALLS_PER_REQUEST) {
      grounded.push({
        ...s,
        groundingStatus: "not_found",
        notes:
          (s.notes ? `${s.notes} — ` : "") + "Non verificato (limite API).",
      });
      continue;
    }
    calls += 1;
    const polygonRing =
      ctx.area.kind === "polygon"
        ? (ctx.area.geojson.coordinates[0] as [number, number][])
        : undefined;
    const hit = await textSearchPlaces(s.searchQuery, ctx.mapsApiKey, {
      bounds,
      polygonRing,
    });
    if (!hit) {
      grounded.push({
        title: s.title,
        type: s.type,
        dayIndex: s.dayIndex,
        orderInDay: s.orderInDay,
        notes: s.notes ?? undefined,
        groundingStatus: "not_found",
      });
      continue;
    }
    grounded.push({
      title: hit.name || s.title,
      type: s.type,
      dayIndex: s.dayIndex,
      orderInDay: s.orderInDay,
      lat: hit.lat,
      lng: hit.lng,
      placeId: hit.placeId,
      formattedAddress: hit.formattedAddress,
      mapsUrl: mapsPlaceUrl(hit.placeId),
      notes: s.notes ?? undefined,
      groundingStatus: "ok",
    });
  }

  const byDay = new Map<number, GroundedStop[]>();
  for (const g of sortStops(grounded)) {
    const list = byDay.get(g.dayIndex) ?? [];
    list.push(g);
    byDay.set(g.dayIndex, list);
  }

  const days: ItineraryDay[] = plan.days.map((d) => {
    const stops = sortStops(byDay.get(d.dayIndex) ?? []);
    return {
      dayIndex: d.dayIndex,
      label: d.label ?? undefined,
      stops,
    };
  });

  // Meteo (centro bounds) se date fisse
  if (ctx.time.mode === "date_range") {
    const midLat = (bounds.north + bounds.south) / 2;
    const midLng = (bounds.east + bounds.west) / 2;
    const forecast = await fetchForecastForRange(
      midLat,
      midLng,
      ctx.time.startDate,
      ctx.time.endDate
    );
    const byDate = new Map(forecast.map((f) => [f.date, f]));
    const tripStart = new Date(ctx.time.startDate.slice(0, 10));
    for (const day of days) {
      const d = new Date(tripStart);
      d.setDate(d.getDate() + (day.dayIndex - 1));
      const key = d.toISOString().slice(0, 10);
      const f = byDate.get(key);
      if (f) {
        day.weatherSummary = `${f.summary} · ${Math.round(f.minTempC)}–${Math.round(f.maxTempC)}°C`;
      }
    }
  }

  const flatOrdered = sortStops(days.flatMap((d) => d.stops));
  const legs: ItineraryLeg[] = [];

  for (let i = 0; i < flatOrdered.length - 1; i++) {
    const a = flatOrdered[i];
    const b = flatOrdered[i + 1];
    if (
      a.lat == null ||
      a.lng == null ||
      b.lat == null ||
      b.lng == null
    ) {
      legs.push({});
      continue;
    }
    const origin = { lat: a.lat, lng: a.lng };
    const dest = { lat: b.lat, lng: b.lng };

    if (ctx.transport === "transit") {
      const km = haversineKm(origin, dest);
      legs.push({
        distanceKm: Math.round(km * 10) / 10,
      });
      continue;
    }

    if (calls >= MAX_GROUNDING_CALLS_PER_REQUEST) {
      legs.push({});
      continue;
    }
    calls += 1;
    const leg = await drivingLegSummary(origin, dest, ctx.mapsApiKey);
    if (leg) {
      legs.push({
        distanceKm: Math.round((leg.distanceMeters / 1000) * 10) / 10,
        durationMin: Math.round(leg.durationSeconds / 60),
      });
    } else {
      if (a.groundingStatus === "ok") {
        a.groundingStatus = "approximate";
        a.notes =
          (a.notes ? `${a.notes} — ` : "") +
          "Verifica percorso verso la tappa successiva.";
      }
      legs.push({});
    }
  }

  return {
    id: randomUUID(),
    summary: plan.summary,
    bestPeriodNote: plan.bestPeriodNote ?? undefined,
    transport: ctx.transport,
    days,
    createdAt: new Date().toISOString(),
    legs: flatOrdered.length < 2 ? undefined : legs,
  };
}

export function itineraryResultToGeminiPlan(
  it: ItineraryResult
): GeminiPlan {
  return {
    summary: it.summary,
    bestPeriodNote: it.bestPeriodNote,
    days: it.days.map((d) => ({
      dayIndex: d.dayIndex,
      label: d.label,
      stops: d.stops.map((s) => ({
        title: s.title,
        type: s.type,
        searchQuery: s.formattedAddress ?? s.title,
        dayIndex: d.dayIndex,
        orderInDay: s.orderInDay,
        notes: s.notes,
      })),
    })),
  };
}
