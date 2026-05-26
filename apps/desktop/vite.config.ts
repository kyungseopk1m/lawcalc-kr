import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@lawcalc-kr/core-engine": decodeURIComponent(
        new URL("../../packages/core-engine/src/index.ts", import.meta.url).pathname,
      ),
      "@lawcalc-kr/compensation": decodeURIComponent(
        new URL("../../packages/compensation/src/index.ts", import.meta.url).pathname,
      ),
      "@lawcalc-kr/datasets-compensation": decodeURIComponent(
        new URL("../../packages/datasets-compensation/src/index.ts", import.meta.url).pathname,
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
