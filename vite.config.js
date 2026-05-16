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
      // HMR config — was pinned to test.kaizerx.com:443/wss so LAN +
      // tunnel testers could hot-reload. Side-effect: when the
      // tunnel is flaky / restarting / WebSocket-blocked, the Vite
      // client never reconnects and falls back to *full page reload*
      // on every retry — visible to the user as the whole site
      // looping every ~1 s.
      //
      // Setting `hmr: false` disables hot-reload entirely. Tradeoff:
      // every code change needs a manual Ctrl+R. Site stops looping.
      // Re-enable later with a smarter `host: window.location.host`
      // proxy rule once the tunnel WebSocket is verified end-to-end.
      hmr: false,
      // Vite 5+ rejects requests whose Host header isn't on this
      // list (CVE-2025-24010-style mitigation).  Keep every hostname
      // we serve through here.
      allowedHosts: ["test.kaizerx.com", "localhost", "192.168.29.125"],
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
        // `/media/*` serves clip thumbnails and rendered videos when
        // STORAGE_BACKEND=local — FastAPI mounts a StaticFiles handler
        // at /media. Without this proxy rule the browser would hit
        // Vite's dev server at https://localhost:3000/media/... and
        // get a 404. In production the frontend is on a different
        // domain so VITE_API_URL prepends the API host to /media URLs
        // (see api/client.js mediaUrl) — that path bypasses this dev
        // proxy entirely.
        "/media": {
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
