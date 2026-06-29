import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Download, Mic, Scissors, Film, Layers, Wand2, UploadCloud,
  ChevronRight, Activity, CheckCircle2, XCircle, ArrowRightCircle,
  Loader2, AlertCircle, Cpu, Boxes, Clock, AlertTriangle, X,
  Sparkles, Gauge, Users, Globe, Search,
} from "lucide-react";
import { adminApi } from "../api/client";
import "../theme/admin-theme.css";

// ── Station visual metadata. Keep keys in sync with the backend
//    services/stage_events.STATIONS order. ────────────────────────────────
const STATION_META = {
  // Render → delivery lane
  ingest:     { icon: Download,    color: "var(--adm-series-2)" },
  transcribe: { icon: Mic,         color: "var(--adm-series-3)" },
  cut_plan:   { icon: Scissors,    color: "var(--adm-series-1)" },
  trim:       { icon: Film,        color: "var(--adm-series-5)" },
  compose:    { icon: Layers,      color: "var(--adm-series-6)", hot: true },
  brand:      { icon: Wand2,       color: "var(--adm-series-4)" },
  upload:     { icon: UploadCloud, color: "var(--adm-cyan)" },
  // Re-render (editor) lane
  slice:      { icon: Scissors,    color: "var(--adm-series-1)" },
  encode:     { icon: Cpu,         color: "var(--adm-series-5)" },
  // SEO pipeline lane
  compare:     { icon: Search,    color: "var(--adm-series-2)" },
  generate:    { icon: Sparkles,  color: "var(--adm-series-3)" },
  score:       { icon: Gauge,     color: "var(--adm-series-1)" },
  per_channel: { icon: Users,     color: "var(--adm-series-4)" },
  platform:    { icon: Globe,     color: "var(--adm-cyan)" },
  // Channel-videos lane (editor "Render all channels")
  queued:      { icon: Clock,        color: "var(--adm-series-2)" },
  rendering:   { icon: Film,         color: "var(--adm-series-6)", hot: true },
  ready:       { icon: CheckCircle2, color: "var(--adm-series-4)" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function KpiTile({ variant = "", label, value, sub }) {
  return (
    <div className={`adm-kpi ${variant}`}>
      <div className="adm-kpi__label">{label}</div>
      <div className="adm-kpi__value tabular-nums">{value}</div>
      {sub ? <div className="adm-kpi__delta">{sub}</div> : null}
    </div>
  );
}

function ageSeconds(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

// (Legacy StationCol / UnitCard / BeltArrow removed — the conveyor is now the
//  animated Highway below.)

const EVT_ICON = {
  entered: ArrowRightCircle,
  exited: CheckCircle2,
  failed: XCircle,
  progressed: Activity,
};
const EVT_COLOR = {
  entered: "var(--adm-cyan-2)",
  exited: "var(--adm-success)",
  failed: "var(--adm-danger)",
  progressed: "var(--adm-text-3)",
};

function EventRow({ ev, onInspect }) {
  const Icon = EVT_ICON[ev.status] || Activity;
  const color = EVT_COLOR[ev.status] || "var(--adm-text-3)";
  const label = ev.stage;
  // Resolve which unit this event belongs to so the row can deep-link.
  const cardId = ev.upload_job_id != null
    ? `u${ev.upload_job_id}`
    : (ev.job_id != null ? `j${ev.job_id}` : null);
  const clickable = !!(onInspect && cardId);
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onInspect({ id: cardId }) : undefined}
      className={`adm-evt flex items-center gap-2 px-2 py-1 rounded w-full text-left ${clickable ? "cursor-pointer" : ""}`}
      style={ev.status === "failed" ? { background: "rgba(239,68,68,0.06)" } : undefined}
      title={clickable ? "Click to inspect this unit" : undefined}
    >
      <Icon size={12} style={{ color }} />
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--adm-text-4)" }}>
        {label}
      </span>
      <span className="text-[11px] truncate flex-1" style={{ color: "var(--adm-text-2)" }}>
        {ev.label || (ev.upload_job_id ? `unit ${ev.upload_job_id}` : "—")}
      </span>
      <span className="text-[9px] tabular-nums" style={{ color: "var(--adm-text-5)" }}>
        {ev.user_id != null ? `u${ev.user_id}` : ""}
      </span>
    </Tag>
  );
}

const SEV_COLOR = {
  ok: "var(--adm-success)",
  info: "var(--adm-cyan-2)",
  warn: "var(--adm-warning)",
  error: "var(--adm-danger)",
};
const SEV_ICON = {
  ok: CheckCircle2,
  info: Activity,
  warn: AlertTriangle,
  error: XCircle,
};

/** card.id is "u<UploadJobV2 id>" (publish) or "j<render Job id>".
 *  Negative ids are synthetic demo units — not inspectable (no DB row). */
function parseUnitId(cardId) {
  if (!cardId) return null;
  const k = cardId[0];
  const n = parseInt(cardId.slice(1), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return { kind: k === "u" ? "publish" : "render", id: n };
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1 border-b" style={{ borderColor: "var(--adm-divider)" }}>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--adm-text-4)" }}>{label}</span>
      <span className="text-[11px] tabular-nums text-right break-all" style={{ color: "var(--adm-text-2)" }}>{String(value)}</span>
    </div>
  );
}

function InspectModal({ open, loading, detail, error, onClose }) {
  if (!open) return null;
  const diag = detail?.diagnosis || {};
  const sev = diag.severity || "info";
  const SevIcon = SEV_ICON[sev] || Activity;
  const sevColor = SEV_COLOR[sev] || "var(--adm-text-3)";
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "rgba(2,6,23,0.66)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="adm-card-glass w-full max-w-lg max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--adm-text-4)" }}>
              {detail?.kind === "render" ? "Render unit" : "Publish unit"} · {detail?.id ?? ""}
            </div>
            <div className="text-sm font-medium truncate" style={{ color: "var(--adm-text)" }}>
              {detail?.label || "—"}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: "var(--adm-text-3)" }}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm py-6" style={{ color: "var(--adm-text-3)" }}>
            <Loader2 size={15} className="animate-spin" /> Inspecting…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded"
               style={{ color: "var(--adm-danger)", background: "rgba(239,68,68,0.08)" }}>
            <AlertCircle size={14} /> {error}
          </div>
        ) : detail ? (
          <>
            {/* Diagnosis banner — the "why is it stuck" answer */}
            <div className="rounded-lg p-3 mb-4 flex items-start gap-2"
                 style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${sevColor}` }}>
              <SevIcon size={16} style={{ color: sevColor, marginTop: 1 }} />
              <div className="min-w-0">
                <div className="text-[12px] font-medium" style={{ color: "var(--adm-text)" }}>
                  {diag.reason || "—"}
                </div>
                {diag.detail ? (
                  <div className="text-[11px] mt-1 break-words" style={{ color: "var(--adm-text-3)" }}>
                    {diag.detail}
                  </div>
                ) : null}
                {diag.stuck ? (
                  <span className="adm-chip adm-chip--amber mt-2">needs attention</span>
                ) : null}
              </div>
            </div>

            {/* Raw state */}
            <div className="mb-4">
              <Field label="status" value={detail.status} />
              <Field label="current stage" value={detail.current_stage} />
              <Field label="user" value={detail.user_id != null ? `u${detail.user_id}` : null} />
              <Field label="channel" value={detail.channel_id} />
              <Field label="path" value={detail.upload_path} />
              <Field label="kind" value={detail.publish_kind} />
              <Field label="privacy" value={detail.privacy_status} />
              <Field label="attempts" value={detail.attempts} />
              <Field label="bytes uploaded" value={detail.bytes_uploaded} />
              <Field label="youtube id" value={detail.youtube_video_id} />
              <Field label="claimed by" value={detail.claimed_by} />
              <Field label="last error" value={detail.last_error} />
              <Field label="started" value={detail.started_at ? timeAgo(detail.started_at) + " ago" : null} />
              <Field label="next attempt" value={detail.next_attempt_at} />
              <Field label="lease expires" value={detail.lease_expires_at} />
            </div>

            {/* Recent transitions for this unit */}
            {detail.events && detail.events.length ? (
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--adm-text-4)" }}>
                  Stage history
                </div>
                <div className="flex flex-col gap-0.5">
                  {detail.events.slice().reverse().map((ev, i) => <EventRow key={i} ev={ev} />)}
                </div>
              </div>
            ) : null}

            {/* Render log tail */}
            {detail.log_tail ? (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--adm-text-4)" }}>
                  Log tail
                </div>
                <pre className="text-[10px] p-2 rounded overflow-x-auto whitespace-pre-wrap"
                     style={{ background: "var(--adm-bg)", color: "var(--adm-text-3)", maxHeight: 180 }}>
                  {detail.log_tail}
                </pre>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Highway visualisation ──────────────────────────────────────────────────
// Each belt is a road; stations are roadside gates; live units are vehicles
// that GLIDE from gate to gate as they progress (keyed by unit id, positioned
// by their station — when the next poll moves a unit forward, only its `left`
// changes, so CSS transitions it smoothly like a car driving on). Real data
// only — no synthetic units. Honours prefers-reduced-motion.
const HIGHWAY_CSS = `
.adm-hw{position:relative;height:178px;border-radius:12px;overflow:hidden;border:1px solid var(--adm-border);background:radial-gradient(130% 100% at 50% 0,rgba(30,41,59,.55),rgba(2,6,23,.65));}
.adm-hw-road{position:absolute;left:1.5%;right:1.5%;top:64px;height:80px;border-radius:9px;background:linear-gradient(180deg,#171f30,#0b101b);border:1px solid rgba(148,163,184,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.03);}
.adm-hw-dash{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);background-image:linear-gradient(90deg,rgba(56,189,248,.55) 0 30px,transparent 30px 64px);background-size:64px 100%;animation:adm-hw-move 1.2s linear infinite;opacity:.85;}
@keyframes adm-hw-move{to{background-position:64px 0;}}
.adm-hw-gate{position:absolute;transform:translateX(-50%);top:8px;width:96px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;pointer-events:none;}
.adm-hw-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:1px solid;transition:box-shadow .3s ease,border-color .3s ease;}
.adm-hw-name{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--adm-text-4);line-height:1.05;max-width:96px;}
.adm-hw-count{font-size:10px;font-variant-numeric:tabular-nums;padding:0 6px;border-radius:9px;border:1px solid var(--adm-border);background:rgba(255,255,255,.05);color:var(--adm-text-4);}
.adm-vehicle{position:absolute;transform:translateX(-50%);display:inline-flex;align-items:center;gap:5px;max-width:122px;padding:3px 9px;border-radius:999px;border:1px solid;background:rgba(13,19,32,.94);color:var(--adm-text-2);font-size:10px;line-height:1;box-shadow:0 3px 10px rgba(0,0,0,.5);transition:left .65s cubic-bezier(.22,.61,.36,1),top .3s ease;z-index:2;}
.adm-vehicle:disabled{cursor:default;}
.adm-vehicle-dot{width:6px;height:6px;border-radius:999px;flex:none;}
.adm-vehicle-lab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.adm-vehicle-more{position:absolute;transform:translateX(-50%);font-size:9px;color:var(--adm-text-4);background:rgba(13,19,32,.94);border:1px solid var(--adm-border);border-radius:999px;padding:1px 8px;z-index:2;}
.adm-hw-empty{position:absolute;left:0;right:0;top:64px;height:80px;display:flex;align-items:center;justify-content:center;font-size:11px;font-style:italic;color:var(--adm-text-5);}
@media (prefers-reduced-motion:reduce){.adm-hw-dash{animation:none;}.adm-vehicle{transition:none;}}
`;

function Highway({ belt, onInspect }) {
  const stations = belt.stations || [];
  const n = stations.length;
  if (!n) return null;
  const slot = 100 / (n + 1);          // gate i centred at (i+1)*slot %
  const MAX_VEH = 3;                   // vehicles drawn per gate before "+N"
  const totalUnits = stations.reduce((a, s) => a + (s.cards?.length || 0), 0);

  // Flat, id-keyed vehicle list so a unit keeps its identity across polls and
  // glides when its station (→ x) changes.
  const vehicles = [];
  stations.forEach((s, i) => {
    (s.cards || []).slice(0, MAX_VEH).forEach((c, vi) => {
      vehicles.push({ card: c, x: (i + 1) * slot, top: 70 + vi * 21 });
    });
  });

  return (
    <div className="adm-hw" role="img" aria-label={`${belt.label} pipeline — ${totalUnits} unit(s) in flight`}>
      <div className="adm-hw-road"><div className="adm-hw-dash" /></div>

      {/* Roadside gates (stations) */}
      {stations.map((s, i) => {
        const meta = STATION_META[s.key] || {};
        const Icon = meta.icon || Activity;
        const active = (s.count || 0) > 0;
        const col = active ? (meta.color || "var(--adm-cyan)") : "var(--adm-text-4)";
        return (
          <div key={s.key} className="adm-hw-gate" style={{ left: `${(i + 1) * slot}%` }}>
            <div
              className="adm-hw-icon"
              style={{ color: col, borderColor: col, boxShadow: active ? `0 0 16px -3px ${meta.color}` : "none" }}
            >
              <Icon size={15} />
            </div>
            <div className="adm-hw-name">{s.label}</div>
            <div
              className="adm-hw-count"
              style={active ? { color: "#fff", background: meta.color, borderColor: meta.color } : undefined}
            >
              {s.count || 0}{s.queue_depth > 0 ? ` · ${s.queue_depth}q` : ""}
            </div>
          </div>
        );
      })}

      {/* Vehicles (units) — id-keyed so they glide between gates */}
      {vehicles.map(({ card: c, x, top }) => {
        const isRender = c.kind === "render";
        // Channel-render vehicles share the parent render-job id, so inspecting
        // would open the wrong unit — keep them display-only.
        const clickable = belt.key !== "channel_render" && !!parseUnitId(c.id);
        const stale = clickable && ageSeconds(c.since) > 900;
        const col = isRender ? "var(--adm-violet-2)" : "var(--adm-cyan-2)";
        return (
          <button
            key={c.id}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => onInspect?.(c) : undefined}
            className="adm-vehicle"
            style={{ left: `${x}%`, top: `${top}px`, borderColor: stale ? "var(--adm-warning)" : col }}
            title={clickable ? `${c.label} · u${c.user_id ?? "?"} — click to inspect` : c.label}
          >
            <span className="adm-vehicle-dot" style={{ background: stale ? "var(--adm-warning)" : col }} />
            <span className="adm-vehicle-lab">{c.label}</span>
          </button>
        );
      })}

      {/* "+N" overflow markers per gate */}
      {stations.map((s, i) => {
        const extra = (s.count || 0) - Math.min(s.cards?.length || 0, MAX_VEH);
        if (extra <= 0) return null;
        return (
          <div key={`more-${s.key}`} className="adm-vehicle-more" style={{ left: `${(i + 1) * slot}%`, top: `${70 + MAX_VEH * 21}px` }}>
            +{extra}
          </div>
        );
      })}

      {totalUnits === 0 ? <div className="adm-hw-empty">no traffic — units appear here as jobs run</div> : null}
    </div>
  );
}

export default function AdminPipelineFlow() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  // Click-to-inspect state.
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectDetail, setInspectDetail] = useState(null);
  const [inspectError, setInspectError] = useState("");

  const onInspect = useCallback(async (card) => {
    const parsed = parseUnitId(card?.id);
    if (!parsed) return;
    setInspectOpen(true);
    setInspectLoading(true);
    setInspectError("");
    setInspectDetail(null);
    try {
      const d = await adminApi.pipelineUnit(parsed.kind, parsed.id);
      setInspectDetail(d);
    } catch (e) {
      setInspectError(e?.message || "failed to inspect unit");
    } finally {
      setInspectLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await adminApi.pipelineFlow();
      setData(d);
      setErr("");
    } catch (e) {
      setErr(e?.message || "failed to load pipeline flow");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) await load();
      if (alive) timer.current = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--adm-text-3)" }}>
        <Loader2 size={16} className="animate-spin" /> Loading pipeline…
      </div>
    );
  }

  const stations = data?.stations || [];
  // Multiple belts: render → delivery, editor re-renders, SEO pipeline.
  // Fall back to a single render belt if the backend predates `belts`.
  const belts = data?.belts || (stations.length
    ? [{ key: "render", label: "Render → delivery", stations }]
    : []);
  const totals = data?.totals || {};
  const events = (data?.recent_events || []).slice().reverse().slice(0, 26);
  const factoryOn = !!data?.factory_enabled;
  const workersOn = !!data?.factory_workers_enabled;
  const gateOn = !!data?.encode_gate?.enabled;
  const gateEncode = data?.encode_gate?.gates?.encode || {};
  const gateHeld = gateEncode.held ?? 0;
  const gateMax = gateEncode.max ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="adm-section-title">
          <Boxes size={14} /> Pipeline Flow — staged factory
        </div>
        <div className="flex items-center gap-2">
          <span className={`adm-chip ${factoryOn ? "adm-chip--emerald" : ""}`}>
            <Cpu size={11} /> Engine {factoryOn ? "ON" : "OFF"}
          </span>
          {workersOn ? (
            <span className="adm-chip adm-chip--violet">
              <span className="adm-dot adm-dot--live" /> Workers live
            </span>
          ) : null}
          {gateOn ? (
            <span className="adm-chip adm-chip--amber" title="Simultaneous NVENC encodes across the fleet (trim + compose)">
              <Cpu size={11} /> Encode {gateHeld}/{gateMax}
            </span>
          ) : null}
        </div>
      </div>

      {err ? (
        <div
          className="flex items-center gap-2 text-[12px] px-3 py-2 rounded"
          style={{ color: "var(--adm-danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <AlertCircle size={14} /> {err}
        </div>
      ) : null}

      {/* KPI rail */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="IN FLIGHT" value={totals.in_flight ?? 0} sub="units in the machine" />
        <KpiTile variant="adm-kpi--indigo" label="QUEUED" value={totals.queued_backlog ?? 0} sub="waiting to enter" />
        <KpiTile variant="adm-kpi--emerald" label="COMPLETED TODAY" value={totals.completed_today ?? 0} />
        <KpiTile variant="adm-kpi--rose" label="FAILED TODAY" value={totals.failed_today ?? 0} />
        <KpiTile variant="adm-kpi--violet" label="DELIVERED (SESSION)" value={data?.counters?.completed ?? 0} />
      </div>

      {/* The conveyors — one belt per lane: render → delivery, editor
          re-renders, and the SEO pipeline. Each tracks live units. */}
      <div className="flex flex-col gap-4">
        <style>{HIGHWAY_CSS}</style>
        {belts.map((belt) => {
          const subtitle = belt.key === "render"
            ? "Source video → master + shorts → per-channel delivery"
            : belt.key === "rerender"
              ? "Canvas-editor re-renders (one clip at a time)"
              : belt.key === "seo"
                ? "Compare → generate → score → per-channel → per-platform"
                : belt.key === "channel_render"
                  ? "Editor 'Render all channels' — each channel's branded clip + its own intro"
                  : "";
          return (
            <div key={belt.key}>
              <div className="text-[10px] uppercase tracking-[0.14em] mb-2 flex items-center gap-2"
                   style={{ color: "var(--adm-text-4)" }}>
                <span style={{ color: "var(--adm-text-3)" }}>{belt.label}</span>
                {subtitle ? <span>· {subtitle}</span> : null}
              </div>
              <Highway belt={belt} onInspect={onInspect} />
            </div>
          );
        })}
        {/* Legend (applies to the render belt) */}
        <div className="flex items-center gap-4 text-[10px]" style={{ color: "var(--adm-text-4)" }}>
          <span className="flex items-center gap-1.5">
            <span className="adm-dot" style={{ background: "var(--adm-violet-2)" }} /> render unit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="adm-dot" style={{ background: "var(--adm-cyan-2)" }} /> publish unit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="adm-dot" style={{ background: "var(--adm-series-6)" }} /> compose = GPU bottleneck (paces the belt)
          </span>
        </div>
      </div>

      {/* Live event ticker */}
      <div className="adm-card p-3">
        <div className="adm-section-title mb-2">
          <Clock size={13} /> Live stage transitions
        </div>
        <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-[11px] italic" style={{ color: "var(--adm-text-5)" }}>
              No recent activity — transitions appear here as units move between stations.
            </div>
          ) : (
            events.map((ev, idx) => (
              <EventRow
                key={`${ev.ts}-${ev.upload_job_id}-${idx}`}
                ev={ev}
                onInspect={onInspect}
              />
            ))
          )}
        </div>
      </div>

      <InspectModal
        open={inspectOpen}
        loading={inspectLoading}
        detail={inspectDetail}
        error={inspectError}
        onClose={() => setInspectOpen(false)}
      />
    </div>
  );
}
