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
      "galavi": resolve(__dirname, "../../galavi/src/index.ts"),
      "@galavi/ome-zarr-adapter": resolve(__dirname, "../../galavi-ome-zarr-adapter/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
  },
});
