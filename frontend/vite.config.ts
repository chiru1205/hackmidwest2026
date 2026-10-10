import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Two apps from one codebase. `--mode citizen` / `--mode city` loads .env.citizen / .env.city (VITE_ROLE).
// No mode (plain `vite`) behaves as the citizen app.
export default defineConfig(({ mode }) => {
  const city = mode === "city";
  const target = process.env.API_TARGET || "http://localhost:8000";
  return {
    plugins: [react()],
    resolve: { alias: { "@contracts": path.resolve(__dirname, "../contracts/types.ts") } },
    build: { outDir: city ? "dist/city" : "dist/citizen", emptyOutDir: true },
    server: {
      port: city ? 5174 : 5173,
      fs: { allow: [path.resolve(__dirname, "..")] },
      proxy: {
        "/api": { target, changeOrigin: true },
        "/photos": { target, changeOrigin: true },
      },
    },
  };
});
