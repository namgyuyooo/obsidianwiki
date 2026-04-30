import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/assistant-ui/",
  plugins: [react()],
  build: {
    outDir: "../assistant-ui",
    emptyOutDir: true,
  },
});
