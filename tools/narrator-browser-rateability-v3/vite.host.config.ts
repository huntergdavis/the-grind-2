import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  publicDir: false,
  build: {
    target: "node22",
    outDir: resolve(root, ".narrator-browser-rateability-v3-host-dist"),
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    sourcemap: false,
    ssr: resolve(root, "src/evidence.ts"),
    rollupOptions: {
      output: {
        entryFileNames: "evidence-host.mjs",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
