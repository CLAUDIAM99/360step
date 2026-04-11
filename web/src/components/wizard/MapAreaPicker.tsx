"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, GoogleMap, LoadScript, Polyline, Polygon } from "@react-google-maps/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GeographicArea } from "@/lib/itinerary/schema";

const mapContainerStyle = { width: "100%", height: "min(360px, 55vh)" };

/** Map ID vettoriale (Advanced Markers). In Cloud Console creane uno o usa DEMO_MAP_ID in dev. */
const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

type Mode = "polygon" | "radius";

type Props = {
  mode: Mode;
  onAreaChange: (area: GeographicArea | null) => void;
};

export function MapAreaPicker({ mode, onAreaChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [center, setCenter] = useState({ lat: 45.46, lng: 9.19 });
  const [radiusKm, setRadiusKm] = useState(40);
  const [mapReady, setMapReady] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [polyPath, setPolyPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [polyDone, setPolyDone] = useState(false);
  const advMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );

  const onMarkerDrag = useCallback(
    (lat: number, lng: number) => {
      setCenter({ lat, lng });
      onAreaChange({
        kind: "radius",
        centerLat: lat,
        centerLng: lng,
        radiusKm,
      });
    },
    [onAreaChange, radiusKm]
  );

  const onRadiusInput = useCallback(
    (km: number) => {
      const r = Math.min(500, Math.max(5, km));
      setRadiusKm(r);
      onAreaChange({
        kind: "radius",
        centerLat: center.lat,
        centerLng: center.lng,
        radiusKm: r,
      });
    },
    [center.lat, center.lng, onAreaChange]
  );

  const closePolygon = useCallback(() => {
    if (polyPath.length < 3) return;
    const coords: [number, number][] = polyPath.map((p) => [p.lng, p.lat]);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([...first]);
    }
    onAreaChange({
      kind: "polygon",
      geojson: { type: "Polygon", coordinates: [coords] },
    });
    setPolyDone(true);
  }, [onAreaChange, polyPath]);

  const resetPolygon = useCallback(() => {
    setPolyPath([]);
    setPolyDone(false);
    onAreaChange(null);
  }, [onAreaChange]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (mode !== "polygon" || polyDone || !e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setPolyPath((p) => [...p, { lat, lng }]);
    },
    [mode, polyDone]
  );

  useEffect(() => {
    setPolyPath([]);
    setPolyDone(false);
  }, [mode]);

  useEffect(() => {
    if (!map || mode !== "radius" || !mapReady) return;
    let cancelled = false;
    (async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary(
        "marker"
      )) as google.maps.MarkerLibrary;
      if (cancelled) return;
      advMarkerRef.current?.map && (advMarkerRef.current.map = null);
      const marker = new AdvancedMarkerElement({
        map,
        position: center,
        gmpDraggable: true,
      });
      advMarkerRef.current = marker;
      marker.addListener("dragend", () => {
        const pos = marker.position;
        if (!pos) return;
        const lat =
          typeof (pos as google.maps.LatLng).lat === "function"
            ? (pos as google.maps.LatLng).lat()
            : (pos as google.maps.LatLngLiteral).lat;
        const lng =
          typeof (pos as google.maps.LatLng).lng === "function"
            ? (pos as google.maps.LatLng).lng()
            : (pos as google.maps.LatLngLiteral).lng;
        onMarkerDrag(lat, lng);
      });
    })();
    return () => {
      cancelled = true;
      if (advMarkerRef.current) {
        advMarkerRef.current.map = null;
        advMarkerRef.current = null;
      }
    };
  }, [map, mode, mapReady, onMarkerDrag]);

  useEffect(() => {
    if (!advMarkerRef.current || mode !== "radius") return;
    advMarkerRef.current.position = center;
  }, [center.lat, center.lng, mode]);

  const onMapLoad = useCallback(
    (m: google.maps.Map) => {
      setMap(m);
      setMapReady(true);
      if (mode === "radius") {
        onAreaChange({
          kind: "radius",
          centerLat: center.lat,
          centerLng: center.lng,
          radiusKm,
        });
      }
    },
    [mode, center.lat, center.lng, radiusKm, onAreaChange]
  );

  if (!apiKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Imposta{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
        per usare la mappa.
      </p>
    );
  }

  const polygonPreviewPath =
    polyPath.length >= 3 && !polyDone
      ? [...polyPath, polyPath[0]]
      : polyPath;

  return (
    <LoadScript
      googleMapsApiKey={apiKey}
      loadingElement={<p className="text-sm text-muted-foreground">Carico mappa…</p>}
    >
      <div className="space-y-3">
        <p className="text-xs text-amber-800 dark:text-amber-200/90">
          Se la mappa non carica o vedi errori in console, disattiva blocchi
          annunci/tracker per questo sito: spesso bloccano{" "}
          <code className="rounded bg-muted px-1">maps.googleapis.com</code>.
        </p>
        {mode === "radius" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="radius-km">Raggio (km)</Label>
              <Input
                id="radius-km"
                type="number"
                min={5}
                max={500}
                value={radiusKm}
                onChange={(e) => onRadiusInput(Number(e.target.value) || 5)}
              />
            </div>
            <p className="text-xs text-muted-foreground max-w-sm">
              Trascina il segnaposto per centrare. L’itinerario sarà generato
              entro il cerchio.
            </p>
          </div>
        )}
        {mode === "polygon" && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Clic sulla mappa per aggiungere vertici (3+), poi «Chiudi area».
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={polyPath.length < 3 || polyDone}
              onClick={closePolygon}
            >
              Chiudi area
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetPolygon}>
              Reimposta
            </Button>
          </div>
        )}
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={mode === "radius" ? 8 : 6}
          onLoad={onMapLoad}
          onClick={onMapClick}
          options={{
            mapId: MAP_ID,
            streetViewControl: false,
            gestureHandling: "greedy",
          }}
        >
          {mode === "radius" && (
            <Circle
              center={center}
              radius={radiusKm * 1000}
              options={{
                fillOpacity: 0.08,
                strokeOpacity: 0.6,
                strokeWeight: 1,
              }}
            />
          )}
          {mode === "polygon" && polyPath.length > 0 && (
            <>
              {polyDone && polyPath.length >= 3 ? (
                <Polygon
                  path={polyPath}
                  options={{
                    fillOpacity: 0.2,
                    strokeWeight: 2,
                    clickable: false,
                  }}
                />
              ) : (
                <Polyline
                  path={polygonPreviewPath}
                  options={{
                    strokeOpacity: 0.9,
                    strokeWeight: 2,
                  }}
                />
              )}
            </>
          )}
        </GoogleMap>
      </div>
    </LoadScript>
  );
}
