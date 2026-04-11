import type { LatLngBounds } from "@/lib/maps/bounds";

/** Ring GeoJSON: [lng, lat][], primo punto uguale all'ultimo (poligono chiuso). */
export function pointInPolygonRing(
  lng: number,
  lat: number,
  ring: [number, number][]
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (Math.abs(yj - yi) < 1e-12) continue;
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInBounds(
  lat: number,
  lng: number,
  b: LatLngBounds
): boolean {
  return (
    lat <= b.north &&
    lat >= b.south &&
    lng <= b.east &&
    lng >= b.west
  );
}
