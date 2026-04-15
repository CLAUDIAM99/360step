import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ensureRoamySchema } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { ItineraryResultSchema } from "@/lib/itinerary/schema";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

const SaveItinerarySchema = z.object({
  title: z.string().min(1).max(80),
  folderId: z.string().min(1).optional(),
  itinerary: ItineraryResultSchema,
});

export async function GET(req: Request) {
  let userId: string;
  try {
    const { uid } = await verifyFirebaseIdToken(req);
    userId = uid;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 }
    );
  }

  await ensureRoamySchema();
  const { rows } = await sql`
    SELECT id, title, folder_id, created_at, updated_at
    FROM roamy_itineraries
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 50
  `;
  return NextResponse.json({ itineraries: rows });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    const { uid } = await verifyFirebaseIdToken(req);
    userId = uid;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  const parsed = SaveItinerarySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input non valido" }, { status: 400 });
  }

  await ensureRoamySchema();
  const id = randomUUID();
  const itineraryJson = JSON.stringify(parsed.data.itinerary);
  await sql`
    INSERT INTO roamy_itineraries (id, user_id, folder_id, title, itinerary_json)
    VALUES (${id}, ${userId}, ${parsed.data.folderId ?? null}, ${parsed.data.title}, ${itineraryJson}::jsonb)
  `;
  return NextResponse.json({ id });
}

