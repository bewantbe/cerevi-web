import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // Subpath aliases must precede the bare "galavi" prefix match.
      "galavi/advanced": resolve(__dirname, "../../galavi/src/advanced.ts"),
      "galavi/ome-zarr": resolve(__dirname, "../../galavi/src/dataset/ome-zarr.ts"),
      "galavi": resolve(__dirname, "../../galavi/src/index.ts"),
    },
  },
});
