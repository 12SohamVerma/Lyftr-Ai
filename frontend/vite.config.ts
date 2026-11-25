import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The backend URL is injected at build time through VITE_API_BASE_URL
// (see src/services/chatApi.ts). Never put LLM keys in VITE_* variables:
// everything prefixed with VITE_ ends up in the public JavaScript bundle.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, host: true },
  preview: { port: 3000, host: true },
  build: { sourcemap: false },
});
