import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  RefreshCw, Radio, Cpu, Wifi, Smartphone, BarChart3, Copy,
} from "lucide-react";
import { liveApi } from "../../api/client";

/**
 * DebugPanel — live health + issues surface for a running event.
 *
 * Polls `/events/{id}/debug` every 2 seconds and renders every moving
 * part of the pipeline side-by-side with a colour-coded status so the
 * operator can spot the broken link immediately — without having to
 * tail backend logs.
 *
 * Sections
 * --------
 *   Issues   — one-liner complaints emitted by the backend snapshot
 *   Session  — director state + pipeline tasks + decisions count
 *   Cameras  — per-camera: webrtc worker stats, ring stats, analyzers
 *   Network  — monitor subscribers, phone tokens, WS clients
 *   Relay    — Phase 7 RTMP destinations (if any)
 *   Raw      — full JSON (collapsed)
 */
export default function DebugPanel({ eventId, isLive }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!eventId || !open) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await liveApi.getDebug(eventId);
        if (!cancelled) { setData(d); setErr(""); }
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e));
      }
    };
    load();
    if (!autoRefresh) return undefined;
    const id = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [eventId, open, autoRefresh]);

  const overall = useMemo(() => {
    if (!data) return { tone: "gray", label: "loading" };
    if (err) return { tone: "red", label: "error" };
    const n = data.issues_count ?? 0;
    if (n === 0 && data.live_in_process) return { tone: "green", label: "healthy" };
    if (n === 0 && !data.live_in_process) return { tone: "gray", label: "not live" };
    if (n <= 2) return { tone: "amber", label: `${n} issue${n > 1 ? "s" : ""}` };
    return { tone: "red", label: `${n} issues` };
  }, [data, err]);

  return (
    <div className="ui-card mt-4">
      {/* Header bar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Activity size={14} className="text-accent2" />
        <span className="text-sm font-bold uppercase tracking-wider text-white">
          Debug
        </span>
        <HealthPill tone={overall.tone} label={overall.label} />
        <span className="ml-auto text-[10px] text-gray-500">
          {isLive ? "LIVE · polling every 2s" : "preview only"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Auto-refresh toggle + manual refresh */}
          <div className="flex items-center gap-3 text-[11px]">
            <label className="flex items-center gap-2 cursor-pointer text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-accent"
              />
              auto-refresh
            </label>
            <button
              onClick={() => liveApi.getDebug(eventId).then(setData).catch((e) => setErr(e.message))}
              className="inline-flex items-center gap-1 text-gray-400 hover:text-white"
            >
              <RefreshCw size={11} /> refresh now
            </button>
            {err && (
              <span className="text-[11px] text-red-400 ml-auto truncate" title={err}>
                {err}
              </span>
            )}
          </div>

          {!data ? (
            <div className="text-[11px] text-gray-500 italic">Loading snapshot…</div>
          ) : (
            <>
              <IssuesBlock issues={data.issues || []} />
              <SessionBlock data={data} />
              <CamerasBlock cams={data.cameras || {}} />
              <NetworkBlock data={data} />
              <RelayBlock relay={data.relay} />
              <RawJsonBlock data={data} open={rawOpen} onToggle={() => setRawOpen(v => !v)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── sub-components ────────────────────────────────────────────────── */

function HealthPill({ tone, label }) {
  const cls =
    tone === "green" ? "bg-green-900/40 border-green-700/60 text-green-300"
    : tone === "amber" ? "bg-amber-900/40 border-amber-700/60 text-amber-300"
    : tone === "red" ? "bg-red-900/40 border-red-700/60 text-red-300"
    : "bg-white/5 border-white/10 text-gray-400";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function IssuesBlock({ issues }) {
  if (!issues.length) {
    return (
      <Block title="Issues" icon={<CheckCircle2 size={12} className="text-green-400" />}>
        <div className="text-[11px] text-green-400">No issues detected.</div>
      </Block>
    );
  }
  return (
    <Block title={`Issues (${issues.length})`} icon={<AlertTriangle size={12} className="text-amber-400" />}>
      <ul className="space-y-1">
        {issues.map((msg, i) => (
          <li key={i} className="text-[11px] text-amber-300 flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">•</span>
            <code className="font-mono text-[11px] whitespace-pre-wrap break-all">{msg}</code>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function SessionBlock({ data }) {
  const d = data.director;
  return (
    <Block title="Session" icon={<Radio size={12} className="text-accent2" />}>
      <Row k="Live in process" v={String(data.live_in_process)} ok={data.live_in_process} />
      <Row k="Decisions total" v={data.decisions_total} />
      <Row k="Pipeline tasks" v={data.pipeline_tasks ? `${data.pipeline_tasks.alive}/${data.pipeline_tasks.total} alive` : "—"} />
      <Row k="WS clients" v={data.ws_clients ?? 0} />
      {d && (
        <>
          <Divider />
          <Row k="Director running" v={String(d.running)} ok={d.running} />
          <Row k="Current cam" v={d.current_cam || "—"} />
          <Row k="Current layout" v={<code className="text-accent2">{d.current_layout}</code>} />
          <Row k="Pinned" v={d.pin || "—"} />
          <Row k="Blacklisted" v={d.blacklist.length ? d.blacklist.join(", ") : "—"} />
          <Row k="In bridge" v={String(d.in_bridge)} />
          <Row k="Last cut at" v={d.last_cut_t ? `${d.last_cut_t.toFixed(2)}s` : "—"} />
        </>
      )}
    </Block>
  );
}

function CamerasBlock({ cams }) {
  const entries = Object.values(cams);
  if (!entries.length) {
    return (
      <Block title="Cameras" icon={<Smartphone size={12} className="text-accent2" />}>
        <div className="text-[11px] text-gray-500">No cameras on this event.</div>
      </Block>
    );
  }
  return (
    <Block title={`Cameras (${entries.length})`} icon={<Smartphone size={12} className="text-accent2" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {entries.map((c) => <CamCard key={c.cam_id} c={c} />)}
      </div>
    </Block>
  );
}

function CamCard({ c }) {
  const w = c.webrtc_worker;
  const r = c.ring;
  const a = c.analyzers;

  const workerOk = w?.running;
  const framesArriving = (r?.fps ?? 0) >= 1.0;
  const tone =
    !w ? "gray"
    : !workerOk ? "red"
    : !framesArriving && (w.chunks_in || 0) > 10 ? "amber"
    : "green";

  return (
    <div className="bg-black/40 border border-border rounded p-2.5 text-[11px]">
      <div className="flex items-center justify-between mb-1.5">
        <code className="font-mono font-semibold text-white">{c.cam_id}</code>
        <HealthPill tone={tone} label={tone === "green" ? "flowing" : tone === "amber" ? "slow" : tone === "red" ? "down" : "—"} />
      </div>

      {w ? (
        <>
          <Row k="Chunks in" v={w.chunks_in} small />
          <Row k="Chunks dropped" v={w.chunks_dropped} small warn={w.chunks_dropped > 0} />
          <Row k="Frames decoded" v={w.frames_decoded} small ok={w.frames_decoded > 0} />
          <Row k="Audio packets" v={w.audio_packets_decoded} small ok={w.audio_packets_decoded > 0} />
          <Row k="FFmpeg restarts" v={`${w.ffmpeg_restarts_video}v / ${w.ffmpeg_restarts_audio}a`} small warn={(w.ffmpeg_restarts_video + w.ffmpeg_restarts_audio) > 0} />
          <Row k="Queue" v={`${w.queue_depth}/${w.queue_capacity}`} small warn={w.queue_depth >= w.queue_capacity} />
          <Row k="Uptime" v={`${w.uptime_s}s`} small />
          {w.last_error ? <div className="text-red-400 text-[10px] mt-1 truncate" title={w.last_error}>err: {w.last_error}</div> : null}
        </>
      ) : (
        <div className="text-gray-500 italic">no webrtc worker (RTMP cam or not live yet)</div>
      )}

      {r && !r.error ? (
        <>
          <Divider />
          <Row k="Ring fps" v={r.fps} small ok={r.fps >= 1.0} warn={r.fps < 1.0} />
          <Row k="Frames buffered" v={r.frames_buffered} small />
          <Row k="Dropped by ring" v={r.dropped_frames} small warn={r.dropped_frames > 0} />
          <Row k="Lag" v={`${r.lag_ms}ms`} small warn={r.lag_ms > 500} />
        </>
      ) : null}

      {a ? (
        <>
          <Divider />
          <Row k="Analyzers" v={`${a.alive}/${a.total} alive`} small ok={a.alive === a.total} warn={a.alive < a.total} />
        </>
      ) : null}
    </div>
  );
}

function NetworkBlock({ data }) {
  const subs = data.monitor_subscribers || {};
  return (
    <Block title="Network" icon={<Wifi size={12} className="text-accent2" />}>
      <Row k="Phone tokens active" v={data.phone_tokens_active ?? 0} />
      {Object.keys(subs).length ? (
        <>
          <Divider />
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Monitor subscribers</div>
          {Object.entries(subs).map(([k, n]) => (
            <Row key={k} k={k} v={`${n} client${n === 1 ? "" : "s"}`} small />
          ))}
        </>
      ) : (
        <div className="text-[11px] text-gray-500 italic">No monitor clients attached.</div>
      )}
    </Block>
  );
}

function RelayBlock({ relay }) {
  if (!relay || (Array.isArray(relay) && !relay.length)) return null;
  return (
    <Block title="Relay destinations" icon={<BarChart3 size={12} className="text-accent2" />}>
      {relay.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
          <HealthPill
            tone={r.state === "live" ? "green" : (r.state === "failed" ? "red" : "amber")}
            label={r.state}
          />
          <code className="font-mono text-white flex-1 truncate">{r.destination_id || r.error}</code>
          <span className="text-gray-500">uptime {r.uptime_s ?? 0}s</span>
          {r.last_error ? <span className="text-red-400 truncate max-w-[40%]" title={r.last_error}>err: {r.last_error}</span> : null}
        </div>
      ))}
    </Block>
  );
}

function RawJsonBlock({ data, open, onToggle }) {
  const copyJson = () => {
    try { navigator.clipboard.writeText(JSON.stringify(data, null, 2)); } catch {}
  };
  return (
    <Block title="Raw snapshot (JSON)" icon={<Cpu size={12} className="text-accent2" />}>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={onToggle}
          className="text-[11px] text-gray-400 hover:text-white inline-flex items-center gap-1"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          {open ? "hide" : "show"}
        </button>
        <button
          onClick={copyJson}
          className="ml-auto text-[11px] text-gray-400 hover:text-white inline-flex items-center gap-1"
        >
          <Copy size={11} /> copy
        </button>
      </div>
      {open && (
        <pre className="bg-black/60 border border-border rounded p-2 text-[10px] leading-relaxed overflow-x-auto max-h-64 overflow-y-auto text-gray-300">
{JSON.stringify(data, null, 2)}
        </pre>
      )}
    </Block>
  );
}

function Block({ title, icon, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500 mb-2">
        {icon}
        <span>{title}</span>
      </div>
      <div className="bg-black/20 border border-border rounded p-2.5">{children}</div>
    </section>
  );
}

function Row({ k, v, ok, warn, small }) {
  const valueCls = ok ? "text-green-300" : warn ? "text-amber-300" : "text-gray-200";
  return (
    <div className={`flex items-baseline gap-2 ${small ? "py-0.5" : "py-0.5"}`}>
      <span className={`text-gray-500 ${small ? "text-[11px]" : "text-[11px]"} w-[45%] flex-shrink-0 truncate`}>{k}</span>
      <span className={`font-mono ${small ? "text-[11px]" : "text-[12px]"} ${valueCls} truncate`}>{v}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50 my-1.5" />;
}
