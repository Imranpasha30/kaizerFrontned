import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_API_URL || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      port: 3000,
      // Bind to all interfaces so phones on the same WiFi can reach the
      // Vite dev server (for the /phone/:event/:cam QR flow). Localhost-only
      // binding would make the phone get ERR_CONNECTION_REFUSED.
      host: true,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
