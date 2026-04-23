import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, Plus, Trash2, PlayCircle, StopCircle, AlertTriangle, Loader2, X,
} from "lucide-react";
import { liveApi } from "../../api/client";

const PRESETS = [
  { label: "YouTube Live",   url: "rtmp://a.rtmp.youtube.com/live2/" },
  { label: "Twitch",         url: "rtmp://live.twitch.tv/app/" },
  { label: "Facebook Live",  url: "rtmps://live-api-s.facebook.com:443/rtmp/" },
];

// Hide most of the RTMP URL so stream keys aren't exposed casually.
function maskUrl(url = "") {
  if (!url) return "";
  try {
    const u = new URL(url);
    const pathTail = u.pathname.length > 8
      ? `${u.pathname.slice(0, 6)}…${u.pathname.slice(-4)}`
      : u.pathname;
    return `${u.protocol}//${u.host}${pathTail}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 32)}…${url.slice(-8)}` : url;
  }
}

function fmtUptime(seconds) {
  if (!seconds || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function statusPillClasses(state) {
  if (state === "live") return "bg-green-900/60 text-green-300 border-green-700/60";
  if (state === "connecting" || state === "reconnecting")
    return "bg-yellow-900/50 text-yellow-300 border-yellow-700/50";
  return "bg-gray-800/60 text-gray-400 border-border";
}

export default function BroadcastPanel({ eventId, isLive }) {
  const [destinations, setDestinations] = useState([]);
  const [status, setStatus] = useState({ is_running: false, destinations: [] });
  const [loading, setLoading]   = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [addOpen, setAddOpen]   = useState(false);
  const [form, setForm]         = useState({
    id: "", name: "", rtmp_url: "", enabled: true, reconnect_max_attempts: 5,
  });
  const [saving, setSaving]     = useState(false);

  const pollRef = useRef(null);

  const refreshDestinations = useCallback(async () => {
    if (!eventId) return;
    try {
      const list = await liveApi.listRelayDestinations(eventId);
      setDestinations(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || String(e));
    }
  }, [eventId]);

  const refreshStatus = useCallback(async () => {
    if (!eventId) return;
    try {
      const s = await liveApi.getRelayStatus(eventId);
      setStatus(s || { is_running: false, destinations: [] });
    } catch (e) {
      // Don't flash the error bar on every poll cycle — only on explicit actions.
    }
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    Promise.all([refreshDestinations(), refreshStatus()]).finally(() => setLoading(false));
  }, [eventId, refreshDestinations, refreshStatus]);

  // Poll every 3s while mounted.
  useEffect(() => {
    if (!eventId) return;
    pollRef.current = setInterval(refreshStatus, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [eventId, refreshStatus]);

  const statusById = useMemo(() => {
    const map = {};
    (status?.destinations || []).forEach((d) => { map[d.destination_id] = d; });
    return map;
  }, [status]);

  // Aggregate uptime — longest-running destination wins the banner.
  const bannerUptime = useMemo(() => {
    const ups = (status?.destinations || [])
      .map((d) => d.uptime_s || 0)
      .filter((x) => x > 0);
    return ups.length ? Math.max(...ups) : 0;
  }, [status]);

  const resetForm = () => setForm({
    id: "", name: "", rtmp_url: "", enabled: true, reconnect_max_attempts: 5,
  });

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    if (!form.id.trim() || !form.name.trim() || !form.rtmp_url.trim()) return;
    setSaving(true); setErr("");
    try {
      await liveApi.addRelayDestination(eventId, {
        id: form.id.trim(),
        name: form.name.trim(),
        rtmp_url: form.rtmp_url.trim(),
        enabled: !!form.enabled,
        reconnect_max_attempts: Number(form.reconnect_max_attempts) || 5,
      });
      setAddOpen(false);
      resetForm();
      await refreshDestinations();
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setSaving(false);
    }
  };

  const removeDest = async (destId) => {
    setErr("");
    try {
      await liveApi.removeRelayDestination(eventId, destId);
      await refreshDestinations();
    } catch (ex) {
      setErr(ex.message || String(ex));
    }
  };

  const startBroadcast = async () => {
    setBusy(true); setErr("");
    try {
      await liveApi.startRelay(eventId);
      await refreshStatus();
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  const stopBroadcast = async () => {
    setBusy(true); setErr("");
    try {
      await liveApi.stopRelay(eventId);
      await refreshStatus();
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  const isRunning = !!status?.is_running;

  return (
    <section className="card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Radio size={14} className="text-accent2" />
          Broadcast
          {isRunning && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-red-600/80 text-white px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              ON AIR
            </span>
          )}
        </h3>
        <button
          className="btn btn-secondary text-[11px] px-2 py-1 flex items-center gap-1"
          onClick={() => { setAddOpen(true); setErr(""); }}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {err && (
        <div className="mb-2 p-2 rounded bg-red-900/40 border border-red-700/40 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1 break-words">{err}</span>
          <button className="text-red-300 hover:text-red-100" onClick={() => setErr("")}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 space-y-1.5 mb-3 overflow-y-auto max-h-72">
        {loading && destinations.length === 0 && (
          <div className="text-xs text-gray-600 italic flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        )}
        {!loading && destinations.length === 0 && (
          <p className="text-xs text-gray-600 italic">
            No destinations configured. Click Add to set one.
          </p>
        )}
        {destinations.map((d) => {
          const st = statusById[d.id];
          const state = st?.state || (d.enabled ? "idle" : "stopped");
          return (
            <div
              key={d.id}
              className="flex items-center gap-2 p-2 rounded border border-border bg-black/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white truncate">{d.name}</span>
                  <span className={`text-[9px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${statusPillClasses(state)}`}>
                    {state}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono truncate" title={d.rtmp_url}>
                  {maskUrl(d.rtmp_url)}
                </div>
                {st?.last_error && (
                  <div className="text-[10px] text-red-400 truncate" title={st.last_error}>
                    err: {st.last_error}
                  </div>
                )}
              </div>
              <button
                className="text-gray-500 hover:text-red-400 flex-shrink-0"
                onClick={() => removeDest(d.id)}
                title="Remove destination"
                disabled={isRunning}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 flex items-center gap-2">
        {!isRunning ? (
          <button
            className="btn btn-green text-xs flex items-center gap-1 flex-1 justify-center"
            onClick={startBroadcast}
            disabled={busy || !isLive || destinations.length === 0}
            title={!isLive ? "Event must be live before broadcasting" : ""}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
            Start broadcasting
          </button>
        ) : (
          <button
            className="btn text-xs flex items-center gap-1 flex-1 justify-center bg-red-900/80 border-red-700/60 text-red-200 hover:bg-red-800"
            onClick={stopBroadcast}
            disabled={busy}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <StopCircle size={12} />}
            Stop broadcasting
          </button>
        )}
        {isRunning && (
          <div className="text-[11px] text-gray-400 font-mono px-2 py-1 rounded bg-black/40 border border-border">
            {fmtUptime(bannerUptime)}
          </div>
        )}
      </div>

      {!isLive && !isRunning && (
        <p className="text-[10px] text-gray-600 mt-2">
          Start the event (Go live) before kicking off the broadcast.
        </p>
      )}

      {/* Add modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAddOpen(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h4 className="text-sm font-semibold text-white">Add broadcast destination</h4>
              <button
                className="text-gray-400 hover:text-white"
                onClick={() => setAddOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={submitAdd} className="p-4 space-y-3">
              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wider">
                  Preset (optional)
                </label>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                      onClick={() => setForm((f) => ({ ...f, rtmp_url: p.url }))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wider">
                  ID (machine name)
                </label>
                <input
                  required
                  className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-sm mt-1"
                  placeholder="youtube_main"
                  value={form.id}
                  onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wider">
                  Display name
                </label>
                <input
                  required
                  className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-sm mt-1"
                  placeholder="YouTube Main Channel"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase tracking-wider">
                  RTMP URL (append your stream key)
                </label>
                <input
                  required
                  className="w-full px-2 py-1.5 rounded bg-black/40 border border-border text-sm font-mono mt-1"
                  placeholder="rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx"
                  value={form.rtmp_url}
                  onChange={(e) => setForm((f) => ({ ...f, rtmp_url: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={!!form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
                <label className="ml-auto flex items-center gap-2 text-xs text-gray-300">
                  Reconnect attempts
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="w-16 px-1.5 py-1 rounded bg-black/40 border border-border text-xs"
                    value={form.reconnect_max_attempts}
                    onChange={(e) => setForm((f) => ({ ...f, reconnect_max_attempts: e.target.value }))}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs flex items-center gap-1"
                  disabled={saving || !form.id.trim() || !form.name.trim() || !form.rtmp_url.trim()}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Save destination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
