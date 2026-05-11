/**
 * Preservation — `PlaceAutocomplete.onPlaceSelect` payload shape & values.
 *
 * **Validates: Requirements 3.5, 3.6, 3.7**
 *
 * Observation-first:
 *   1. `src/components/maps/PlaceAutocomplete.tsx` forwards the place selection
 *      into `onPlaceSelect({ formattedAddress, lat, lng })` with values derived
 *      from `PlacesService.getDetails` (via the adapter).
 *   2. We freeze this contract as `oracle/place-select-payload.json` and
 *      assert F' produces the same payload byte-for-byte.
 *
 * Properties:
 *   - shape: payload has exactly the three keys formattedAddress, lat, lng.
 *   - passthrough: the payload reflects whatever `getDetails()` returns.
 *   - external `value` sync ignored while input focused (3.5).
 *   - Bounds/country still set on the AutocompleteService request (3.7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";
import { fireEvent } from "@testing-library/react";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  mapsMockState,
  resetMapsMocks,
  setNextPlace,
  setNextPredictions,
} from "../../../_helpers/maps-mocks";
import oracle from "../oracle/place-select-payload.json" with { type: "json" };

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

interface Payload {
  formattedAddress: string;
  lat: number;
  lng: number;
}

/**
 * Render PlaceAutocomplete, type a character to trigger predictions, then
 * click the first prediction to trigger onPlaceSelect.
 */
async function renderAutocompleteAndSelect(
  place: Payload,
  options: { initialValue?: string; focusInput?: boolean; externalValue?: string } = {},
) {
  installGoogleMapsGlobal();
  resetMapsMocks();
  setNextPlace(place);
  // Set up a prediction so the dropdown appears.
  setNextPredictions([
    { place_id: "test_place_id", description: place.formattedAddress },
  ]);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const { PlaceAutocomplete } = await import(
    "../../../../src/components/maps/PlaceAutocomplete"
  );

  const received: Payload[] = [];
  const onPlaceSelect = (p: Payload) => received.push(p);

  let currentValue = options.initialValue ?? "";
  const onChange = (v: string) => {
    currentValue = v;
  };

  function Host({ value }: { value: string }) {
    return React.createElement(
      PlaceAutocomplete as unknown as React.FC<{
        value: string;
        onChange: (v: string) => void;
        onPlaceSelect: (p: Payload) => void;
        placeholder?: string;
      }>,
      { value, onChange, onPlaceSelect },
    );
  }

  await act(async () => {
    root.render(React.createElement(Host, { value: currentValue }));
  });

  const input = container.querySelector("input") as HTMLInputElement;
  if (options.focusInput) input.focus();

  // Type a character to trigger predictions.
  await act(async () => {
    fireEvent.change(input, { target: { value: "a" } });
  });
  // Wait past the 150ms debounce + microtask for getPlacePredictions.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });

  // Click the first prediction to trigger onPlaceSelect.
  await act(async () => {
    const firstItem = container.querySelector('[role="option"]') as HTMLElement | null;
    if (firstItem) {
      firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
  });
  // Wait for async getDetails to complete.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Optionally push a new external `value` prop to exercise the sync effect.
  if (options.externalValue !== undefined) {
    await act(async () => {
      root.render(
        React.createElement(Host, { value: options.externalValue ?? "" }),
      );
    });
  }

  const inputValueAfter = input.value;
  const focused = document.activeElement === input;

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return {
    received,
    inputValueAfter,
    wasFocused: focused,
    serviceCallOptions: mapsMockState.autocompleteServiceCalls.map((c) => c.request),
  };
}

describe("Preservation — PlaceAutocomplete.onPlaceSelect payload", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[oracle] payload is byte-exact for each canonical place sample", async () => {
    for (const entry of oracle.entries as Array<{
      input: Payload;
      expected: Payload;
    }>) {
      const { received } = await renderAutocompleteAndSelect(entry.input);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(entry.expected);
      // Shape check: exactly three keys, nothing else.
      expect(Object.keys(received[0]).sort()).toEqual([
        "formattedAddress",
        "lat",
        "lng",
      ]);
    }
  });

  it("[preservation 3.7] AutocompleteService is called with componentRestrictions.country='br' and Manaus bounds", async () => {
    await renderAutocompleteAndSelect({
      formattedAddress: "Rua X",
      lat: -3.11,
      lng: -60.02,
    });
    // The adapter calls AutocompleteService.getPlacePredictions with country and bounds.
    expect(mapsMockState.autocompleteServiceCalls.length).toBeGreaterThanOrEqual(1);
    const req = mapsMockState.autocompleteServiceCalls[0].request as Record<string, unknown>;
    expect((req.componentRestrictions as Record<string, unknown>).country).toBe("br");
    expect(req.bounds).toBeDefined();
  });

  it("[preservation 3.5] external `value` change does NOT overwrite input while focused", async () => {
    installGoogleMapsGlobal();
    resetMapsMocks();
    setNextPlace({ formattedAddress: "Ignored", lat: 0, lng: 0 });
    setNextPredictions([{ place_id: "p1", description: "Ignored" }]);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    const { PlaceAutocomplete } = await import(
      "../../../../src/components/maps/PlaceAutocomplete"
    );

    let currentValue = "user typing";
    const onChange = (v: string) => { currentValue = v; };

    function Host({ value }: { value: string }) {
      return React.createElement(
        PlaceAutocomplete as unknown as React.FC<{
          value: string;
          onChange: (v: string) => void;
          onPlaceSelect: (p: Payload) => void;
        }>,
        { value, onChange, onPlaceSelect: () => {} },
      );
    }

    await act(async () => {
      root.render(React.createElement(Host, { value: currentValue }));
    });

    const input = container.querySelector("input") as HTMLInputElement;
    // Focus the input to simulate user typing.
    input.focus();
    // Set the input value to simulate user typing (without triggering onChange).
    input.value = "user typing";

    // Push a new external value — should NOT overwrite because input is focused.
    await act(async () => {
      root.render(React.createElement(Host, { value: "from firestore" }));
    });

    const inputValueAfter = input.value;
    const wasFocused = document.activeElement === input;

    await act(async () => { root.unmount(); });
    container.remove();

    // The sync effect checks document.activeElement !== inputRef.current
    // before overwriting. Focused input => no overwrite.
    expect(wasFocused).toBe(true);
    expect(inputValueAfter).toBe("user typing");
  });

  it("[property] ∀ place: payload = { formattedAddress, lat, lng } passthrough", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Only test non-empty formattedAddress (adapter skips empty).
          formattedAddress: fc.string({ minLength: 1, maxLength: 80 }).filter(
            (s) => s.trim().length > 0,
          ),
          lat: fc.double({ min: -90, max: 90, noNaN: true }),
          lng: fc.double({ min: -180, max: 180, noNaN: true }),
        }),
        async (place) => {
          const { received } = await renderAutocompleteAndSelect(place);
          if (received.length !== 1) return false;
          const out = received[0];
          return (
            out.formattedAddress === place.formattedAddress &&
            Object.is(out.lat, place.lat) &&
            Object.is(out.lng, place.lng) &&
            Object.keys(out).length === 3
          );
        },
      ),
      { numRuns: 10 },
    );
  });
});
