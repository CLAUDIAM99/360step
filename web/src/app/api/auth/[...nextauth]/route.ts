import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

function missingAuthEnv() {
  const missing: string[] = [];
  if (!process.env.NEXTAUTH_SECRET) missing.push("NEXTAUTH_SECRET");
  if (!process.env.NEXTAUTH_URL && !process.env.VERCEL_URL) {
    missing.push("NEXTAUTH_URL (or VERCEL_URL)");
  }
  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  return missing;
}

const handler = NextAuth(authOptions);

export async function GET(req: Request) {
  const missing = missingAuthEnv();
  if (missing.length) {
    return NextResponse.json(
      { error: "Missing auth env vars", missing },
      { status: 500 }
    );
  }
  return handler(req);
}

export async function POST(req: Request) {
  const missing = missingAuthEnv();
  if (missing.length) {
    return NextResponse.json(
      { error: "Missing auth env vars", missing },
      { status: 500 }
    );
  }
  return handler(req);
}

