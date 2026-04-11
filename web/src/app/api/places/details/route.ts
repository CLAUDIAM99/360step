import { NextResponse } from "next/server";
import { fetchPlaceDetails } from "@/lib/maps/place-details";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`pd:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe richieste. Riprova tra poco." },
      { status: 429 }
    );
  }
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get("placeId")?.trim();
  if (!placeId || placeId.length < 4) {
    return NextResponse.json({ error: "placeId mancante" }, { status: 400 });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata" },
      { status: 500 }
    );
  }
  try {
    const details = await fetchPlaceDetails(placeId, key);
    if (!details) {
      return NextResponse.json(
        { error: "Dettagli non disponibili" },
        { status: 404 }
      );
    }
    return NextResponse.json(details);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore" },
      { status: 500 }
    );
  }
}
