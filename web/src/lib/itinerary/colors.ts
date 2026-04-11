import type { StopType } from "@/lib/itinerary/schema";
import { ROAMY_PALETTE } from "@/lib/theme/bordeaux-palette";

const DAY_ITINERARY_HEX = [
  ROAMY_PALETTE.bordeauxBright,
  "#9B1A40",
  ROAMY_PALETTE.roseMauve,
  ROAMY_PALETTE.plumDeep,
  "#C75B7A",
] as const;

export function dayItineraryHex(dayIndex: number): string {
  const i = Math.max(0, dayIndex - 1) % DAY_ITINERARY_HEX.length;
  return DAY_ITINERARY_HEX[i] ?? ROAMY_PALETTE.bordeauxBright;
}

export function dayListAccentClass(dayIndex: number): string {
  const hex = dayItineraryHex(dayIndex);
  return `border-l-4 border-l-[${hex}]`;
}

export function daySectionBorderClass(dayIndex: number): string {
  return dayListAccentClass(dayIndex);
}

export const MAP_MARKER_MUTED_HEX = "#9a8d8a";

export const STOP_TYPE_BADGE_CLASS: Record<StopType, string> = {
  visit:
    "border border-primary/20 bg-primary/5 text-foreground dark:border-primary/30 dark:bg-primary/10 dark:text-foreground",
  meal:
    "border border-accent/25 bg-accent/10 text-foreground dark:border-accent/35 dark:bg-accent/15",
  sleep:
    "border border-muted-foreground/20 bg-muted text-foreground dark:bg-muted/80",
  parking:
    "border border-border bg-muted/60 text-foreground dark:bg-muted/40",
  camper_stop:
    "border border-border bg-muted/60 text-foreground dark:bg-muted/40",
  scenic:
    "border border-primary/15 bg-muted/50 text-foreground dark:bg-primary/10",
  fuel:
    "border border-accent/20 bg-muted/50 text-foreground dark:bg-accent/10",
  other:
    "border border-border bg-muted/40 text-muted-foreground dark:bg-muted/30",
};
