/**
 * Preservation — theme toggle reflects in `colorScheme` of the `<Map>`.
 *
 * **Validates: Requirements 3.10**
 *
 * The current `TrackingMap` / `RouteMap` compute `resolvedTheme` from the
 * context theme ("dark"|"light"|"system") plus a `useSyncExternalStore`
 * watching `prefers-color-scheme: dark`. Output:
 *   - theme = "dark"   ⇒ colorScheme="DARK"
 *   - theme = "light"  ⇒ colorScheme="LIGHT"
 *   - theme = "system" ⇒ colorScheme matches matchMedia at render time.
 *
 * Oracle: `oracle/theme-toggle.json` fixes the mapping and the system-mode
 * resolution for the two cases (prefers dark = true / false).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  resetMapsMocks,
} from "../../../_helpers/maps-mocks";
import oracle from "../oracle/theme-toggle.json" with { type: "json" };

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

let themeState: "dark" | "light" | "system" = "light";
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: themeState, setTheme: () => {} }),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: themeState, setTheme: () => {} }),
}));

/**
 * Overrides `window.matchMedia` to report a deterministic value for
 * `prefers-color-scheme: dark`, then restores the default on teardown.
 */
function setPrefersDark(prefersDark: boolean) {
  // @ts-expect-error override
  window.matchMedia = (query: string) => ({
    matches: query.includes("dark") ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

async function renderAndCaptureScheme(
  component: "RouteMap" | "TrackingMap",
  theme: "dark" | "light" | "system",
  prefersDark: boolean,
) {
  installGoogleMapsGlobal();
  resetMapsMocks();
  setPrefersDark(prefersDark);
  themeState = theme;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  if (component === "RouteMap") {
    const { RouteMap } = await import(
      "../../../../src/components/maps/RouteMap"
    );
    await act(async () => {
      root.render(
        React.createElement(
          RouteMap as unknown as React.FC<{ stops: never[] }>,
          { stops: [] },
        ),
      );
    });
  } else {
    const { TrackingMap } = await import(
      "../../../../src/components/maps/TrackingMap"
    );
    await act(async () => {
      root.render(
        React.createElement(
          TrackingMap as unknown as React.FC<{
            locations: Array<unknown>;
            driverNames: Record<string, string>;
            selectedDriverId: string | null;
            trail: Array<{ lat: number; lng: number }>;
          }>,
          {
            locations: [],
            driverNames: {},
            selectedDriverId: null,
            trail: [],
          },
        ),
      );
    });
  }

  const mapEl = container.querySelector(
    '[data-testid="google-map"]',
  ) as HTMLElement | null;
  const colorScheme = mapEl?.getAttribute("data-color-scheme") ?? null;

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return colorScheme;
}

describe("Preservation — Map colorScheme reacts to theme (3.10)", () => {
  beforeEach(() => {
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    themeState = "light";
  });

  it("[oracle] each canonical (component, theme, prefersDark) yields the expected colorScheme", async () => {
    for (const entry of oracle.entries as Array<{
      component: "RouteMap" | "TrackingMap";
      theme: "dark" | "light" | "system";
      prefersDark: boolean;
      expected: "DARK" | "LIGHT";
    }>) {
      const actual = await renderAndCaptureScheme(
        entry.component,
        entry.theme,
        entry.prefersDark,
      );
      expect(
        actual,
        `${entry.component}/${entry.theme}/prefersDark=${entry.prefersDark}`,
      ).toBe(entry.expected);
    }
  });

  it("[property 3.10] ∀ (theme, prefersDark): colorScheme ∈ {LIGHT, DARK} and matches the expected rule", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<"RouteMap" | "TrackingMap">("RouteMap", "TrackingMap"),
        fc.constantFrom<"dark" | "light" | "system">("dark", "light", "system"),
        fc.boolean(),
        async (component, theme, prefersDark) => {
          const actual = await renderAndCaptureScheme(
            component,
            theme,
            prefersDark,
          );
          const expected =
            theme === "dark"
              ? "DARK"
              : theme === "light"
                ? "LIGHT"
                : prefersDark
                  ? "DARK"
                  : "LIGHT";
          return actual === expected;
        },
      ),
      { numRuns: 12 },
    );
  });
});
