import { SchemaType } from "@google/generative-ai";

const stopTypeEnum = [
  "visit",
  "meal",
  "sleep",
  "parking",
  "camper_stop",
  "scenic",
  "fuel",
  "other",
] as const;

const plannedStopSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    type: { type: SchemaType.STRING, enum: [...stopTypeEnum] },
    searchQuery: { type: SchemaType.STRING },
    dayIndex: { type: SchemaType.INTEGER },
    orderInDay: { type: SchemaType.INTEGER },
    notes: { type: SchemaType.STRING, nullable: true },
  },
  required: ["title", "type", "searchQuery", "dayIndex", "orderInDay"],
};

const daySchema = {
  type: SchemaType.OBJECT,
  properties: {
    dayIndex: { type: SchemaType.INTEGER },
    label: { type: SchemaType.STRING, nullable: true },
    stops: {
      type: SchemaType.ARRAY,
      items: plannedStopSchema,
    },
  },
  required: ["dayIndex", "stops"],
};

/** Schema API Gemini per JSON vincolato (responseMimeType application/json). */
export const GEMINI_PLAN_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    bestPeriodNote: { type: SchemaType.STRING, nullable: true },
    days: {
      type: SchemaType.ARRAY,
      items: daySchema,
    },
  },
  required: ["summary", "days"],
};
