import type {
  EnergyProfile,
  ItineraryLeg,
  ItineraryResult,
  Pace,
  Transport,
} from "@/lib/itinerary/schema";
import { evaluateItineraryHealth } from "@/lib/itinerary/health";
import { buildRebalancingSuggestions } from "@/lib/itinerary/rebalance";
import { drivingDirectionsLeg } from "@/lib/maps/routes";
import { haversineKm } from "@/lib/geo/distance";

function airLegKm(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }): ItineraryLeg {
  const km = haversineKm(origin, dest);
  return { distanceKm: Math.round(km * 10) / 10, airDistanceOnly: true };
}

function sortStopsGlobal(days: ItineraryResult["days"]) {
  const flat = days.flatMap((d) => d.stops);
  return [...flat].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.orderInDay - b.orderInDay;
  });
}

export async function recomputeLegsHealthAndSuggestions(
  itinerary: ItineraryResult,
  ctx: {
    mapsApiKey: string;
    transport: Transport;
    preferScenicRoutes?: boolean;
    pace?: Pace;
    energyProfile?: EnergyProfile;
    /** Safety cap to avoid runaway costs; defaults to 40 directions calls. */
    maxDirectionsCalls?: number;
  }
): Promise<ItineraryResult> {
  const maxDirectionsCalls = ctx.maxDirectionsCalls ?? 40;
  let directionsCalls = 0;

  const next: ItineraryResult = {
    ...itinerary,
    days: itinerary.days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ ...s })) })),
  };

  const flatOrdered = sortStopsGlobal(next.days);
  const legs: ItineraryLeg[] = [];

  for (let i = 0; i < flatOrdered.length - 1; i++) {
    const a = flatOrdered[i];
    const b = flatOrdered[i + 1];
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      legs.push({});
      continue;
    }
    const origin = { lat: a.lat, lng: a.lng };
    const dest = { lat: b.lat, lng: b.lng };

    if (ctx.transport === "transit") {
      const km = haversineKm(origin, dest);
      legs.push({ distanceKm: Math.round(km * 10) / 10 });
      continue;
    }

    if (directionsCalls >= maxDirectionsCalls) {
      legs.push(airLegKm(origin, dest));
      continue;
    }

    directionsCalls += 1;
    const leg = await drivingDirectionsLeg(origin, dest, ctx.mapsApiKey, {
      preferScenic: ctx.preferScenicRoutes === true,
    });
    if (leg) {
      legs.push({
        distanceKm: Math.round((leg.distanceMeters / 1000) * 10) / 10,
        durationMin: Math.round(leg.durationSeconds / 60),
        encodedPolyline: leg.encodedPolyline ?? undefined,
      });
    } else {
      legs.push(airLegKm(origin, dest));
    }
  }

  const withLegs: ItineraryResult = {
    ...next,
    legs: flatOrdered.length < 2 ? undefined : legs,
    updatedAt: new Date().toISOString(),
  };

  const health = evaluateItineraryHealth({
    itinerary: withLegs,
    pace: ctx.pace ?? "balanced",
    energyProfile: ctx.energyProfile ?? "balanced",
  });

  return {
    ...withLegs,
    dayHealth: health.dayHealth,
    tripHealthSummary: health.tripHealthSummary,
    rebalancingSuggestions: buildRebalancingSuggestions(withLegs, health.dayHealth),
  };
}

