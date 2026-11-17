import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // In development the React app (5173) talks to the API server (3001) through this proxy.
  server: { proxy: { "/api": "http://localhost:3001", "/uploads": "http://localhost:3001" } },
});
