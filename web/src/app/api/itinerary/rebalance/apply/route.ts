import { NextResponse } from "next/server";
import { RebalanceApplyRequestSchema } from "@/lib/itinerary/schema";
import { applyRebalancingSuggestion } from "@/lib/itinerary/rebalance";
import { recomputeLegsHealthAndSuggestions } from "@/lib/itinerary/recompute";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`rba:${ip}`, 20, 60_000);
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

  const parsed = RebalanceApplyRequestSchema.safeParse(json);
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
    const mutated = applyRebalancingSuggestion(
      parsed.data.itinerary,
      parsed.data.suggestion
    );
    const result = await recomputeLegsHealthAndSuggestions(mutated, {
      mapsApiKey: mapsKey,
      transport: parsed.data.ctx.transport,
      preferScenicRoutes: parsed.data.ctx.preferScenicRoutes,
      pace: parsed.data.ctx.pace,
      energyProfile: parsed.data.ctx.energyProfile,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore apply" },
      { status: 500 }
    );
  }
}

