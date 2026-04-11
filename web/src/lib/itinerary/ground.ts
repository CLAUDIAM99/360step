import { randomUUID } from "crypto";
import {
  boundsFromArea,
  widenBounds,
  type LatLngBounds,
} from "@/lib/maps/bounds";
import { geocodeAddress, type GeocodeResult } from "@/lib/maps/geocode";
import { mapsPlaceUrl, textSearchPlaces } from "@/lib/maps/places";
import { drivingDirectionsLeg } from "@/lib/maps/routes";
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

/** Soglia: oltre questa distanza la prima/ultima tappa non coincide con partenza/arrivo dichiarati. */
const ANCHOR_MAX_DISTANCE_KM = 18;

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

function areStopsEquivalent(a: GroundedStop, b: GroundedStop): boolean {
  if (a.placeId && b.placeId) return a.placeId === b.placeId;
  if (
    a.lat != null &&
    a.lng != null &&
    b.lat != null &&
    b.lng != null &&
    Math.abs(a.lat - b.lat) < 0.0001 &&
    Math.abs(a.lng - b.lng) < 0.0001
  ) {
    return true;
  }
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
}

function withCrossDayStartStops(days: ItineraryDay[]): ItineraryDay[] {
  const orderedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const out: ItineraryDay[] = [];
  let previousDayLastStop: GroundedStop | undefined;

  for (const day of orderedDays) {
    const currentStops = sortStops(day.stops).map((s, index) => ({
      ...s,
      dayIndex: day.dayIndex,
      orderInDay: index,
    }));

    let withCarry = currentStops;
    if (previousDayLastStop) {
      const first = currentStops[0];
      const alreadyStartsFromPrevious =
        first != null && areStopsEquivalent(previousDayLastStop, first);
      if (!alreadyStartsFromPrevious) {
        withCarry = [
          {
            ...previousDayLastStop,
            dayIndex: day.dayIndex,
            orderInDay: 0,
            notes:
              previousDayLastStop.notes ??
              "Ripartenza dalla tappa finale del giorno precedente.",
          },
          ...currentStops.map((s) => ({
            ...s,
            dayIndex: day.dayIndex,
          })),
        ];
      }
    }

    const normalizedStops = withCarry.map((s, index) => ({
      ...s,
      dayIndex: day.dayIndex,
      orderInDay: index,
    }));
    out.push({ ...day, stops: normalizedStops });
    previousDayLastStop = normalizedStops[normalizedStops.length - 1];
  }

  return out;
}

function anchorStopFromGeocode(
  geo: GeocodeResult,
  title: string,
  dayIndex: number,
  orderInDay: number,
  notes: string
): GroundedStop {
  return {
    title,
    type: "visit",
    dayIndex,
    orderInDay,
    lat: geo.lat,
    lng: geo.lng,
    placeId: geo.placeId,
    formattedAddress: geo.formattedAddress,
    mapsUrl: geo.placeId ? mapsPlaceUrl(geo.placeId) : undefined,
    notes,
    groundingStatus: "ok",
  };
}

async function enforceAnchorStops(
  rawDays: ItineraryDay[],
  opts: { startPlaceQuery?: string; endPlaceQuery?: string; mapsApiKey: string }
): Promise<ItineraryDay[]> {
  let next = rawDays.map((d) => ({
    ...d,
    stops: [...d.stops],
  }));

  const startQ = opts.startPlaceQuery?.trim();
  if (startQ && startQ.length >= 2) {
    const geoStart = await geocodeAddress(startQ, opts.mapsApiKey);
    if (geoStart) {
      const day1 = next.find((d) => d.dayIndex === 1);
      if (day1 && day1.stops.length > 0) {
        const sorted = sortStops(day1.stops);
        const first = sorted[0];
        let tooFar = true;
        if (first.lat != null && first.lng != null) {
          const km = haversineKm(
            { lat: geoStart.lat, lng: geoStart.lng },
            { lat: first.lat, lng: first.lng }
          );
          tooFar = km > ANCHOR_MAX_DISTANCE_KM;
        }
        if (tooFar) {
          const rest = sorted.slice(1);
          const anchor = anchorStopFromGeocode(
            geoStart,
            `Partenza · ${startQ}`,
            1,
            0,
            "Punto di partenza allineato alla tua ricerca."
          );
          const merged = [anchor, ...rest].map((s, i) => ({
            ...s,
            dayIndex: 1,
            orderInDay: i,
          }));
          next = next.map((d) =>
            d.dayIndex === 1 ? { ...d, stops: merged } : d
          );
        }
      }
    }
  }

  const endQ = opts.endPlaceQuery?.trim();
  if (endQ && endQ.length >= 2) {
    const geoEnd = await geocodeAddress(endQ, opts.mapsApiKey);
    if (geoEnd) {
      const maxDay = Math.max(0, ...next.map((d) => d.dayIndex));
      const lastDay = next.find((d) => d.dayIndex === maxDay);
      if (lastDay && lastDay.stops.length > 0) {
        const sorted = sortStops(lastDay.stops);
        const last = sorted[sorted.length - 1];
        let tooFar = true;
        if (last.lat != null && last.lng != null) {
          const km = haversineKm(
            { lat: geoEnd.lat, lng: geoEnd.lng },
            { lat: last.lat, lng: last.lng }
          );
          tooFar = km > ANCHOR_MAX_DISTANCE_KM;
        }
        if (tooFar) {
          const body = sorted.slice(0, -1);
          const anchor = anchorStopFromGeocode(
            geoEnd,
            `Arrivo · ${endQ}`,
            maxDay,
            body.length,
            "Ultima tappa allineata alla tua ricerca."
          );
          const merged = [...body, anchor].map((s, i) => ({
            ...s,
            dayIndex: maxDay,
            orderInDay: i,
          }));
          next = next.map((d) =>
            d.dayIndex === maxDay ? { ...d, stops: merged } : d
          );
        }
      }
    }
  }

  return next;
}

function stripCrossDayCarryStops(days: ItineraryDay[]): ItineraryDay[] {
  const orderedDays = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const out: ItineraryDay[] = [];
  let previousDayLastStop: GroundedStop | undefined;

  for (const day of orderedDays) {
    const orderedStops = sortStops(day.stops);
    let effectiveStops = orderedStops;
    if (
      previousDayLastStop &&
      orderedStops[0] &&
      areStopsEquivalent(previousDayLastStop, orderedStops[0])
    ) {
      effectiveStops = orderedStops.slice(1);
    }
    const normalizedStops = effectiveStops.map((s, index) => ({
      ...s,
      dayIndex: day.dayIndex,
      orderInDay: index,
    }));
    out.push({ ...day, stops: normalizedStops });
    previousDayLastStop = normalizedStops[normalizedStops.length - 1];
  }

  return out;
}

export async function groundGeminiPlan(
  plan: GeminiPlan,
  ctx: {
    area: GeographicArea;
    transport: Transport;
    time: GenerateItineraryRequest["time"];
    mapsApiKey: string;
    startPlaceQuery?: string;
    endPlaceQuery?: string;
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

  const rawDays: ItineraryDay[] = plan.days.map((d) => {
    const stops = sortStops(byDay.get(d.dayIndex) ?? []);
    return {
      dayIndex: d.dayIndex,
      label: d.label ?? undefined,
      stops,
    };
  });
  const anchored = await enforceAnchorStops(rawDays, {
    startPlaceQuery: ctx.startPlaceQuery,
    endPlaceQuery: ctx.endPlaceQuery,
    mapsApiKey: ctx.mapsApiKey,
  });
  const days = withCrossDayStartStops(anchored);

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
    const leg = await drivingDirectionsLeg(origin, dest, ctx.mapsApiKey);
    if (leg) {
      legs.push({
        distanceKm: Math.round((leg.distanceMeters / 1000) * 10) / 10,
        durationMin: Math.round(leg.durationSeconds / 60),
        encodedPolyline: leg.encodedPolyline ?? undefined,
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
  const days = stripCrossDayCarryStops(it.days);
  return {
    summary: it.summary,
    bestPeriodNote: it.bestPeriodNote,
    days: days.map((d) => ({
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
