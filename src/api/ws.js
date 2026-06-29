// WebSocket live-progress client (Wave 3).
//
// Streams render/upload progress from the backend instead of 2s HTTP
// polling. Server pushes frames shaped like GET /api/jobs/:id/status/
// (status, log_lines, log_offset, error) so the two feeds are
// interchangeable — callers fall back to polling via onDown() when the
// socket can't be established or dies repeatedly.
//
// URLs ride under /api so the Vite dev proxy (`"/api": { ws: true }`)
// and the production VITE_API_URL origin both Just Work, including
// through the cloudflared tunnel.

import { getToken } from "./client";

const ORIGIN = import.meta.env.VITE_API_URL || "";

function wsBase() {
  // ORIGIN empty in dev → same-origin (Vite proxies /api with ws:true).
  const httpOrigin = ORIGIN || window.location.origin;
  return httpOrigin.replace(/^http/, "ws");
}

const MAX_RECONNECTS = 3;

/**
 * Open a live socket with auto-reconnect and a polling-fallback signal.
 *
 * @param {string} path          e.g. `/api/ws/jobs/123`
 * @param {object} handlers      { onFrame(obj), onDown() }
 * @returns {{ close: () => void }}
 *
 * onDown fires AT MOST ONCE — after MAX_RECONNECTS consecutive
 * failures — and means "this feed is dead, start polling".
 */
export function openProgressSocket(path, { onFrame, onDown } = {}) {
  let ws = null;
  let closed = false;
  let attempts = 0;
  let downFired = false;

  const fireDown = () => {
    if (!downFired && !closed) {
      downFired = true;
      try { onDown && onDown(); } catch {}
    }
  };

  const connect = () => {
    if (closed || downFired) return;
    const token = getToken();
    const url = `${wsBase()}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    try {
      ws = new WebSocket(url);
    } catch {
      fireDown();
      return;
    }

    ws.onopen = () => { attempts = 0; };

    ws.onmessage = (ev) => {
      let data = null;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (!data || data.type === "ping") return;
      try { onFrame && onFrame(data); } catch {}
      if (data.final) {
        closed = true;
        try { ws.close(); } catch {}
      }
    };

    ws.onclose = () => {
      if (closed || downFired) return;
      attempts += 1;
      if (attempts >= MAX_RECONNECTS) {
        fireDown();
        return;
      }
      // Exponential-ish backoff: 1s, 2s, 4s.
      setTimeout(connect, 1000 * Math.pow(2, attempts - 1));
    };

    ws.onerror = () => {
      // onclose follows; reconnect logic lives there.
    };
  };

  connect();

  return {
    close() {
      closed = true;
      try { ws && ws.close(); } catch {}
    },
  };
}

/** Live render-pipeline progress for one job. */
export function openJobProgress(jobId, handlers) {
  return openProgressSocket(`/api/ws/jobs/${jobId}`, handlers);
}

/** Live publish/upload status for the signed-in user. */
export function openUploadsProgress(handlers) {
  return openProgressSocket(`/api/ws/uploads`, handlers);
}
