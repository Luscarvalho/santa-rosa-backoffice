import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    // Property-based tests can take a few seconds under jsdom
    testTimeout: 20_000,
    hookTimeout: 20_000,
    server: {
      deps: {
        // Inline @vis.gl/react-google-maps so our module-level mock via
        // vi.mock("@vis.gl/react-google-maps") always intercepts.
        inline: [/@vis\.gl\/react-google-maps/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@lib": path.resolve(__dirname, "./src/lib"),
    },
  },
});
