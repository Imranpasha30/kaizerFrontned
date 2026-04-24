import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Maximize2, Minimize2, RefreshCw, Radio, AlertTriangle,
} from "lucide-react";
import { liveApi } from "../api/client";
import ProgramPreview from "../components/live/ProgramPreview";

/**
 * ProgramMonitor — full-screen dedicated preview of the live program feed.
 *
 * Designed to be opened in a separate browser window (so you can drag it
 * onto a second monitor during a show) or served up on a TV connected via
 * casting. No operator controls — pure monitoring. The canvas-composited
 * output follows whatever the director is choosing in real time.
 *
 * Route: /program/:eventId (protected).
 */
export default function ProgramMonitor() {
  const { eventId } = useParams();
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [activeCam, setActiveCam] = useState(null);
  const [activeLayout, setActiveLayout] = useState("single");
  const [activeLayoutCams, setActiveLayoutCams] = useState([]);
  const [activeReason, setActiveReason] = useState("");
  const [isFullscreen, setFullscreen] = useState(false);
  const containerRef = useRef(null);
  const wsRef = useRef(null);

  // Fetch event detail + refresh periodically so new cams appear.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await liveApi.getEvent(eventId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e));
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [eventId]);

  // Subscribe to the director decision stream so the canvas layout/primary
  // tracks whatever the autonomous director is picking in real time.
  useEffect(() => {
    if (!detail?.is_live_in_process) return undefined;
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsProto}//${window.location.host}/api/live/events/${detail.id}/stream`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "selection") {
          setActiveCam(msg.cam_id);
          if (msg.layout) setActiveLayout(msg.layout);
          if (Array.isArray(msg.layout_cams)) setActiveLayoutCams(msg.layout_cams);
          if (msg.reason) setActiveReason(msg.reason);
        }
      } catch { /* noop */ }
    };
    return () => { try { ws.close(); } catch {} };
  }, [detail?.is_live_in_process, detail?.id]);

  // Fullscreen toggle — browsers require a user-gesture on the triggering click.
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen?.();
        setFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setFullscreen(false);
      }
    } catch {
      // Safari + some mobile browsers reject in specific contexts; silently ignore
    }
  }
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (!eventId) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-gray-500">No event id in URL.</p>
      </div>
    );
  }
  if (err) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3 p-6">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm">{err}</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading event {eventId}…</p>
      </div>
    );
  }

  const isLive = detail.is_live_in_process || detail.status === "live";
  const primary = activeCam || detail.cameras?.[0]?.cam_id;

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-black text-white flex flex-col select-none"
    >
      {/* Thin header strip — fades into the top of the program area */}
      <header className="px-4 py-2 flex items-center gap-3 border-b border-white/10 bg-gradient-to-b from-black to-transparent z-10">
        <div className="flex items-center gap-2">
          <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-xs tracking-widest">
            KAIZER
          </div>
          <span className="text-[11px] text-gray-400 tracking-wider uppercase">Program Monitor</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{detail.name}</div>
          {detail.venue ? (
            <div className="text-[11px] text-gray-500 truncate">{detail.venue}</div>
          ) : null}
        </div>

        {/* Live status */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isLive ? (
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
              <Radio size={12} className="text-accent2 animate-pulse" />
              <span className="text-accent2">ON AIR</span>
            </div>
          ) : (
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">
              {detail.status}
            </span>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-white/5 text-gray-400 hover:text-white transition"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* The big program canvas fills the remaining viewport */}
      <main className="flex-1 relative flex items-center justify-center p-0">
        <div className="w-full h-full max-h-[calc(100vh-48px)] aspect-video relative">
          <ProgramPreview
            eventId={detail.id}
            cameras={detail.cameras || []}
            layout={activeLayout}
            primary={primary}
            layoutCams={activeLayoutCams}
            className="!w-full !h-full !border-0 !rounded-none"
          />

          {/* Overlay: layout + reason — only show briefly after each decision */}
          {activeReason ? (
            <div className="absolute bottom-6 left-6 px-3 py-1.5 rounded-md glass-panel text-[11px] font-mono text-gray-300">
              <span className="text-accent2 font-semibold">{activeLayout}</span>
              <span className="mx-2 text-gray-600">·</span>
              <span>{activeReason}</span>
            </div>
          ) : null}

          {!isLive ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-300">Event is not live</div>
                <div className="text-xs text-gray-500 mt-1">
                  Go to the dashboard and click Go live
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
