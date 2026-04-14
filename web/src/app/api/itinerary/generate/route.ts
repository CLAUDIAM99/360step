import { NextResponse } from "next/server";
import { GenerateItineraryRequestSchema } from "@/lib/itinerary/schema";
import { runGeminiPlanner } from "@/lib/itinerary/gemini";
import { groundGeminiPlan } from "@/lib/itinerary/ground";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`gen:${ip}`, 8, 60_000);
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
  const parsed = GenerateItineraryRequestSchema.safeParse(json);
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
    const plan = await runGeminiPlanner(parsed.data);
    const result = await groundGeminiPlan(plan, {
      area: parsed.data.area,
      transport: parsed.data.transport,
      time: parsed.data.time,
      pace: parsed.data.preferences.pace,
      energyProfile: parsed.data.preferences.energyProfile,
      mapsApiKey: mapsKey,
      startPlaceQuery: parsed.data.startPlaceQuery,
      endPlaceQuery: parsed.data.endPlaceQuery,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore generazione" },
      { status: 500 }
    );
  }
}
