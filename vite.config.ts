import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "galavi": resolve(__dirname, "../../galavi/src/index.ts"),
      "@galavi/ome-zarr-adapter": resolve(__dirname, "../../galavi-ome-zarr-adapter/src/index.ts"),
    },
  },
});
