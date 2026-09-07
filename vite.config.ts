import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue(), vueDevTools()],
  preview: {
    allowedHosts: ["cerevi.gmisp.com"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Subpath aliases must precede the bare "galavi" prefix match.
      "galavi/ome-zarr": resolve(__dirname, "../../galavi/src/dataset/adapters/ome-zarr.ts"),
      "galavi": resolve(__dirname, "../../galavi/src/index.ts"),
    },
  },
});
