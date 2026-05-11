# Bug Condition Exploration — Counterexamples

> Spec: `maps-cost-optimization` · Task 1 (pre-fix exploration)
>
> These six property-based tests are designed to **fail on the unfixed code `F`**.
> Each failure confirms one branch of the formal bug condition `C(X)` defined in
> `bugfix.md §Deriving the Bug Condition` and cross-referenced in
> `design.md §Bug Details`.
>
> Runner: `vitest` + `fast-check` + `@testing-library/react` + `jsdom`.
> All tests executed from `master` (pre-fix `F`). Reproduce any single test with:
>
> ```
> npx vitest --run tests/bugfix/maps-cost-optimization/<file>
> ```

## Summary

| # | Branch of C(X) | Test file | Status on F | Root cause (hypothesized) |
|---|----|----|----|----|
| C1 | `route_transition ∧ causes_api_provider_remount` | `c1-provider-remount.test.tsx` | ❌ fails | `<APIProvider>` mounted inside each route component in `src/routes/_authenticated/{tracking,routes_.$routeId}.tsx` |
| C2 | `autocomplete_keystroke ∧ session_token = null` | `c2-autocomplete-session.test.ts` | ❌ fails | `new placesLib.Autocomplete(...)` in `src/components/maps/PlaceAutocomplete.tsx` never passes `sessionToken` |
| C3 | `directions_request ∧ stops_geo_key ∈ cache.keys` | `c3-directions-cache.test.tsx` | ❌ fails | `DirectionsLayer` in `src/components/maps/RouteMap.tsx` has no in-memory cache; only last-key dedupe |
| C4 | `locations_snapshot ∧ ∃ doc.status ≠ "active"` | `c4-firestore-scope.test.ts` | ❌ fails | `onSnapshot(collection(db, "locations"))` in `src/services/location.service.ts` has no `where(...)` filter |
| C5 | `visibilityState = "hidden" ∧ hidden_duration_ms > 30000` | `c5-hidden-listener.test.ts` | ❌ fails | `src/hooks/useDriverLocations.ts` never observes `document.visibilityState` |
| C6 | `map_render ∧ color_scheme = "DARK" ∧ css_filter ≠ "none"` | `c6-dark-filter.test.tsx` | ❌ fails | `style.filter = "saturate(0.72) brightness(0.92) contrast(0.95)"` hardcoded in both map components |

**All six property-tests fail on `F`.** Each failure is a mensurable counterexample for the matching branch of `C(X)`.

---

## C1 — APIProvider remount

**File:** `c1-provider-remount.test.tsx`

**Property:** `∀ routeSequence ∈ fc.array(fc.constantFrom("/tracking","/routes/abc","/routes/def"), {minLength:1,maxLength:20}) ⇒ mountCount ≤ 1`

**Concrete counterexample:**

- Navigation: `/tracking → /routes/abc → /tracking`
- Expected: `mountCount ≤ 1`
- Observed in F: `mountCount = 3`
- Raw assertion output:
  ```
  AssertionError: expected 3 to be less than or equal to 1
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: -365050357, path: "0:1:0:0:2", endOnFailure: true }
Counterexample: [["/routes/def","/tracking"]]
Shrunk 4 time(s)
```

Two distinct routes in sequence already produce two APIProvider mounts — shrinker confirms the minimum trigger is a single route change between any two of the three tracked pathnames.

**Maps to:** Requirements 2.1, 2.2. Bug cause: TanStack Router unmounts the previous route component and mounts the next, so any `<APIProvider>` that lives inside a route wrapper is unmounted + remounted on every transition. Each remount re-triggers the Maps JS boot and (when `libraries` differ across the two wrappers) invalidates the SDK's internal cache as well.

---

## C2 — Autocomplete without session token

**File:** `c2-autocomplete-session.test.ts`

**Property:** `∀ (keystrokes, select) trace ⇒ every Autocomplete construction carries sessionToken ≠ null/undefined`

**Concrete counterexample:**

- Trace: typing `"Av Djalma Batista, 1661"` (28 keystrokes) + select
- Expected: `sessionToken` defined and non-null
- Observed in F: `sessionToken === undefined` (the `new placesLib.Autocomplete(input, options)` call in `PlaceAutocomplete.tsx` does not include `sessionToken` in `options`)
- Raw assertion output:
  ```
  AssertionError: expected undefined to be defined
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: 458272467, path: "0:0:0:0", endOnFailure: true }
Counterexample: [" ", false]
Shrunk 3 time(s)
```

A single space keystroke, with no selection, is enough — the first mount constructs an Autocomplete with `sessionToken = undefined`.

**Maps to:** Requirements 2.3, 2.4. Bug cause: `src/components/maps/PlaceAutocomplete.tsx:46-52` never generates or passes an `AutocompleteSessionToken`, so Google bills each keystroke's prediction as a standalone Per-Request event.

---

## C3 — Directions cache miss on repeated key

**File:** `c3-directions-cache.test.tsx`

**Property:** `∀ X where stopsGeoKey(X) ∈ cache.keys ⇒ network_calls(X) = 0`

**Concrete counterexample:**

- Sequence: `A → AB → ABC → AB → ABC`
  - `A` (1 stop): no call (<2 stops skip)
  - `AB` (first): 1 call
  - `ABC` (first): 1 call
  - `AB` (repeat): MUST be a cache hit (property says 0 new calls)
  - `ABC` (repeat): MUST be a cache hit (property says 0 new calls)
- Expected: `abCalls = 1`, `abcCalls = 1`, total = 2
- Observed in F: `abCalls = 2`, `abcCalls = 2`, total = 4
- Raw assertion output:
  ```
  AssertionError: expected 2 to be 1
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: 1520828204, path: "2:1:0:2", endOnFailure: true }
Counterexample: [["ABC","AB","ABC"]]
Shrunk 3 time(s)
```

Three-step sequence with one repeat already breaks the property. The shrunk input `["ABC","AB","ABC"]` emits 3 network calls instead of the expected 2.

**Maps to:** Requirements 2.5. Bug cause: `src/components/maps/RouteMap.tsx:68-108` deduplicates only against the *previous* `stopsGeoKey` via `lastStopsGeoKeyRef`; any non-consecutive repeat is re-billed.

---

## C4 — Firestore snapshot includes inactive docs

**File:** `c4-firestore-scope.test.ts`

**Property:** `∀ seed (active+inactive) ⇒ every delivered doc has status = "active"`

**Concrete counterexample:**

- Seed: `{active: 3, inactive: 50}` (53 docs)
- Expected: delivered snapshot length = 3, all with `status = "active"`
- Observed in F: delivered snapshot length = 53, includes 50 `status = "inactive"` docs
- Raw assertion output:
  ```
  AssertionError: expected 53 to be 3
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: -1328954821, path: "0:0:1:0:0:0:0", endOnFailure: true }
Counterexample: [0, 1]
Shrunk 6 time(s)
```

Minimal trigger: 0 active + 1 inactive doc. Since `onSnapshot` is subscribed without a `where("status","==","active")` filter, the single inactive doc is delivered and breaks the invariant.

**Maps to:** Requirements 2.7. Bug cause: `src/services/location.service.ts:5-16` calls `onSnapshot(ref, ...)` on the raw collection reference — no `query()` + `where()` applied.

---

## C5 — Listener stays active while tab hidden

**File:** `c5-hidden-listener.test.ts`

**Property:** `∀ hiddenForMs > 30000: active_listeners.locations = 0`

**Concrete counterexample:**

- Sequence: mount hook consumer → seed 1 active doc → dispatch `visibilitychange → hidden` → advance 31_000 ms on fake timers
- Expected: `activeSubscribers.length = 0`
- Observed in F: `activeSubscribers.length = 1` (listener never paused)
- Raw assertion output:
  ```
  AssertionError: expected 1 to be +0
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: 1897639915, path: "0:0", endOnFailure: true }
Counterexample: [30001]
Shrunk 1 time(s)
```

Minimum hidden duration that violates the property: 30_001 ms — exactly one millisecond past the spec threshold of 30 seconds.

**Maps to:** Requirements 2.8. Bug cause: `src/hooks/useDriverLocations.ts` subscribes on first listener and only unsubscribes when the last listener leaves — it never observes `document.visibilityState` nor listens for `visibilitychange`.

---

## C6 — CSS filter layered over colorScheme=DARK

**File:** `c6-dark-filter.test.tsx`

**Property:** `resolvedTheme = "dark" ⇒ mapEl.style.filter ∈ {"", "none"}`

**Concrete counterexamples (RouteMap and TrackingMap, both in dark theme):**

- Expected: `style.filter ∈ {"", "none"}`
- Observed in F: `style.filter === "saturate(0.72) brightness(0.92) contrast(0.95)"`
- Raw assertion output:
  ```
  AssertionError: expected [ '', 'none' ] to include 'saturate(0.72) brightness(0.92) contr…'
  ```

**Shrunk property-based counterexample (fast-check):**

```
{ seed: -2039384785, path: "0:0", endOnFailure: true }
Counterexample: ["RouteMap"]
Shrunk 1 time(s)
```

Either component in dark theme violates the property — the shrinker picks `RouteMap` deterministically.

**Maps to:** Requirements 2.11. Bug cause: `src/components/maps/RouteMap.tsx:233-236` and `src/components/maps/TrackingMap.tsx:148-151` both hardcode `style={{ filter: mapFilter }}` where `mapFilter` is `"saturate(0.72) brightness(0.92) contrast(0.95)"` whenever `resolvedTheme === "dark"`, on top of the native `colorScheme="DARK"` prop.

---

## Reproducing the counterexamples

All seeds above are captured from the `master` branch under `Node 20+` with the project's pinned vitest + fast-check versions. To reproduce a specific shrinked failure deterministically, pass the seed + path to `fc.assert`:

```ts
await fc.assert(property, { seed: -365050357, path: "0:1:0:0:2", endOnFailure: true });
```

or run all six files at once:

```
npx vitest --run tests/bugfix/maps-cost-optimization/
```

Expected result on pre-fix `F`: **6 test files failed, 13 tests failed**.

After the fix (tasks 4–9) is merged, all six property tests — including both the concrete and the fast-check property variants — MUST pass on `F'` without re-running. If any continues to fail, the specific branch of C(X) was not fully addressed.
