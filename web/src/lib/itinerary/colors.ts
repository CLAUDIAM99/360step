import type { StopType } from "@/lib/itinerary/schema";

/** Colori hex per marker e tratti su Google Maps (tema caldo / burgundy). */
export const STOP_TYPE_MAP_HEX: Record<StopType, string> = {
  visit: "#8B3D47",
  meal: "#B85A3C",
  sleep: "#6E4A5C",
  parking: "#9A7349",
  camper_stop: "#5D6B48",
  scenic: "#6F7F58",
  fuel: "#C2562D",
  other: "#8B7B70",
};

/** Marker attenuato quando il giorno non è focalizzato sulla mappa. */
export const MAP_MARKER_MUTED_HEX = "#A09088";

/** Classi Tailwind per badge tipo tappa in lista (allineate alla palette sopra). */
export const STOP_TYPE_BADGE_CLASS: Record<StopType, string> = {
  visit:
    "border border-[hsl(355_32%_72%)] bg-[hsl(355_28%_94%)] text-[hsl(355_38%_26%)] dark:border-[hsl(355_22%_38%)] dark:bg-[hsl(355_18%_20%)] dark:text-[hsl(355_32%_88%)]",
  meal:
    "border border-[hsl(22_35%_70%)] bg-[hsl(24_32%_93%)] text-[hsl(22_42%_28%)] dark:border-[hsl(22_28%_34%)] dark:bg-[hsl(22_22%_18%)] dark:text-[hsl(28_38%_88%)]",
  sleep:
    "border border-[hsl(300_18%_68%)] bg-[hsl(300_22%_93%)] text-[hsl(300_28%_28%)] dark:border-[hsl(300_18%_32%)] dark:bg-[hsl(300_16%_18%)] dark:text-[hsl(300_28%_88%)]",
  parking:
    "border border-[hsl(32_30%_68%)] bg-[hsl(34_28%_92%)] text-[hsl(28_32%_26%)] dark:border-[hsl(32_25%_32%)] dark:bg-[hsl(30_20%_17%)] dark:text-[hsl(34_32%_88%)]",
  camper_stop:
    "border border-[hsl(88_22%_62%)] bg-[hsl(88_24%_91%)] text-[hsl(88_28%_24%)] dark:border-[hsl(88_20%_30%)] dark:bg-[hsl(88_18%_16%)] dark:text-[hsl(88_32%_86%)]",
  scenic:
    "border border-[hsl(78_26%_62%)] bg-[hsl(78_28%_92%)] text-[hsl(78_30%_24%)] dark:border-[hsl(78_22%_30%)] dark:bg-[hsl(78_18%_16%)] dark:text-[hsl(78_32%_86%)]",
  fuel:
    "border border-[hsl(18_38%_68%)] bg-[hsl(20_34%_93%)] text-[hsl(18_42%_26%)] dark:border-[hsl(18_30%_34%)] dark:bg-[hsl(18_22%_17%)] dark:text-[hsl(24_38%_88%)]",
  other:
    "border border-[hsl(25_18%_72%)] bg-[hsl(30_22%_92%)] text-[hsl(25_22%_30%)] dark:border-[hsl(25_14%_32%)] dark:bg-[hsl(25_12%_18%)] dark:text-[hsl(32_22%_88%)]",
};

/** Bordo sinistro ciclico per sezioni giorno nella lista (toni caldi). */
const DAY_SECTION_ACCENT_BORDERS = [
  "border-l-[hsl(355_38%_44%)]",
  "border-l-[hsl(28_42%_46%)]",
  "border-l-[hsl(38_36%_44%)]",
  "border-l-[hsl(18_40%_44%)]",
  "border-l-[hsl(45_38%_42%)]",
] as const;

export function daySectionBorderClass(dayIndex: number): string {
  const i = Math.max(0, dayIndex - 1) % DAY_SECTION_ACCENT_BORDERS.length;
  return DAY_SECTION_ACCENT_BORDERS[i] ?? DAY_SECTION_ACCENT_BORDERS[0];
}
