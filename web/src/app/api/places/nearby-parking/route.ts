import { NextResponse } from "next/server";
import { z } from "zod";
import { nearbyParking } from "@/lib/maps/nearby-parking";
import { rateLimit } from "@/lib/rate-limit";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().min(200).max(5000).optional(),
});

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`pk:${ip}`, 24, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe richieste. Riprova tra poco." },
      { status: 429 }
    );
  }
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata" },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    radiusM: searchParams.get("radiusM") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const hits = await nearbyParking(
      parsed.data.lat,
      parsed.data.lng,
      mapsKey,
      parsed.data.radiusM
    );
    return NextResponse.json({ results: hits });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore ricerca parcheggi" },
      { status: 500 }
    );
  }
}
