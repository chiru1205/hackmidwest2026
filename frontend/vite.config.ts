import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@contracts": path.resolve(__dirname, "../contracts/types.ts") } },
  server: {
    port: 5173,
    fs: { allow: [path.resolve(__dirname, "..")] },
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/photos": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
