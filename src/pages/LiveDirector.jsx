import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Radio, PlayCircle, StopCircle, Pin, PinOff, Ban,
  CheckCircle2, Zap, Loader2, Plus, RefreshCw, AlertTriangle, Lock, Trash2,
} from "lucide-react";
import { liveApi } from "../api/client";
import BroadcastPanel from "../components/live/BroadcastPanel";
import ChromaPanel from "../components/live/ChromaPanel";
import BridgePanel from "../components/live/BridgePanel";
import {
  Button,
  Card,
  Input,
  SectionHeader,
  LayoutPreview,
  LayoutPicker,
  DEFAULT_LAYOUT_OPTIONS,
} from "../components/ui";

/**
 * LiveDirector — Autonomous Live Director control surface.
 *
 *  ┌─ Header: event picker / create / start / stop ────────────────────┐
 *  │                                                                   │
 *  ├─ Program layout picker (LayoutPicker tiles — Canva-style) ───────┤
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
  const [activeLayout, setActiveLayout] = useState("single");
  const [activeLayoutCams, setActiveLayoutCams] = useState([]);
  const [activeReason, setActiveReason] = useState("");
  const wsRef = useRef(null);

  // layout picker + lock state
  const [pickerLayout, setPickerLayout] = useState("single");
  const [lockStatus, setLockStatus] = useState({ saving: false, note: "", error: "" });

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
          if (msg.layout) setActiveLayout(msg.layout);
          if (Array.isArray(msg.layout_cams)) setActiveLayoutCams(msg.layout_cams);
          if (msg.reason) setActiveReason(msg.reason);
          setDecisions((prev) => [
            {
              t: msg.t,
              cam_id: msg.cam_id,
              reason: msg.reason,
              confidence: msg.confidence,
              layout: msg.layout || "single",
              layout_cams: Array.isArray(msg.layout_cams) ? msg.layout_cams : [],
              transition: msg.transition,
            },
            ...prev,
          ].slice(0, 60));
        }
      } catch { /* ignore non-JSON */ }
    };
    ws.onerror = () => setErr("Director stream disconnected. Refresh to re-open.");
    return () => { try { ws.close(); } catch {} };
  }, [detail?.id, detail?.is_live_in_process]);

  // Keep the picker in sync with the current on-air layout when the user
  // hasn't explicitly touched the picker yet.
  useEffect(() => {
    setPickerLayout(activeLayout);
  }, [detail?.id]);

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

  const deleteCamera = async (c) => {
    if (!selectedId) return;
    if (!window.confirm(`Remove camera "${c}" from this event?`)) return;
    try {
      await liveApi.deleteCamera(selectedId, c);
      await refreshDetail();
    } catch (e) { setErr(e.message || String(e)); }
  };

  const deleteEvent = async () => {
    if (!selectedId) return;
    if (!window.confirm("Delete this event and all its cameras + logs? This cannot be undone.")) return;
    try {
      await liveApi.deleteEvent(selectedId);
      setSelectedId(null);
      setDetail(null);
      reload();
    } catch (e) { setErr(e.message || String(e)); }
  };

  const lockLayout = async () => {
    if (!selectedId) return;
    setLockStatus({ saving: true, note: "", error: "" });
    try {
      await liveApi.setLockedLayout(selectedId, {
        layout: pickerLayout,
        layout_cams: activeLayoutCams,
      });
      setLockStatus({ saving: false, note: "Layout locked.", error: "" });
    } catch (ex) {
      const msg = String(ex?.message || ex);
      // If the endpoint isn't wired yet, surface a friendly message.
      const friendly = /404|not.?found/i.test(msg)
        ? "Layout locking coming soon — the director is choosing automatically for now."
        : msg;
      setLockStatus({ saving: false, note: "", error: friendly });
    }
  };

  const releaseLock = async () => {
    if (!selectedId) return;
    setLockStatus({ saving: true, note: "", error: "" });
    try {
      await liveApi.releaseLockedLayout(selectedId);
      setLockStatus({ saving: false, note: "Back to auto — director is choosing.", error: "" });
    } catch (ex) {
      const msg = String(ex?.message || ex);
      const friendly = /404|not.?found/i.test(msg)
        ? "Layout locking coming soon — the director is choosing automatically for now."
        : msg;
      setLockStatus({ saving: false, note: "", error: friendly });
    }
  };

  // Pretty labels for the on-air tile.
  const layoutMeta = useMemo(() => {
    const found = DEFAULT_LAYOUT_OPTIONS.find((o) => o.id === activeLayout);
    return found || DEFAULT_LAYOUT_OPTIONS[0];
  }, [activeLayout]);

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
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw size={14} />}
          onClick={reload}
          title="Refresh events"
        >
          Refresh
        </Button>
      </div>

      {err && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700/40 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {err}
          <button className="ml-auto text-red-300 hover:text-red-100" onClick={() => setErr("")}>✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LEFT — event picker + create */}
        <Card className="p-4">
          <h2 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-3">
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

          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider">Create event</div>
            <Input
              placeholder="Event name (e.g. Spring Tour Hyderabad)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="Venue (optional)"
              value={newVenue}
              onChange={(e) => setNewVenue(e.target.value)}
            />
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              leftIcon={creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              disabled={creating || !newName.trim()}
              onClick={createEvent}
            >
              Create
            </Button>
          </div>
        </Card>

        {/* MIDDLE — cameras + start/stop */}
        <Card className="p-4 md:col-span-2">
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
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<PlayCircle size={14} />}
                        onClick={startLive}
                        disabled={detail.cameras.length === 0}
                      >
                        Go live
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 size={14} />}
                        onClick={deleteEvent}
                        className="!text-red-400 !border-red-900/40 hover:!bg-red-950/30"
                        title="Delete this event and all its cameras"
                      >
                        Delete
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<StopCircle size={14} />}
                      onClick={stopLive}
                    >
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              {/* Program layout — Canva-style tile picker */}
              <div className="mb-5 border-t border-border pt-4">
                <div className="mb-3">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider">
                    Program layout
                  </div>
                  <p className="text-[13px] text-gray-400 mt-1">
                    The director switches layouts automatically based on the scene.
                    Lock one here when you want to override.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
                  {/* Left — current ON AIR layout */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="ui-live-dot" aria-hidden="true" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white">
                        {isLive ? "On air" : "Preview"}
                      </span>
                      <span className="text-[11px] text-gray-400 font-mono">
                        · {layoutMeta.name}
                      </span>
                    </div>
                    <LayoutPreview layout={activeLayout} size="lg" />
                    <div className="text-[11px] text-gray-500 font-mono max-w-[220px] truncate">
                      {activeLayoutCams.length
                        ? activeLayoutCams.join(" + ")
                        : activeCam || "—"}
                    </div>
                    {activeReason && (
                      <div className="text-[11px] text-gray-500 max-w-[220px] truncate" title={activeReason}>
                        {activeReason}
                      </div>
                    )}
                  </div>

                  {/* Right — picker */}
                  <div>
                    <LayoutPicker
                      value={pickerLayout}
                      onChange={setPickerLayout}
                      options={DEFAULT_LAYOUT_OPTIONS}
                      size="md"
                    />

                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={lockStatus.saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                        onClick={lockLayout}
                        disabled={lockStatus.saving || !pickerLayout}
                      >
                        Lock layout
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={releaseLock}
                        disabled={lockStatus.saving}
                      >
                        Release auto
                      </Button>
                      {lockStatus.note && (
                        <span className="text-[11px] text-green-400">{lockStatus.note}</span>
                      )}
                      {lockStatus.error && (
                        <span className="text-[11px] text-gray-400">{lockStatus.error}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cameras */}
              <div className="mb-4 border-t border-border pt-4">
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
                        {isLive ? (
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
                        ) : (
                          <button
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-red-900/30 hover:text-red-300 text-gray-400 inline-flex items-center gap-1"
                            onClick={() => deleteCamera(c.cam_id)}
                            title="Remove this camera from the event"
                          >
                            <Trash2 size={10} /> Remove
                          </button>
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
                  <div className="flex gap-2 items-end">
                    <Input
                      className="flex-1"
                      placeholder="cam_id (e.g. cam_stage)"
                      value={camId}
                      onChange={(e) => setCamId(e.target.value)}
                    />
                    <Input
                      className="flex-1"
                      placeholder="Label (Stage Left)"
                      value={camLabel}
                      onChange={(e) => setCamLabel(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addCamera}
                      disabled={!camId.trim()}
                    >
                      Add
                    </Button>
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
                    <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span>Program output</span>
                      <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-gray-400">
                        <LayoutPreview layout={activeLayout} size="sm" />
                        <span className="text-[10px] font-mono">{layoutMeta.name}</span>
                      </span>
                    </div>
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
                    <div className="bg-black/60 rounded border border-border max-h-72 overflow-y-auto">
                      {decisions.length === 0 ? (
                        <div className="px-3 py-2 text-gray-600 italic text-[11px]">
                          Waiting for first decision…
                        </div>
                      ) : decisions.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] border-b border-border/50 last:border-b-0"
                        >
                          <LayoutPreview layout={d.layout || "single"} size="sm" />
                          <div className="flex-1 min-w-0 font-mono text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 w-12 shrink-0">
                                {(d.t || 0).toFixed(1)}s
                              </span>
                              <span className="text-accent2 font-semibold truncate">
                                {d.cam_id}
                              </span>
                              <span className="ml-auto text-gray-500 shrink-0">
                                {((d.confidence || 0) * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div
                              className="text-gray-400 truncate mt-0.5"
                              title={d.reason}
                            >
                              {d.reason || "—"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
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
