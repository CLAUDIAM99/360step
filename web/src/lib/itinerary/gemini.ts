import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiPlanSchema, type GeminiPlan } from "@/lib/itinerary/schema";
import {
  buildPlannerPrompt,
  buildInsertStopPrompt,
} from "@/lib/itinerary/prompts";
import type { GenerateItineraryRequest } from "@/lib/itinerary/schema";
import { GEMINI_PLAN_RESPONSE_SCHEMA } from "@/lib/itinerary/gemini-response-schema";
import { deriveDailyBudget } from "@/lib/itinerary/pace-budgets";

/** Default: Gemini 3 Flash (preview). Override con GEMINI_MODEL se serve (es. gemini-3.1-flash-lite-preview). */
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

function extractJsonText(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (m) return m[1].trim();
  return t;
}

const ALLOWED_STOP_TYPES = new Set<string>([
  "visit",
  "meal",
  "sleep",
  "parking",
  "camper_stop",
  "scenic",
  "fuel",
  "other",
]);

/** Normalizza forma/rumorosità del JSON modello prima di Zod (wrapper, null, tipi). */
function normalizeParsedGeminiPlan(input: unknown): unknown {
  if (input == null || typeof input !== "object") return input;
  const raw = input as Record<string, unknown>;
  const inner =
    raw.plan && typeof raw.plan === "object"
      ? (raw.plan as Record<string, unknown>)
      : raw.itinerary && typeof raw.itinerary === "object"
        ? (raw.itinerary as Record<string, unknown>)
        : raw.result && typeof raw.result === "object"
          ? (raw.result as Record<string, unknown>)
          : raw.data && typeof raw.data === "object"
            ? (raw.data as Record<string, unknown>)
            : null;
  const root = inner ?? raw;
  if (!Array.isArray(root.days)) return input;

  return {
    summary: root.summary == null ? "" : String(root.summary),
    bestPeriodNote:
      root.bestPeriodNote == null || root.bestPeriodNote === ""
        ? undefined
        : String(root.bestPeriodNote),
    days: root.days.map((dayRaw) => {
      const d = dayRaw as Record<string, unknown>;
      const dayIndex = Math.max(1, Math.floor(Number(d.dayIndex)) || 1);
      const stopsIn = Array.isArray(d.stops) ? d.stops : [];
      return {
        dayIndex,
        label:
          d.label == null || d.label === ""
            ? undefined
            : String(d.label),
        stops: stopsIn.map((stRaw, i) => {
          const s = stRaw as Record<string, unknown>;
          let typeStr = "other";
          if (typeof s.type === "string") {
            const t = s.type.toLowerCase().trim();
            typeStr = ALLOWED_STOP_TYPES.has(t) ? t : "other";
          }
          return {
            title:
              s.title == null || s.title === ""
                ? "Tappa"
                : String(s.title),
            type: typeStr,
            searchQuery:
              s.searchQuery == null || s.searchQuery === ""
                ? String(s.title ?? "place")
                : String(s.searchQuery),
            dayIndex: Math.max(
              1,
              Math.floor(Number(s.dayIndex ?? d.dayIndex ?? dayIndex)) || dayIndex
            ),
            orderInDay: Math.max(
              0,
              Math.floor(Number(s.orderInDay ?? i)) || i
            ),
            notes:
              s.notes == null || s.notes === ""
                ? undefined
                : String(s.notes),
            aiRationale:
              s.aiRationale == null || s.aiRationale === ""
                ? undefined
                : String(s.aiRationale),
          };
        }),
      };
    }),
  };
}

async function generatePlannerJson(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY non configurata");
  const genAI = new GoogleGenerativeAI(key);
  const modelName = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const run = async (useResponseSchema: boolean) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: useResponseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: GEMINI_PLAN_RESPONSE_SCHEMA,
          }
        : { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(prompt);
    return extractJsonText(result.response.text());
  };
  try {
    return await run(true);
  } catch (e) {
    // #region agent log
    fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "570e4d",
      },
      body: JSON.stringify({
        sessionId: "570e4d",
        location: "gemini.ts:generatePlannerJson",
        message: "retry without responseSchema",
        data: {
          err:
            e instanceof Error
              ? e.message.slice(0, 200)
              : String(e).slice(0, 200),
        },
        hypothesisId: "H2",
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.warn("[gemini] responseSchema failed, retrying without", e);
    return await run(false);
  }
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

function enforceHumanPacing(
  plan: GeminiPlan,
  req: GenerateItineraryRequest
): GeminiPlan {
  const budget = deriveDailyBudget(
    req.preferences.pace,
    req.preferences.energyProfile
  );
  const trimPriority = new Map<string, number>([
    ["other", 0],
    ["fuel", 1],
    ["meal", 2],
    ["scenic", 3],
    ["visit", 4],
    ["parking", 5],
    ["camper_stop", 6],
    ["sleep", 10],
  ]);

  return {
    ...plan,
    days: plan.days.map((day) => {
      const ordered = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
      if (ordered.length <= budget.maxStops) return day;
      const keepCount = Math.max(2, budget.maxStops);
      const keep = [...ordered]
        .sort((a, b) => (trimPriority.get(b.type) ?? 0) - (trimPriority.get(a.type) ?? 0))
        .slice(0, keepCount)
        .sort((a, b) => a.orderInDay - b.orderInDay)
        .map((stop, index) => ({
          ...stop,
          dayIndex: day.dayIndex,
          orderInDay: index,
          notes:
            index === keep.length - 1 && ordered.length > keepCount
              ? [stop.notes, "Giornata compressa per mantenere un ritmo sostenibile."]
                  .filter(Boolean)
                  .join(" — ")
              : stop.notes,
        }));
      return { ...day, stops: keep };
    }),
  };
}

export async function runGeminiPlanner(
  req: GenerateItineraryRequest
): Promise<GeminiPlan> {
  const prompt = buildPlannerPrompt(req);
  const text = await generatePlannerJson(prompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const normalized = normalizeParsedGeminiPlan(parsed);
  const out = GeminiPlanSchema.safeParse(normalized);
  if (!out.success) {
    logPlanSchemaFailure(
      "gemini.ts:runGeminiPlanner",
      normalized,
      out.error.issues
    );
    throw new Error("Schema itinerario Gemini non valido");
  }
  const normalizedPlan = normalizePlan(out.data);
  return enforceHumanPacing(normalizedPlan, req);
}

export async function runGeminiInsertStop(
  plan: GeminiPlan,
  newStopDescription: string,
  language: "it" | "en"
): Promise<GeminiPlan> {
  const prompt = buildInsertStopPrompt(
    JSON.stringify(plan),
    newStopDescription,
    language
  );
  const text = await generatePlannerJson(prompt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Risposta Gemini non JSON valido");
  }
  const normalized = normalizeParsedGeminiPlan(parsed);
  const out = GeminiPlanSchema.safeParse(normalized);
  if (!out.success) {
    logPlanSchemaFailure(
      "gemini.ts:runGeminiInsertStop",
      normalized,
      out.error.issues
    );
    throw new Error("Schema dopo insert non valido");
  }
  return normalizePlan(out.data);
}
