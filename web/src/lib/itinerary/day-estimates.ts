import type { ItineraryResult, StopType } from "./schema";

const OVERLOAD_MINUTES = 600;

function visitHeuristicMinutes(type: StopType): number {
  switch (type) {
    case "meal":
      return 75;
    case "scenic":
      return 45;
    case "visit":
      return 60;
    case "sleep":
      return 30;
    case "parking":
      return 15;
    case "camper_stop":
      return 45;
    case "fuel":
      return 20;
    default:
      return 35;
  }
}

function sortStopsGlobal(days: ItineraryResult["days"]) {
  const flat = days.flatMap((d) => d.stops);
  return [...flat].sort((a, b) => {
    if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
    return a.orderInDay - b.orderInDay;
  });
}

export type DayLoadEstimate = {
  dayIndex: number;
  visitMinutes: number;
  driveMinutes: number;
  totalMinutes: number;
  overload: boolean;
};

/** Stima carico giornaliero (visite euristiche + tempi guida dai legs se presenti). */
export function estimateDailyLoads(result: ItineraryResult): DayLoadEstimate[] {
  const legs = result.legs ?? [];
  const flat = sortStopsGlobal(result.days);
  return [...result.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((day) => {
      const stops = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
      const visitMinutes = stops.reduce(
        (acc, s) => acc + visitHeuristicMinutes(s.type),
        0
      );
      let driveMinutes = 0;
      for (let i = 0; i < flat.length - 1; i++) {
        const a = flat[i];
        const b = flat[i + 1];
        if (a.dayIndex === day.dayIndex && b.dayIndex === day.dayIndex) {
          const leg = legs[i];
          if (leg?.durationMin != null) driveMinutes += leg.durationMin;
        }
      }
      const totalMinutes = visitMinutes + driveMinutes;
      return {
        dayIndex: day.dayIndex,
        visitMinutes,
        driveMinutes,
        totalMinutes,
        overload: totalMinutes > OVERLOAD_MINUTES,
      };
    });
}
