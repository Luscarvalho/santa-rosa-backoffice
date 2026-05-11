/**
 * Integration tests for `PlaceAutocomplete` session-token behavior.
 *
 * These tests verify the full component (not just the adapter) to confirm
 * that the C2 bug condition is fixed end-to-end:
 *   - Every keystroke carries a non-null session token.
 *   - All keystrokes in one search share the same token.
 *   - After a selection, the next search gets a fresh token.
 *
 * Also re-verifies the C2 property test from task 1 passes in F' (fixed code).
 *
 * **Validates: Requirements 2.3, 2.4 / Property P2 (re-verification post-fix)**
 */

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import fc from "fast-check";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  mapsMockState,
  resetMapsMocks,
} from "../../_helpers/maps-mocks";

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function renderPlaceAutocomplete(container: HTMLElement) {
  const { PlaceAutocomplete } = await import(
    "../../../src/components/maps/PlaceAutocomplete"
  );
  let currentValue = "";
  const selections: Array<{ formattedAddress: string; lat: number; lng: number }> = [];

  await act(async () => {
    const root = createRoot(container);
    root.render(
      React.createElement(PlaceAutocomplete, {
        value: currentValue,
        onChange: (v: string) => { currentValue = v; },
        onPlaceSelect: (p: { formattedAddress: string; lat: number; lng: number }) => {
          selections.push(p);
        },
      }),
    );
  });

  return { selections };
}

async function typeIntoInput(input: HTMLInputElement, text: string) {
  for (const ch of text) {
    await act(async () => {
      fireEvent.change(input, { target: { value: input.value + ch } });
    });
    // Wait past the 150ms debounce so each keystroke fires a predictions request.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
  }
}

async function selectFirstPrediction(container: HTMLElement) {
  await act(async () => {
    const firstItem = container.querySelector('[role="option"]') as HTMLElement | null;
    if (firstItem) {
      firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PlaceAutocomplete — session token integration (C2 re-verification)", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    resetMapsMocks();
    installGoogleMapsGlobal();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it('[C2 concrete] "Av Djalma Batista, 1661" — all keystrokes carry a non-null session token', async () => {
    await renderPlaceAutocomplete(container);
    const input = container.querySelector("input") as HTMLInputElement;

    await typeIntoInput(input, "Av Djalma Batista, 1661");

    const tokens = mapsMockState.autocompleteServiceCalls.map((c) => c.sessionToken);
    expect(tokens.length).toBeGreaterThanOrEqual(1);

    for (const token of tokens) {
      expect(token).toBeDefined();
      expect(token).not.toBeNull();
    }
  });

  it("[C2] all keystrokes in one search share the same session token", async () => {
    await renderPlaceAutocomplete(container);
    const input = container.querySelector("input") as HTMLInputElement;

    await typeIntoInput(input, "Rua das Flores");

    const tokens = mapsMockState.autocompleteServiceCalls.map((c) => c.sessionToken);
    expect(tokens.length).toBeGreaterThan(1);

    const first = tokens[0];
    for (const token of tokens) {
      expect(token).toBe(first);
    }
  });

  it("[C2] token is discarded after select — next search gets a fresh token", async () => {
    await renderPlaceAutocomplete(container);
    const input = container.querySelector("input") as HTMLInputElement;

    // First search.
    await typeIntoInput(input, "Av Djalma");
    const token1 = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(token1).not.toBeNull();

    // Select to close the session.
    await selectFirstPrediction(container);

    // Reset call tracking.
    mapsMockState.autocompleteServiceCalls.length = 0;

    // Second search — clear input first.
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    await typeIntoInput(input, "Rua Recife");

    const token2 = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(token2).not.toBeNull();

    // Must be a different token object.
    expect(token2).not.toBe(token1);
  });

  it("[C2] getDetails (select) carries the same token as the preceding keystrokes", async () => {
    await renderPlaceAutocomplete(container);
    const input = container.querySelector("input") as HTMLInputElement;

    await typeIntoInput(input, "Av Djalma");
    const startToken = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;

    await selectFirstPrediction(container);

    const detailsToken = mapsMockState.placesServiceDetailsCalls[0]?.sessionToken;
    expect(detailsToken).toBeDefined();
    expect(detailsToken).toBe(startToken);
  });

  it("[C2] no legacy Autocomplete constructions — adapter-based path is used", async () => {
    await renderPlaceAutocomplete(container);
    const input = container.querySelector("input") as HTMLInputElement;

    await typeIntoInput(input, "Av Djalma");

    // The new implementation uses AutocompleteService, not the widget Autocomplete.
    expect(mapsMockState.autocompleteConstructions.length).toBe(0);
    expect(mapsMockState.autocompleteServiceCalls.length).toBeGreaterThan(0);
  });

  it("[C2 property] ∀ keystroke sequence: every getPlacePredictions call carries a non-null token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 5 }),
        async (keystrokes) => {
          resetMapsMocks();
          installGoogleMapsGlobal();

          const c = document.createElement("div");
          document.body.appendChild(c);
          const r = createRoot(c);

          const { PlaceAutocomplete } = await import(
            "../../../src/components/maps/PlaceAutocomplete"
          );

          await act(async () => {
            r.render(
              React.createElement(PlaceAutocomplete, {
                value: "",
                onChange: () => {},
                onPlaceSelect: () => {},
              }),
            );
          });

          const inp = c.querySelector("input") as HTMLInputElement | null;
          if (inp) {
            for (const ch of keystrokes) {
              await act(async () => {
                fireEvent.change(inp, { target: { value: inp.value + ch } });
              });
              await act(async () => {
                await new Promise((res) => setTimeout(res, 200));
              });
            }
          }

          const tokens = mapsMockState.autocompleteServiceCalls.map((c) => c.sessionToken);

          await act(async () => { r.unmount(); });
          c.remove();

          if (tokens.length === 0) return true;
          return tokens.every((t) => t !== undefined && t !== null);
        },
      ),
      { numRuns: 6 },
    );
  }, 30_000);

  it("[C2 property] ∀ keystroke sequence: all calls in one search share the same token", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 5 }),
        async (keystrokes) => {
          resetMapsMocks();
          installGoogleMapsGlobal();

          const c = document.createElement("div");
          document.body.appendChild(c);
          const r = createRoot(c);

          const { PlaceAutocomplete } = await import(
            "../../../src/components/maps/PlaceAutocomplete"
          );

          await act(async () => {
            r.render(
              React.createElement(PlaceAutocomplete, {
                value: "",
                onChange: () => {},
                onPlaceSelect: () => {},
              }),
            );
          });

          const inp = c.querySelector("input") as HTMLInputElement | null;
          if (inp) {
            for (const ch of keystrokes) {
              await act(async () => {
                fireEvent.change(inp, { target: { value: inp.value + ch } });
              });
              await act(async () => {
                await new Promise((res) => setTimeout(res, 200));
              });
            }
          }

          const tokens = mapsMockState.autocompleteServiceCalls.map((c) => c.sessionToken);

          await act(async () => { r.unmount(); });
          c.remove();

          if (tokens.length <= 1) return true;
          const first = tokens[0];
          return tokens.every((t) => t === first);
        },
      ),
      { numRuns: 6 },
    );
  }, 30_000);
});
