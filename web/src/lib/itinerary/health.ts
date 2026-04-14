import { estimateDailyLoads } from "./day-estimates";
import { deriveDailyBudget, type DailyPaceBudget } from "./pace-budgets";
import type {
  DayHealth,
  DayHealthIssueCode,
  DayHealthSuggestion,
  EnergyProfile,
  ItineraryResult,
  Pace,
  TripHealthSummary,
} from "./schema";

type HealthInput = {
  itinerary: ItineraryResult;
  pace?: Pace;
  energyProfile?: EnergyProfile;
};

export type ItineraryHealthReport = {
  dayHealth: DayHealth[];
  tripHealthSummary: TripHealthSummary;
  budget: DailyPaceBudget;
};

function ratio(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return value / cap;
}

function toScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildSuggestions(
  dayIndex: number,
  issues: DayHealthIssueCode[],
  budget: DailyPaceBudget
): DayHealthSuggestion[] {
  const suggestions: DayHealthSuggestion[] = [];
  for (const issue of issues) {
    if (issue === "too_dense") {
      suggestions.push({
        id: `d${dayIndex}-dense`,
        issueCode: issue,
        title: "Riduci tappe in giornata",
        explanation: `Il numero di tappe supera il budget giornaliero consigliato (${budget.maxStops}).`,
        effect: "Meno fretta tra una tappa e l'altra.",
      });
    } else if (issue === "too_much_drive") {
      suggestions.push({
        id: `d${dayIndex}-drive`,
        issueCode: issue,
        title: "Accorcia i trasferimenti",
        explanation: `La guida stimata supera ${budget.maxDriveMinutes} minuti.`,
        effect: "Riduce stanchezza e rischio ritardi.",
      });
    } else if (issue === "too_fragmented") {
      suggestions.push({
        id: `d${dayIndex}-fragmented`,
        issueCode: issue,
        title: "Raggruppa tappe vicine",
        explanation: "Ci sono troppi passaggi tra micro-tappe nella stessa giornata.",
        effect: "Giornata piu fluida e leggibile.",
      });
    } else if (issue === "low_recovery_margin") {
      suggestions.push({
        id: `d${dayIndex}-recovery`,
        issueCode: issue,
        title: "Aggiungi margine di recupero",
        explanation: "Il margine libero stimato e troppo basso per imprevisti e pause.",
        effect: "Maggiore resilienza a traffico o cambi meteo.",
      });
    }
  }
  return suggestions;
}

export function evaluateItineraryHealth({
  itinerary,
  pace = "balanced",
  energyProfile = "balanced",
}: HealthInput): ItineraryHealthReport {
  const budget = deriveDailyBudget(pace, energyProfile);
  const loads = estimateDailyLoads(itinerary);

  const dayHealth: DayHealth[] = loads.map((load) => {
    const day = itinerary.days.find((d) => d.dayIndex === load.dayIndex);
    const stopCount = day?.stops.length ?? 0;
    const transitions = Math.max(0, stopCount - 1);
    const recoveryMinutes = Math.max(0, budget.maxTotalMinutes - load.totalMinutes);
    const issues: DayHealthIssueCode[] = [];

    if (stopCount > budget.maxStops) issues.push("too_dense");
    if (transitions > budget.maxTransitions) issues.push("too_fragmented");
    if (load.driveMinutes > budget.maxDriveMinutes) issues.push("too_much_drive");
    if (recoveryMinutes < budget.minRecoveryMinutes) issues.push("low_recovery_margin");

    const scoreRaw =
      ratio(stopCount, budget.maxStops) * 30 +
      ratio(load.driveMinutes, budget.maxDriveMinutes) * 30 +
      ratio(load.totalMinutes, budget.maxTotalMinutes) * 30 +
      ratio(transitions, budget.maxTransitions) * 10;

    const loadScore = toScore(scoreRaw * 25);
    return {
      dayIndex: load.dayIndex,
      loadScore,
      stopCount,
      transitions,
      visitMinutes: load.visitMinutes,
      driveMinutes: load.driveMinutes,
      totalMinutes: load.totalMinutes,
      recoveryMinutes,
      issues,
      suggestions: buildSuggestions(load.dayIndex, issues, budget),
    };
  });

  const overloadDays = dayHealth.filter((d) => d.loadScore >= 80).length;
  const warningDays = dayHealth.filter((d) => d.loadScore >= 60).length;
  const averageLoadScore = toScore(
    dayHealth.reduce((sum, d) => sum + d.loadScore, 0) / Math.max(1, dayHealth.length)
  );

  const riskLevel: TripHealthSummary["riskLevel"] =
    overloadDays > 0 ? "high" : warningDays > 0 ? "moderate" : "low";

  return {
    dayHealth,
    tripHealthSummary: {
      riskLevel,
      overloadDays,
      warningDays,
      averageLoadScore,
    },
    budget,
  };
}
