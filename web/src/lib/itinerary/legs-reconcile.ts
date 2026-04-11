import { haversineKm } from "@/lib/geo/distance";
import type {
  GroundedStop,
  ItineraryLeg,
  ItineraryResult,
} from "@/lib/itinerary/schema";

function sortStopsGlobal(days: ItineraryResult["days"]): GroundedStop[] {
  const flat = days.flatMap((d) => d.stops);
  return [...flat].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.orderInDay - b.orderInDay;
  });
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/**
 * Garantisce distanceKm per ogni gamba dove ci sono coordinate;
 * non sovrascrive percorsi stradali già validi (encodedPolyline + distanceKm).
 */
export function reconcileItineraryLegs(result: ItineraryResult): ItineraryResult {
  const ordered = sortStopsGlobal(result.days);
  if (ordered.length < 2) {
    return { ...result, legs: undefined };
  }
  const prevLegs = result.legs ?? [];
  const legs: ItineraryLeg[] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const prev = prevLegs[i] ?? {};
    const hasCoords =
      a.lat != null &&
      a.lng != null &&
      b.lat != null &&
      b.lng != null;
    const airKm = hasCoords
      ? roundKm(
          haversineKm(
            { lat: a.lat!, lng: a.lng! },
            { lat: b.lat!, lng: b.lng! }
          )
        )
      : null;

    if (!hasCoords) {
      legs.push({ ...prev });
      continue;
    }

    const hasRoadEstimate =
      prev.distanceKm != null &&
      prev.encodedPolyline &&
      prev.airDistanceOnly !== true;

    if (hasRoadEstimate) {
      legs.push({ ...prev });
      continue;
    }

    if (prev.distanceKm != null && !Number.isNaN(prev.distanceKm)) {
      const roadKm = prev.distanceKm;
      const leg = { ...prev };
      if (leg.airDistanceOnly !== true && airKm != null && roadKm > airKm * 3.5) {
        leg.airDistanceOnly = true;
      }
      legs.push(leg);
      continue;
    }

    legs.push({
      ...prev,
      distanceKm: airKm!,
      airDistanceOnly: true,
    });
  }

  return { ...result, legs };
}

export type ItineraryAnalytics = {
  totalKm: number;
  totalHoursDrive: number;
  legsWithDuration: number;
  legsAirOnly: number;
  stopCount: number;
  dayCount: number;
  hasPartialTimes: boolean;
};

export function itineraryAnalytics(result: ItineraryResult): ItineraryAnalytics {
  const r = reconcileItineraryLegs(result);
  const legs = r.legs ?? [];
  let totalKm = 0;
  let totalMin = 0;
  let legsWithDuration = 0;
  let legsAirOnly = 0;
  for (const leg of legs) {
    if (leg.distanceKm != null) totalKm += leg.distanceKm;
    if (leg.durationMin != null) {
      totalMin += leg.durationMin;
      legsWithDuration += 1;
    }
    if (leg.airDistanceOnly === true) legsAirOnly += 1;
  }
  const stopCount = r.days.reduce((n, d) => n + d.stops.length, 0);
  const dayCount = r.days.length;
  return {
    totalKm: Math.round(totalKm * 10) / 10,
    totalHoursDrive: Math.round((totalMin / 60) * 10) / 10,
    legsWithDuration,
    legsAirOnly,
    stopCount,
    dayCount,
    hasPartialTimes: legsWithDuration > 0 && legsWithDuration < legs.length,
  };
}
