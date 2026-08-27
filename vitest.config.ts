import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

// Mirrors the resolve aliases in vite.config.ts so tests resolve the app and
// the galavi workspace sources exactly like the app build does.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Subpath aliases must precede the bare "galavi" prefix match.
      "galavi/ome-zarr": resolve(__dirname, "../../galavi/src/dataset/adapters/ome-zarr.ts"),
      "galavi": resolve(__dirname, "../../galavi/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
