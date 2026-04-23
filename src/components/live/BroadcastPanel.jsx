import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, Plus, Trash2, PlayCircle, StopCircle, AlertTriangle, Loader2, X,
} from "lucide-react";
import { liveApi } from "../../api/client";
import { Button, Card, Input, PasswordInput } from "../ui";

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
  // The form stores base_url + stream_key separately so the stream key can be
  // masked behind a PasswordInput. They are joined on submit.
  const [form, setForm]         = useState({
    id: "", name: "", base_url: "", stream_key: "", enabled: true, reconnect_max_attempts: 5,
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
    id: "", name: "", base_url: "", stream_key: "", enabled: true, reconnect_max_attempts: 5,
  });

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    const base = (form.base_url || "").trim();
    const key  = (form.stream_key || "").trim();
    if (!form.id.trim() || !form.name.trim() || !base || !key) return;
    const rtmp_url = `${base.replace(/\/$/, "")}/${key}`;
    setSaving(true); setErr("");
    try {
      await liveApi.addRelayDestination(eventId, {
        id: form.id.trim(),
        name: form.name.trim(),
        rtmp_url,
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
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Phase 7 · relay
          </span>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Radio size={16} className="text-accent2" />
            Broadcast
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-red-600/80 text-white px-1.5 py-0.5 rounded-full">
                <span className="ui-live-dot" aria-hidden="true" />
                ON AIR
              </span>
            )}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus size={12} />}
          onClick={() => { setAddOpen(true); setErr(""); }}
        >
          Add
        </Button>
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
          <Button
            variant="primary"
            size="sm"
            className="flex-1 justify-center"
            leftIcon={busy ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
            onClick={startBroadcast}
            disabled={busy || !isLive || destinations.length === 0}
            title={!isLive ? "Event must be live before broadcasting" : ""}
          >
            Start broadcasting
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-center !text-red-400 !border-red-900/40 hover:!bg-red-950/30"
            leftIcon={busy ? <Loader2 size={12} className="animate-spin" /> : <StopCircle size={12} />}
            onClick={stopBroadcast}
            disabled={busy}
          >
            Stop broadcasting
          </Button>
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
          <Card className="w-full max-w-md !p-0 shadow-2xl">
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
                      onClick={() => setForm((f) => ({ ...f, base_url: p.url }))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <Input
                required
                label="ID (machine name)"
                placeholder="youtube_main"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              />

              <Input
                required
                label="Display name"
                placeholder="YouTube Main Channel"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />

              <Input
                required
                label="Base URL"
                hint="The public RTMP endpoint. Pick a preset above, or paste manually."
                placeholder="rtmp://a.rtmp.youtube.com/live2/"
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              />

              <PasswordInput
                label="Stream key"
                hint="Kept private. Never shown in plain text after saving."
                autoComplete="new-password"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={form.stream_key}
                onChange={(e) => setForm((f) => ({ ...f, stream_key: e.target.value }))}
              />

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  leftIcon={saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  disabled={
                    saving
                    || !form.id.trim()
                    || !form.name.trim()
                    || !form.base_url.trim()
                    || !form.stream_key.trim()
                  }
                >
                  Save destination
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </Card>
  );
}
