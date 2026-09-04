import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  publicDir: false,
  build: {
    target: "es2022",
    outDir: resolve(root, ".narrator-browser-rateability-v3-dist"),
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(root, "index.html"),
    },
  },
  worker: {
    format: "es",
  },
});
