import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiPlanSchema, type GeminiPlan } from "@/lib/itinerary/schema";
import {
  buildPlannerPrompt,
  buildInsertStopPrompt,
} from "@/lib/itinerary/prompts";
import type { GenerateItineraryRequest } from "@/lib/itinerary/schema";

/** Default: Gemini 3 Flash (preview). Override con GEMINI_MODEL se serve (es. gemini-3.1-flash-lite-preview). */
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

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
    },
  });
  const prompt = buildPlannerPrompt(req);
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const out = GeminiPlanSchema.safeParse(parsed);
  if (!out.success) {
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
    generationConfig: { responseMimeType: "application/json" },
  });
  const prompt = buildInsertStopPrompt(
    JSON.stringify(plan),
    newStopDescription,
    language
  );
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const out = GeminiPlanSchema.safeParse(parsed);
  if (!out.success) {
    throw new Error("Schema dopo insert non valido");
  }
  return normalizePlan(out.data);
}
