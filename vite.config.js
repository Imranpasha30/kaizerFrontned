import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_API_URL || "http://localhost:8000";

  return {
    // basicSsl mints a self-signed cert on the first run so the dev server
    // can serve HTTPS. Browsers require a secure context for getUserMedia
    // over a LAN IP — plain http://192.168.x.x blocks camera access. The
    // phone will show a one-time cert warning; accept it.
    plugins: [react(), basicSsl()],
    server: {
      port: 3000,
      host: true,  // bind to 0.0.0.0 so LAN phones can reach us
      https: true, // served via the self-signed cert from basicSsl
      proxy: {
        // `ws: true` forwards WebSocket upgrades under /api through to the
        // backend — so the phone's ingest + dashboard monitor WS can use
        // same-origin URLs (no hardcoded :8000). Avoids mixed-content
        // blocking when the page itself is HTTPS.
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
