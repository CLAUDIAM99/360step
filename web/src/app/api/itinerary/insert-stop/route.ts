import { NextResponse } from "next/server";
import {
  InsertStopRequestSchema,
  type GeminiPlan,
} from "@/lib/itinerary/schema";
import { runGeminiInsertStop } from "@/lib/itinerary/gemini";
import {
  groundGeminiPlan,
  itineraryResultToGeminiPlan,
} from "@/lib/itinerary/ground";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

function stopSignature(stop: GeminiPlan["days"][number]["stops"][number]): string {
  const title = stop.title.trim().toLowerCase();
  const query = stop.searchQuery.trim().toLowerCase();
  return `${stop.type}|${title}|${query}`;
}

function stabilizeInsertedPlan(base: GeminiPlan, merged: GeminiPlan): GeminiPlan {
  const baseByDay = new Map(base.days.map((d) => [d.dayIndex, d]));
  const stableDays = merged.days
    .map((mergedDay) => {
      const baseDay = baseByDay.get(mergedDay.dayIndex);
      if (!baseDay) return mergedDay;

      const mergedSigs = mergedDay.stops.map(stopSignature);
      const baseSigs = baseDay.stops.map(stopSignature);
      const overlapCount = mergedSigs.filter((s) => baseSigs.includes(s)).length;
      const similarity = overlapCount / Math.max(1, baseSigs.length);
      const likelyChangedByInsert =
        mergedDay.stops.length !== baseDay.stops.length || similarity < 0.8;

      const chosen = likelyChangedByInsert ? mergedDay : baseDay;
      return {
        ...chosen,
        dayIndex: mergedDay.dayIndex,
        stops: chosen.stops.map((s, index) => ({
          ...s,
          dayIndex: mergedDay.dayIndex,
          orderInDay: index,
        })),
      };
    })
    .sort((a, b) => a.dayIndex - b.dayIndex);

  return {
    ...merged,
    days: stableDays,
  };
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`ins:${ip}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe richieste. Riprova tra poco." },
      { status: 429 }
    );
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const parsed = InsertStopRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input non valido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata" },
      { status: 500 }
    );
  }
  try {
    const base = itineraryResultToGeminiPlan(parsed.data.itinerary);
    const merged = await runGeminiInsertStop(
      base,
      parsed.data.newStopDescription,
      parsed.data.language
    );
    const stabilized = stabilizeInsertedPlan(base, merged);
    const prev = parsed.data.itinerary;
    const result = await groundGeminiPlan(stabilized, {
      area: parsed.data.area,
      transport: parsed.data.transport,
      time: parsed.data.time,
      pace: parsed.data.preferences.pace,
      energyProfile: parsed.data.preferences.energyProfile,
      mapsApiKey: mapsKey,
      startPlaceQuery: parsed.data.startPlaceQuery,
      endPlaceQuery: parsed.data.endPlaceQuery,
      returnToHubEachNight: parsed.data.returnToHubEachNight,
      accommodationAsBase: parsed.data.accommodationAsBase,
      reuseAccommodationUntilChanged: parsed.data.reuseAccommodationUntilChanged,
      preferScenicRoutes: parsed.data.preferScenicRoutes,
      continueTrip: {
        tripId: prev.tripId ?? prev.id,
        revision: prev.revision,
        createdAt: prev.createdAt,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore insert" },
      { status: 500 }
    );
  }
}
