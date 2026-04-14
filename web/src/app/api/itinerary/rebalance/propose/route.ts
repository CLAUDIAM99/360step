import { NextResponse } from "next/server";
import {
  RebalanceProposeRequestSchema,
  type RebalanceProposeResponse,
} from "@/lib/itinerary/schema";
import { applyRebalancingSuggestion } from "@/lib/itinerary/rebalance";
import { recomputeLegsHealthAndSuggestions } from "@/lib/itinerary/recompute";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`rbp:${ip}`, 20, 60_000);
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

  const parsed = RebalanceProposeRequestSchema.safeParse(json);
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
    const before = parsed.data.itinerary;
    const mutated = applyRebalancingSuggestion(before, parsed.data.suggestion);
    const afterPreview = await recomputeLegsHealthAndSuggestions(mutated, {
      mapsApiKey: mapsKey,
      transport: parsed.data.ctx.transport,
      preferScenicRoutes: parsed.data.ctx.preferScenicRoutes,
      pace: parsed.data.ctx.pace,
      energyProfile: parsed.data.ctx.energyProfile,
    });

    const beforeSummary = before.tripHealthSummary;
    const afterSummary = afterPreview.tripHealthSummary;
    const res: RebalanceProposeResponse = {
      before,
      afterPreview,
      delta: {
        riskLevelBefore: beforeSummary?.riskLevel ?? "low",
        riskLevelAfter: afterSummary?.riskLevel ?? "low",
        averageLoadScoreBefore: beforeSummary?.averageLoadScore ?? 0,
        averageLoadScoreAfter: afterSummary?.averageLoadScore ?? 0,
        overloadDaysBefore: beforeSummary?.overloadDays ?? 0,
        overloadDaysAfter: afterSummary?.overloadDays ?? 0,
      },
      explanation:
        parsed.data.suggestion.type === "move_stop"
          ? "Propongo di spostare una tappa per ridurre il carico e aumentare il margine del giorno."
          : parsed.data.suggestion.type === "mark_optional"
            ? "Propongo di rendere una tappa opzionale per ridurre pressione e aumentare resilienza agli imprevisti."
            : "Propongo un riequilibrio non automatico (hint) perché non ci sono spostamenti sicuri.",
    };

    return NextResponse.json(res);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore propose" },
      { status: 500 }
    );
  }
}

