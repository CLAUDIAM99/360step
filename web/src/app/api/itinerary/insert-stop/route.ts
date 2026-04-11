import { NextResponse } from "next/server";
import {
  InsertStopRequestSchema,
} from "@/lib/itinerary/schema";
import { runGeminiInsertStop } from "@/lib/itinerary/gemini";
import {
  groundGeminiPlan,
  itineraryResultToGeminiPlan,
} from "@/lib/itinerary/ground";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

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
    const result = await groundGeminiPlan(merged, {
      area: parsed.data.area,
      transport: parsed.data.transport,
      time: parsed.data.time,
      mapsApiKey: mapsKey,
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
