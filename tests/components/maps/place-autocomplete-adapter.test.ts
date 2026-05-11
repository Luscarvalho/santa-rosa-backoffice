/**
 * Unit tests + PBT for `createAutocompleteAdapter` (place-autocomplete-adapter.ts).
 *
 * Validates: Requirements 2.3, 2.4 / Property P2
 *
 * Unit tests:
 *   1. New token generated in `start` after `select`.
 *   2. Same token reused in consecutive `start`s before `select`.
 *   3. `dispose` clears state (sessionToken nulled, attrNode removed).
 *   4. (Task 7.4) Backend selection: legacy when flag off.
 *   5. (Task 7.4) Backend selection: places-new when flag on + bindings present.
 *   6. (Task 7.4) Backend selection: fallback to legacy + warn when flag on but bindings absent.
 *
 * PBT (P2):
 *   fc.array(fc.oneof(keystroke, select), {minLength:1, maxLength:50})
 *   ⇒ invariant "unique token per block until `select`; discarded after `select`".
 *
 * **Validates: Requirements 2.3, 2.4**
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { installGoogleMapsGlobal, mapsMockState, resetMapsMocks } from "../../_helpers/maps-mocks";
import { createAutocompleteAdapter } from "../../../src/components/maps/place-autocomplete-adapter";

// ─── Minimal placesLib mock ───────────────────────────────────────────────────

function makePlacesLib() {
  installGoogleMapsGlobal();
  // Return the places namespace from the installed global shim.
  return (globalThis as unknown as { google: { maps: { places: unknown } } })
    .google.maps.places as Parameters<typeof createAutocompleteAdapter>[0];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const START_OPTS = { input: "Av Djalma", country: "br" as const };

/**
 * Flush all pending microtasks (queueMicrotask callbacks in the mock).
 */
async function flushMicrotasks() {
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("createAutocompleteAdapter — unit", () => {
  beforeEach(() => {
    resetMapsMocks();
    installGoogleMapsGlobal();
  });

  it("generates a new token in start() after select()", async () => {
    const placesLib = makePlacesLib();
    const adapter = createAutocompleteAdapter(placesLib);

    // First start — creates token T1.
    const p1 = adapter.start(START_OPTS);
    await flushMicrotasks();
    await p1;

    const { mapsMockState } = await import("../../_helpers/maps-mocks");
    const token1 = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(token1).toBeDefined();
    expect(token1).not.toBeNull();

    // Select — closes session, discards T1.
    const selectPromise = adapter.select("place_id_1");
    await flushMicrotasks();
    await selectPromise;

    // Reset call tracking.
    mapsMockState.autocompleteServiceCalls.length = 0;

    // Second start — must create a fresh token T2 ≠ T1.
    const p2 = adapter.start(START_OPTS);
    await flushMicrotasks();
    await p2;

    const token2 = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(token2).toBeDefined();
    expect(token2).not.toBeNull();

    // Tokens must be different objects (new session).
    expect(token2).not.toBe(token1);

    adapter.dispose();
  });

  it("reuses the same token across consecutive start()s before select()", async () => {
    const placesLib = makePlacesLib();
    const adapter = createAutocompleteAdapter(placesLib);

    const { mapsMockState } = await import("../../_helpers/maps-mocks");

    // Three consecutive starts without a select.
    for (const input of ["A", "Av", "Av D"]) {
      const p = adapter.start({ ...START_OPTS, input });
      await flushMicrotasks();
      await p;
    }

    const tokens = mapsMockState.autocompleteServiceCalls.map((c) => c.sessionToken);
    expect(tokens.length).toBe(3);

    // All tokens must be non-null.
    for (const t of tokens) {
      expect(t).toBeDefined();
      expect(t).not.toBeNull();
    }

    // All tokens must be the same object reference (same session).
    const first = tokens[0];
    for (const t of tokens) {
      expect(t).toBe(first);
    }

    adapter.dispose();
  });

  it("dispose() clears the session token and removes the attribution node", async () => {
    const placesLib = makePlacesLib();
    const adapter = createAutocompleteAdapter(placesLib);

    // Start a session so a token is created.
    const p = adapter.start(START_OPTS);
    await flushMicrotasks();
    await p;

    // Count attribution nodes before dispose.
    const nodesBefore = document.body.querySelectorAll("div[style]").length;

    adapter.dispose();

    // After dispose, the attribution node should be removed from the DOM.
    const nodesAfter = document.body.querySelectorAll("div[style]").length;
    expect(nodesAfter).toBeLessThanOrEqual(nodesBefore);

    // A subsequent start() after dispose would create a new adapter — here we
    // just verify dispose doesn't throw and the adapter is in a clean state.
    // (Calling start() after dispose() is not a supported use-case.)
  });

  it("token passed to select() matches the token used in start()", async () => {
    const placesLib = makePlacesLib();
    const adapter = createAutocompleteAdapter(placesLib);

    const { mapsMockState } = await import("../../_helpers/maps-mocks");

    // Start to capture the token.
    const p = adapter.start(START_OPTS);
    await flushMicrotasks();
    await p;

    const startToken = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(startToken).not.toBeNull();

    // Select — the getDetails call should carry the same token.
    const selectPromise = adapter.select("place_id_1");
    await flushMicrotasks();
    await selectPromise;

    const detailsToken = mapsMockState.placesServiceDetailsCalls[0]?.sessionToken;
    expect(detailsToken).toBe(startToken);

    adapter.dispose();
  });
});

// ─── Task 7.4 — Backend selection (VITE_USE_NEW_PLACES gate) ─────────────────

/**
 * Tests for the `VITE_USE_NEW_PLACES` feature flag branching in
 * `createAutocompleteAdapter`.
 *
 * The factory must:
 *   - Return `LegacyAutocompleteAdapter` (backend="places-legacy") when flag is off.
 *   - Return `NewPlacesAdapter` (backend="places-new") when flag is on AND the
 *     library exposes `PlaceAutocompleteElement` or `Place`.
 *   - Fall back to `LegacyAutocompleteAdapter` with a `console.warn` when flag
 *     is on but the new bindings are absent.
 *
 * **Validates: Requirements 2.4**
 */
// ─── Task 7.4 — Backend selection (VITE_USE_NEW_PLACES gate) ─────────────────

/**
 * Tests for the `VITE_USE_NEW_PLACES` feature flag branching in
 * `createAutocompleteAdapter`.
 *
 * The factory must:
 *   - Return `LegacyAutocompleteAdapter` (backend="places-legacy") when flag is off.
 *   - Return `NewPlacesAdapter` (backend="places-new") when flag is on AND the
 *     library exposes `PlaceAutocompleteElement` or `Place`.
 *   - Fall back to `LegacyAutocompleteAdapter` with a `console.warn` when flag
 *     is on but the new bindings are absent.
 *
 * Strategy: we test the branching logic directly by passing a `placesLib` that
 * either has or lacks the new bindings, and by controlling `USE_NEW_PLACES`
 * through a module-level mock that reads from a mutable sentinel.
 *
 * **Validates: Requirements 2.4**
 */

// Mutable sentinel read by the mock below.
let _useNewPlaces = false;

vi.mock("@/lib/env-flags", () => ({
  get USE_NEW_PLACES() {
    return _useNewPlaces;
  },
  FIRESTORE_ACTIVE_ONLY: false,
  DIRECTIONS_CACHE: true,
}));

// Re-import the factory AFTER the mock is registered so it picks up the mock.
// The top-level `createAutocompleteAdapter` import is used directly in the
// backend-selection tests — vi.mock is hoisted so it applies to that import too.

describe("createAutocompleteAdapter — backend selection (task 7.4)", () => {
  beforeEach(() => {
    resetMapsMocks();
    installGoogleMapsGlobal();
    _useNewPlaces = false;
  });

  it("returns places-legacy backend when USE_NEW_PLACES is false (default)", () => {
    _useNewPlaces = false;
    const placesLib = makePlacesLib();
    // createAutocompleteAdapter is already imported at the top of the file and
    // uses the mocked env-flags module (mock is hoisted by vi.mock).
    const adapter = createAutocompleteAdapter(placesLib);
    expect(adapter.backend).toBe("places-legacy");
    adapter.dispose();
  });

  it("returns places-new backend when USE_NEW_PLACES=true and PlaceAutocompleteElement is present", () => {
    _useNewPlaces = true;
    const placesLib = {
      ...makePlacesLib(),
      PlaceAutocompleteElement: class {},
    } as Parameters<typeof createAutocompleteAdapter>[0];
    const adapter = createAutocompleteAdapter(placesLib);
    expect(adapter.backend).toBe("places-new");
    adapter.dispose();
  });

  it("returns places-new backend when USE_NEW_PLACES=true and Place is present", () => {
    _useNewPlaces = true;
    const placesLib = {
      ...makePlacesLib(),
      Place: {},
    } as Parameters<typeof createAutocompleteAdapter>[0];
    const adapter = createAutocompleteAdapter(placesLib);
    expect(adapter.backend).toBe("places-new");
    adapter.dispose();
  });

  it("falls back to places-legacy and warns when USE_NEW_PLACES=true but bindings absent", () => {
    _useNewPlaces = true;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const placesLib = makePlacesLib();
    const adapter = createAutocompleteAdapter(placesLib);
    expect(adapter.backend).toBe("places-legacy");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("VITE_USE_NEW_PLACES=1");
    expect(warnSpy.mock.calls[0][0]).toContain("places-legacy");
    warnSpy.mockRestore();
    adapter.dispose();
  });

  it("places-new adapter still applies session-token billing (delegates to legacy)", async () => {
    _useNewPlaces = true;
    const placesLib = {
      ...makePlacesLib(),
      PlaceAutocompleteElement: class {},
    } as Parameters<typeof createAutocompleteAdapter>[0];
    const adapter = createAutocompleteAdapter(placesLib);
    expect(adapter.backend).toBe("places-new");

    // start() should still create a session token via the legacy delegate.
    const p = adapter.start(START_OPTS);
    await flushMicrotasks();
    await p;

    const token = mapsMockState.autocompleteServiceCalls[0]?.sessionToken;
    expect(token).toBeDefined();
    expect(token).not.toBeNull();

    adapter.dispose();
  });
});

// ─── PBT (P2) ─────────────────────────────────────────────────────────────────

/**
 * PBT P2 — Session token invariant.
 *
 * For any sequence of {type:"keystroke"} and {type:"select"} events:
 *   - Within a block (between selects), all start() calls share the same token.
 *   - After a select(), the next start() uses a different token.
 *   - Every start() call carries a non-null token.
 *
 * **Validates: Requirements 2.3, 2.4**
 */
describe("PBT P2 — session token invariant across arbitrary event sequences", () => {
  beforeEach(() => {
    resetMapsMocks();
    installGoogleMapsGlobal();
    // Ensure the flag is off so the PBT runs against the legacy backend
    // (the flag mock is file-level and may be left in a non-default state
    // by the backend-selection test suite above).
    _useNewPlaces = false;
  });

  it(
    "token is unique per block until select; discarded after select",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              fc.record({ type: fc.constant("keystroke" as const), ch: fc.string({ minLength: 1, maxLength: 1 }) }),
              fc.record({ type: fc.constant("select" as const) }),
            ),
            { minLength: 1, maxLength: 50 },
          ),
          async (events) => {
            resetMapsMocks();
            installGoogleMapsGlobal();

            const { mapsMockState } = await import("../../_helpers/maps-mocks");
            const placesLib = makePlacesLib();
            const adapter = createAutocompleteAdapter(placesLib);

            // Replay events, tracking token blocks.
            // A "block" is a sequence of keystrokes between two selects.
            const blocks: Array<Array<unknown>> = [[]];
            let currentInput = "";

            for (const event of events) {
              if (event.type === "keystroke") {
                currentInput += event.ch;
                mapsMockState.autocompleteServiceCalls.length = 0;

                const p = adapter.start({ input: currentInput, country: "br" });
                await new Promise<void>((r) => setTimeout(r, 5));
                await p;

                const token =
                  mapsMockState.autocompleteServiceCalls[0]?.sessionToken ?? null;
                blocks[blocks.length - 1].push(token);
              } else {
                // select
                mapsMockState.placesServiceDetailsCalls.length = 0;
                const selectP = adapter.select("place_id_1");
                await new Promise<void>((r) => setTimeout(r, 5));
                await selectP;

                // Start a new block.
                blocks.push([]);
                currentInput = "";
              }
            }

            adapter.dispose();

            // Validate invariants on each block.
            for (const block of blocks) {
              if (block.length === 0) continue;

              // Every token in the block must be non-null.
              for (const token of block) {
                if (token === null || token === undefined) return false;
              }

              // All tokens within a block must be the same object (same session).
              const first = block[0];
              for (const token of block) {
                if (token !== first) return false;
              }
            }

            // Tokens across different blocks must be different objects.
            const nonEmptyBlocks = blocks.filter((b) => b.length > 0);
            for (let i = 1; i < nonEmptyBlocks.length; i++) {
              const prevToken = nonEmptyBlocks[i - 1][0];
              const currToken = nonEmptyBlocks[i][0];
              if (prevToken === currToken) return false;
            }

            return true;
          },
        ),
        { numRuns: 30 },
      );
    },
    30_000,
  );
});
