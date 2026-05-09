import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = {
    target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
    changeOrigin: true,
  }

  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        "@": resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/health': apiProxy,
        '/registry': apiProxy,
        '/specimens': apiProxy,
        '/atlas': apiProxy,
        '/meshes': apiProxy,
        '/ome-zarr': apiProxy,
      },
    },
  }
});
