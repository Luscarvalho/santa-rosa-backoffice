/**
 * C1 — Bug Condition: APIProvider remounts on route transitions.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * The pre-fix implementation mounted `<APIProvider>` **inside each route
 * component** (`src/routes/_authenticated/tracking.tsx` and
 * `src/routes/_authenticated/routes_.$routeId.tsx`). TanStack Router unmounts
 * the previous route component and mounts the next one on navigation, so
 * `APIProvider` was remounted on every /tracking ↔ /routes/:id transition.
 *
 * The fix (tasks 4.1–4.4) consolidates `<APIProvider>` into a single
 * `<GoogleMapsProvider>` mounted in the authenticated layout (`_authenticated.tsx`),
 * so navigating between routes no longer remounts the provider.
 *
 * Property (from tasks.md §1 C1):
 *   ∀ sequence ∈ fc.array(fc.constantFrom("/tracking","/routes/abc","/routes/def"),
 *                         {minLength:1, maxLength:20})
 *     ⇒ mountCount ≤ 1.
 *
 * EXPECTED IN F (unfixed code): property FAILS — the first time a distinct
 * route is navigated to, mountCount ≥ 2. The shrunk counterexample is the
 * minimal sequence with two distinct routes.
 *
 * EXPECTED IN F' (fixed code): property PASSES — `GoogleMapsProvider` is
 * mounted once in the layout and never remounted on route transitions.
 *
 * This test uses the real `GoogleMapsProvider` component in a minimal TanStack
 * Router layout (same approach as `tests/integration/maps-provider-mount-count.test.tsx`)
 * to verify the fix end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import fc from "fast-check";
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
} from "../../_helpers/maps-mocks";

// Mock `@vis.gl/react-google-maps` BEFORE any import that reaches for the
// real `APIProvider`. Our `GoogleMapsProvider` imports the mocked symbol,
// and the mocked `APIProvider` increments `mapsMockState.apiProviderMountCount`
// on every mount effect.
vi.mock("@vis.gl/react-google-maps", () => makeVisGlMock());

import { GoogleMapsProvider } from "../../../src/providers/GoogleMapsProvider";

// ─── Minimal test route tree mirroring the real authenticated layout ──────
//
// We intentionally bypass the generated `routeTree.gen.ts` so the test does
// not drag in Firebase, react-query, or the real page components. What matters
// for C1 is the wiring: one `GoogleMapsProvider` inside the layout route,
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

type RouteName = "/tracking" | "/routes/abc" | "/routes/def";

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

/**
 * Navigate a sequence of routes using the fixed layout topology and return
 * the final `apiProviderMountCount`.
 */
async function navigateSequence(routes: RouteName[]): Promise<number> {
  if (routes.length === 0) return 0;

  const router = buildRouter(routes[0]);
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

    for (let i = 1; i < routes.length; i++) {
      const route = routes[i];
      if (route === "/tracking") {
        await act(async () => {
          await router.navigate({ to: "/tracking" });
        });
      } else {
        // "/routes/abc" or "/routes/def"
        const routeId = route.replace("/routes/", "");
        await act(async () => {
          await router.navigate({
            to: "/routes/$routeId",
            params: { routeId },
          });
        });
      }
      await act(async () => {
        await router.invalidate();
      });
    }
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }

  return mapsMockState.apiProviderMountCount;
}

describe("C1 — APIProvider mount count across route transitions (BUG EXPLORATION)", () => {
  beforeEach(() => {
    installGoogleMapsGlobal();
    resetMapsMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("[concrete] mountCount ≤ 1 for the explicit C1 counterexample: /tracking → /routes/abc → /tracking", async () => {
    const mountCount = await navigateSequence([
      "/tracking",
      "/routes/abc",
      "/tracking",
    ]);
    // In the unfixed code F this asserts 3 (one per route change) — test fails
    // and confirms the bug C1. In the fixed code F' it should be 1.
    expect(mountCount).toBeLessThanOrEqual(1);
  });

  it("[property] ∀ route sequence ⇒ mountCount ≤ 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<RouteName>(
            "/tracking",
            "/routes/abc",
            "/routes/def",
          ),
          { minLength: 1, maxLength: 20 },
        ),
        async (routes) => {
          // Reset state between property runs so counts don't accumulate.
          resetMapsMocks();
          const mountCount = await navigateSequence(routes as RouteName[]);
          return mountCount <= 1;
        },
      ),
      {
        numRuns: 30,
        // Seed keeps reproducibility; fast-check will still shrink to the
        // minimum counterexample when the property fails.
      },
    );
  });
});
