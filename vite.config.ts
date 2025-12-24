import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { viteMockServe } from "vite-plugin-mock";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), viteMockServe()],
  resolve: {
    alias: {
      "@": resolve(__dirname, './src'),
      "galavi": resolve(__dirname, '../galavi/packages/galavi/src/index.ts'),
      "@galavi/types": resolve(__dirname, '../galavi/packages/types/src/index.d.ts'),
      "@galavi/layer-vsr": resolve(__dirname, '../galavi/packages/layer-vsr/src/main.ts'),
    },
  },
});
