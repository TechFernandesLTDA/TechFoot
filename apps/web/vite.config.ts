import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const contentSecurityPolicy = "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    headers: { "Content-Security-Policy": contentSecurityPolicy },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
