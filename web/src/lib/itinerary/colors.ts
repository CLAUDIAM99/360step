import type { StopType } from "@/lib/itinerary/schema";
import { BORDEAUX } from "@/lib/theme/bordeaux-palette";

/**
 * Un colore per giorno (mappa + bordo lista), ciclo nella famiglia Bordeaux.
 */
const DAY_ITINERARY_HEX = [
  BORDEAUX.principal,
  BORDEAUX.wine,
  BORDEAUX.mauve,
  "#4d1520",
  "#8b4d5c",
] as const;

export function dayItineraryHex(dayIndex: number): string {
  const i = Math.max(0, dayIndex - 1) % DAY_ITINERARY_HEX.length;
  return DAY_ITINERARY_HEX[i] ?? BORDEAUX.principal;
}

/** Bordo sinistro sezione giorno — stesso hex del tracciato mappa. */
export function dayListAccentClass(dayIndex: number): string {
  const hex = dayItineraryHex(dayIndex);
  return `border-l-4 border-l-[${hex}]`;
}

/** @deprecated Usare dayListAccentClass */
export function daySectionBorderClass(dayIndex: number): string {
  return dayListAccentClass(dayIndex);
}

/** Marker quando il giorno non è focalizzato sulla mappa. */
export const MAP_MARKER_MUTED_HEX = "#7d6d68";

/**
 * Badge tipo tappa: neutri, palette Bordeaux (non competono col colore-giorno).
 */
export const STOP_TYPE_BADGE_CLASS: Record<StopType, string> = {
  visit:
    "border border-primary/20 bg-primary/5 text-foreground dark:border-primary/30 dark:bg-primary/10 dark:text-foreground",
  meal:
    "border border-accent/25 bg-accent/8 text-foreground dark:border-accent/30 dark:bg-accent/10",
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
