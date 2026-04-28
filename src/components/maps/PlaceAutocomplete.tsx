import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";

export interface PlaceResult {
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface Props {
  /** Current display text — synced to input when not focused */
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Uncontrolled input with Google Places Autocomplete.
 * Uses componentRestrictions: { country: "br" } by default.
 */
export function PlaceAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Buscar endereço...",
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary("places");
  // Store callback in ref to avoid re-attaching listener on every render
  const onPlaceSelectRef = useRef(onPlaceSelect);
  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  });

  // Attach Places Autocomplete once the library is loaded
  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry"],
      componentRestrictions: { country: "br" },
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location && place.formatted_address) {
        const result: PlaceResult = {
          formattedAddress: place.formatted_address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        onPlaceSelectRef.current(result);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLib]);

  // Sync external value to input when it changes (e.g. loading from Firestore)
  // Only update if the input is not currently focused
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
