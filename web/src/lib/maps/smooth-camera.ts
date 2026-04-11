/** Easing per animazioni camera mappa (0..1). */
export function easeOutCubic(t: number): number {
  const x = 1 - t;
  return 1 - x * x * x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function shortestLngDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
