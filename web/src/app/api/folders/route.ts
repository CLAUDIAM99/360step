import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ensureRoamySchema } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(60),
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
    SELECT id, name, created_at
    FROM roamy_folders
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ folders: rows });
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
  const parsed = CreateFolderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input non valido" }, { status: 400 });
  }

  await ensureRoamySchema();
  const id = randomUUID();
  await sql`
    INSERT INTO roamy_folders (id, user_id, name)
    VALUES (${id}, ${userId}, ${parsed.data.name})
  `;
  return NextResponse.json({ id, name: parsed.data.name });
}

