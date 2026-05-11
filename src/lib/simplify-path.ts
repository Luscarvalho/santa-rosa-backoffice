/**
 * Douglas-Peucker path simplification with spherical distance approximation.
 *
 * Perpendicular distance is computed in meters using:
 *   - ~111320 m/deg for latitude
 *   - cos(meanLat * π/180) * 111320 m/deg for longitude
 *
 * This avoids a dependency on the Google Maps geometry library and works in
 * any environment (Node, browser, tests).
 */

export interface SimplifyOptions {
  /** Douglas-Peucker tolerance in meters. Default 15. */
  toleranceMeters?: number;
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * Approximate perpendicular distance (in meters) from point `p` to the line
 * segment defined by `a` and `b`, using a flat-earth approximation scaled by
 * the cosine of the mean latitude.
 */
function perpendicularDistanceMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const meanLat = (a.lat + b.lat + p.lat) / 3;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const mPerDegLng = cosLat * METERS_PER_DEG_LAT;

  // Convert to a local Cartesian plane (meters)
  const ax = a.lng * mPerDegLng;
  const ay = a.lat * METERS_PER_DEG_LAT;
  const bx = b.lng * mPerDegLng;
  const by = b.lat * METERS_PER_DEG_LAT;
  const px = p.lng * mPerDegLng;
  const py = p.lat * METERS_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // a and b are the same point — return distance from p to a
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // Perpendicular distance = |cross product| / |segment length|
  const cross = Math.abs(dx * (ay - py) - (ax - px) * dy);
  return cross / Math.sqrt(lenSq);
}

/**
 * Iterative Douglas-Peucker over a stack of `[start, end]` ranges.
 *
 * An iterative implementation avoids risking a stack overflow on patholo-
 * gical zig-zag inputs: at depth `d`, recursive DP can consume `O(d)` JS
 * frames, and property-based tests exercise paths up to 1000 points. The
 * stack-based form bounds host stack usage to a single frame regardless
 * of path length.
 *
 * Marks indices in `keep` that should be retained.
 */
function douglasPeucker<P extends { lat: number; lng: number }>(
  points: ReadonlyArray<P>,
  start: number,
  end: number,
  toleranceMeters: number,
  keep: Uint8Array,
): void {
  const stack: Array<[number, number]> = [[start, end]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [s, e] = range;
    if (e <= s + 1) continue;

    let maxDist = 0;
    let maxIdx = s;

    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistanceMeters(points[i], points[s], points[e]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > toleranceMeters) {
      keep[maxIdx] = 1;
      stack.push([s, maxIdx]);
      stack.push([maxIdx, e]);
    }
  }
}

/**
 * Simplify a sequence of lat/lng points using the Douglas-Peucker algorithm
 * with a spherical distance approximation.
 *
 * - `points.length ≤ 2` → returns a shallow copy (no simplification possible).
 * - `toleranceMeters === 0` → returns a shallow copy (no simplification).
 * - First and last points are always preserved.
 * - The returned array is a subsequence of the input (same object references).
 */
export function simplifyPath<P extends { lat: number; lng: number }>(
  points: ReadonlyArray<P>,
  opts?: SimplifyOptions,
): P[] {
  const toleranceMeters = opts?.toleranceMeters ?? 15;

  // Degenerate cases — return a copy without simplification
  if (points.length <= 2 || toleranceMeters === 0) {
    return [...points];
  }

  const n = points.length;
  const keep = new Uint8Array(n); // 0 = discard, 1 = keep
  keep[0] = 1;
  keep[n - 1] = 1;

  douglasPeucker(points, 0, n - 1, toleranceMeters, keep);

  const result: P[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}
