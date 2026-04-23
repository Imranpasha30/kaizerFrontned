import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Radio, PlayCircle, StopCircle, Pin, PinOff, Ban,
  CheckCircle2, Zap, Loader2, Plus, RefreshCw, AlertTriangle,
} from "lucide-react";
import { liveApi } from "../api/client";
import BroadcastPanel from "../components/live/BroadcastPanel";
import ChromaPanel from "../components/live/ChromaPanel";
import BridgePanel from "../components/live/BridgePanel";

/**
 * LiveDirector — Autonomous Live Director control surface.
 *
 *  ┌─ Header: event picker / create / start / stop ────────────────────┐
 *  │                                                                   │
 *  ├─ Multi-cam preview grid (active cam highlighted) ────────────────┤
 *  │                                                                   │
 *  ├─ Operator controls: pin / blacklist / force-cut ─────────────────┤
 *  │                                                                   │
 *  ├─ Program output <video> + director decision log ─────────────────┤
 *  │                                                                   │
 *  └───────────────────────────────────────────────────────────────────┘
 */
export default function LiveDirector() {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // new-event form
  const [newName, setNewName] = useState("");
  const [newVenue, setNewVenue] = useState("");
  const [creating, setCreating] = useState(false);

  // camera form
  const [camId, setCamId] = useState("");
  const [camLabel, setCamLabel] = useState("");

  // decisions stream from WS
  const [decisions, setDecisions] = useState([]);
  const [activeCam, setActiveCam] = useState(null);
  const wsRef = useRef(null);

  // initial load
  const reload = useCallback(() => {
    setLoading(true);
    liveApi.listEvents()
      .then((list) => {
        setEvents(Array.isArray(list) ? list : []);
        if (!selectedId && list?.length) setSelectedId(list[0].id);
      })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { reload(); }, []);

  // when selection changes → fetch detail
  useEffect(() => {
    if (!selectedId) return;
    liveApi.getEvent(selectedId)
      .then(setDetail)
      .catch((e) => setErr(e.message || String(e)));
  }, [selectedId]);

  // Re-fetch the event detail — used by child panels that mutate config_json.
  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const d = await liveApi.getEvent(selectedId);
      setDetail(d);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [selectedId]);

  // open/close WebSocket when detail says it's live
  useEffect(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!detail || !detail.is_live_in_process) return;

    // Vite proxies /api through to the backend; WS goes direct to :8000
    const wsUrl = `ws://${window.location.hostname}:8000/api/live/events/${detail.id}/stream`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "selection") {
          setActiveCam(msg.cam_id);
          setDecisions((prev) => [
            { t: msg.t, cam_id: msg.cam_id, reason: msg.reason, confidence: msg.confidence },
            ...prev,
          ].slice(0, 60));
        }
      } catch { /* ignore non-JSON */ }
    };
    ws.onerror = () => setErr("Director stream disconnected. Refresh to re-open.");
    return () => { try { ws.close(); } catch {} };
  }, [detail?.id, detail?.is_live_in_process]);

  const createEvent = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ev = await liveApi.createEvent({ name: newName, venue: newVenue });
      setNewName(""); setNewVenue("");
      await reload();
      setSelectedId(ev.id);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setCreating(false); }
  };

  const addCamera = async () => {
    if (!selectedId || !camId.trim()) return;
    try {
      await liveApi.addCamera(selectedId, { cam_id: camId, label: camLabel });
      setCamId(""); setCamLabel("");
      const d = await liveApi.getEvent(selectedId);
      setDetail(d);
    } catch (e) { setErr(e.message || String(e)); }
  };

  const startLive = async () => {
    try {
      await liveApi.start(selectedId);
      const d = await liveApi.getEvent(selectedId);
      setDetail(d);
    } catch (e) { setErr(e.message || String(e)); }
  };

  const stopLive = async () => {
    try {
      await liveApi.stop(selectedId);
      const d = await liveApi.getEvent(selectedId);
      setDetail(d);
      setDecisions([]);
      setActiveCam(null);
    } catch (e) { setErr(e.message || String(e)); }
  };

  const pin = async (c) => { try { await liveApi.pin(selectedId, c); } catch (e) { setErr(e.message); } };
  const unpin = async () => { try { await liveApi.unpin(selectedId); } catch (e) { setErr(e.message); } };
  const blacklist = async (c) => { try { await liveApi.blacklist(selectedId, c); } catch (e) { setErr(e.message); } };
  const allow = async (c) => { try { await liveApi.allow(selectedId, c); } catch (e) { setErr(e.message); } };
  const forceCut = async (c) => { try { await liveApi.forceCut(selectedId, c); } catch (e) { setErr(e.message); } };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const isLive = !!detail?.is_live_in_process;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center">
            <Radio size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Autonomous Live Director
              {isLive && (
                <span className="inline-flex items-center gap-1 text-xs bg-red-600/80 text-white px-2 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              N cameras in → one AI-switched program feed out. Zero human operator.
            </p>
          </div>
        </div>
        <button className="btn btn-secondary text-xs" onClick={reload} title="Refresh events">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700/40 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {err}
          <button className="ml-auto text-red-300 hover:text-red-100" onClick={() => setErr("")}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LEFT — event picker + create */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
            Events
          </h2>
          <div className="space-y-1 mb-4 max-h-64 overflow-y-auto">
            {events.length === 0 && (
              <p className="text-xs text-gray-600 italic">No events yet.</p>
            )}
            {events.map((ev) => (
              <button key={ev.id}
                onClick={() => setSelectedId(ev.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between
                  ${ev.id === selectedId ? "bg-accent/20 text-white" : "text-gray-400 hover:bg-white/5"}`}>
                <span className="truncate">{ev.name}</span>
                <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded uppercase tracking-wide
                  ${ev.status === "live" ? "bg-red-600/60 text-white"
                  : ev.status === "ended" ? "bg-gray-700 text-gray-400"
                  : "bg-yellow-900/40 text-yellow-400"}`}>
                  {ev.status}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Create event</div>
            <input className="w-full mb-2 px-2 py-1.5 rounded bg-black/40 border border-border text-sm"
              placeholder="Event name (e.g. Spring Tour Hyderabad)"
              value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="w-full mb-2 px-2 py-1.5 rounded bg-black/40 border border-border text-sm"
              placeholder="Venue (optional)"
              value={newVenue} onChange={(e) => setNewVenue(e.target.value)} />
            <button className="w-full btn btn-primary text-sm"
              disabled={creating || !newName.trim()}
              onClick={createEvent}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create
            </button>
          </div>
        </section>

        {/* MIDDLE — cameras + start/stop */}
        <section className="card p-4 md:col-span-2">
          {!detail ? (
            <p className="text-gray-600 text-sm">Select an event on the left.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{detail.name}</h2>
                  {detail.venue && <p className="text-xs text-gray-500">{detail.venue}</p>}
                </div>
                <div className="flex gap-2">
                  {!isLive ? (
                    <button className="btn btn-primary text-sm flex items-center gap-1"
                      onClick={startLive} disabled={detail.cameras.length === 0}>
                      <PlayCircle size={14} /> Go live
                    </button>
                  ) : (
                    <button className="btn btn-secondary text-sm flex items-center gap-1"
                      onClick={stopLive}>
                      <StopCircle size={14} /> Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Cameras */}
              <div className="mb-4">
                <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                  Cameras ({detail.cameras.length})
                </div>
                {detail.cameras.length === 0 && (
                  <p className="text-xs text-gray-600 italic mb-2">
                    Add at least one camera before going live.
                  </p>
                )}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                  {detail.cameras.map((c) => {
                    const active = c.cam_id === activeCam;
                    return (
                      <div key={c.cam_id}
                        className={`p-3 rounded-md border transition-colors
                          ${active ? "border-accent bg-accent/10"
                                   : "border-border bg-black/30"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Camera size={13} className={active ? "text-accent" : "text-gray-500"} />
                          <span className="text-xs font-medium text-white truncate">
                            {c.label || c.cam_id}
                          </span>
                          {active && (
                            <span className="ml-auto text-[10px] bg-accent text-white px-1.5 py-0.5 rounded">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-600 font-mono mb-2">{c.cam_id}</div>
                        {isLive && (
                          <div className="flex gap-1 flex-wrap">
                            <button className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                              onClick={() => pin(c.cam_id)} title="Pin this camera">
                              <Pin size={10} /> Pin
                            </button>
                            <button className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                              onClick={() => blacklist(c.cam_id)} title="Never cut to this camera">
                              <Ban size={10} /> Blacklist
                            </button>
                            <button className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300"
                              onClick={() => forceCut(c.cam_id)} title="Force cut now">
                              <Zap size={10} /> Force cut
                            </button>
                            <button className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                              onClick={() => allow(c.cam_id)} title="Remove from blacklist">
                              <CheckCircle2 size={10} /> Allow
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isLive && (
                  <button className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    onClick={unpin}>
                    <PinOff size={11} /> Unpin all
                  </button>
                )}
              </div>

              {/* Add camera */}
              {!isLive && (
                <div className="border-t border-border pt-3 mb-4">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Add camera</div>
                  <div className="flex gap-2">
                    <input className="flex-1 px-2 py-1.5 rounded bg-black/40 border border-border text-sm"
                      placeholder="cam_id (e.g. cam_stage)"
                      value={camId} onChange={(e) => setCamId(e.target.value)} />
                    <input className="flex-1 px-2 py-1.5 rounded bg-black/40 border border-border text-sm"
                      placeholder="Label (Stage Left)"
                      value={camLabel} onChange={(e) => setCamLabel(e.target.value)} />
                    <button className="btn btn-secondary text-xs" onClick={addCamera} disabled={!camId.trim()}>
                      Add
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">
                    RTMP push URL after start: <code className="text-accent2">rtmp://localhost:1935/live/{detail.id}/&lt;cam_id&gt;</code>
                  </p>
                </div>
              )}

              {/* Program output + decision log (live only) */}
              {isLive && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Program output</div>
                    <video
                      className="w-full bg-black rounded border border-border"
                      controls autoPlay muted playsInline
                      src={`/media/live/${detail.id}/program.m3u8`}>
                      Program HLS stream
                    </video>
                    <p className="text-[10px] text-gray-600 mt-1">
                      HLS stream at <code>/media/live/{detail.id}/program.m3u8</code>.
                      Some browsers need hls.js to play m3u8.
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                      Director decisions
                    </div>
                    <div className="bg-black/60 rounded border border-border font-mono text-[11px] max-h-72 overflow-y-auto">
                      {decisions.length === 0 ? (
                        <div className="px-3 py-2 text-gray-600 italic">
                          Waiting for first decision…
                        </div>
                      ) : decisions.map((d, i) => (
                        <div key={i} className="px-3 py-1.5 border-b border-border/50 flex justify-between gap-2">
                          <span className="text-gray-500">{d.t.toFixed(1)}s</span>
                          <span className="text-accent2 font-semibold">{d.cam_id}</span>
                          <span className="text-gray-400 flex-1 truncate" title={d.reason}>
                            {d.reason}
                          </span>
                          <span className="text-gray-600">{(d.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Phase 7.8 — autonomous broadcast control panels */}
      {detail && (
        <div className="mt-6">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
            Autonomous broadcast controls
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <BroadcastPanel
              eventId={detail.id}
              isLive={isLive}
            />
            <ChromaPanel
              eventId={detail.id}
              cameras={detail.cameras}
              detail={detail}
              onDetailRefresh={refreshDetail}
            />
            <BridgePanel
              eventId={detail.id}
              detail={detail}
              onDetailRefresh={refreshDetail}
            />
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-gray-600 mt-6">
        Phase 6 Autonomous Live Director · See <Link to="/" className="text-accent2 hover:underline">docs</Link> for RTMP setup.
      </p>
    </div>
  );
}
