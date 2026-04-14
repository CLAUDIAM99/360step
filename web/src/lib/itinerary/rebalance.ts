import type {
  DayHealth,
  ItineraryResult,
  RebalancingSuggestion,
} from "./schema";

function stopKey(dayIndex: number, orderInDay: number, title: string, placeId?: string) {
  return `${dayIndex}:${orderInDay}:${placeId ?? title}`;
}

function cloneResult(result: ItineraryResult): ItineraryResult {
  return {
    ...result,
    days: result.days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ ...s })) })),
  };
}

export function buildRebalancingSuggestions(
  itinerary: ItineraryResult,
  dayHealth: DayHealth[]
): RebalancingSuggestion[] {
  const sortedDays = [...itinerary.days].sort((a, b) => a.dayIndex - b.dayIndex);
  const suggestions: RebalancingSuggestion[] = [];

  for (const health of dayHealth) {
    if (health.issues.length === 0) continue;
    const day = sortedDays.find((d) => d.dayIndex === health.dayIndex);
    if (!day) continue;
    const ordered = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay);
    const movable =
      [...ordered]
        .reverse()
        .find((s) => s.stopStatus === "optional" && s.type !== "sleep") ??
      [...ordered].reverse().find((s) => s.type !== "sleep");
    const nextDay = sortedDays.find((d) => d.dayIndex === health.dayIndex + 1);

    if (movable && nextDay && health.issues.some((i) => i === "too_dense" || i === "too_much_drive")) {
      suggestions.push({
        id: `rebalance-move-${health.dayIndex}-${movable.orderInDay}`,
        type: "move_stop",
        reason: "Riduce carico della giornata mantenendo la tappa nel viaggio.",
        fromDayIndex: health.dayIndex,
        toDayIndex: nextDay.dayIndex,
        stopKey: stopKey(movable.dayIndex, movable.orderInDay, movable.title, movable.placeId),
        stopTitle: movable.title,
        expectedImpact: "Meno pressione temporale nel giorno corrente.",
      });
      continue;
    }

    if (movable && health.issues.includes("too_dense")) {
      suggestions.push({
        id: `rebalance-optional-${health.dayIndex}-${movable.orderInDay}`,
        type: "mark_optional",
        reason: "Rende la tappa facoltativa per aumentare il margine della giornata.",
        fromDayIndex: health.dayIndex,
        stopKey: stopKey(movable.dayIndex, movable.orderInDay, movable.title, movable.placeId),
        stopTitle: movable.title,
        expectedImpact: "Maggiore flessibilita in caso di ritardi.",
      });
      continue;
    }

    suggestions.push({
      id: `rebalance-hint-${health.dayIndex}`,
      type: "split_day_hint",
      reason: "La giornata e critica ma non ci sono spostamenti automatici sicuri.",
      fromDayIndex: health.dayIndex,
      expectedImpact: "Suggerito ripensare manualmente la sequenza di tappe.",
    });
  }

  return suggestions;
}

export function applyRebalancingSuggestion(
  itinerary: ItineraryResult,
  suggestion: RebalancingSuggestion
): ItineraryResult {
  if (suggestion.type === "split_day_hint") return itinerary;

  const next = cloneResult(itinerary);
  const getDay = (dayIndex: number) => next.days.find((d) => d.dayIndex === dayIndex);

  if (suggestion.type === "mark_optional" && suggestion.stopKey) {
    for (const day of next.days) {
      day.stops = day.stops.map((stop) =>
        stopKey(stop.dayIndex, stop.orderInDay, stop.title, stop.placeId) === suggestion.stopKey
          ? stop.type === "sleep"
            ? stop
            : { ...stop, stopStatus: "optional" }
          : stop
      );
    }
  }

  if (
    suggestion.type === "move_stop" &&
    suggestion.stopKey &&
    suggestion.toDayIndex != null
  ) {
    const fromDay = getDay(suggestion.fromDayIndex);
    const toDay = getDay(suggestion.toDayIndex);
    if (fromDay && toDay) {
      const idx = fromDay.stops.findIndex(
        (stop) =>
          stopKey(stop.dayIndex, stop.orderInDay, stop.title, stop.placeId) ===
          suggestion.stopKey
      );
      if (idx >= 0) {
        const [moved] = fromDay.stops.splice(idx, 1);
        if (moved?.type === "sleep") {
          // Safety: never auto-move accommodations (base anchors).
          return itinerary;
        }
        toDay.stops.push({ ...moved, dayIndex: toDay.dayIndex });
      }
      fromDay.stops = fromDay.stops
        .sort((a, b) => a.orderInDay - b.orderInDay)
        .map((s, i) => ({ ...s, dayIndex: fromDay.dayIndex, orderInDay: i }));
      toDay.stops = toDay.stops
        .sort((a, b) => a.orderInDay - b.orderInDay)
        .map((s, i) => ({ ...s, dayIndex: toDay.dayIndex, orderInDay: i }));
    }
  }

  return {
    ...next,
    legs: undefined,
    dayHealth: undefined,
    tripHealthSummary: undefined,
    rebalancingSuggestions: undefined,
    revision: (next.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}
