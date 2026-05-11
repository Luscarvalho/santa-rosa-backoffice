/**
 * C6 — Bug Condition: `RouteMap` and `TrackingMap` apply a redundant
 * `style.filter = "saturate(0.72) brightness(0.92) contrast(0.95)"` over
 * the native `colorScheme="DARK"` Maps mode, incurring a useless WebGL
 * post-process on every frame.
 *
 * **Validates: Requirements 2.11**
 *
 * Property (from tasks.md §1 C6):
 *   resolvedTheme = "dark" ⇒ mapEl.style.filter ∈ {undefined, "none", ""}
 *
 * EXPECTED IN F: the mapEl.style.filter equals
 *   "saturate(0.72) brightness(0.92) contrast(0.95)"
 * The property fails on any render where resolvedTheme resolves to "dark".
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
} from "../../_helpers/maps-mocks";

vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

interface ThemeStub {
  theme: "dark" | "light" | "system";
}
let themeState: ThemeStub = { theme: "dark" };

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme: () => {} }),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme: () => {} }),
}));

/** Returns the `style.filter` value observed on the rendered map element. */
async function renderMapWithTheme(
  component: "RouteMap" | "TrackingMap",
  theme: "dark" | "light",
) {
  installGoogleMapsGlobal();
  resetMapsMocks();
  themeState = { theme };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  if (component === "RouteMap") {
    const { RouteMap } = await import(
      "../../../src/components/maps/RouteMap"
    );
    await act(async () => {
      root.render(
        React.createElement(RouteMap as unknown as React.FC<{
          stops: Array<{ lat: number; lng: number; label: string }>;
        }>, { stops: [] }),
      );
    });
  } else {
    const { TrackingMap } = await import(
      "../../../src/components/maps/TrackingMap"
    );
    await act(async () => {
      root.render(
        React.createElement(TrackingMap as unknown as React.FC<{
          locations: Array<unknown>;
          driverNames: Record<string, string>;
          selectedDriverId: string | null;
          trail: Array<{ lat: number; lng: number }>;
        }>, {
          locations: [],
          driverNames: {},
          selectedDriverId: null,
          trail: [],
        }),
      );
    });
  }

  const mapEl = container.querySelector(
    '[data-testid="google-map"]',
  ) as HTMLElement | null;
  const colorScheme = mapEl?.getAttribute("data-color-scheme") ?? null;
  const filter = mapEl?.style.filter ?? "";

  await act(async () => {
    root.unmount();
  });
  container.remove();

  return { filter, colorScheme };
}

describe("C6 — CSS filter applied over colorScheme=DARK (BUG EXPLORATION)", () => {
  beforeEach(() => {
    resetMapsMocks();
    themeState = { theme: "dark" };
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[concrete] RouteMap in dark theme: filter must be 'none' or empty", async () => {
    const { filter, colorScheme } = await renderMapWithTheme("RouteMap", "dark");
    expect(colorScheme).toBe("DARK");
    // In F the filter is "saturate(0.72) brightness(0.92) contrast(0.95)" —
    // assertion below fails and confirms the bug. In F' filter must be ""/"none".
    expect(["", "none"]).toContain(filter);
  });

  it("[concrete] TrackingMap in dark theme: filter must be 'none' or empty", async () => {
    const { filter, colorScheme } = await renderMapWithTheme(
      "TrackingMap",
      "dark",
    );
    expect(colorScheme).toBe("DARK");
    expect(["", "none"]).toContain(filter);
  });

  it("[property] ∀ component ∈ {RouteMap, TrackingMap}: dark theme ⇒ no CSS filter", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<"RouteMap" | "TrackingMap">("RouteMap", "TrackingMap"),
        async (component) => {
          const { filter } = await renderMapWithTheme(component, "dark");
          return filter === "" || filter === "none";
        },
      ),
      { numRuns: 4 },
    );
  });
});
