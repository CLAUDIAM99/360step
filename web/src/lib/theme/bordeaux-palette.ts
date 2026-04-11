/**
 * Palette brand Roamy (hex) — crema, bordeaux acceso, malva, pietra.
 */
export const ROAMY_PALETTE = {
  bordeauxBright: "#B3123F",
  plumDeep: "#4A0B1F",
  roseMauve: "#E38AAE",
  creamSoft: "#FFF3EB",
  stoneGray: "#434955",
  blushLight: "#FAD0DA",
} as const;

/** @deprecated Usare ROAMY_PALETTE */
export const BORDEAUX = {
  principal: ROAMY_PALETTE.bordeauxBright,
  dark: ROAMY_PALETTE.plumDeep,
  wine: "#9B1A40",
  mauve: ROAMY_PALETTE.roseMauve,
  cream: ROAMY_PALETTE.creamSoft,
  anthracite: ROAMY_PALETTE.stoneGray,
} as const;
