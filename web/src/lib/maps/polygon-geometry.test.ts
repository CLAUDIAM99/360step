import { describe, it, expect } from "vitest";
import { pointInBounds, pointInPolygonRing } from "./polygon-geometry";
import type { LatLngBounds } from "./bounds";

describe("pointInPolygonRing", () => {
  it("punto interno a quadrato [lng,lat]", () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(pointInPolygonRing(0.5, 0.5, ring)).toBe(true);
    expect(pointInPolygonRing(2, 2, ring)).toBe(false);
  });
});

describe("pointInBounds", () => {
  it("dentro bbox", () => {
    const b: LatLngBounds = {
      north: 60,
      south: 55,
      east: 0,
      west: -8,
    };
    expect(pointInBounds(57, -4, b)).toBe(true);
    expect(pointInBounds(50, -4, b)).toBe(false);
  });
});
