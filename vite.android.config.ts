import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Static shell for the Android APK. The website keeps the TanStack Start
 * server build. This one only bundles the game so a WebView can ship it.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./android-shell", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./android-www", import.meta.url)),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
