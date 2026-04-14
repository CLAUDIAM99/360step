import type { EnergyProfile, Pace } from "./schema";

export type DailyPaceBudget = {
  maxStops: number;
  maxDriveMinutes: number;
  maxTotalMinutes: number;
  maxTransitions: number;
  minRecoveryMinutes: number;
};

const BASE_BY_PACE: Record<Pace, DailyPaceBudget> = {
  relaxed: {
    maxStops: 4,
    maxDriveMinutes: 120,
    maxTotalMinutes: 390,
    maxTransitions: 4,
    minRecoveryMinutes: 120,
  },
  balanced: {
    maxStops: 6,
    maxDriveMinutes: 180,
    maxTotalMinutes: 510,
    maxTransitions: 6,
    minRecoveryMinutes: 90,
  },
  intense: {
    maxStops: 8,
    maxDriveMinutes: 240,
    maxTotalMinutes: 600,
    maxTransitions: 8,
    minRecoveryMinutes: 60,
  },
};

export function deriveDailyBudget(
  pace: Pace = "balanced",
  energyProfile: EnergyProfile = "balanced"
): DailyPaceBudget {
  const base = BASE_BY_PACE[pace] ?? BASE_BY_PACE.balanced;
  if (energyProfile === "balanced") return base;

  if (energyProfile === "low") {
    return {
      maxStops: Math.max(3, base.maxStops - 1),
      maxDriveMinutes: Math.max(90, base.maxDriveMinutes - 45),
      maxTotalMinutes: Math.max(360, base.maxTotalMinutes - 75),
      maxTransitions: Math.max(3, base.maxTransitions - 1),
      minRecoveryMinutes: base.minRecoveryMinutes + 30,
    };
  }

  return {
    maxStops: Math.min(10, base.maxStops + 1),
    maxDriveMinutes: base.maxDriveMinutes + 45,
    maxTotalMinutes: base.maxTotalMinutes + 60,
    maxTransitions: base.maxTransitions + 1,
    minRecoveryMinutes: Math.max(45, base.minRecoveryMinutes - 20),
  };
}
