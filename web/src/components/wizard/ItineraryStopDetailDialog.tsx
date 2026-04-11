"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GroundedStop } from "@/lib/itinerary/schema";

type DetailsJson = {
  name?: string;
  formattedAddress?: string;
  editorialSummary?: string;
  photoRefs?: string[];
  error?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: GroundedStop | null;
};

export function ItineraryStopDetailDialog({
  open,
  onOpenChange,
  stop,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DetailsJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !stop?.placeId) {
      setData(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/places/details?placeId=${encodeURIComponent(stop.placeId)}`)
      .then(async (r) => {
        const j = (await r.json()) as DetailsJson;
        if (!r.ok) throw new Error(j.error || "Dettagli non disponibili");
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Errore caricamento");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, stop?.placeId]);

  const title = data?.name ?? stop?.title ?? "Tappa";
  const summary =
    data?.editorialSummary ?? stop?.notes ?? data?.formattedAddress;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {(stop?.formattedAddress || data?.formattedAddress) && (
            <p className="flex items-start gap-2 text-left text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              {stop?.formattedAddress ?? data?.formattedAddress}
            </p>
          )}
        </DialogHeader>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        {!loading && !stop?.placeId && (
          <p className="text-sm text-muted-foreground">
            Nessun luogo Google collegato a questa tappa. Apri la scheda su Maps
            per maggiori informazioni.
          </p>
        )}
        {data?.photoRefs && data.photoRefs.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {data.photoRefs.map((ref, i) => (
              <div
                key={`${ref}-${i}`}
                className="relative aspect-video overflow-hidden rounded-lg bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/places/photo?ref=${encodeURIComponent(ref)}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        {summary && !loading && (
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        )}
        {stop?.mapsUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={stop.mapsUrl} target="_blank" rel="noopener noreferrer">
              Apri in Google Maps
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
