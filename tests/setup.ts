import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom lacks matchMedia — provide a minimal default so components don't crash
// at import time. Individual tests may override by re-assigning window.matchMedia.
if (typeof window !== "undefined" && !window.matchMedia) {
  // @ts-expect-error jsdom shim
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// Some components capture the current document.visibilityState at mount.
// jsdom defaults to "visible" which is what we want — tests override via helper.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
