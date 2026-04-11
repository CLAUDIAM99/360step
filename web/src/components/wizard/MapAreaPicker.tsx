"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Circle, GoogleMap, Marker, Polyline, Polygon } from "@react-google-maps/api";
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
  /** Solo dopo «Disegna l’area» i clic aggiungono vertici. */
  const [polygonDrawing, setPolygonDrawing] = useState(false);

  const [radiusSearch, setRadiusSearch] = useState("");
  const [radiusPredOpen, setRadiusPredOpen] = useState(false);
  const [radiusPredictions, setRadiusPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const radiusAutoRef = useRef<google.maps.places.AutocompleteService | null>(
    null
  );
  const radiusPlacesRef = useRef<google.maps.places.PlacesService | null>(null);
  const radiusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const radiusWrapRef = useRef<HTMLDivElement>(null);
  const radiusListId = useId();

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

  const applyRadiusPlace = useCallback(
    (p: google.maps.places.AutocompletePrediction) => {
      if (!radiusPlacesRef.current) return;
      radiusPlacesRef.current.getDetails(
        { placeId: p.place_id, fields: ["geometry"] },
        (place, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            return;
          }
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setCenter({ lat, lng });
          setRadiusSearch(p.description);
          setRadiusPredOpen(false);
          setRadiusPredictions([]);
          map?.panTo({ lat, lng });
          map?.setZoom(10);
          onAreaChange({
            kind: "radius",
            centerLat: lat,
            centerLng: lng,
            radiusKm,
          });
        }
      );
    },
    [map, onAreaChange, radiusKm]
  );

  const fetchRadiusPredictions = useCallback((text: string) => {
    if (!radiusAutoRef.current || text.trim().length < 2) {
      setRadiusPredictions([]);
      return;
    }
    radiusAutoRef.current.getPlacePredictions(
      { input: text, types: ["geocode"] },
      (results, status) => {
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          results?.length
        ) {
          setRadiusPredictions(results.slice(0, 8));
        } else {
          setRadiusPredictions([]);
        }
      }
    );
  }, []);

  const [radiusServicesReady, setRadiusServicesReady] = useState(false);

  useEffect(() => {
    const init = () => {
      if (!window.google?.maps?.places) return false;
      radiusAutoRef.current = new google.maps.places.AutocompleteService();
      radiusPlacesRef.current = new google.maps.places.PlacesService(
        document.createElement("div")
      );
      setRadiusServicesReady(true);
      return true;
    };
    if (init()) return;
    const iv = setInterval(() => {
      if (init()) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!radiusWrapRef.current?.contains(e.target as Node)) {
        setRadiusPredOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
    setPolygonDrawing(false);
  }, [onAreaChange, polyPath]);

  const resetPolygon = useCallback(() => {
    setPolyPath([]);
    setPolyDone(false);
    setPolygonDrawing(false);
    onAreaChange(null);
  }, [onAreaChange]);

  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (mode !== "polygon" || polyDone || !polygonDrawing || !e.latLng) {
        return;
      }
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setPolyPath((p) => [...p, { lat, lng }]);
    },
    [mode, polyDone, polygonDrawing]
  );

  useEffect(() => {
    setPolyPath([]);
    setPolyDone(false);
    setPolygonDrawing(false);
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
    <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Se la mappa non carica o vedi errori in console, disattiva blocchi
          annunci/tracker per questo sito: spesso bloccano{" "}
          <code className="rounded bg-muted px-1">maps.googleapis.com</code>.
        </p>
      {mode === "radius" && (
        <div className="space-y-3">
          <div ref={radiusWrapRef} className="relative space-y-1">
            <Label htmlFor="radius-search">Cerca luogo (centro del raggio)</Label>
            <Input
              id="radius-search"
              type="text"
              autoComplete="off"
              placeholder={
                radiusServicesReady
                  ? "Es. Milano, Lago di Como…"
                  : "Caricamento suggerimenti…"
              }
              disabled={!radiusServicesReady}
              value={radiusSearch}
              onChange={(e) => {
                const v = e.target.value;
                setRadiusSearch(v);
                if (radiusDebounceRef.current) {
                  clearTimeout(radiusDebounceRef.current);
                }
                radiusDebounceRef.current = setTimeout(() => {
                  fetchRadiusPredictions(v);
                  setRadiusPredOpen(v.trim().length >= 2);
                }, 280);
              }}
              onFocus={() => {
                if (radiusSearch.trim().length >= 2) {
                  fetchRadiusPredictions(radiusSearch);
                  setRadiusPredOpen(true);
                }
              }}
            />
            {radiusPredOpen && radiusPredictions.length > 0 && (
              <ul
                id={radiusListId}
                role="listbox"
                className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
              >
                {radiusPredictions.map((p) => (
                  <li
                    key={p.place_id}
                    role="option"
                    className="cursor-pointer border-b border-border/50 px-3 py-2 last:border-0 hover:bg-muted/80"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyRadiusPlace(p)}
                  >
                    {p.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
              Cerca un luogo per centrare il cerchio, oppure trascina il
              segnaposto sulla mappa.
            </p>
          </div>
        </div>
      )}
      {mode === "polygon" && (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
          <span className="max-w-xl">
            {!polygonDrawing && !polyDone &&
              "Attiva «Disegna l’area», poi clicca sulla mappa per i vertici."}
            {polygonDrawing && !polyDone &&
              "Clic sulla mappa per aggiungere punti (3+), poi «Chiudi area»."}
            {polyDone && "Area chiusa. Usa «Reimposta» per ricominciare."}
          </span>
          <div className="flex flex-wrap gap-2">
            {!polyDone && (
              <Button
                type="button"
                variant={polygonDrawing ? "secondary" : "default"}
                size="sm"
                disabled={polyDone}
                onClick={() => setPolygonDrawing((d) => !d)}
              >
                {polygonDrawing ? "Interrompi disegno" : "Disegna l’area"}
              </Button>
            )}
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
            {polyPath.map((pt, i) => (
              <Marker
                key={i}
                position={pt}
                label={{
                  text: String(i + 1),
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: "bold",
                }}
              />
            ))}
          </>
        )}
      </GoogleMap>
    </div>
  );
}
