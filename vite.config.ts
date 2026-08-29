import { defineConfig } from "vite";

export default defineConfig({
  base: "/the-grind-2/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
