"use client";

import { useCallback, useState } from "react";
import {
  Circle,
  DrawingManager,
  GoogleMap,
  LoadScript,
  Marker,
} from "@react-google-maps/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { GeographicArea } from "@/lib/itinerary/schema";

const mapContainerStyle = { width: "100%", height: "min(360px, 55vh)" };

const libraries: ("drawing")[] = ["drawing"];

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

  const onMarkerDrag = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
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

  const onPolyComplete = useCallback(
    (poly: google.maps.Polygon) => {
      const path = poly.getPath();
      const coords: [number, number][] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        coords.push([p.lng(), p.lat()]);
      }
      if (coords.length >= 3) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coords.push([...first]);
        }
        onAreaChange({
          kind: "polygon",
          geojson: { type: "Polygon", coordinates: [coords] },
        });
      }
    },
    [onAreaChange]
  );

  const onMapLoad = useCallback(() => {
    setMapReady(true);
    if (mode === "radius") {
      onAreaChange({
        kind: "radius",
        centerLat: center.lat,
        centerLng: center.lng,
        radiusKm,
      });
    }
  }, [mode, center.lat, center.lng, radiusKm, onAreaChange]);

  if (!apiKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Imposta{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
        per usare la mappa.
      </p>
    );
  }

  return (
    <LoadScript
      googleMapsApiKey={apiKey}
      libraries={libraries}
      loadingElement={<p className="text-sm text-muted-foreground">Carico mappa…</p>}
    >
      <div className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
            Disegna un poligono con lo strumento in alto a sinistra sulla mappa.
          </p>
        )}
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={mode === "radius" ? 8 : 6}
          onLoad={onMapLoad}
          options={{ streetViewControl: false }}
        >
          {mode === "radius" && (
            <>
              <Marker
                position={center}
                draggable
                onDragEnd={onMarkerDrag}
              />
              <Circle
                center={center}
                radius={radiusKm * 1000}
                options={{
                  fillOpacity: 0.08,
                  strokeOpacity: 0.6,
                  strokeWeight: 1,
                }}
              />
            </>
          )}
          {mode === "polygon" && mapReady && (
            <DrawingManager
              onPolygonComplete={onPolyComplete}
              options={{
                drawingControl: true,
                drawingControlOptions: {
                  drawingModes: [
                    google.maps.drawing.OverlayType.POLYGON,
                  ],
                },
                polygonOptions: {
                  fillOpacity: 0.2,
                  strokeWeight: 2,
                  clickable: false,
                  editable: false,
                  zIndex: 1,
                },
              }}
            />
          )}
        </GoogleMap>
      </div>
    </LoadScript>
  );
}
