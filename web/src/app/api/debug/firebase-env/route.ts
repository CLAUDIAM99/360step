import { NextResponse } from "next/server";

export const runtime = "nodejs";

function presence(v: string | undefined) {
  return { present: Boolean(v), len: v ? v.length : 0 };
}

export async function GET() {
  // IMPORTANT: never return actual secret values.
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_FIREBASE_API_KEY: presence(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: presence(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: presence(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      NEXT_PUBLIC_FIREBASE_APP_ID: presence(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    },
  });
}

