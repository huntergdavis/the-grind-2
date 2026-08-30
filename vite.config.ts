import { defineConfig } from "vite";
import packageJson from "./package.json" with { type: "json" };

export default defineConfig({
  base: "/the-grind-2/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
