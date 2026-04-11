import type { GeographicArea } from "@/lib/itinerary/schema";

export type LatLngBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export function boundsFromArea(area: GeographicArea): LatLngBounds {
  if (area.kind === "radius") {
    const km = area.radiusKm;
    const latDelta = km / 111;
    const lngDelta = km / (111 * Math.cos((area.centerLat * Math.PI) / 180));
    return {
      north: area.centerLat + latDelta,
      south: area.centerLat - latDelta,
      east: area.centerLng + lngDelta,
      west: area.centerLng - lngDelta,
    };
  }
  if (area.kind === "polygon") {
    const ring = area.geojson.coordinates[0];
    if (!ring?.length) {
      return {
        north: 0,
        south: 0,
        east: 0,
        west: 0,
      };
    }
    let north = -90,
      south = 90,
      east = -180,
      west = 180;
    for (const [lng, lat] of ring) {
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      west = Math.min(west, lng);
    }
    return { north, south, east, west };
  }
  // corridor: placeholder until geocoded — caller widens
  return {
    north: 1,
    south: -1,
    east: 1,
    west: -1,
  };
}

export function widenBounds(b: LatLngBounds, factor = 1.15): LatLngBounds {
  const latMid = (b.north + b.south) / 2;
  const lngMid = (b.east + b.west) / 2;
  const halfLat = ((b.north - b.south) / 2) * factor;
  const halfLng = ((b.east - b.west) / 2) * factor;
  return {
    north: latMid + halfLat,
    south: latMid - halfLat,
    east: lngMid + halfLng,
    west: lngMid - halfLng,
  };
}
