"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PlaceAutocompleteFieldProps = {
  id?: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Usare dentro un albero già caricato con Maps JS API (`libraries` include `places`). */
export function PlaceAutocompleteField({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  className,
}: PlaceAutocompleteFieldProps) {
  const listId = useId();
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [predictions, setPredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const autoRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  const [servicesReady, setServicesReady] = useState(false);

  useEffect(() => {
    const init = () => {
      if (!window.google?.maps?.places) return false;
      autoRef.current = new google.maps.places.AutocompleteService();
      placesRef.current = new google.maps.places.PlacesService(
        document.createElement("div")
      );
      setServicesReady(true);
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
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchPredictions = useCallback((text: string) => {
    if (!autoRef.current || text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    autoRef.current.getPlacePredictions(
      {
        input: text,
        types: ["geocode"],
      },
      (results, status) => {
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          results?.length
        ) {
          setPredictions(results.slice(0, 8));
        } else {
          setPredictions([]);
        }
      }
    );
  }, []);

  const applyPrediction = useCallback(
    (p: google.maps.places.AutocompletePrediction) => {
      if (!placesRef.current) return;
      placesRef.current.getDetails(
        {
          placeId: p.place_id,
          fields: ["formatted_address", "name"],
        },
        (place, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place
          ) {
            const fallback = p.description;
            onChange(fallback);
            setInput(fallback);
            setOpen(false);
            setPredictions([]);
            return;
          }
          const text =
            place.formatted_address ?? place.name ?? p.description;
          onChange(text);
          setInput(text);
          setOpen(false);
          setPredictions([]);
        }
      );
    },
    [onChange]
  );

  const onInputChange = (raw: string) => {
    setInput(raw);
    onChange(raw);
    setActiveIdx(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPredictions(raw);
      setOpen(raw.trim().length >= 2);
    }, 280);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) =>
        i < predictions.length - 1 ? i + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) =>
        i <= 0 ? predictions.length - 1 : i - 1
      );
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      applyPrediction(predictions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={servicesReady ? placeholder : "Caricamento suggerimenti…"}
        value={input}
        disabled={disabled || !servicesReady}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => {
          if (input.trim().length >= 2) {
            fetchPredictions(input);
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
      />
      {open && predictions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
        >
          {predictions.map((p, i) => (
            <li
              key={p.place_id}
              role="option"
              aria-selected={i === activeIdx}
              className={cn(
                "cursor-pointer border-b border-border/50 px-3 py-2 last:border-0",
                i === activeIdx ? "bg-accent" : "hover:bg-muted/80"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyPrediction(p)}
            >
              <span className="text-foreground">{p.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
