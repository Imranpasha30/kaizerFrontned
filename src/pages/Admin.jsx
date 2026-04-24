import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  Activity, Cpu, Users, Briefcase, Sparkles, Radio, Shield, RefreshCw,
  Loader2, Search, ChevronLeft, ChevronRight, X, AlertCircle, CheckCircle2,
  UserCog, HardDrive, Server, Thermometer, Database, Clock, ExternalLink,
  BarChart3, Eye, EyeOff,
} from "lucide-react";
import { adminApi } from "../api/client";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Modal from "../components/Modal";

// ──────────────────────────────────────────────────────────────────────────
// Small utilities
// ──────────────────────────────────────────────────────────────────────────

/** Never let raw secret fields slip into the UI.  We sanitise at render time
 *  as a second line of defence — the backend already redacts these. */
const SECRET_KEYS = new Set([
  "access_token", "refresh_token", "client_secret", "api_key",
  "token", "password", "secret", "authorization",
]);

function maskStreamKey(v) {
  if (!v || typeof v !== "string") return "";
  if (v.length <= 4) return "••••";
  return `${"•".repeat(Math.max(6, Math.min(12, v.length - 4)))}${v.slice(-4)}`;
}

function isSecretKey(k) {
  if (!k) return false;
  const kk = String(k).toLowerCase();
  if (SECRET_KEYS.has(kk)) return true;
  // cover stream_key / rtmp_key / ingest_key / youtube_refresh_token etc.
  if (kk.endsWith("_key") || kk.endsWith("_token") || kk.endsWith("_secret")) return true;
  return false;
}

/** Render a plain key/value pair, masking anything that looks secret. */
function SafeKV({ k, v }) {
  if (v == null) return null;
  const secret = isSecretKey(k);
  const shown = secret ? (typeof v === "string" ? maskStreamKey(v) : "••••") : String(v);
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-gray-500 w-32 shrink-0 truncate">{k}</span>
      <span className={`font-mono ${secret ? "text-gray-500" : "text-gray-200"} truncate`}>
        {shown}
      </span>
    </div>
  );
}

function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const now = Date.now();
  const diff = Math.round((now - t) / 1000);
  if (diff < 5)     return "just now";
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return "yesterday";
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtBytes(gb) {
  if (gb == null || Number.isNaN(Number(gb))) return "—";
  const n = Number(gb);
  if (n < 0.01) return `${Math.round(n * 1024)} MB`;
  if (n < 1024) return `${n.toFixed(1)} GB`;
  return `${(n / 1024).toFixed(2)} TB`;
}

function fmtMoney(usd) {
  if (usd == null || Number.isNaN(Number(usd))) return "—";
  const n = Number(usd);
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function fmtInt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const s = Math.floor(Number(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (s < 86400) return `${h}h ${m}m`;
  const d = Math.floor(s / 86400);
  return `${d}d ${h % 24}h`;
}

// ──────────────────────────────────────────────────────────────────────────
// Page-hidden-aware polling hook
// ──────────────────────────────────────────────────────────────────────────

function usePolling(fn, intervalMs, { enabled = true, deps = [] } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer = null;

    async function tick() {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(tick, intervalMs);
        return;
      }
      try { await fnRef.current(); } catch { /* swallow; inner fn reports */ }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }

    tick();
    const onVis = () => { if (!document.hidden) { /* trigger immediate */ clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

// ──────────────────────────────────────────────────────────────────────────
// Tiny inline SVG charts — no library, ~60 LoC total.
// ──────────────────────────────────────────────────────────────────────────

/**
 * SparkLine — a polyline of values 0..n with nice padding + last-point dot.
 * `values` is a numeric array.  `max` clamps the Y axis (defaults to data max).
 */
function SparkLine({ values = [], width = 220, height = 44, color = "#e74c3c", max }) {
  const pts = useMemo(() => {
    if (!values.length) return { poly: "", fill: "", last: null };
    const vmax = max != null ? max : Math.max(1, ...values);
    const dx = values.length > 1 ? width / (values.length - 1) : 0;
    const coords = values.map((v, i) => {
      const x = i * dx;
      const y = height - (Math.max(0, v) / vmax) * (height - 4) - 2;
      return [x, y];
    });
    const poly = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const fill = `${coords[0][0]},${height} ${poly} ${coords[coords.length - 1][0]},${height}`;
    return { poly, fill, last: coords[coords.length - 1] };
  }, [values, width, height, max]);

  return (
    <svg width={width} height={height} className="block">
      {pts.fill && (
        <polygon points={pts.fill} fill={color} opacity="0.10" />
      )}
      {pts.poly && (
        <polyline points={pts.poly} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.last && (
        <circle cx={pts.last[0]} cy={pts.last[1]} r={2.5} fill={color} />
      )}
    </svg>
  );
}

/**
 * BarChart — horizontal bars of {label, value} rows.  Good for by-day.
 */
function BarChart({ data = [], valueKey = "value", labelKey = "label", color = "#e74c3c", format = fmtInt, height = 160 }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        const h = Math.max(2, (v / max) * (height - 24));
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
            <div className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {format(v)}
            </div>
            <div
              className="w-full rounded-t transition-all"
              style={{ height: `${h}px`, background: color, opacity: 0.65 + (v / max) * 0.35 }}
              title={`${d[labelKey]}: ${format(v)}`}
            />
            <div className="text-[9px] text-gray-600 truncate w-full text-center">
              {String(d[labelKey] || "").slice(-5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Status pill
// ──────────────────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const cfg = {
    done:       { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",   label: "done" },
    completed:  { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",   label: "completed" },
    processing: { cls: "bg-sky-500/10 text-sky-400 border-sky-500/30",               label: "processing" },
    pending:    { cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",         label: "pending" },
    queued:     { cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",         label: "queued" },
    failed:     { cls: "bg-red-500/10 text-red-400 border-red-500/30",               label: "failed" },
    error:      { cls: "bg-red-500/10 text-red-400 border-red-500/30",               label: "error" },
    cancelled:  { cls: "bg-gray-500/10 text-gray-400 border-gray-500/30",            label: "cancelled" },
  }[s] || { cls: "bg-gray-500/10 text-gray-400 border-gray-500/30", label: s || "unknown" };

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Stat card (big number panel)
// ──────────────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sublabel, accent = "text-accent2", spark }) {
  return (
    <Card className="p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {Icon && <Icon size={13} />} <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent} tabular-nums truncate`}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[11px] text-gray-500 truncate">{sublabel}</div>
      )}
      {spark && <div className="mt-1">{spark}</div>}
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared table shell
// ──────────────────────────────────────────────────────────────────────────

function TableShell({ headers, children, empty = "No rows" }) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-panel">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0c0c0c] text-left">
            <tr>
              {headers.map((h) => (
                <th key={h.key} className={`px-3 py-2 font-medium text-gray-400 ${h.className || ""}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {React.Children.count(children) === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-gray-600">
                  {empty}
                </td>
              </tr>
            ) : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Error banner
// ──────────────────────────────────────────────────────────────────────────

function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 bg-red-500/5 border border-red-500/30 rounded text-xs text-red-300">
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 break-words">{error}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-200">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// System snapshot hook — shared by Overview + System tabs
// ──────────────────────────────────────────────────────────────────────────

function useSystemHistory(enabled) {
  const [snap, setSnap]       = useState(null);
  const [history, setHistory] = useState([]); // 5 minutes @ 5s = 60 points
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);

  const fetchOnce = useCallback(async () => {
    try {
      const s = await adminApi.system();
      setSnap(s);
      setHistory((prev) => {
        const next = [...prev, {
          t: Date.now(),
          cpu: s?.cpu_percent ?? 0,
          ram: s?.ram_percent ?? 0,
          gpu: s?.gpu?.utilization_percent ?? 0,
          disk: s?.disk_percent ?? 0,
        }];
        return next.slice(-60);
      });
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load /admin/system");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchOnce, 5000, { enabled });

  return { snap, history, error, loading, refetch: fetchOnce };
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ──────────────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { snap, history, error, loading } = useSystemHistory(true);
  const [usage, setUsage]   = useState(null);
  const [loadExtra, setLoadExtra] = useState(true);
  const [usersCount, setUsersCount] = useState(null);
  const [jobsCount, setJobsCount]   = useState(null);
  const [extraErr, setExtraErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [u, users, jobs] = await Promise.allSettled([
          adminApi.geminiUsage(1),
          adminApi.listUsers("", 1, 0),
          adminApi.listJobs({ limit: 1 }),
        ]);
        if (!alive) return;
        if (u.status === "fulfilled") setUsage(u.value);
        if (users.status === "fulfilled") setUsersCount(users.value?.total ?? null);
        if (jobs.status === "fulfilled") setJobsCount(jobs.value?.total ?? jobs.value?.jobs?.length ?? null);
        const firstErr = [u, users, jobs].find((r) => r.status === "rejected");
        if (firstErr) setExtraErr(firstErr.reason?.message || "");
      } finally {
        if (alive) setLoadExtra(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const cpuVals  = history.map((h) => h.cpu);
  const ramVals  = history.map((h) => h.ram);
  const gpuVals  = history.map((h) => h.gpu);

  return (
    <div className="space-y-5">
      <ErrorBanner error={error || extraErr} />

      {/* Top row — big numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Cpu}
          label="CPU"
          value={loading ? "…" : `${Math.round(snap?.cpu_percent ?? 0)}%`}
          sublabel={snap ? `${snap.cpu_count} cores` : ""}
          spark={<SparkLine values={cpuVals} max={100} />}
        />
        <StatCard
          icon={Database}
          label="RAM"
          value={loading ? "…" : `${Math.round(snap?.ram_percent ?? 0)}%`}
          sublabel={snap ? `${fmtBytes(snap.ram_used_gb)} / ${fmtBytes(snap.ram_total_gb)}` : ""}
          spark={<SparkLine values={ramVals} max={100} color="#f39c12" />}
        />
        <StatCard
          icon={Server}
          label="GPU"
          value={loading ? "…" : snap?.gpu ? `${Math.round(snap.gpu.utilization_percent ?? 0)}%` : "n/a"}
          sublabel={snap?.gpu?.name || ""}
          spark={snap?.gpu ? <SparkLine values={gpuVals} max={100} color="#8b5cf6" /> : null}
        />
        <StatCard
          icon={Radio}
          label="Live events running"
          value={loading ? "…" : fmtInt(snap?.live_events_running ?? 0)}
          sublabel="in-process sessions"
          accent={((snap?.live_events_running ?? 0) > 0) ? "text-emerald-400" : "text-gray-300"}
        />
      </div>

      {/* Second row — usage summaries */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Sparkles}
          label="Gemini cost (today)"
          value={loadExtra ? "…" : fmtMoney(usage?.total_cost_usd)}
          sublabel={usage ? `${fmtInt(usage.total_calls)} calls` : ""}
        />
        <StatCard
          icon={Sparkles}
          label="Gemini tokens (today)"
          value={loadExtra ? "…" : fmtInt(usage?.total_tokens)}
          sublabel="prompt + output"
        />
        <StatCard
          icon={Users}
          label="Users (total)"
          value={loadExtra ? "…" : fmtInt(usersCount)}
          sublabel="registered accounts"
        />
        <StatCard
          icon={Briefcase}
          label="Jobs (all-time)"
          value={loadExtra ? "…" : fmtInt(jobsCount)}
          sublabel="across all users"
        />
      </div>

      {/* Process + disk snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-2">Process</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <SafeKV k="pid" v={snap?.process?.pid} />
            <SafeKV k="threads" v={snap?.process?.threads} />
            <SafeKV k="rss" v={snap?.process?.rss_gb != null ? fmtBytes(snap.process.rss_gb) : null} />
            <SafeKV k="uptime" v={snap?.process?.uptime_s != null ? fmtDuration(snap.process.uptime_s) : null} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-gray-500 mb-2">Disk</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <SafeKV k="used" v={snap ? fmtBytes(snap.disk_used_gb) : null} />
            <SafeKV k="total" v={snap ? fmtBytes(snap.disk_total_gb) : null} />
            <SafeKV k="usage" v={snap ? `${Math.round(snap.disk_percent ?? 0)}%` : null} />
            <SafeKV k="timestamp" v={snap?.timestamp ? relTime(snap.timestamp) : null} />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: System
// ──────────────────────────────────────────────────────────────────────────

function MetricBar({ label, value, suffix = "%", color = "#e74c3c" }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-100 tabular-nums">
          {v.toFixed(1)}{suffix}
        </span>
      </div>
      <div className="h-2 bg-[#0a0a0a] rounded overflow-hidden border border-border">
        <div className="h-full transition-all" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  );
}

function SystemTab() {
  const { snap, history, error, loading, refetch } = useSystemHistory(true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Polling every 5s • {history.length} samples • auto-pauses when tab is hidden
        </div>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={refetch}>
          Refresh now
        </Button>
      </div>

      <ErrorBanner error={error} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
            <Cpu size={14} /> CPU
            {snap && <span className="text-xs font-normal text-gray-500">• {snap.cpu_count} cores</span>}
          </div>
          <MetricBar label="Utilisation" value={snap?.cpu_percent ?? 0} />
          <SparkLine values={history.map((h) => h.cpu)} max={100} width={440} height={60} />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
            <Database size={14} /> RAM
            {snap && <span className="text-xs font-normal text-gray-500">• {fmtBytes(snap.ram_total_gb)} total</span>}
          </div>
          <MetricBar label="Used" value={snap?.ram_percent ?? 0} color="#f39c12" />
          <div className="text-xs text-gray-500">
            {snap ? `${fmtBytes(snap.ram_used_gb)} of ${fmtBytes(snap.ram_total_gb)}` : "—"}
          </div>
          <SparkLine values={history.map((h) => h.ram)} max={100} color="#f39c12" width={440} height={60} />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
            <Server size={14} /> GPU
            {snap?.gpu && <span className="text-xs font-normal text-gray-500 truncate">• {snap.gpu.name}</span>}
          </div>
          {snap?.gpu ? (
            <>
              <MetricBar label="Utilisation" value={snap.gpu.utilization_percent ?? 0} color="#8b5cf6" />
              {snap.gpu.memory_total_mb != null && (
                <MetricBar
                  label="VRAM"
                  value={(100 * (snap.gpu.memory_used_mb || 0)) / (snap.gpu.memory_total_mb || 1)}
                  color="#8b5cf6"
                />
              )}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Thermometer size={12} /> {snap.gpu.temperature_c ?? "—"}°C
                </div>
                <div>{snap.gpu.memory_used_mb ?? 0} / {snap.gpu.memory_total_mb ?? 0} MB</div>
              </div>
              <SparkLine values={history.map((h) => h.gpu)} max={100} color="#8b5cf6" width={440} height={60} />
            </>
          ) : (
            <div className="text-xs text-gray-500">No GPU detected</div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
            <HardDrive size={14} /> Disk
            {snap && <span className="text-xs font-normal text-gray-500">• {fmtBytes(snap.disk_total_gb)} total</span>}
          </div>
          <MetricBar label="Used" value={snap?.disk_percent ?? 0} color="#10b981" />
          <div className="text-xs text-gray-500">
            {snap ? `${fmtBytes(snap.disk_used_gb)} of ${fmtBytes(snap.disk_total_gb)}` : "—"}
          </div>
          <SparkLine values={history.map((h) => h.disk)} max={100} color="#10b981" width={440} height={60} />
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-xs text-gray-500 mb-2">Process</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
          <SafeKV k="pid" v={snap?.process?.pid} />
          <SafeKV k="threads" v={snap?.process?.threads} />
          <SafeKV k="rss" v={snap?.process?.rss_gb != null ? fmtBytes(snap.process.rss_gb) : null} />
          <SafeKV k="uptime" v={snap?.process?.uptime_s != null ? fmtDuration(snap.process.uptime_s) : null} />
          <SafeKV k="live_events" v={snap?.live_events_running} />
          <SafeKV k="timestamp" v={snap?.timestamp ? relTime(snap.timestamp) : null} />
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Users
// ──────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function UsersTab() {
  const [q, setQ]             = useState("");
  const [debouncedQ, setDQ]   = useState("");
  const [offset, setOffset]   = useState(0);
  const [data, setData]       = useState({ total: 0, users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [detailUser, setDetailUser] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDQ(q); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(debouncedQ, PAGE_SIZE, offset);
      setData(res || { total: 0, users: [] });
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load users");
    } finally { setLoading(false); }
  }, [debouncedQ, offset]);

  useEffect(() => { load(); }, [load]);

  const total = data.total || 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email or name…"
            icon={<Search size={12} />}
          />
        </div>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={load}>
          Refresh
        </Button>
      </div>

      <ErrorBanner error={error} />

      <TableShell
        headers={[
          { key: "email",    label: "Email" },
          { key: "name",     label: "Name" },
          { key: "plan",     label: "Plan" },
          { key: "admin",    label: "Admin" },
          { key: "active",   label: "Active" },
          { key: "jobs",     label: "Jobs", className: "text-right" },
          { key: "clips",    label: "Clips", className: "text-right" },
          { key: "storage",  label: "Storage", className: "text-right" },
          { key: "gemini",   label: "Gemini 30d", className: "text-right" },
          { key: "last",     label: "Last login" },
        ]}
        empty={loading ? "Loading…" : "No users match the search"}
      >
        {(data.users || []).map((u) => (
          <tr
            key={u.id}
            className="hover:bg-white/5 cursor-pointer"
            onClick={() => setDetailUser(u)}
          >
            <td className="px-3 py-2 text-gray-100 truncate max-w-[220px]">{u.email}</td>
            <td className="px-3 py-2 text-gray-300 truncate max-w-[160px]">{u.name || "—"}</td>
            <td className="px-3 py-2 text-gray-300">{u.plan || "free"}</td>
            <td className="px-3 py-2">
              {u.is_admin ? (
                <span className="inline-flex items-center gap-1 text-xs text-accent2">
                  <Shield size={11} /> yes
                </span>
              ) : <span className="text-gray-500">—</span>}
            </td>
            <td className="px-3 py-2">
              {u.is_active
                ? <CheckCircle2 size={12} className="text-emerald-400" />
                : <X size={12} className="text-gray-500" />}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-200">{fmtInt(u.jobs_count)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-200">{fmtInt(u.clips_count)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-200">
              {u.storage_mb != null ? (u.storage_mb >= 1024 ? fmtBytes(u.storage_mb / 1024) : `${Math.round(u.storage_mb)} MB`) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-200">
              {fmtMoney(u.gemini_cost_usd_30d)}
              <span className="text-gray-600 ml-1">({fmtInt(u.gemini_calls_30d)})</span>
            </td>
            <td className="px-3 py-2 text-gray-400">{relTime(u.last_login_at)}</td>
          </tr>
        ))}
      </TableShell>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>{total > 0 ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}` : "0 users"}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft size={12} />}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
          >Prev</Button>
          <span className="tabular-nums">{page} / {pages}</span>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight size={12} />}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
          >Next</Button>
        </div>
      </div>

      <UserDrillDownModal
        user={detailUser}
        onClose={() => setDetailUser(null)}
        onUpdated={(updated) => {
          setDetailUser(updated);
          setData((d) => ({
            ...d,
            users: (d.users || []).map((u) => u.id === updated.id ? { ...u, ...updated } : u),
          }));
        }}
      />
    </div>
  );
}

function UserDrillDownModal({ user, onClose, onUpdated }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [togglingAdmin, setTogglingAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setDetail(null); return; }
    let alive = true;
    setLoading(true); setError("");
    adminApi.getUser(user.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (alive) setError(e.message || "Failed to load user"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user]);

  async function handleToggleAdmin() {
    if (!user) return;
    if (!confirm(`${user.is_admin ? "Revoke" : "Grant"} admin for ${user.email}?`)) return;
    setTogglingAdmin(true); setError("");
    try {
      const updated = await adminApi.toggleAdmin(user.id);
      onUpdated?.(updated);
    } catch (e) {
      setError(e.message || "Failed to update admin flag");
    } finally {
      setTogglingAdmin(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={user ? `User • ${user.email}` : "User"}
      size="xl"
    >
      {user && (
        <div className="space-y-4">
          <ErrorBanner error={error} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <SafeKV k="id" v={user.id} />
            <SafeKV k="plan" v={user.plan || "free"} />
            <SafeKV k="active" v={user.is_active ? "yes" : "no"} />
            <SafeKV k="admin" v={user.is_admin ? "yes" : "no"} />
            <SafeKV k="jobs" v={user.jobs_count} />
            <SafeKV k="clips" v={user.clips_count} />
            <SafeKV k="storage" v={user.storage_mb != null ? `${Math.round(user.storage_mb)} MB` : null} />
            <SafeKV k="gemini 30d" v={`${fmtMoney(user.gemini_cost_usd_30d)} (${fmtInt(user.gemini_calls_30d)})`} />
            <SafeKV k="created" v={relTime(user.created_at)} />
            <SafeKV k="last login" v={relTime(user.last_login_at)} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={user.is_admin ? "ghost" : "primary"}
              size="sm"
              leftIcon={<UserCog size={12} />}
              onClick={handleToggleAdmin}
              loading={togglingAdmin}
            >
              {user.is_admin ? "Revoke admin" : "Make admin"}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading drill-down…
            </div>
          ) : detail ? (
            <>
              {detail.storage_breakdown && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 mb-1">Storage breakdown</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(detail.storage_breakdown).map(([k, v]) => (
                      <div key={k} className="bg-panel border border-border rounded px-2 py-1 text-xs">
                        <span className="text-gray-500">{k}: </span>
                        <span className="text-gray-200 font-mono">
                          {typeof v === "number" ? (v >= 1024 ? fmtBytes(v / 1024) : `${Math.round(v)} MB`) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Recent jobs ({(detail.recent_jobs || []).length})
                </div>
                <TableShell
                  headers={[
                    { key: "id",      label: "ID" },
                    { key: "title",   label: "Title" },
                    { key: "status",  label: "Status" },
                    { key: "clips",   label: "Clips", className: "text-right" },
                    { key: "created", label: "Created" },
                  ]}
                  empty="No recent jobs"
                >
                  {(detail.recent_jobs || []).map((j) => (
                    <tr key={j.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-gray-200 tabular-nums">#{j.id}</td>
                      <td className="px-3 py-2 text-gray-200 truncate max-w-[260px]">{j.title || j.name || "—"}</td>
                      <td className="px-3 py-2"><StatusPill status={j.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(j.clips_count)}</td>
                      <td className="px-3 py-2 text-gray-400">{relTime(j.created_at)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Recent Gemini calls ({(detail.recent_gemini_calls || []).length})
                </div>
                <TableShell
                  headers={[
                    { key: "when",    label: "When" },
                    { key: "model",   label: "Model" },
                    { key: "purpose", label: "Purpose" },
                    { key: "tokens",  label: "Tokens", className: "text-right" },
                    { key: "cost",    label: "Cost", className: "text-right" },
                  ]}
                  empty="No Gemini calls"
                >
                  {(detail.recent_gemini_calls || []).map((c, i) => (
                    <tr key={c.id ?? i} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-gray-400">{relTime(c.created_at || c.timestamp)}</td>
                      <td className="px-3 py-2 text-gray-200 font-mono text-[11px]">{c.model || "—"}</td>
                      <td className="px-3 py-2 text-gray-300">{c.purpose || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(c.tokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-200">{fmtMoney(c.cost_usd)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Jobs
// ──────────────────────────────────────────────────────────────────────────

const JOB_STATUSES = ["", "pending", "processing", "done", "failed"];

function JobsTab() {
  const [filters, setFilters]   = useState({ q: "", status: "", user_id: "", limit: PAGE_SIZE, offset: 0 });
  const [data, setData]         = useState({ total: 0, jobs: [] });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [detailJob, setDetailJob] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const clean = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      const res = await adminApi.listJobs(clean);
      setData(res || { total: 0, jobs: [] });
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load jobs");
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function setFilter(k, v) { setFilters((f) => ({ ...f, [k]: v, offset: k === "offset" ? v : 0 })); }

  const total = data.total || (data.jobs || []).length;
  const page = Math.floor((filters.offset || 0) / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Search"
            value={filters.q}
            onChange={(e) => setFilter("q", e.target.value)}
            placeholder="title or user email…"
            icon={<Search size={12} />}
          />
        </div>
        <div className="w-40">
          <label className="ui-field-label"><span>Status</span></label>
          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
            className="ui-input"
          >
            {JOB_STATUSES.map((s) => (
              <option key={s || "all"} value={s}>{s || "all"}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <Input
            label="User ID"
            value={filters.user_id}
            onChange={(e) => setFilter("user_id", e.target.value)}
            placeholder="e.g. 42"
          />
        </div>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={load}>
          Refresh
        </Button>
      </div>

      <ErrorBanner error={error} />

      <TableShell
        headers={[
          { key: "id",      label: "ID" },
          { key: "title",   label: "Title" },
          { key: "user",    label: "User" },
          { key: "status",  label: "Status" },
          { key: "clips",   label: "Clips", className: "text-right" },
          { key: "cost",    label: "Gemini $", className: "text-right" },
          { key: "created", label: "Created" },
        ]}
        empty={loading ? "Loading…" : "No jobs match the filters"}
      >
        {(data.jobs || []).map((j) => (
          <tr
            key={j.id}
            className="hover:bg-white/5 cursor-pointer"
            onClick={() => setDetailJob(j)}
          >
            <td className="px-3 py-2 text-gray-200 tabular-nums">#{j.id}</td>
            <td className="px-3 py-2 text-gray-200 truncate max-w-[260px]">{j.title || j.name || "—"}</td>
            <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]">{j.user_email || j.email || "—"}</td>
            <td className="px-3 py-2"><StatusPill status={j.status} /></td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(j.clips_count)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-200">{fmtMoney(j.gemini_cost_usd ?? j.gemini_cost)}</td>
            <td className="px-3 py-2 text-gray-400">{relTime(j.created_at)}</td>
          </tr>
        ))}
      </TableShell>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>{total > 0 ? `${(filters.offset || 0) + 1}–${Math.min((filters.offset || 0) + PAGE_SIZE, total)} of ${total}` : "0 jobs"}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft size={12} />}
            onClick={() => setFilter("offset", Math.max(0, (filters.offset || 0) - PAGE_SIZE))}
            disabled={(filters.offset || 0) === 0}
          >Prev</Button>
          <span className="tabular-nums">{page} / {pages}</span>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight size={12} />}
            onClick={() => setFilter("offset", (filters.offset || 0) + PAGE_SIZE)}
            disabled={(filters.offset || 0) + PAGE_SIZE >= total}
          >Next</Button>
        </div>
      </div>

      <JobDrillDownModal job={detailJob} onClose={() => setDetailJob(null)} />
    </div>
  );
}

function JobDrillDownModal({ job, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!job) { setDetail(null); return; }
    let alive = true;
    setLoading(true); setError("");
    adminApi.getJob(job.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch((e) => { if (alive) setError(e.message || "Failed to load job"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [job]);

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      title={job ? `Job #${job.id} • ${job.title || job.name || "untitled"}` : "Job"}
      size="xl"
    >
      {job && (
        <div className="space-y-4">
          <ErrorBanner error={error} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <SafeKV k="id" v={job.id} />
            <SafeKV k="status" v={job.status} />
            <SafeKV k="user" v={job.user_email || job.email} />
            <SafeKV k="clips" v={job.clips_count} />
            <SafeKV k="gemini" v={fmtMoney(job.gemini_cost_usd ?? job.gemini_cost)} />
            <SafeKV k="created" v={relTime(job.created_at)} />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading drill-down…
            </div>
          ) : detail ? (
            <>
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Clips ({(detail.clips || []).length})
                </div>
                <TableShell
                  headers={[
                    { key: "id",     label: "ID" },
                    { key: "title",  label: "Title" },
                    { key: "dur",    label: "Duration", className: "text-right" },
                    { key: "status", label: "Status" },
                  ]}
                  empty="No clips"
                >
                  {(detail.clips || []).map((c) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-gray-200 tabular-nums">#{c.id}</td>
                      <td className="px-3 py-2 text-gray-200 truncate max-w-[300px]">{c.title || c.headline || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        {c.duration_s != null ? fmtDuration(c.duration_s) : "—"}
                      </td>
                      <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                    </tr>
                  ))}
                </TableShell>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Renders ({(detail.renders || []).length})
                </div>
                <TableShell
                  headers={[
                    { key: "id",     label: "ID" },
                    { key: "kind",   label: "Kind" },
                    { key: "status", label: "Status" },
                    { key: "when",   label: "When" },
                  ]}
                  empty="No renders"
                >
                  {(detail.renders || []).map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-gray-200 tabular-nums">#{r.id}</td>
                      <td className="px-3 py-2 text-gray-300">{r.kind || r.type || "—"}</td>
                      <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-2 text-gray-400">{relTime(r.created_at)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1">
                  Gemini calls ({(detail.gemini_calls || []).length})
                </div>
                <TableShell
                  headers={[
                    { key: "when",    label: "When" },
                    { key: "model",   label: "Model" },
                    { key: "purpose", label: "Purpose" },
                    { key: "tokens",  label: "Tokens", className: "text-right" },
                    { key: "cost",    label: "Cost", className: "text-right" },
                  ]}
                  empty="No Gemini calls"
                >
                  {(detail.gemini_calls || []).map((c, i) => (
                    <tr key={c.id ?? i} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-gray-400">{relTime(c.created_at || c.timestamp)}</td>
                      <td className="px-3 py-2 text-gray-200 font-mono text-[11px]">{c.model || "—"}</td>
                      <td className="px-3 py-2 text-gray-300">{c.purpose || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(c.tokens)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-200">{fmtMoney(c.cost_usd)}</td>
                    </tr>
                  ))}
                </TableShell>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Gemini Usage
// ──────────────────────────────────────────────────────────────────────────

function GeminiTab() {
  const [days, setDays]         = useState(30);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.geminiUsage(days);
      setData(res);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load Gemini usage");
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Window</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ui-input w-24"
        >
          <option value={1}>1 day</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={load}>Refresh</Button>
      </div>

      <ErrorBanner error={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard icon={Sparkles} label={`Total calls (${days}d)`} value={loading ? "…" : fmtInt(data?.total_calls)} />
        <StatCard icon={Sparkles} label="Total tokens" value={loading ? "…" : fmtInt(data?.total_tokens)} />
        <StatCard icon={Sparkles} label="Total cost" value={loading ? "…" : fmtMoney(data?.total_cost_usd)} accent="text-accent3" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-100">Cost by day</div>
          <div className="text-xs text-gray-500">last {days} days</div>
        </div>
        {data?.by_day?.length ? (
          <BarChart
            data={(data.by_day || []).map((d) => ({ label: d.date, value: Number(d.cost_usd) || 0 }))}
            format={fmtMoney}
            height={160}
          />
        ) : (
          <div className="text-xs text-gray-500 py-4">{loading ? "Loading…" : "No cost data yet"}</div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-gray-100 mb-2">By user</div>
        <TableShell
          headers={[
            { key: "email",  label: "User" },
            { key: "calls",  label: "Calls",  className: "text-right" },
            { key: "tokens", label: "Tokens", className: "text-right" },
            { key: "cost",   label: "Cost",   className: "text-right" },
          ]}
          empty={loading ? "Loading…" : "No data"}
        >
          {(data?.by_user || []).map((r) => (
            <tr key={r.user_id} className="hover:bg-white/5">
              <td className="px-3 py-2 text-gray-200 truncate max-w-[260px]">{r.email || `user#${r.user_id}`}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(r.calls)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(r.tokens)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-100">{fmtMoney(r.cost_usd)}</td>
            </tr>
          ))}
        </TableShell>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">By model</div>
          <TableShell
            headers={[
              { key: "model",  label: "Model" },
              { key: "calls",  label: "Calls",  className: "text-right" },
              { key: "tokens", label: "Tokens", className: "text-right" },
              { key: "cost",   label: "Cost",   className: "text-right" },
            ]}
            empty={loading ? "Loading…" : "No data"}
          >
            {(data?.by_model || []).map((r, i) => (
              <tr key={r.model ?? i} className="hover:bg-white/5">
                <td className="px-3 py-2 text-gray-200 font-mono text-[11px] truncate max-w-[220px]">{r.model || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(r.calls)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(r.tokens)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-100">{fmtMoney(r.cost_usd)}</td>
              </tr>
            ))}
          </TableShell>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-100 mb-2">By purpose</div>
          <TableShell
            headers={[
              { key: "purpose", label: "Purpose" },
              { key: "calls",   label: "Calls", className: "text-right" },
              { key: "cost",    label: "Cost",  className: "text-right" },
            ]}
            empty={loading ? "Loading…" : "No data"}
          >
            {(data?.by_purpose || []).map((r, i) => (
              <tr key={r.purpose ?? i} className="hover:bg-white/5">
                <td className="px-3 py-2 text-gray-200">{r.purpose || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmtInt(r.calls)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-100">{fmtMoney(r.cost_usd)}</td>
              </tr>
            ))}
          </TableShell>
        </Card>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Live events
// ──────────────────────────────────────────────────────────────────────────

function LiveEventsTab() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [revealIds, setRevealIds] = useState(() => new Set());

  const fetchOnce = useCallback(async () => {
    try {
      const res = await adminApi.liveEvents();
      setEvents(Array.isArray(res) ? res : (res?.events || []));
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load live events");
    } finally { setLoading(false); }
  }, []);

  usePolling(fetchOnce, 3000, { enabled: true });

  function toggleReveal(id) {
    setRevealIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">Polling every 3s • pauses when tab is hidden</div>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={fetchOnce}>Refresh</Button>
      </div>

      <ErrorBanner error={error} />

      {loading && !events.length ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : !events.length ? (
        <Card className="p-8 text-center text-sm text-gray-500">
          No live events currently running.
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const id = e.id ?? e.event_id ?? e.session_id;
            const revealed = revealIds.has(id);
            return (
              <Card key={id} className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Radio size={13} className="text-emerald-400 animate-pulse-soft" />
                      <span className="text-sm font-semibold text-gray-100">
                        {e.name || e.title || `Event #${id}`}
                      </span>
                      <StatusPill status={e.status || "processing"} />
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      id #{id} • user {e.user_email || e.user_id || "—"} • up {e.uptime_s != null ? fmtDuration(e.uptime_s) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <div>cameras <span className="text-gray-200 tabular-nums">{e.cameras_count ?? (e.cameras || []).length ?? 0}</span></div>
                    <div>workers <span className="text-gray-200 tabular-nums">{e.workers_count ?? (e.workers || []).length ?? 0}</span></div>
                    <div>fps <span className="text-gray-200 tabular-nums">{e.fps ?? "—"}</span></div>
                  </div>
                </div>

                {e.cameras?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-gray-500 mb-1">Cameras</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {e.cameras.map((c) => (
                        <div key={c.id || c.cam_id} className="bg-[#0a0a0a] border border-border rounded p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="text-gray-200 truncate">{c.label || c.name || `cam ${c.id || c.cam_id}`}</div>
                            <StatusPill status={c.status || (c.connected ? "done" : "pending")} />
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5 font-mono truncate">
                            {c.kind || c.source || ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {e.workers?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-gray-500 mb-1">Workers</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {e.workers.map((w, i) => (
                        <div key={w.id ?? i} className="bg-[#0a0a0a] border border-border rounded p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="text-gray-200 truncate">{w.name || w.kind || `worker ${i}`}</div>
                            <StatusPill status={w.status || "processing"} />
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            cpu {w.cpu_percent != null ? `${Math.round(w.cpu_percent)}%` : "—"} • mem {w.mem_mb != null ? `${Math.round(w.mem_mb)} MB` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {e.relay_destinations?.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] font-semibold text-gray-500">Relay destinations</div>
                      <button
                        onClick={() => toggleReveal(id)}
                        className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
                        title="Toggle stream-key visibility (last 4 chars only)"
                      >
                        {revealed ? <Eye size={11} /> : <EyeOff size={11} />}
                        {revealed ? "hide keys" : "show last 4"}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {e.relay_destinations.map((d, i) => (
                        <div key={d.id ?? i} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-300 truncate max-w-[200px]">{d.name || d.platform || "destination"}</span>
                          <span className="text-gray-500 font-mono truncate">{d.rtmp_url || ""}</span>
                          <span className="text-gray-600 font-mono ml-auto">
                            {revealed ? maskStreamKey(d.stream_key) : "••••••••"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: Audit log
// ──────────────────────────────────────────────────────────────────────────

function AuditTab() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [filter, setFilter]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.audit();
      setRows(Array.isArray(res) ? res : (res?.events || res?.entries || []));
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load audit log");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(f));
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter events…"
            icon={<Search size={12} />}
          />
        </div>
        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={load}>Refresh</Button>
      </div>

      <ErrorBanner error={error} />

      <TableShell
        headers={[
          { key: "when",   label: "When" },
          { key: "kind",   label: "Kind" },
          { key: "user",   label: "User" },
          { key: "detail", label: "Detail" },
        ]}
        empty={loading ? "Loading…" : "No audit events yet"}
      >
        {filtered.map((r, i) => (
          <tr key={r.id ?? i} className="hover:bg-white/5">
            <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{relTime(r.created_at || r.timestamp || r.at)}</td>
            <td className="px-3 py-2">
              <StatusPill status={r.kind || r.event || r.action || "info"} />
            </td>
            <td className="px-3 py-2 text-gray-300 truncate max-w-[200px]">{r.user_email || r.email || r.user_id || "—"}</td>
            <td className="px-3 py-2 text-gray-400 font-mono text-[11px] truncate max-w-[520px]">
              {typeof r.detail === "string" ? r.detail
                : r.message ? r.message
                : r.detail ? JSON.stringify(r.detail)
                : "—"}
            </td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shell
// ──────────────────────────────────────────────────────────────────────────

const TABS = [
  { path: "overview", label: "Overview",    icon: Activity,  comp: OverviewTab   },
  { path: "system",   label: "System",      icon: Cpu,       comp: SystemTab     },
  { path: "users",    label: "Users",       icon: Users,     comp: UsersTab      },
  { path: "jobs",     label: "Jobs",        icon: Briefcase, comp: JobsTab       },
  { path: "gemini",   label: "Gemini usage",icon: Sparkles,  comp: GeminiTab     },
  { path: "live",     label: "Live events", icon: Radio,     comp: LiveEventsTab },
  { path: "audit",    label: "Audit log",   icon: Shield,    comp: AuditTab      },
];

function AdminSidebar() {
  return (
    <aside className="w-56 flex-shrink-0 border-r border-border bg-[#0a0a0a] min-h-[calc(100vh-3rem)]">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-xs tracking-widest">
            KAIZER
          </div>
          <span className="text-[11px] text-accent2 font-bold tracking-[0.2em]">ADMIN</span>
        </div>
      </div>
      <nav className="p-2 flex flex-col gap-0.5">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded text-sm ${
                isActive
                  ? "bg-accent/10 text-accent2 border-l-2 border-accent2 -ml-[2px] pl-[14px]"
                  : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
              }`
            }
          >
            <t.icon size={14} /> {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border mt-2">
        <Link to="/app" className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1">
          <ChevronLeft size={11} /> Back to app
        </Link>
      </div>
    </aside>
  );
}

function AdminHeader({ tabLabel, onRefresh }) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-panel">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-bold tracking-[0.18em] text-gray-100">KAIZER ADMIN</h1>
        <span className="text-gray-600">/</span>
        <span className="text-sm text-gray-300 truncate">{tabLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={12} />} onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>
    </header>
  );
}

function AdminTabWrapper({ tab }) {
  const [refreshSig, setRefreshSig] = useState(0);
  const Comp = tab.comp;
  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)]">
      <AdminHeader tabLabel={tab.label} onRefresh={() => setRefreshSig((s) => s + 1)} />
      <div className="flex-1 p-5 bg-dark">
        {/* key bumps to force a remount/refetch when the header Refresh is clicked */}
        <Comp key={refreshSig} />
      </div>
    </div>
  );
}

export default function Admin() {
  return (
    <div className="flex bg-dark text-gray-100">
      <AdminSidebar />
      <div className="flex-1 min-w-0">
        <Routes>
          <Route index element={<AdminTabWrapper tab={TABS[0]} />} />
          {TABS.map((t) => (
            <Route key={t.path} path={t.path} element={<AdminTabWrapper tab={t} />} />
          ))}
          <Route path="*" element={<AdminTabWrapper tab={TABS[0]} />} />
        </Routes>
      </div>
    </div>
  );
}
