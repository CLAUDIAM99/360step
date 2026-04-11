import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({
  mode: z.enum(["overview", "detail"]),
  stops: z
    .array(
      z.object({
        lat: z.number(),
        lng: z.number(),
        label: z.string().max(3).optional(),
      })
    )
    .min(1)
    .max(60),
  /** Per mode=detail: indici 0-based delle tappe da evidenziare (es. primo giorno). */
  highlightIndices: z.array(z.number().int().min(0)).max(30).optional(),
});

const STATIC_BASE = "https://maps.googleapis.com/maps/api/staticmap";

function buildStaticMapUrl(
  apiKey: string,
  params: {
    stops: { lat: number; lng: number; label?: string }[];
    mode: "overview" | "detail";
    highlightIndices?: number[];
  }
): string {
  const { stops, mode, highlightIndices } = params;
  const u = new URL(STATIC_BASE);
  u.searchParams.set("size", "640x400");
  u.searchParams.set("scale", "2");
  u.searchParams.set("maptype", "roadmap");
  u.searchParams.set("key", apiKey);

  const pts = stops.filter(
    (s) =>
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      Math.abs(s.lat) <= 90 &&
      Math.abs(s.lng) <= 180
  );
  if (pts.length === 0) {
    throw new Error("Nessuna coordinata valida");
  }

  const use = mode === "detail" && highlightIndices?.length
    ? highlightIndices
        .filter((i) => i >= 0 && i < pts.length)
        .map((i) => pts[i]!)
    : pts;

  const forVisible = use.length ? use : pts;
  for (const s of forVisible.slice(0, 15)) {
    u.searchParams.append("visible", `${s.lat},${s.lng}`);
  }

  const markSet =
    mode === "detail" && highlightIndices?.length
      ? highlightIndices
          .filter((i) => i >= 0 && i < pts.length)
          .slice(0, 20)
          .map((i, j) => ({ ...pts[i]!, label: String(j + 1) }))
      : pts.slice(0, 25).map((s, j) => ({
          ...s,
          label: s.label ?? String(j + 1),
        }));

  for (const s of markSet) {
    const lb = (s.label ?? "·").slice(0, 2);
    u.searchParams.append(
      "markers",
      `size:mid|color:0xB3123F|label:${lb}|${s.lat},${s.lng}`
    );
  }

  let url = u.toString();
  if (url.length > 7800) {
    const u2 = new URL(STATIC_BASE);
    u2.searchParams.set("size", "600x360");
    u2.searchParams.set("scale", "2");
    u2.searchParams.set("maptype", "roadmap");
    u2.searchParams.set("key", apiKey);
    const mid = pts[Math.floor(pts.length / 2)]!;
    u2.searchParams.set("center", `${mid.lat},${mid.lng}`);
    u2.searchParams.set("zoom", "10");
    for (let i = 0; i < Math.min(12, pts.length); i++) {
      const s = pts[i]!;
      u2.searchParams.append(
        "markers",
        `size:mid|color:0xB3123F|label:${i + 1}|${s.lat},${s.lng}`
      );
    }
    url = u2.toString();
  }

  return url;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const rl = rateLimit(`stmap:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe richieste. Riprova tra poco." },
      { status: 429 }
    );
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata" },
      { status: 500 }
    );
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Input non valido", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const url = buildStaticMapUrl(key, parsed.data);
    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore mappa statica" },
      { status: 500 }
    );
  }
}
