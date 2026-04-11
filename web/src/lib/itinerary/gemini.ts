import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiPlanSchema, type GeminiPlan } from "@/lib/itinerary/schema";
import {
  buildPlannerPrompt,
  buildInsertStopPrompt,
} from "@/lib/itinerary/prompts";
import type { GenerateItineraryRequest } from "@/lib/itinerary/schema";
import { GEMINI_PLAN_RESPONSE_SCHEMA } from "@/lib/itinerary/gemini-response-schema";

/** Default: Gemini 3 Flash (preview). Override con GEMINI_MODEL se serve (es. gemini-3.1-flash-lite-preview). */
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

function extractJsonText(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (m) return m[1].trim();
  return t;
}

function logPlanSchemaFailure(
  location: string,
  parsed: unknown,
  issues: { path: (string | number)[]; message: string }[]
): void {
  // #region agent log
  const topKeys =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>)
      : [];
  fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "570e4d",
    },
    body: JSON.stringify({
      sessionId: "570e4d",
      location,
      message: "GeminiPlanSchema safeParse failed",
      data: {
        issueCount: issues.length,
        issues: issues.slice(0, 12),
        topKeys,
      },
      hypothesisId: "H1",
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.error("[gemini] GeminiPlanSchema", JSON.stringify({ issues, topKeys }));
}

function normalizePlan(plan: GeminiPlan): GeminiPlan {
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      stops: d.stops.map((s, i) => ({
        ...s,
        dayIndex: s.dayIndex ?? d.dayIndex,
        orderInDay: s.orderInDay ?? i,
      })),
    })),
  };
}

export async function runGeminiPlanner(
  req: GenerateItineraryRequest
): Promise<GeminiPlan> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY non configurata");
  }
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_PLAN_RESPONSE_SCHEMA,
    },
  });
  const prompt = buildPlannerPrompt(req);
  const result = await model.generateContent(prompt);
  const text = extractJsonText(result.response.text());
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const out = GeminiPlanSchema.safeParse(parsed);
  if (!out.success) {
    logPlanSchemaFailure(
      "gemini.ts:runGeminiPlanner",
      parsed,
      out.error.issues
    );
    throw new Error("Schema itinerario Gemini non valido");
  }
  return normalizePlan(out.data);
}

export async function runGeminiInsertStop(
  plan: GeminiPlan,
  newStopDescription: string,
  language: "it" | "en"
): Promise<GeminiPlan> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY non configurata");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_PLAN_RESPONSE_SCHEMA,
    },
  });
  const prompt = buildInsertStopPrompt(
    JSON.stringify(plan),
    newStopDescription,
    language
  );
  const result = await model.generateContent(prompt);
  const text = extractJsonText(result.response.text());
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const out = GeminiPlanSchema.safeParse(parsed);
  if (!out.success) {
    logPlanSchemaFailure(
      "gemini.ts:runGeminiInsertStop",
      parsed,
      out.error.issues
    );
    throw new Error("Schema dopo insert non valido");
  }
  return normalizePlan(out.data);
}
