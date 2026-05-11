import { useSyncExternalStore } from "react";

export type SystemColorScheme = "light" | "dark";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Shared `MediaQueryList` instance, created once per browsing context so that
 * every consumer of {@link useSystemColorScheme} reuses the same underlying
 * subscription rather than opening a new one in each component.
 *
 * Guarded for SSR / non-DOM environments (e.g. Vitest's node default, SSR pre-hydrate),
 * where `window`/`matchMedia` are not defined. In those cases the hook falls
 * back to {@link getServerSnapshot}.
 */
const sharedMediaQuery: MediaQueryList | null =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MEDIA_QUERY)
    : null;

function subscribe(onStoreChange: () => void): () => void {
  if (sharedMediaQuery === null) {
    return () => {};
  }
  sharedMediaQuery.addEventListener("change", onStoreChange);
  return () => {
    sharedMediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(): SystemColorScheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  // Re-read from window.matchMedia each time so that test overrides of
  // window.matchMedia are respected. The subscription still uses the shared
  // MediaQueryList instance for efficiency in production.
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getServerSnapshot(): SystemColorScheme {
  return "light";
}

/**
 * Observes the user's system color scheme preference
 * (`prefers-color-scheme: dark`) through a single shared `matchMedia`
 * subscription.
 *
 * Returns `"dark"` when the OS/browser reports dark mode, `"light"` otherwise.
 * Defaults to `"light"` on the server and when `matchMedia` is unavailable,
 * matching the previous inline `useSyncExternalStore` implementation.
 */
export function useSystemColorScheme(): SystemColorScheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
