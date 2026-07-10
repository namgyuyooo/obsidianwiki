import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API base is read from VITE_API_BASE at build/dev time.
// In dev we also proxy /api to the FastAPI server so no CORS/env is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE || "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
});
