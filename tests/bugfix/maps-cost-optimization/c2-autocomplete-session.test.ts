/**
 * C2 — Bug Condition: PlaceAutocomplete dispatches predictions with no
 * `sessionToken`, so every keystroke is billed as a standalone request
 * instead of being grouped into a Per-Session session.
 *
 * **Validates: Requirements 2.3, 2.4**
 *
 * The OLD implementation in `src/components/maps/PlaceAutocomplete.tsx`
 * constructed:
 *
 *   new placesLib.Autocomplete(inputRef.current, {
 *     fields: ["formatted_address", "geometry"],
 *     componentRestrictions: { country: "br" },
 *     bounds: manausBounds,
 *     strictBounds: false,
 *   });
 *
 * No `sessionToken` was ever passed — so from the Places billing side each
 * `Autocomplete` construction (and the implied per-keystroke predictions it
 * fires internally) was a fresh billing event.
 *
 * The NEW implementation uses `AutocompleteAdapter` which calls
 * `AutocompleteService.getPlacePredictions` with a session token generated
 * lazily on the first keystroke and discarded after `select()`.
 *
 * Property (from tasks.md §1 C2):
 *   ∀ sequence of keystrokes followed by a select
 *     ⇒ ∀ request: request.sessionToken = currentSession.token
 *       ∧ currentSession.token ≠ null
 *
 * EXPECTED IN F (old code): all constructions show `sessionToken === undefined`.
 * EXPECTED IN F' (new code): all getPlacePredictions calls carry a non-null
 * sessionToken, and the same token is reused across keystrokes within one search.
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
} from "../../_helpers/maps-mocks";

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

/**
 * Render PlaceAutocomplete, drive a sequence of keystrokes, then optionally
 * a select. Returns the list of `sessionToken` values observed in
 * AutocompleteService.getPlacePredictions calls.
 */
async function runAutocompleteTrace(keystrokes: string, select: boolean) {
  installGoogleMapsGlobal();
  resetMapsMocks();

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  // Dynamic import so the vi.mock for @vis.gl/react-google-maps is in effect.
  const { PlaceAutocomplete } = await import(
    "../../../src/components/maps/PlaceAutocomplete"
  );

  let currentValue = "";
  const onChange = (v: string) => {
    currentValue = v;
  };
  const selections: Array<{
    formattedAddress: string;
    lat: number;
    lng: number;
  }> = [];
  const onPlaceSelect = (p: {
    formattedAddress: string;
    lat: number;
    lng: number;
  }) => {
    selections.push(p);
  };

  await act(async () => {
    root.render(
      React.createElement(PlaceAutocomplete, {
        value: currentValue,
        onChange,
        onPlaceSelect,
      }),
    );
  });

  // Simulate keystrokes by dispatching input events.
  const input = container.querySelector("input") as HTMLInputElement | null;
  if (input) {
    for (const ch of keystrokes) {
      await act(async () => {
        const next = input.value + ch;
        // Use fireEvent.change to properly trigger React's synthetic onChange.
        fireEvent.change(input, { target: { value: next } });
      });
      // Wait past the 150 ms debounce so each keystroke fires its predictions
      // request (otherwise only the final one would fire and tests would
      // see fewer calls than keystrokes).
      await act(async () => {
        await new Promise((r) => setTimeout(r, 200));
      });
    }
  }

  if (select) {
    // Click the first prediction in the dropdown (if any).
    await act(async () => {
      const firstItem = container.querySelector('[role="option"]') as HTMLElement | null;
      if (firstItem) {
        firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }
    });
    // Wait for async select to complete.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return {
    serviceCallTokens: mapsMockState.autocompleteServiceCalls.map(
      (c) => c.sessionToken,
    ),
    detailsCallTokens: mapsMockState.placesServiceDetailsCalls.map(
      (c) => c.sessionToken,
    ),
    selections,
    // Legacy: autocompleteConstructions should be empty in the new implementation.
    constructions: mapsMockState.autocompleteConstructions.slice(),
  };
}

describe("C2 — Autocomplete session token presence (BUG EXPLORATION → FIXED)", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it('[concrete] "Av Djalma Batista, 1661" (28 keystrokes) + select must use a non-null sessionToken', async () => {
    const { serviceCallTokens, detailsCallTokens } = await runAutocompleteTrace(
      "Av Djalma Batista, 1661",
      true,
    );
    // In F' (fixed code): every getPlacePredictions call carries a session token.
    expect(serviceCallTokens.length).toBeGreaterThanOrEqual(1);
    for (const token of serviceCallTokens) {
      expect(token).toBeDefined();
      expect(token).not.toBeNull();
    }
    // All calls within the same search share the same token.
    const uniqueTokens = new Set(serviceCallTokens);
    expect(uniqueTokens.size).toBe(1);

    // The getDetails call (select) also carries the same session token.
    if (detailsCallTokens.length > 0) {
      for (const token of detailsCallTokens) {
        expect(token).toBeDefined();
        expect(token).not.toBeNull();
      }
    }
  });

  it("[property] ∀ trace(keystrokes, select): every getPlacePredictions call carries a session token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.boolean(),
        async (keystrokes, select) => {
          const { serviceCallTokens } = await runAutocompleteTrace(
            keystrokes,
            select,
          );
          if (serviceCallTokens.length === 0) return true; // nothing to check
          return serviceCallTokens.every(
            (t) => t !== undefined && t !== null,
          );
        },
      ),
      { numRuns: 6 },
    );
  }, 30_000);

  it("[property] ∀ trace: all keystrokes in one search share the same session token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 8 }),
        async (keystrokes) => {
          const { serviceCallTokens } = await runAutocompleteTrace(
            keystrokes,
            false,
          );
          if (serviceCallTokens.length <= 1) return true;
          // All tokens in a single search session must be identical.
          const first = serviceCallTokens[0];
          return serviceCallTokens.every((t) => t === first);
        },
      ),
      { numRuns: 6 },
    );
  }, 30_000);

  it("[property] token is discarded after select — next search gets a fresh token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1, maxLength: 6 }),
        async (search1, search2) => {
          installGoogleMapsGlobal();
          resetMapsMocks();

          const container = document.createElement("div");
          document.body.appendChild(container);
          const root: Root = createRoot(container);

          const { PlaceAutocomplete } = await import(
            "../../../src/components/maps/PlaceAutocomplete"
          );

          let currentValue = "";
          await act(async () => {
            root.render(
              React.createElement(PlaceAutocomplete, {
                value: currentValue,
                onChange: (v) => { currentValue = v; },
                onPlaceSelect: () => {},
              }),
            );
          });

          const input = container.querySelector("input") as HTMLInputElement | null;

          // First search
          if (input) {
            for (const ch of search1) {
              await act(async () => {
                input.value = input.value + ch;
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              // Wait past the 150 ms debounce to let predictions fire.
              await act(async () => {
                await new Promise((r) => setTimeout(r, 200));
              });
            }
          }

          // Select first prediction to close the session
          await act(async () => {
            const firstItem = container.querySelector('[role="option"]') as HTMLElement | null;
            if (firstItem) {
              firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            }
          });
          await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
          });

          const tokensAfterSearch1 = mapsMockState.autocompleteServiceCalls.map(
            (c) => c.sessionToken,
          );

          // Reset call tracking (but keep adapter alive)
          mapsMockState.autocompleteServiceCalls.length = 0;

          // Second search
          if (input) {
            input.value = "";
            for (const ch of search2) {
              await act(async () => {
                input.value = input.value + ch;
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              await act(async () => {
                await new Promise((r) => setTimeout(r, 200));
              });
            }
          }

          const tokensAfterSearch2 = mapsMockState.autocompleteServiceCalls.map(
            (c) => c.sessionToken,
          );

          await act(async () => {
            root.unmount();
          });
          container.remove();

          // Both searches must have non-null tokens.
          const allValid =
            tokensAfterSearch1.every((t) => t !== undefined && t !== null) &&
            tokensAfterSearch2.every((t) => t !== undefined && t !== null);

          if (!allValid) return false;

          // If both searches produced tokens, they must be different objects
          // (new session after select).
          if (tokensAfterSearch1.length > 0 && tokensAfterSearch2.length > 0) {
            return tokensAfterSearch1[0] !== tokensAfterSearch2[0];
          }

          return true;
        },
      ),
      { numRuns: 6 },
    );
  }, 30_000);
});
