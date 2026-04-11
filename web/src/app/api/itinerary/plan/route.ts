import { NextResponse } from "next/server";
import { GenerateItineraryRequestSchema } from "@/lib/itinerary/schema";
import { runGeminiPlanner } from "@/lib/itinerary/gemini";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`plan:${ip}`, 8, 60_000);
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
  try {
    const plan = await runGeminiPlanner(parsed.data);
    return NextResponse.json(plan);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore pianificazione" },
      { status: 500 }
    );
  }
}
