/**
 * Task 4.5 — Integration: Maps provider mounts exactly once across route
 * transitions.
 *
 * **Validates: P1 (post-fix re-verification) — Requirements 2.1, 2.2**
 *
 * Post-fix topology (see design.md §Arquitetura da Correção):
 *
 *   /_authenticated (layout)
 *     └── <GoogleMapsProvider>
 *         └── <Outlet />
 *             ├── /tracking
 *             └── /routes/:routeId
 *
 * The previous per-route `<APIProvider>` wrappers were removed in tasks 4.3
 * and 4.4. Navigating `/tracking → /routes/abc → /tracking` SHALL NOT remount
 * the provider, so `mapsMockState.apiProviderMountCount` MUST remain at 1.
 *
 * Pre-fix reproduction (the exploration test `c1-provider-remount.test.tsx`)
 * uses a standalone wrapper that simulates the old pattern by unmounting and
 * remounting an `<APIProvider>` directly — it does NOT exercise the real
 * route tree, so it still "fails" on purpose and remains as a documentation
 * artifact of the pre-fix bug condition. This integration test is the
 * post-fix verification of P1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import {
  installGoogleMapsGlobal,
  makeVisGlMock,
  mapsMockState,
  resetMapsMocks,
} from "../_helpers/maps-mocks";

// Mock `@vis.gl/react-google-maps` BEFORE any import that reaches for the
// real `APIProvider`. Our `GoogleMapsProvider` imports the mocked symbol,
// and the mocked `APIProvider` increments `mapsMockState.apiProviderMountCount`
// on every mount effect.
vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

import { GoogleMapsProvider } from "../../src/providers/GoogleMapsProvider";

// ─── Minimal test route tree mirroring the real authenticated layout ──────
//
// We intentionally bypass the generated `routeTree.gen.ts` so the test does
// not drag in Firebase, react-query, or the real page components. What matters
// for P1 is the wiring: one `GoogleMapsProvider` inside the layout route,
// with child routes rendered via `<Outlet />`.

function AuthenticatedLayout() {
  return (
    <GoogleMapsProvider apiKey="test-api-key">
      <Outlet />
    </GoogleMapsProvider>
  );
}

function TrackingStub() {
  return <div data-testid="tracking-page">tracking</div>;
}

function RouteDetailStub() {
  return <div data-testid="route-detail-page">route-detail</div>;
}

function buildRouter(initialPath: string) {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });

  const authenticatedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_authenticated",
    component: AuthenticatedLayout,
  });

  const trackingRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: "/tracking",
    component: TrackingStub,
  });

  const routeDetailRoute = createRoute({
    getParentRoute: () => authenticatedRoute,
    path: "/routes/$routeId",
    component: RouteDetailStub,
  });

  const routeTree = rootRoute.addChildren([
    authenticatedRoute.addChildren([trackingRoute, routeDetailRoute]),
  ]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

describe("Task 4.5 — GoogleMapsProvider mounts once across route transitions", () => {
  beforeEach(() => {
    installGoogleMapsGlobal();
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("navigating /tracking → /routes/abc → /tracking keeps mountCount === 1", async () => {
    const router = buildRouter("/tracking");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <RouterProvider
            router={
              router as unknown as Parameters<typeof RouterProvider>[0]["router"]
            }
          />,
        );
      });

      // Wait for the initial route to settle.
      await act(async () => {
        await router.load();
      });

      // Initial render of /tracking should have mounted the provider exactly once.
      expect(mapsMockState.apiProviderMountCount).toBe(1);
      expect(container.querySelector('[data-testid="tracking-page"]')).not.toBeNull();

      // Navigate to /routes/abc
      await act(async () => {
        await router.navigate({
          to: "/routes/$routeId",
          params: { routeId: "abc" },
        });
      });
      await act(async () => {
        await router.invalidate();
      });

      expect(
        container.querySelector('[data-testid="route-detail-page"]'),
      ).not.toBeNull();
      expect(mapsMockState.apiProviderMountCount).toBe(1);

      // Navigate back to /tracking
      await act(async () => {
        await router.navigate({ to: "/tracking" });
      });
      await act(async () => {
        await router.invalidate();
      });

      expect(container.querySelector('[data-testid="tracking-page"]')).not.toBeNull();
      expect(mapsMockState.apiProviderMountCount).toBe(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("multiple round-trips still keep mountCount === 1 (P1 generalization)", async () => {
    const router = buildRouter("/tracking");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <RouterProvider
            router={
              router as unknown as Parameters<typeof RouterProvider>[0]["router"]
            }
          />,
        );
      });
      await act(async () => {
        await router.load();
      });

      const sequence: Array<
        | { to: "/tracking" }
        | { to: "/routes/$routeId"; params: { routeId: string } }
      > = [
        { to: "/routes/$routeId", params: { routeId: "abc" } },
        { to: "/tracking" },
        { to: "/routes/$routeId", params: { routeId: "def" } },
        { to: "/tracking" },
        { to: "/routes/$routeId", params: { routeId: "abc" } },
      ];

      for (const step of sequence) {
        await act(async () => {
          // @ts-expect-error — router.navigate's overload selection depends on
          // the params presence, which matches at runtime for each step.
          await router.navigate(step);
        });
        await act(async () => {
          await router.invalidate();
        });
        // Invariant: the provider is never remounted.
        expect(mapsMockState.apiProviderMountCount).toBe(1);
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
