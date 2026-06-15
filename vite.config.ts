import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const stableEntries = new Set(["service-worker", "recorder"]);

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        "guide-editor": resolve(__dirname, "guide-editor.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        recorder: resolve(__dirname, "src/content/recorder.ts")
      },
      output: {
        entryFileNames: (chunk) =>
          stableEntries.has(chunk.name)
            ? "assets/[name].js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
