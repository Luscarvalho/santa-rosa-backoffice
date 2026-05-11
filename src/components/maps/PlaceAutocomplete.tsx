import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";
import {
  createAutocompleteAdapter,
  type AutocompletePrediction,
} from "./place-autocomplete-adapter";

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

/** Manaus bounding box — biases predictions toward the city. */
const MANAUS_BOUNDS: google.maps.LatLngBoundsLiteral = {
  south: -3.2,
  west: -60.2,
  north: -2.9,
  east: -59.8,
};

/** Debounce window between keystrokes before firing a predictions request. */
const PREDICTIONS_DEBOUNCE_MS = 150;

/** Timeout that defers dropdown close to let mousedown on an option fire. */
const BLUR_CLOSE_DELAY_MS = 150;

/**
 * Uncontrolled input with Google Places Autocomplete.
 *
 * Uses `AutocompleteAdapter` (session-token aware) instead of the widget-based
 * `Autocomplete` class, fixing Bug Condition C2: every keystroke was previously
 * billed as a standalone request. Now all keystrokes in a single search are
 * grouped into one Per-Session billing session.
 *
 * Public shape is identical to the previous implementation:
 *   props: value, onChange, onPlaceSelect, placeholder, className
 *
 * Preserves:
 *   - defaultValue / external sync without focus steal (3.5)
 *   - Manaus priority + country="br" (3.7)
 *   - payload { formattedAddress, lat, lng } (3.6)
 *
 * Robustness fixes over the initial version:
 *   - Debounces keystrokes (150ms) to reduce HTTP call volume — session token
 *     consolidates billing, but the API is still called per keystroke without this.
 *   - Guards against out-of-order resolution of `adapter.start()` (typing fast
 *     could otherwise show predictions for "a" after the user already typed "abc").
 *   - Cleans up pending blur timeout and in-flight fetches on unmount.
 *
 * **Validates: Requirements 2.3, 2.4, 3.5, 3.6, 3.7 / Property P2**
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

  // Store callbacks in refs to avoid re-attaching effects on every render.
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
    onChangeRef.current = onChange;
  });

  // Dropdown state
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSelecting, setIsSelecting] = useState(false);

  // Create adapter once when placesLib is available; dispose on unmount.
  const adapter = useMemo(
    () => (placesLib ? createAutocompleteAdapter(placesLib) : null),
    [placesLib],
  );

  useEffect(() => {
    return () => {
      adapter?.dispose();
    };
  }, [adapter]);

  // Request sequencing: each call to fetchPredictions bumps this counter so
  // a late-arriving result from an older keystroke is discarded instead of
  // overwriting the dropdown built from the latest input.
  const fetchSeqRef = useRef(0);

  // Debounce timer for keystroke → fetch; cleared on next keystroke or unmount.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Blur-close timer; cleared on unmount so we don't setState post-unmount.
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks mount state for async callbacks. Written once synchronously on unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (blurTimerRef.current !== null) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
      }
    };
  }, []);

  /** Runs a predictions fetch, ignoring stale resolutions. */
  const fetchPredictions = useCallback(
    async (input: string) => {
      if (!adapter || input.trim().length === 0) {
        setPredictions([]);
        setIsOpen(false);
        return;
      }

      const mySeq = ++fetchSeqRef.current;

      try {
        const results = await adapter.start({
          input,
          country: "br",
          bounds: MANAUS_BOUNDS,
        });
        // Discard stale resolutions and resolutions that land after unmount.
        if (!mountedRef.current || fetchSeqRef.current !== mySeq) return;
        setPredictions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
      } catch {
        if (!mountedRef.current || fetchSeqRef.current !== mySeq) return;
        setPredictions([]);
        setIsOpen(false);
      }
    },
    [adapter],
  );

  // Handle input change: call onChange prop + schedule debounced fetch.
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      onChangeRef.current(text);

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      if (text.trim().length === 0) {
        // Empty input: reset dropdown immediately and cancel in-flight requests
        // by bumping the seq counter.
        fetchSeqRef.current += 1;
        setPredictions([]);
        setIsOpen(false);
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void fetchPredictions(text);
      }, PREDICTIONS_DEBOUNCE_MS);
    },
    [fetchPredictions],
  );

  // Handle prediction selection.
  const handleSelect = useCallback(
    async (prediction: AutocompletePrediction) => {
      if (!adapter) return;

      // Cancel any pending debounced fetch — selection closes the session.
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Invalidate any in-flight prediction fetch.
      fetchSeqRef.current += 1;

      setIsSelecting(true);
      setIsOpen(false);
      setPredictions([]);
      setActiveIndex(-1);

      // Update input display immediately for responsiveness.
      if (inputRef.current) {
        inputRef.current.value = prediction.description;
      }
      onChangeRef.current(prediction.description);

      try {
        const place = await adapter.select(prediction.placeId);
        if (!mountedRef.current) return;
        onPlaceSelectRef.current({
          formattedAddress: place.formattedAddress,
          lat: place.lat,
          lng: place.lng,
        });
      } catch {
        // Selection failed — leave input as-is, user can retry.
      } finally {
        if (mountedRef.current) setIsSelecting(false);
      }
    },
    [adapter],
  );

  // Keyboard navigation within the dropdown.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || predictions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, predictions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        void handleSelect(predictions[activeIndex]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    },
    [isOpen, predictions, activeIndex, handleSelect],
  );

  // Close dropdown when focus leaves the component.
  const handleBlur = useCallback(() => {
    // Delay to allow mousedown on a prediction item to fire first.
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (!mountedRef.current) return;
      setIsOpen(false);
      setActiveIndex(-1);
    }, BLUR_CLOSE_DELAY_MS);
  }, []);

  // Sync external value to input when it changes (e.g. loading from Firestore).
  // Only update if the input is not currently focused (3.5).
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        defaultValue={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        role="combobox"
        disabled={isSelecting}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
      {isOpen && predictions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md"
        >
          {predictions.map((prediction, index) => (
            <li
              key={prediction.placeId}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                // Prevent blur from firing before click.
                e.preventDefault();
                void handleSelect(prediction);
              }}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm",
                index === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {prediction.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
