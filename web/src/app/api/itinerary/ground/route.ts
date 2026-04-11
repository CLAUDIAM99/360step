import { NextResponse } from "next/server";
import { GroundItineraryRequestSchema } from "@/lib/itinerary/schema";
import { groundGeminiPlan } from "@/lib/itinerary/ground";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`grnd:${ip}`, 8, 60_000);
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
  const parsed = GroundItineraryRequestSchema.safeParse(json);
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
  const { plan, ...ctx } = parsed.data;
  try {
    const result = await groundGeminiPlan(plan, {
      area: ctx.area,
      transport: ctx.transport,
      time: ctx.time,
      mapsApiKey: mapsKey,
      startPlaceQuery: ctx.startPlaceQuery,
      endPlaceQuery: ctx.endPlaceQuery,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore grounding" },
      { status: 500 }
    );
  }
}
