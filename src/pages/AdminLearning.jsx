import React, { useCallback, useEffect, useState } from "react";
import {
  Brain, Download, RefreshCw, Loader2, AlertCircle, Eye, Target,
  Languages, Globe, TrendingUp, Database, Hash,
} from "lucide-react";
import { adminApi } from "../api/client";
import "../theme/admin-theme.css";

// One row per published video. FEATURES (content + the SEO that shipped) are
// snapshotted at poll time, joined to the measured outcome (LABELS). The export
// is training-ready — no cleaning needed. This view is the "see the data"
// surface: how much we've collected, coverage, and which patterns win.

function Kpi({ variant = "", icon: Icon, label, value, sub }) {
  return (
    <div className={`adm-kpi ${variant}`}>
      <div className="adm-kpi__label flex items-center gap-1.5">
        {Icon ? <Icon size={11} /> : null} {label}
      </div>
      <div className="adm-kpi__value tabular-nums">{value}</div>
      {sub ? <div className="adm-kpi__delta">{sub}</div> : null}
    </div>
  );
}

function Pct(n, d) {
  if (!d) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function Breakdown({ icon: Icon, title, map }) {
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="adm-card p-3">
      <div className="adm-section-title mb-2">
        {Icon ? <Icon size={13} /> : null} {title}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs" style={{ color: "var(--adm-text-5)" }}>no data yet</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--adm-text-3)" }}>{k || "—"}</span>
              <span className="adm-chip tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLearning() {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(true);
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState("");   // "" | "backfill" | "download"
  const [note, setNote]   = useState("");

  const load = useCallback(async () => {
    try {
      setErr("");
      const d = await adminApi.learningOverview();
      setData(d);
    } catch (e) {
      setErr(e?.message || "failed to load learning overview");
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onBackfill = useCallback(async () => {
    setBusy("backfill"); setNote("");
    try {
      const r = await adminApi.learningBackfill();
      setNote(`Backfill complete — built ${r?.built ?? 0} samples${r?.skipped ? `, skipped ${r.skipped}` : ""}.`);
      await load();
    } catch (e) {
      setNote(`Backfill failed: ${e?.message || "error"}`);
    } finally {
      setBusy("");
    }
  }, [load]);

  const onDownload = useCallback(async () => {
    setBusy("download"); setNote("");
    try {
      await adminApi.learningDatasetDownload();
      setNote("Dataset downloaded — kaizer_seo_training.jsonl");
    } catch (e) {
      setNote(`Download failed: ${e?.message || "error"}`);
    } finally {
      setBusy("");
    }
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--adm-text-3)" }}>
        <Loader2 size={16} className="animate-spin" /> Loading learning data…
      </div>
    );
  }

  const total      = data?.total ?? 0;
  const withViews  = data?.with_views ?? 0;
  const withCtr    = data?.with_ctr ?? 0;
  const avgVph     = data?.avg_views_per_hour ?? 0;
  const byChannel  = data?.by_channel || [];
  const topKw      = data?.top_keywords || [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="adm-section-title">
          <Brain size={14} /> Learning — SEO training dataset
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="adm-chip cursor-pointer"
            title="Refresh stats"
          >
            <RefreshCw size={11} /> Refresh
          </button>
          <button
            type="button"
            onClick={onBackfill}
            disabled={!!busy}
            className="adm-chip adm-chip--violet cursor-pointer"
            style={{ opacity: busy ? 0.6 : 1 }}
            title="(Re)build samples from existing performance history — safe & idempotent"
          >
            {busy === "backfill" ? <Loader2 size={11} className="animate-spin" /> : <Database size={11} />}
            Backfill from history
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!!busy || total === 0}
            className="adm-chip adm-chip--cyan cursor-pointer"
            style={{ opacity: (busy || total === 0) ? 0.6 : 1 }}
            title="Download the training-ready dataset as JSONL"
          >
            {busy === "download" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            Download .jsonl
          </button>
        </div>
      </div>

      <div className="text-xs -mt-2" style={{ color: "var(--adm-text-5)" }}>
        One clean row per published video — the content &amp; SEO that shipped (features) joined to the
        measured outcome (label). Training-ready: feed the JSONL straight to a model, no preprocessing.
      </div>

      {err ? (
        <div className="adm-card p-3 flex items-center gap-2 text-xs" style={{ color: "var(--adm-warning)" }}>
          <AlertCircle size={13} /> {err}
        </div>
      ) : null}

      {note ? (
        <div className="adm-card p-3 text-xs" style={{ color: "var(--adm-text-2)" }}>
          {note}
        </div>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Database} label="Samples" value={total.toLocaleString()} sub="rows collected" />
        <Kpi icon={Eye} label="With views" value={withViews.toLocaleString()}
             sub={`${Pct(withViews, total)} have an outcome`} variant="" />
        <Kpi icon={Target} label="With CTR" value={withCtr.toLocaleString()}
             sub={`${Pct(withCtr, total)} (needs YT Analytics)`} />
        <Kpi icon={TrendingUp} label="Avg views/hr" value={Number(avgVph).toLocaleString()}
             sub="rate label (age-fair)" />
      </div>

      {total === 0 ? (
        <div className="adm-card p-4 text-sm" style={{ color: "var(--adm-text-3)" }}>
          No samples yet. They accrue automatically as the analytics poller samples published
          videos. Click <strong>Backfill from history</strong> to bootstrap from existing
          performance data right now.
        </div>
      ) : null}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Breakdown icon={Languages} title="By language" map={data?.languages} />
        <Breakdown icon={Globe} title="By platform" map={data?.platforms} />
      </div>

      {/* By channel */}
      {byChannel.length > 0 ? (
        <div className="adm-card p-3">
          <div className="adm-section-title mb-2"><Database size={13} /> By channel</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--adm-text-5)" }} className="text-left">
                  <th className="py-1.5 pr-3 font-medium">Channel</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Samples</th>
                  <th className="py-1.5 font-medium text-right">Total views</th>
                </tr>
              </thead>
              <tbody>
                {byChannel.map((c) => (
                  <tr key={c.channel_id ?? c.channel_name} style={{ borderTop: "1px solid var(--adm-border)" }}>
                    <td className="py-1.5 pr-3" style={{ color: "var(--adm-text-2)" }}>
                      {c.channel_name || `#${c.channel_id ?? "?"}`}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: "var(--adm-text-3)" }}>
                      {Number(c.samples || 0).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums" style={{ color: "var(--adm-text-3)" }}>
                      {Number(c.views || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Winning keywords */}
      {topKw.length > 0 ? (
        <div className="adm-card p-3">
          <div className="adm-section-title mb-2">
            <Hash size={13} /> Winning keywords
            <span className="text-[10px] ml-1 font-normal" style={{ color: "var(--adm-text-5)" }}>
              (ranked by total views/hr · ≥2 samples)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topKw.map((k) => (
              <span
                key={k.keyword}
                className="adm-chip tabular-nums"
                title={`score ${k.score} across ${k.n} videos`}
              >
                {k.keyword}
                <span style={{ color: "var(--adm-cyan-2)" }}>· {k.score}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
