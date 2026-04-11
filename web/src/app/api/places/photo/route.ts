import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`pp:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe richieste. Riprova tra poco." },
      { status: 429 }
    );
  }
  const ref = new URL(req.url).searchParams.get("ref")?.trim();
  if (!ref || ref.length < 8) {
    return NextResponse.json({ error: "ref mancante" }, { status: 400 });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata" },
      { status: 500 }
    );
  }
  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json({ error: "Foto non disponibile" }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Errore" }, { status: 500 });
  }
}
