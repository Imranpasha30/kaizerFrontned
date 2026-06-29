import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, RefreshCw, Sparkles, Image as ImageIcon, Youtube, DollarSign,
  Users, Briefcase, Clock, Film, AlertCircle, Loader2, TrendingUp, Zap,
  X, ChevronDown, Filter, Download as DownloadIcon, Database,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area,
} from "recharts";
import { adminApi } from "../api/client";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

// ─── Formatters ────────────────────────────────────────────────────────

function fmtMoney(usd) {
  if (usd == null || Number.isNaN(Number(usd))) return "—";
  const n = Number(usd);
  if (n === 0) return "$0.00";
  if (n < 0.001) return "<$0.001";
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${(n / 1000).toFixed(2)}k`;
}

function fmtInt(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v < 1000) return v.toLocaleString();
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}

function fmtBytes(bytes) {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)}KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const s = Math.floor(Number(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function relTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Math.round((Date.now() - t) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Color palette ────────────────────────────────────────────────────
// Aligned with the admin theme palette: violet+cyan+emerald+amber. Each
// provider gets a distinct hue + supplemental dash style on its line.
const COLORS = {
  gemini:    "#7c3aed",  // violet — top-of-stack provider
  openai:    "#22c55e",  // emerald
  anthropic: "#d97706",  // amber-orange — Claude
  youtube:   "#06b6d4",  // cyan
  total:     "#f59e0b",  // amber
  muted:     "#64748b",
  grid:      "rgba(148, 163, 184, 0.08)",
  text:      "#94a3b8",
};

const DONUT_COLORS = [COLORS.gemini, COLORS.openai, COLORS.anthropic, COLORS.youtube, COLORS.total, "#ec4899"];

// ─── KPI Tile ─────────────────────────────────────────────────────────

function KpiTile({ icon: Icon, label, value, sub, tone = "default", trend, loading }) {
  // Map provider tone → admin theme gradient class
  const gradTone = {
    default:   "",
    gemini:    "adm-kpi--violet",
    openai:    "adm-kpi--emerald",
    anthropic: "adm-kpi--amber",
    youtube:   "",       // cyan is default
    accent:    "adm-kpi--amber",
  }[tone] || "";

  return (
    <div className={`adm-kpi ${gradTone} flex flex-col gap-1.5 min-w-0`}>
      <div className="adm-kpi__label flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate">
          {Icon && <Icon size={12} />} {label}
        </span>
        {trend != null && (
          <span className="flex items-center gap-0.5 text-[10px]" style={{ opacity: 0.92 }}>
            <TrendingUp size={10} className={trend < 0 ? "rotate-180" : ""} />
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="adm-kpi__value truncate">
        {loading ? <span style={{ opacity: 0.6 }}>…</span> : value}
      </div>
      {sub && <div className="adm-kpi__delta truncate"><span style={{ opacity: 0.85 }}>{sub}</span></div>}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter = (v) => v }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-[#0a0a0a] border border-border rounded-md px-3 py-2 shadow-lg text-xs">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-gray-300">{p.name}</span>
          <span className="ml-auto text-gray-100 font-semibold">{formatter(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Time range selector ──────────────────────────────────────────────

const RANGES = [
  { label: "Day", days: 1 },
  { label: "Week", days: 7 },
  { label: "Month", days: 30 },
  { label: "Quarter", days: 90 },
];

function RangeTabs({ value, onChange }) {
  return (
    <div className="inline-flex bg-panel border border-border rounded-md p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.days}
          type="button"
          onClick={() => onChange(r.days)}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            value === r.days
              ? "bg-accent text-white"
              : "text-gray-400 hover:text-gray-100"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── Polling hook ─────────────────────────────────────────────────────

function usePolling(fn, intervalMs, { enabled = true, deps = [] } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer = null;
    async function tick() {
      if (cancelled) return;
      if (document.hidden) { timer = setTimeout(tick, intervalMs); return; }
      try { await fnRef.current(); } catch { /* swallow */ }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }
    tick();
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);
}

// ─── Section header ───────────────────────────────────────────────────

function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-gray-400 font-semibold">
        {Icon && <Icon size={12} />} {children}
      </div>
      {action}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────

export default function AdminUsage() {
  const [days, setDays]       = useState(30);
  const [data, setData]       = useState(null);
  const [rtmp, setRtmp]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetched, setLastFetched] = useState(null);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.allSettled([
        adminApi.usageDashboard(days),
        adminApi.rtmpActivity(days),
      ]);
      if (d.status === "fulfilled") setData(d.value);
      if (r.status === "fulfilled") setRtmp(r.value);
      setError(d.status === "rejected" ? (d.reason?.message || "Failed") : "");
      setLastFetched(new Date());
    } catch (e) {
      setError(e?.message || "Failed to load usage dashboard");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // 60s refresh — fast enough to feel "live" without hammering the DB.
  usePolling(load, 60_000, { enabled: autoRefresh, deps: [days] });

  // ── Derived: zero-filled daily timeseries (last N days) ─────────────
  const dailyMerged = useMemo(() => {
    if (!data) return [];
    const span = Number(data?.window?.days || days);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay = new Map();
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { day: key, gemini: 0, openai: 0, anthropic: 0, youtube: 0, total: 0 });
    }
    (data?.timeseries?.gemini || []).forEach((r) => {
      const row = byDay.get(String(r.day).slice(0, 10));
      if (row) row.gemini = Number(r.cost_usd || 0);
    });
    (data?.timeseries?.openai || []).forEach((r) => {
      const row = byDay.get(String(r.day).slice(0, 10));
      if (row) row.openai = Number(r.cost_usd || 0);
    });
    (data?.timeseries?.anthropic || []).forEach((r) => {
      const row = byDay.get(String(r.day).slice(0, 10));
      if (row) row.anthropic = Number(r.cost_usd || 0);
    });
    (data?.timeseries?.youtube || []).forEach((r) => {
      const row = byDay.get(String(r.day).slice(0, 10));
      if (row) row.youtube = Number(r.quota || 0);
    });
    const rows = Array.from(byDay.values());
    rows.forEach((r) => { r.total = +(r.gemini + r.openai + r.anthropic).toFixed(4); });
    // Show last 14 ticks on the X axis for a clean look — full series still
    // renders for accurate area under the curve.
    return rows;
  }, [data, days]);

  const providerMix = useMemo(() => {
    if (!data) return [];
    const g = Number(data?.overview?.gemini?.window_cost_usd || 0);
    const o = Number(data?.overview?.openai?.window_cost_usd || 0);
    const a = Number(data?.overview?.anthropic?.window_cost_usd || 0);
    // YouTube isn't $-priced, but quota burn against the cap is a useful
    // "spend" proxy — show it as % of the daily cap for the day-mix donut.
    const ytPct = Number(data?.overview?.youtube?.today_pct || 0);
    return [
      { name: "Gemini", value: +g.toFixed(4), display: fmtMoney(g) },
      { name: "OpenAI", value: +o.toFixed(4), display: fmtMoney(o) },
      { name: "Claude",  value: +a.toFixed(4), display: fmtMoney(a) },
      { name: "YouTube quota", value: ytPct,  display: `${ytPct.toFixed(1)}% of cap` },
    ].filter((r) => r.value > 0);
  }, [data]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ─── Header bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500">AI cost intelligence</div>
          <h2 className="text-2xl font-bold text-gray-100 tracking-tight">
            Usage <span className="text-accent2">/</span> Spend dashboard
          </h2>
          <div className="text-xs text-gray-500 mt-0.5">
            Window: <span className="text-gray-300">last {days} day{days === 1 ? "" : "s"}</span>
            {lastFetched && (
              <> · refreshed <span className="text-gray-300">{relTime(lastFetched.toISOString())}</span></>
            )}
            {autoRefresh && <> · <span className="text-emerald-400">● live</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RangeTabs value={days} onChange={setDays} />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
            onClick={() => { setLoading(true); load(); }}
          >
            Refresh
          </Button>
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
              autoRefresh
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                : "border-border text-gray-500 hover:text-gray-300"
            }`}
            title="Toggle 60s polling"
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-500/5 border border-red-500/30 rounded text-xs text-red-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 break-words">{error}</div>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-200">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ─── KPI strip ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        <KpiTile
          icon={DollarSign}
          tone="accent"
          label="Today's AI spend"
          value={fmtMoney(data?.overview?.total_cost_today_usd)}
          sub="Gemini + OpenAI + Claude"
          loading={loading}
        />
        <KpiTile
          icon={Sparkles}
          tone="gemini"
          label="Gemini today"
          value={fmtMoney(data?.overview?.gemini?.today_cost_usd)}
          sub={`${fmtInt(data?.overview?.gemini?.today_calls)} calls`}
          loading={loading}
        />
        <KpiTile
          icon={ImageIcon}
          tone="openai"
          label="OpenAI today"
          value={fmtMoney(data?.overview?.openai?.today_cost_usd)}
          sub={`${fmtInt(data?.overview?.openai?.today_calls)} calls`}
          loading={loading}
        />
        <KpiTile
          icon={Sparkles}
          tone="anthropic"
          label="Claude today"
          value={fmtMoney(data?.overview?.anthropic?.today_cost_usd)}
          sub={`${fmtInt(data?.overview?.anthropic?.today_calls)} calls`}
          loading={loading}
        />
        <KpiTile
          icon={Youtube}
          tone="youtube"
          label="YouTube quota used"
          value={`${(data?.overview?.youtube?.today_pct ?? 0).toFixed(1)}%`}
          sub={`${fmtInt(data?.overview?.youtube?.today_quota)} / ${fmtInt(data?.overview?.youtube?.daily_cap)} units`}
          loading={loading}
        />
        <KpiTile
          icon={TrendingUp}
          label={`${days}-day total`}
          value={fmtMoney(data?.overview?.total_cost_window_usd)}
          sub={`${fmtInt((data?.overview?.gemini?.window_calls || 0) + (data?.overview?.openai?.window_calls || 0) + (data?.overview?.anthropic?.window_calls || 0))} calls`}
          loading={loading}
        />
        <KpiTile
          icon={Film}
          label="Video upload cost"
          value={fmtMoney(data?.gemini?.video_uploads?.cost_usd)}
          sub={`${fmtMoney(data?.gemini?.video_uploads?.cost_per_minute_usd)}/min`}
          loading={loading}
        />
      </div>

      {/* ─── Summary trend + provider mix ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Card className="p-4 xl:col-span-2">
          <SectionTitle icon={Activity}>Daily spend trend</SectionTitle>
          <div className="h-72">
            {dailyMerged.length === 0 ? (
              <EmptyState text={loading ? "Loading..." : "No usage in this window"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMerged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gemFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={COLORS.gemini} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={COLORS.gemini} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="oaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={COLORS.openai} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={COLORS.openai} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="anFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={COLORS.anthropic} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={COLORS.anthropic} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    stroke={COLORS.text}
                    fontSize={10}
                    tickFormatter={(d) => String(d).slice(5)}
                    interval="preserveStartEnd"
                    minTickGap={20}
                  />
                  <YAxis
                    stroke={COLORS.text}
                    fontSize={10}
                    tickFormatter={(v) => `$${v < 1 ? v.toFixed(2) : v.toFixed(0)}`}
                  />
                  <Tooltip content={(p) => <ChartTooltip {...p} formatter={fmtMoney} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: COLORS.text }} iconType="circle" />
                  <Area type="monotone" dataKey="gemini"    name="Gemini"  stroke={COLORS.gemini}    fill="url(#gemFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="openai"    name="OpenAI"  stroke={COLORS.openai}    fill="url(#oaFill)"  strokeWidth={2} />
                  <Area type="monotone" dataKey="anthropic" name="Claude"  stroke={COLORS.anthropic} fill="url(#anFill)"  strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle icon={Filter}>Provider mix</SectionTitle>
          <div className="h-72 flex items-center">
            {providerMix.length === 0 ? (
              <EmptyState text={loading ? "Loading..." : "No usage yet"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={providerMix}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="#0a0a0a"
                  >
                    {providerMix.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#0a0a0a] border border-border rounded px-3 py-2 text-xs">
                          <div className="text-gray-100 font-semibold">{d.name}</div>
                          <div className="text-gray-400 mt-0.5">{d.display}</div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 11, color: COLORS.text }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ─── YouTube quota usage ───────────────────────── */}
      <Card className="p-4">
        <SectionTitle icon={Youtube}>
          <span>YouTube Data API quota</span>
          <span className="text-gray-600 normal-case tracking-normal ml-2 text-[10px]">
            {fmtInt(data?.overview?.youtube?.today_quota)} of {fmtInt(data?.overview?.youtube?.daily_cap)} units today
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
          <div className="lg:col-span-2">
            <div className="h-60">
              {(data?.timeseries?.youtube || []).length === 0 ? (
                <EmptyState text="No YouTube quota usage yet" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyMerged} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke={COLORS.text} fontSize={10}
                           tickFormatter={(d) => String(d).slice(5)}
                           interval="preserveStartEnd" minTickGap={20} />
                    <YAxis stroke={COLORS.text} fontSize={10} />
                    <Tooltip content={(p) => <ChartTooltip {...p} formatter={(v) => `${fmtInt(v)} units`} />} />
                    <Bar dataKey="youtube" name="Quota units" fill={COLORS.youtube} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <BreakdownList
              title="By operation"
              rows={data?.youtube?.by_operation}
              labelKey="operation"
              valueKey="quota"
              formatValue={(v) => `${fmtInt(v)} u`}
              color={COLORS.youtube}
            />
            <BreakdownList
              title="By publish kind"
              rows={data?.youtube?.by_publish_kind}
              labelKey="kind"
              valueKey="quota"
              formatValue={(v) => `${fmtInt(v)} u`}
              color={COLORS.youtube}
            />
          </div>
        </div>
        <div className="mt-4">
          <SectionTitle>Top videos by quota spend</SectionTitle>
          <PerVideoTable rows={data?.youtube?.top_videos || []} />
        </div>
      </Card>

      {/* ─── RTMP-live agent activity ──────────────────── */}
      <RtmpActivityCard rtmp={rtmp} days={days} />

      {/* ─── Gemini deep dive ──────────────────────────── */}
      <Card className="p-4">
        <SectionTitle icon={Sparkles}>
          <span>Gemini usage</span>
          <span className="text-gray-600 normal-case tracking-normal ml-2 text-[10px]">
            {fmtMoney(data?.overview?.gemini?.window_cost_usd)} · {fmtInt(data?.overview?.gemini?.window_calls)} calls in {days}d
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <div>
            <BreakdownChart
              title="By purpose (SEO vs video analysis vs ...)"
              rows={data?.gemini?.by_purpose}
              labelKey="purpose"
              valueKey="cost_usd"
              color={COLORS.gemini}
            />
          </div>
          <div>
            <BreakdownChart
              title="By model"
              rows={data?.gemini?.by_model}
              labelKey="model"
              valueKey="cost_usd"
              color={COLORS.gemini}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <TopUsersTable title="Top users" rows={data?.gemini?.top_users} color={COLORS.gemini} />
          <TopJobsTable  title="Top jobs"  rows={data?.gemini?.top_jobs}  color={COLORS.gemini} />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total video bytes analysed"
            value={fmtBytes(data?.gemini?.video_uploads?.total_bytes)}
            sub={`${fmtInt(data?.gemini?.video_uploads?.call_count)} uploads`}
            icon={Database}
          />
          <MetricCard
            label="Total video duration"
            value={fmtDuration(data?.gemini?.video_uploads?.total_seconds)}
            sub="analysed by Gemini"
            icon={Clock}
          />
          <MetricCard
            label="Cost / minute"
            value={fmtMoney(data?.gemini?.video_uploads?.cost_per_minute_usd)}
            sub="video uploads"
            icon={Zap}
          />
          <MetricCard
            label="Avg cost / call"
            value={fmtMoney(
              data?.overview?.gemini?.window_calls
                ? (data?.overview?.gemini?.window_cost_usd || 0) / data.overview.gemini.window_calls
                : 0
            )}
            sub="last 30d avg"
            icon={Activity}
          />
        </div>
      </Card>

      {/* ─── OpenAI deep dive ──────────────────────────── */}
      <Card className="p-4">
        <SectionTitle icon={ImageIcon}>
          <span>OpenAI usage</span>
          <span className="text-gray-600 normal-case tracking-normal ml-2 text-[10px]">
            {fmtMoney(data?.overview?.openai?.window_cost_usd)} · {fmtInt(data?.overview?.openai?.window_calls)} calls in {days}d
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
          <BreakdownChart
            title="By purpose"
            rows={data?.openai?.by_purpose}
            labelKey="purpose"
            valueKey="cost_usd"
            color={COLORS.openai}
          />
          <BreakdownChart
            title="By model"
            rows={data?.openai?.by_model}
            labelKey="model"
            valueKey="cost_usd"
            color={COLORS.openai}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <TopUsersTable title="Top users" rows={data?.openai?.top_users} color={COLORS.openai} />
          <TopJobsTable  title="Top jobs"  rows={data?.openai?.top_jobs}  color={COLORS.openai} />
        </div>
      </Card>

      {/* ─── Live tail — last 25 calls per provider ──── */}
      <Card className="p-4">
        <SectionTitle icon={Activity}>Recent calls</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-2">
          <RecentCallsList
            title="Gemini"
            color={COLORS.gemini}
            icon={Sparkles}
            calls={data?.recent_calls?.gemini || []}
            kind="gemini"
          />
          <RecentCallsList
            title="OpenAI"
            color={COLORS.openai}
            icon={ImageIcon}
            calls={data?.recent_calls?.openai || []}
            kind="openai"
          />
          <RecentCallsList
            title="YouTube"
            color={COLORS.youtube}
            icon={Youtube}
            calls={data?.recent_calls?.youtube || []}
            kind="youtube"
          />
        </div>
      </Card>

      <div className="text-[10px] text-gray-600 text-center pt-2">
        Window: {data?.window?.start} → {data?.window?.end} ·
        Polling every 60s · auto-pauses when tab is hidden
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function EmptyState({ text }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
      {text}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-[#0a0a0a] border border-border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="text-lg font-bold text-gray-100 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

function BreakdownList({ title, rows = [], labelKey, valueKey, formatValue, color }) {
  if (!rows?.length) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">{title}</div>
        <div className="text-xs text-gray-600 italic">no data</div>
      </div>
    );
  }
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5">{title}</div>
      <div className="space-y-1">
        {rows.slice(0, 6).map((r, i) => {
          const v = Number(r[valueKey]) || 0;
          const pct = (v / max) * 100;
          return (
            <div key={i} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-gray-300 truncate">{r[labelKey] || "(unset)"}</span>
                <span className="text-gray-400 tabular-nums shrink-0">{formatValue(v)}</span>
              </div>
              <div className="h-1 bg-[#0a0a0a] rounded mt-1 overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownChart({ title, rows = [], labelKey, valueKey, color }) {
  const data = (rows || []).slice(0, 8).map((r) => ({
    label: r[labelKey] || "(unset)",
    value: Number(r[valueKey]) || 0,
    calls: Number(r.calls) || 0,
    tokens: Number(r.tokens) || 0,
  }));
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">{title}</div>
      <div className="h-56">
        {data.length === 0 ? (
          <EmptyState text="no data" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke={COLORS.text} fontSize={10} tickFormatter={fmtMoney} />
              <YAxis
                type="category"
                dataKey="label"
                stroke={COLORS.text}
                fontSize={10}
                width={90}
                tickFormatter={(s) => String(s).length > 14 ? `${String(s).slice(0, 13)}…` : s}
              />
              <Tooltip content={(p) => <ChartTooltip {...p} formatter={fmtMoney} />} />
              <Bar dataKey="value" name="Cost" fill={color} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function TopUsersTable({ title, rows = [], color }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[#0a0a0a] px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
        <Users size={11} /> {title}
      </div>
      <div className="divide-y divide-border">
        {(!rows || rows.length === 0) && (
          <div className="px-3 py-4 text-xs text-gray-600 italic text-center">no calls yet</div>
        )}
        {(rows || []).slice(0, 8).map((r, i) => (
          <div key={i} className="px-3 py-2 grid grid-cols-[1.5rem_1fr_auto_auto] items-center gap-2 text-xs hover:bg-white/[0.02]">
            <span className="text-gray-600 tabular-nums">#{i + 1}</span>
            <span className="text-gray-200 truncate" title={r.email || ""}>{r.email || "(system)"}</span>
            <span className="text-gray-500 tabular-nums">{fmtInt(r.calls)} calls</span>
            <span className="font-semibold tabular-nums" style={{ color }}>{fmtMoney(r.cost_usd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopJobsTable({ title, rows = [], color }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[#0a0a0a] px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
        <Briefcase size={11} /> {title}
      </div>
      <div className="divide-y divide-border">
        {(!rows || rows.length === 0) && (
          <div className="px-3 py-4 text-xs text-gray-600 italic text-center">no job-attributed calls</div>
        )}
        {(rows || []).slice(0, 8).map((r, i) => (
          <div key={i} className="px-3 py-2 grid grid-cols-[1.5rem_1fr_auto_auto_auto] items-center gap-2 text-xs hover:bg-white/[0.02]">
            <span className="text-gray-600 tabular-nums">#{i + 1}</span>
            <a
              href={`/jobs/${r.job_id}`}
              target="_blank" rel="noreferrer"
              className="text-gray-200 hover:text-accent2 truncate"
              title={`Job ${r.job_id}`}
            >
              job #{r.job_id}
            </a>
            {r.file_bytes ? (
              <span className="text-gray-500 tabular-nums">{fmtBytes(r.file_bytes)}</span>
            ) : <span className="text-gray-700">—</span>}
            {r.duration_s ? (
              <span className="text-gray-500 tabular-nums">{fmtDuration(r.duration_s)}</span>
            ) : <span className="text-gray-700">—</span>}
            <span className="font-semibold tabular-nums" style={{ color }}>{fmtMoney(r.cost_usd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PerVideoTable({ rows = [] }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-xs text-gray-600 italic px-3 py-4 text-center border border-border rounded-md">
        No YouTube uploads yet
      </div>
    );
  }
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0a0a0a] text-left text-gray-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-3 py-2 font-semibold">Video</th>
              <th className="px-3 py-2 font-semibold">Channel</th>
              <th className="px-3 py-2 font-semibold">Kind</th>
              <th className="px-3 py-2 font-semibold text-right">Size</th>
              <th className="px-3 py-2 font-semibold text-right">Operations</th>
              <th className="px-3 py-2 font-semibold text-right">Quota burned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, 15).map((r, i) => (
              <tr key={i} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  {r.video_id ? (
                    <a
                      href={`https://www.youtube.com/watch?v=${r.video_id}`}
                      target="_blank" rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 font-mono"
                    >
                      {r.video_id}
                    </a>
                  ) : <span className="text-gray-600">(no id)</span>}
                </td>
                <td className="px-3 py-2 text-gray-400 truncate max-w-[180px]" title={r.google_channel_id || ""}>
                  {r.google_channel_id ? `${r.google_channel_id.slice(0, 12)}…` : "—"}
                </td>
                <td className="px-3 py-2 text-gray-300">{r.kind || "—"}</td>
                <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmtBytes(r.file_bytes)}</td>
                <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmtInt(r.calls)}</td>
                <td className="px-3 py-2 text-right font-semibold text-blue-400 tabular-nums">
                  {fmtInt(r.quota)} u
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentCallsList({ title, color, icon: Icon, calls, kind }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-[#0a0a0a] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
           style={{ color }}>
        {Icon && <Icon size={11} />} {title}
        <span className="ml-auto text-gray-600 normal-case tracking-normal">{calls.length} recent</span>
      </div>
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {calls.length === 0 ? (
          <div className="px-3 py-6 text-xs text-gray-600 italic text-center">no recent calls</div>
        ) : calls.map((c, i) => (
          <div key={i} className="px-3 py-2 text-xs hover:bg-white/[0.02]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-gray-300 font-mono text-[10px] truncate">
                {kind === "youtube" ? c.operation : (c.purpose || c.model || "—")}
              </span>
              <span className="text-gray-600 text-[10px] shrink-0">{relTime(c.created_at)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-0.5">
              <span className="text-gray-500 text-[10px] truncate">
                {kind === "youtube"
                  ? (c.video_id ? `→ ${c.video_id}` : "")
                  : kind === "openai"
                    ? `${fmtInt(c.image_count)} img`
                    : `${fmtInt(c.tokens)} tok`}
              </span>
              <span className="font-semibold tabular-nums" style={{ color }}>
                {kind === "youtube" ? `${fmtInt(c.quota_cost)} u` : fmtMoney(c.cost_usd)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── RTMP-live agent audit card ─────────────────────────────────────
// Consolidated view of every broadcast the RTMP agent has minted +
// pushed. Reads /api/admin/rtmp/activity. Shows "off" badge when the
// feature flag is disabled so the operator immediately knows why
// counts are zero.
function RtmpActivityCard({ rtmp, days }) {
  if (!rtmp) {
    return (
      <Card className="p-4">
        <SectionTitle icon={Youtube}>RTMP-live agent</SectionTitle>
        <div className="text-xs text-gray-500 mt-2">Loading…</div>
      </Card>
    );
  }
  const t = rtmp.totals || {};
  const enabled = !!rtmp.enabled;
  const hasAny  = (t.jobs_total || 0) > 0;

  return (
    <Card className="p-4">
      <SectionTitle icon={Youtube}>
        <span>RTMP-live agent audit</span>
        <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium normal-case tracking-normal border ${
          enabled
            ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
            : "border-amber-500/40 text-amber-300 bg-amber-500/10"
        }`}>
          {enabled
            ? `ENABLED · concurrency ${rtmp.concurrency}`
            : "DISABLED (set KAIZER_NATIVE_RTMP_ENABLED=true in .env)"}
        </span>
      </SectionTitle>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3">
        <MetricCard icon={Activity} label="Broadcasts minted"
          value={fmtInt(t.broadcasts_minted)}
          sub={`liveBroadcasts.insert in last ${days}d`} />
        <MetricCard icon={Activity} label="Jobs total"
          value={fmtInt(t.jobs_total)}
          sub={`${t.jobs_done || 0}✓ / ${t.jobs_failed || 0}✗ / ${t.jobs_inflight || 0}…`} />
        <MetricCard icon={Activity} label="Success rate"
          value={hasAny ? `${(t.success_rate_pct || 0).toFixed(1)}%` : "—"}
          sub={`${t.jobs_done || 0}/${t.jobs_total || 0} completed`} />
        <MetricCard icon={Activity} label="Quota spent (RTMP)"
          value={fmtInt(t.units_spent_rtmp)}
          sub={`API units, last ${days}d`} />
        <MetricCard icon={Activity} label="Quota saved"
          value={fmtInt(t.units_saved)}
          sub={`vs videos.insert (${fmtInt(t.videos_insert_equivalent_cost)} would-have-cost)`} />
        <MetricCard icon={Activity} label="Extra capacity gained"
          value={hasAny ? `+${Math.floor((t.units_saved || 0) / 250)}` : "—"}
          sub="more uploads from the saved quota" />
      </div>

      <div className="mt-4">
        <SectionTitle>Recent broadcasts (last 25)</SectionTitle>
        {(!rtmp.recent || rtmp.recent.length === 0) ? (
          <div className="text-xs text-gray-600 italic px-3 py-4 text-center border border-border rounded-md">
            {enabled
              ? "No RTMP broadcasts yet — publish a clip with provider=native_rtmp to populate."
              : "Feature is OFF. Flip the env var and publish a clip to start collecting audit data."}
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#0a0a0a] text-left text-gray-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Job</th>
                    <th className="px-3 py-2 font-semibold">Channel</th>
                    <th className="px-3 py-2 font-semibold">Title</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Video ID / URL</th>
                    <th className="px-3 py-2 font-semibold text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rtmp.recent.map((r) => (
                    <tr key={r.job_id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 font-mono text-gray-400">#{r.job_id}</td>
                      <td className="px-3 py-2 text-gray-300 truncate max-w-[140px]">
                        {r.channel_name || `ch ${r.channel_id || "?"}`}
                      </td>
                      <td className="px-3 py-2 text-gray-300 truncate max-w-[260px]" title={r.title}>
                        {r.title || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === "done"   ? "bg-emerald-500/15 text-emerald-300" :
                          r.status === "failed" ? "bg-red-500/15 text-red-300"         :
                          r.status === "queued" || r.status === "uploading" || r.status === "processing"
                                                ? "bg-blue-500/15 text-blue-300"        :
                                                  "bg-gray-500/15 text-gray-300"
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.watch_url ? (
                          <a href={r.watch_url} target="_blank" rel="noreferrer"
                             className="text-blue-400 hover:text-blue-300 font-mono">
                            {r.video_id}
                          </a>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                        {relTime(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {rtmp.by_channel && rtmp.by_channel.length > 0 && (
        <div className="mt-4">
          <SectionTitle>By channel (last {days}d)</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {rtmp.by_channel.map((c) => (
              <div key={c.channel_id} className="bg-[#0a0a0a] border border-border rounded p-2.5">
                <div className="text-xs text-gray-200 truncate" title={c.channel_name}>
                  {c.channel_name || `Channel ${c.channel_id}`}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 tabular-nums">
                  {c.total} total · <span className="text-emerald-400">{c.done}✓</span> · <span className="text-red-400">{c.failed}✗</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
