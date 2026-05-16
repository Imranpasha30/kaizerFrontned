import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Cpu, MemoryStick, HardDrive, Server, Network,
  RefreshCw, Database, Zap, Gauge,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import { adminApi } from "../api/client";
import Button from "../components/ui/Button";
import {
  Page, PageHeader, DashCard, KpiTile, RangeTabs, SectionTitle, EmptySlot,
  ErrorBanner, ChartTooltip, CHART, FilterButton, LiveDot,
} from "./admin/_primitives";

// ─── Formatters ───────────────────────────────────────────────────────

const fmtPct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);
const fmtGB  = (n) => (n == null ? "—" : `${Number(n).toFixed(2)} GB`);
const fmtMB  = (n) => (n == null ? "—" : `${Math.round(Number(n))} MB`);
const fmtBps = (n) => {
  if (n == null) return "—";
  const v = Number(n);
  if (v < 1024) return `${v} B/s`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB/s`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(v / 1024 ** 3).toFixed(2)} GB/s`;
};

const fmtTimeOnly = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ─── Range picker ─────────────────────────────────────────────────────

const RANGES = [
  { label: "1h",  value: "1",   hours: 1,   bucket: 0  },
  { label: "6h",  value: "6",   hours: 6,   bucket: 0  },
  { label: "24h", value: "24",  hours: 24,  bucket: 2  },
  { label: "3d",  value: "72",  hours: 72,  bucket: 5  },
  { label: "7d",  value: "168", hours: 168, bucket: 15 },
  { label: "14d", value: "336", hours: 336, bucket: 30 },
];

// ─── Polling hook (page-hidden-aware) ─────────────────────────────────

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

// ─── KPI summary tile (avg / p95 / max) ───────────────────────────────

function CapacityKpi({ icon: Icon, label, summary, format, tone = "cyan" }) {
  const value = summary?.p95 != null ? format(summary.p95) : "—";
  return (
    <div className={`adm-kpi adm-kpi--${tone === "cyan" ? "" : tone}`.trim()}>
      <div className="adm-kpi__label flex items-center gap-1.5">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="adm-kpi__value">{value}</div>
      <div className="adm-kpi__delta">
        <span style={{ opacity: 0.92 }}>avg {format(summary?.avg)}</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span style={{ opacity: 0.92 }}>max {format(summary?.max)}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────

export default function AdminCapacity() {
  const [rangeVal, setRangeVal] = useState("24");
  const range = RANGES.find((r) => r.value === rangeVal) || RANGES[2];

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [autoRefresh, setAuto]  = useState(true);
  const [lastTs, setLastTs]     = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await adminApi.systemHistory(range.hours, range.bucket);
      setData(d);
      setError("");
      setLastTs(new Date());
    } catch (e) {
      setError(e?.message || "Failed to load system history");
    } finally {
      setLoading(false);
    }
  }, [range.hours, range.bucket]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Short windows refresh every 30s; long windows every 5 min.
  const refreshMs = range.hours <= 24 ? 30_000 : 300_000;
  usePolling(load, refreshMs, { enabled: autoRefresh, deps: [range.hours, range.bucket] });

  const samples = data?.samples || [];
  const sum     = data?.summary || {};
  const totalRam = useMemo(() => {
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i]?.ram_used_gb != null && samples[i]?.ram_percent) {
        return samples[i].ram_used_gb / (samples[i].ram_percent / 100);
      }
    }
    return null;
  }, [samples]);
  const gpuTotalMb = samples[samples.length - 1]?.gpu_mem_total_mb || null;

  return (
    <Page>
      {/* ─── Header ─────────────────────────────────────── */}
      <PageHeader
        eyebrow="Capacity planning"
        title="System / Resource history"
        accent="cyan"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span>last <span style={{ color: "var(--adm-text-2)" }}>{range.label}</span></span>
            {data && <span>· <span style={{ color: "var(--adm-text-2)" }}>{data.raw_count}</span> samples</span>}
            {lastTs && <span>· refreshed <span style={{ color: "var(--adm-text-2)" }}>{fmtTimeOnly(lastTs.toISOString())}</span></span>}
            {autoRefresh && <LiveDot label="live" />}
          </span>
        }
        actions={
          <>
            <RangeTabs
              value={rangeVal}
              onChange={setRangeVal}
              options={RANGES.map(({ label, value }) => ({ label, value }))}
            />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw size={12} className={loading ? "animate-spin" : ""} />}
              onClick={() => { setLoading(true); load(); }}
            >
              Refresh
            </Button>
            <FilterButton active={autoRefresh} onClick={() => setAuto((v) => !v)}>
              Auto-refresh {autoRefresh ? "ON" : "OFF"}
            </FilterButton>
          </>
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError("")} />

      {/* ─── Kaizer-only KPI strip (PRIMARY) ──────────────── */}
      <div>
        <div className="adm-section-title mb-2 flex items-center gap-2">
          <Gauge size={12} /> Kaizer footprint
          <span className="text-[10px] normal-case tracking-normal" style={{ color: "var(--adm-text-5)" }}>
            uvicorn + pipeline subprocess + ffmpeg + vite + cloudflared
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <CapacityKpi icon={Cpu}         label="CPU p95"        tone="cyan"    summary={sum?.kaizer_cpu_percent}  format={fmtPct} />
          <CapacityKpi icon={MemoryStick} label="RAM p95"        tone="violet"  summary={sum?.kaizer_rss_gb}       format={fmtGB}  />
          <CapacityKpi icon={Server}      label="GPU p95"        tone="indigo"  summary={sum?.kaizer_gpu_util}     format={fmtPct} />
          <CapacityKpi icon={Database}    label="Proc p95"       tone="emerald" summary={sum?.kaizer_proc_count}   format={(n) => (n == null ? "—" : `${Math.round(Number(n))} procs`)} />
          <CapacityKpi icon={Zap}         label="ffmpeg peak"    tone="amber"   summary={sum?.kaizer_ffmpeg_count} format={(n) => (n == null ? "—" : `${Math.round(Number(n))} jobs`)} />
        </div>
      </div>

      {/* ─── Whole-machine context strip (SECONDARY, dimmed) ── */}
      <div>
        <div className="adm-section-title mb-2 flex items-center gap-2" style={{ opacity: 0.7 }}>
          <Cpu size={12} /> Whole machine — for context
          <span className="text-[10px] normal-case tracking-normal" style={{ color: "var(--adm-text-5)" }}>
            includes Chrome, VS Code, etc. — not what you size the cloud against
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 opacity-70">
          <CapacityKpi icon={Cpu}         label="CPU p95"     tone="cyan"   summary={sum?.cpu_percent} format={fmtPct} />
          <CapacityKpi icon={MemoryStick} label="RAM p95"     tone="cyan"   summary={sum?.ram_percent} format={fmtPct} />
          <CapacityKpi icon={MemoryStick} label="RAM GB p95"  tone="cyan"   summary={sum?.ram_used_gb} format={fmtGB}  />
          <CapacityKpi icon={Server}      label="GPU p95"     tone="cyan"   summary={sum?.gpu_util}    format={fmtPct} />
        </div>
      </div>

      {/* ─── Sizing-recommendation strip ─────────────── */}
      <DashCard icon={Zap} title="Sizing recommendation (Kaizer-only)">
        <SizingHints summary={sum} totalRam={totalRam} gpuTotalMb={gpuTotalMb} />
      </DashCard>

      {/* ─── CPU & RAM chart — Kaizer-only overlaid on whole-machine ── */}
      <DashCard
        icon={Cpu}
        title="CPU & RAM — Kaizer vs whole machine"
        action={<span className="text-[10px]" style={{ color: "var(--adm-text-5)" }}>solid = Kaizer-only · dashed/faint = whole machine</span>}
      >
        <div className="h-72">
          {samples.length === 0 ? (
            <EmptySlot text={loading ? "Loading..." : "No samples yet — give the sampler ~30s after first start."} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={samples} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="kCpuFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor={CHART.series[0]} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={CHART.series[0]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="kRamFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor={CHART.series[1]} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={CHART.series[1]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis dataKey="ts" stroke={CHART.axis} fontSize={10}
                       tickFormatter={fmtTimeOnly} interval="preserveStartEnd" minTickGap={40} />
                <YAxis yAxisId="pct" stroke={CHART.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis yAxisId="gb"  stroke={CHART.axis} fontSize={10} orientation="right" tickFormatter={(v) => `${v}GB`} />
                <Tooltip content={(p) => <ChartTooltip {...p} labelFormatter={fmtDateTime} formatter={(v, e) => (e?.dataKey === "kaizer_rss_gb" ? fmtGB(v) : fmtPct(v))} />} />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART.text }} iconType="circle" />
                {/* Kaizer-only (PRIMARY — solid, with fill) */}
                <Area yAxisId="pct" type="monotone" dataKey="kaizer_cpu_percent" name="Kaizer CPU %" stroke={CHART.series[0]} fill="url(#kCpuFill)" strokeWidth={2.2} />
                <Area yAxisId="gb"  type="monotone" dataKey="kaizer_rss_gb"      name="Kaizer RAM GB" stroke={CHART.series[1]} fill="url(#kRamFill)" strokeWidth={2.2} />
                {/* Whole-machine (CONTEXT — thin dashed, no fill) */}
                <Line yAxisId="pct" type="monotone" dataKey="cpu_percent" name="Machine CPU %" stroke={CHART.series[0]} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="pct" type="monotone" dataKey="ram_percent" name="Machine RAM %" stroke={CHART.series[1]} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DashCard>

      {/* ─── GPU + process row ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <DashCard icon={Server} title="GPU utilisation & memory">
          <div className="h-64">
            {samples.length === 0 ? <EmptySlot text="Loading…" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samples} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="ts" stroke={CHART.axis} fontSize={10}
                         tickFormatter={fmtTimeOnly} interval="preserveStartEnd" minTickGap={40} />
                  <YAxis yAxisId="util" stroke={CHART.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis yAxisId="mem"  stroke={CHART.axis} fontSize={10} orientation="right" tickFormatter={(v) => `${v}MB`} />
                  <Tooltip content={(p) => <ChartTooltip {...p} labelFormatter={fmtDateTime} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: CHART.text }} iconType="circle" />
                  <Line yAxisId="util" type="monotone" dataKey="gpu_util" name="GPU util" stroke={CHART.series[2]} strokeWidth={2} dot={false} />
                  <Line yAxisId="mem"  type="monotone" dataKey="gpu_mem_used_mb" name="GPU mem" stroke={CHART.series[3]} strokeWidth={2} dot={false} strokeDasharray={CHART.dashArray[1]} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </DashCard>

        <DashCard icon={Database} title="Backend process — RSS & threads">
          <div className="h-64">
            {samples.length === 0 ? <EmptySlot text="Loading…" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samples} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="ts" stroke={CHART.axis} fontSize={10}
                         tickFormatter={fmtTimeOnly} interval="preserveStartEnd" minTickGap={40} />
                  <YAxis yAxisId="rss" stroke={CHART.axis} fontSize={10} tickFormatter={(v) => `${v}GB`} />
                  <YAxis yAxisId="th"  stroke={CHART.axis} fontSize={10} orientation="right" />
                  <Tooltip content={(p) => <ChartTooltip {...p} labelFormatter={fmtDateTime} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: CHART.text }} iconType="circle" />
                  <Line yAxisId="rss" type="monotone" dataKey="proc_rss_gb"  name="RSS"     stroke={CHART.series[1]} strokeWidth={2} dot={false} />
                  <Line yAxisId="th"  type="monotone" dataKey="proc_threads" name="Threads" stroke={CHART.series[5]} strokeWidth={2} dot={false} strokeDasharray={CHART.dashArray[1]} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </DashCard>
      </div>

      {/* ─── Network + disk row ─────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <DashCard icon={Network} title="Network throughput (bytes/sec)">
          <div className="h-56">
            {samples.length === 0 ? <EmptySlot text="Loading…" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samples} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="ts" stroke={CHART.axis} fontSize={10}
                         tickFormatter={fmtTimeOnly} interval="preserveStartEnd" minTickGap={40} />
                  <YAxis stroke={CHART.axis} fontSize={10}
                         tickFormatter={(v) => v > 1024 ** 2 ? `${(v / 1024 ** 2).toFixed(0)}MB` : `${(v / 1024).toFixed(0)}KB`} />
                  <Tooltip content={(p) => <ChartTooltip {...p} labelFormatter={fmtDateTime} formatter={fmtBps} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: CHART.text }} iconType="circle" />
                  <Line type="monotone" dataKey="net_rx_bps" name="RX" stroke={CHART.series[1]} strokeWidth={1.6} dot={false} />
                  <Line type="monotone" dataKey="net_tx_bps" name="TX" stroke={CHART.series[3]} strokeWidth={1.6} dot={false} strokeDasharray={CHART.dashArray[1]} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </DashCard>

        <DashCard icon={HardDrive} title="Disk usage %">
          <div className="h-56">
            {samples.length === 0 ? <EmptySlot text="Loading…" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={samples} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="diskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={CHART.series[3]} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={CHART.series[3]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="ts" stroke={CHART.axis} fontSize={10}
                         tickFormatter={fmtTimeOnly} interval="preserveStartEnd" minTickGap={40} />
                  <YAxis stroke={CHART.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={(p) => <ChartTooltip {...p} labelFormatter={fmtDateTime} formatter={fmtPct} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: CHART.text }} iconType="circle" />
                  <Area type="monotone" dataKey="disk_percent" name="Disk" stroke={CHART.series[3]} fill="url(#diskFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </DashCard>
      </div>

      <div className="text-[10px] text-center pt-2" style={{ color: "var(--adm-text-5)" }}>
        Sampler writes one row every ~30s · retention 14 days · auto-prunes hourly
      </div>
    </Page>
  );
}

// ─── Sizing recommendation strip ───────────────────────────────────────

function SizingHints({ summary, totalRam, gpuTotalMb }) {
  // Read from the Kaizer-only summary (cloud sizing isn't about what
  // the rest of your computer is doing — only what OUR stack needs).
  const cpuMax = summary?.kaizer_cpu_percent?.max ?? 0;
  const ramMax = summary?.kaizer_rss_gb?.max     ?? 0;
  const gpuMax = summary?.kaizer_gpu_util?.max   ?? 0;

  const cpuHint = cpuMax < 30 ? "2 vCPU enough"
                : cpuMax < 60 ? "4 vCPU comfortable"
                : cpuMax < 85 ? "8 vCPU recommended"
                : "8+ vCPU at peak — burstable not safe";
  const ramHint = ramMax < 2  ? "2 GB RAM enough"
                : ramMax < 4  ? "4 GB RAM comfortable"
                : ramMax < 8  ? "8 GB RAM recommended"
                : ramMax < 14 ? "16 GB RAM safe headroom"
                : "16 GB+ RAM — pipeline is RAM-heavy";
  const gpuHint = gpuMax < 5  ? "GPU optional (NVENC idle)"
                : gpuMax < 30 ? "Entry GPU (T4 / L4) plenty"
                : gpuMax < 70 ? "Mid GPU (L4 / A10) recommended"
                : "Dedicated GPU box — encoder is the bottleneck";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Hint icon={Cpu}    label="CPU"  primary={cpuHint}
            sub={`Kaizer peak ${cpuMax?.toFixed?.(1) ?? "—"}% across this window`} />
      <Hint icon={MemoryStick} label="RAM" primary={ramHint}
            sub={`Kaizer peak ${ramMax.toFixed(2)} GB${totalRam ? ` (box has ${totalRam.toFixed(2)} GB)` : ""}`} />
      <Hint icon={Server} label="GPU" primary={gpuHint}
            sub={`Kaizer peak ${gpuMax?.toFixed?.(1) ?? "—"}% util${gpuTotalMb ? ` · ${gpuTotalMb} MB VRAM on box` : ""}`} />
    </div>
  );
}

function Hint({ icon: Icon, label, primary, sub }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(6,182,212,0.04))",
        border: "1px solid var(--adm-border)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--adm-text-4)" }}>
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="text-sm font-semibold mt-1" style={{ color: "var(--adm-text)" }}>{primary}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--adm-text-4)" }}>{sub}</div>
    </div>
  );
}
