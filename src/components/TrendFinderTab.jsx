import { Fragment, useEffect, useMemo, useState } from "react";
import { TrendingUp, Download, Loader2, Sparkles, AlertCircle, RefreshCw, Info, Clock, BarChart2, BookOpen } from "lucide-react";
import { api } from "../api/client";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n || 0)));

/** Visual charts rendered from the report JSON — readable at a glance for non-experts. */
function ReportCharts({ data }) {
  if (!data || data.mode === "starter") return null;
  const timing = data.timing || {};
  const heat = timing.heatmap || [];
  const perDay = timing.per_day_best || [];
  const tiers = data.tiers || {};
  const drivers = (data.drivers || []).slice(0, 6);
  const maxHeat = Math.max(1, ...heat.map((c) => c.score || 0));
  const grid = {}; heat.forEach((c) => { grid[`${c.dow}-${c.hour}`] = c; });
  const tierRows = [
    ["breakout", "Breakout", "bg-emerald-500"],
    ["solid", "Solid", "bg-sky-500"],
    ["under", "Underperformer", "bg-rose-500"],
  ];
  const maxTier = Math.max(1, ...tierRows.map(([k]) => (tiers[k]?.n || 0)));
  const maxDriver = Math.max(0.001, ...drivers.map((d) => Math.abs(d.correlation || 0)));

  return (
    <div className="space-y-5 mb-5">
      {/* Best time to post — weekly heatmap */}
      {heat.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white mb-2">
            <Clock size={14} className="text-accent2" /> Best time to post (your week)
          </div>
          <div className="overflow-x-auto">
            <div className="inline-grid" style={{ gridTemplateColumns: "34px repeat(24, 14px)", gap: 2 }}>
              <div />
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="text-[7px] text-gray-600 text-center">{h % 6 === 0 ? h : ""}</div>
              ))}
              {DOW.map((d, di) => (
                <Fragment key={di}>
                  <div className="text-[9px] text-gray-400 flex items-center">{d}</div>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const c = grid[`${di}-${h}`];
                    const v = c ? (c.score || 0) / maxHeat : 0;
                    return (
                      <div key={h}
                        title={c ? `${d} ${String(h).padStart(2, "0")}:00 — ${c.score} early views/hr (n=${c.n})`
                                 : `${d} ${String(h).padStart(2, "0")}:00 — no posts`}
                        style={{ width: 14, height: 14, borderRadius: 2,
                                 background: c ? `rgba(45,212,191,${0.12 + v * 0.88})` : "rgba(255,255,255,0.035)" }} />
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-gray-500 mt-1.5">Brighter = videos posted then gain views fastest. Hours are your channel's local time (0–23). Hover a square for details.</div>
        </div>
      )}

      {/* Per-day best hour */}
      {perDay.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <div className="text-[12px] font-semibold text-white mb-2">Each day's best hour</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {perDay.map((d) => (
              <div key={d.dow} className="rounded bg-white/5 border border-gray-800 p-2 text-center">
                <div className="text-[10px] text-gray-400">{d.day}</div>
                <div className="text-sm font-bold text-accent2">{String(d.hour).padStart(2, "0")}:00</div>
                <div className="text-[9px] text-gray-600">{fmtN(d.score)}/hr · n={d.n}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Tiers */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white mb-2">
            <BarChart2 size={14} className="text-accent2" /> How your videos split
          </div>
          {tierRows.map(([k, label, color]) => {
            const nn = tiers[k]?.n || 0;
            return (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <div className="w-24 text-[11px] text-gray-400 shrink-0">{label}</div>
                <div className="flex-1 bg-white/5 rounded h-4 overflow-hidden">
                  <div className={`${color} h-4 rounded`} style={{ width: `${(nn / maxTier) * 100}%` }} />
                </div>
                <div className="w-12 text-right text-[11px] text-gray-300 tabular-nums">{fmtN(nn)}</div>
              </div>
            );
          })}
        </div>

        {/* Drivers */}
        {drivers.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <div className="text-[12px] font-semibold text-white mb-2">What moves your views (strength)</div>
            {drivers.map((d) => (
              <div key={d.factor} className="flex items-center gap-2 mb-1.5">
                <div className="w-32 text-[11px] text-gray-400 shrink-0 truncate" title={d.factor}>
                  {d.factor.replace(/_/g, " ")}
                  {d.n != null && <span className="text-gray-600"> · n={fmtN(d.n)}{d.limited_sample ? " ⚠" : ""}</span>}
                </div>
                <div className="flex-1 bg-white/5 rounded h-4 overflow-hidden">
                  <div className={`h-4 rounded ${d.limited_sample ? "bg-gray-500" : d.correlation >= 0 ? "bg-teal-500" : "bg-amber-500"}`}
                       style={{ width: `${(Math.abs(d.correlation) / maxDriver) * 100}%` }} />
                </div>
                <div className="w-12 text-right text-[11px] text-gray-300 tabular-nums">{(d.correlation >= 0 ? "+" : "") + d.correlation.toFixed(2)}</div>
              </div>
            ))}
            <div className="text-[9.5px] text-gray-600 mt-1">Correlation with views on your own data (−1…+1), well-measured factors first. ⚠ = limited sample. Strong link, not proof of cause.</div>
          </div>
        )}
      </div>

      {/* Glossary */}
      {data.glossary && Object.keys(data.glossary).length > 0 && (
        <details className="rounded-lg border border-border p-3">
          <summary className="flex items-center gap-1.5 text-[12px] font-semibold text-white cursor-pointer">
            <BookOpen size={14} className="text-accent2" /> What these words mean (plain English)
          </summary>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(data.glossary).map(([term, desc]) => (
              <div key={term} className="text-[12px]">
                <dt className="text-gray-200 font-medium inline">{term}: </dt>
                <dd className="text-gray-400 inline">{desc}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

/**
 * TrendFinderTab — the channel root-cause analyzer, a dedicated tab inside Insights.
 *
 * Pick a connected channel → Analyze → a precise, evidence-backed diagnosis (the 10
 * dimensions, ranked drivers, targets, next-10) rendered from the backend's report, with
 * export. Reuses the page's ytChannels (no extra fetch). Backend: /api/insights/*.
 *
 * Kaizer X is a production & analytics tool — this diagnoses editorial/content performance.
 */

// ── tiny markdown renderer (the report is a known GFM subset we produce) ──
function inline(t, kp = "i") {
  const nodes = [];
  let rest = String(t || ""), k = 0;
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { nodes.push(rest); break; }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    if (m[1]) nodes.push(<strong key={`${kp}${k++}`} className="text-white">{m[2]}</strong>);
    else if (m[3]) nodes.push(<a key={`${kp}${k++}`} href={m[5]} target="_blank" rel="noreferrer" className="text-accent2 underline hover:text-accent">{m[4]}</a>);
    else nodes.push(<code key={`${kp}${k++}`} className="px-1 rounded bg-black/40 text-teal-300 text-[12px]">{m[7]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}
const _row = (l) => l.replace(/^\s*\|?/, "").replace(/\|?\s*$/, "").split("|").map((c) => c.trim());
const _blockStart = (l) => /^(#{1,3} |> |\s*[-*] |\s*\d+\. |\||---+\s*$)/.test(l);

function Markdown({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?[-:\s|]+\|?\s*$/.test(lines[i + 1])) {
      const head = _row(line); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(_row(lines[i])); i++; }
      out.push(
        <div key={key++} className="overflow-x-auto my-3">
          <table className="w-full text-[12px] border border-gray-800">
            <thead><tr className="bg-white/5">{head.map((h, j) => <th key={j} className="px-2 py-1.5 text-left text-gray-300 border border-gray-800">{inline(h, `th${key}-${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2 py-1.5 text-gray-400 border border-gray-800 align-top">{inline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>); continue;
    }
    if (line.startsWith("### ")) { out.push(<h4 key={key++} className="text-sm font-semibold text-white mt-4 mb-1">{inline(line.slice(4))}</h4>); i++; continue; }
    if (line.startsWith("## ")) { out.push(<h3 key={key++} className="text-base font-bold text-white mt-5 mb-2 pb-1 border-b border-border">{inline(line.slice(3))}</h3>); i++; continue; }
    if (line.startsWith("# ")) { out.push(<h2 key={key++} className="text-lg font-bold text-white mt-2 mb-2">{inline(line.slice(2))}</h2>); i++; continue; }
    if (line.startsWith("> ")) {
      const buf = []; while (i < lines.length && lines[i].startsWith("> ")) { buf.push(lines[i].slice(2)); i++; }
      out.push(<blockquote key={key++} className="border-l-2 border-accent2/60 pl-3 my-2 text-gray-400 text-[13px] italic">{inline(buf.join(" "))}</blockquote>); continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items = []; while (i < lines.length && /^\s*[-*] /.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*] /, "")); i++; }
      out.push(<ul key={key++} className="list-disc ml-5 my-2 space-y-1 text-[13px] text-gray-300">{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>); continue;
    }
    if (/^\s*\d+\. /.test(line)) {
      const items = []; while (i < lines.length && /^\s*\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s/, "")); i++; }
      out.push(<ol key={key++} className="list-decimal ml-5 my-2 space-y-1 text-[13px] text-gray-300">{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>); continue;
    }
    if (/^---+$/.test(line.trim())) { out.push(<hr key={key++} className="my-4 border-border" />); i++; continue; }
    const buf = [line]; i++;
    while (i < lines.length && lines[i].trim() && !_blockStart(lines[i])) { buf.push(lines[i]); i++; }
    out.push(<p key={key++} className="text-[13px] text-gray-300 my-2 leading-relaxed">{inline(buf.join(" "))}</p>);
  }
  return <div>{out}</div>;
}

const MODE_BADGE = {
  deep: { t: "Deep diagnostic", c: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40" },
  blend: { t: "Early-stage (growing confidence)", c: "bg-amber-500/20 text-amber-200 border-amber-400/40" },
  starter: { t: "Starter plan", c: "bg-sky-500/20 text-sky-200 border-sky-400/40" },
};

export default function TrendFinderTab({ ytChannels = [], initialGcid = "" }) {
  const [gcid, setGcid] = useState(initialGcid || (ytChannels[0]?.google_channel_id || ""));
  const [provider, setProvider] = useState("gemini");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState("");          // live progress message while a run is in flight
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const channel = useMemo(
    () => ytChannels.find((c) => c.google_channel_id === gcid) || null, [ytChannels, gcid]);

  // Load an existing report (no re-run) when the channel changes.
  useEffect(() => {
    if (!gcid) { setReport(null); return; }
    let alive = true;
    setErr(""); setNote("");
    api.insightsLatest(gcid)
      .then((r) => { if (alive) { setReport(r); } })
      .catch(() => { if (alive) setReport(null); });   // 404 = none yet
    return () => { alive = false; };
  }, [gcid]);

  async function analyze() {
    if (!gcid) return;
    setBusy(true); setErr(""); setNote(""); setProg("Queued…");
    try {
      // Background run (a big channel takes minutes) → poll for status.
      const { run_id } = await api.insightsAnalyze({ google_channel_id: gcid, provider, force });
      const started = Date.now();
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api.insightsAnalyzeStatus(run_id);
        if (st.msg) setProg(st.msg);
        if (st.status === "done") {
          const r = st.result || {};
          setReport(r);
          setNote(`Analyzed ${r.videos_analyzed} videos · ${r.access_mode === "full" ? "full analytics" : "public data only"}.`);
          break;
        }
        if (st.status === "failed") { setErr(st.error || "Analysis failed."); break; }
        if (Date.now() - started > 10 * 60 * 1000) { setErr("Analysis is taking too long — please try again."); break; }
      }
    } catch (e) {
      setErr(e?.message || "Analysis failed. Make sure this is your own connected channel.");
    } finally { setBusy(false); setProg(""); }
  }

  function exportMd() {
    if (!report?.report_md) return;
    const blob = new Blob([report.report_md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kaizer-insights-${gcid}.md`; a.click();
    URL.revokeObjectURL(url);
  }

  const caveats = report?.report_json?.data_coverage?.caveats || [];
  const mode = report?.mode || report?.report_json?.mode;

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="rounded-xl border border-border bg-panel p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={18} className="text-accent2" />
          <h2 className="text-white font-semibold">Channel Doctor — root-cause analyzer</h2>
        </div>
        <p className="text-[12px] text-gray-500">
          Reads your channel's full history and diagnoses exactly what's holding videos back —
          CTR, retention, early velocity, traffic sources, timing, cadence, topics — then tells you
          what to fix. Precise on what you control; honest that views also depend on the news cycle
          and algorithmic luck.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-border bg-panel p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-400">Channel</span>
          <select value={gcid} onChange={(e) => setGcid(e.target.value)}
            className="bg-black border border-border rounded px-2 py-1.5 text-sm text-white min-w-[220px]">
            <option value="">Select a channel…</option>
            {ytChannels.map((c) => (
              <option key={c.google_channel_id} value={c.google_channel_id}>
                {c.youtube_channel_title || c.google_channel_id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-400">Write-up</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="bg-black border border-border rounded px-2 py-1.5 text-sm text-white">
            <option value="gemini">Smart (AI-written)</option>
            <option value="deterministic">Plain (facts only)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-400 pb-2">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
          Refresh data (re-pull)
        </label>
        <button type="button" disabled={!gcid || busy} onClick={analyze}
          className="ml-auto px-4 py-2 rounded-lg bg-accent2 hover:bg-accent text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {busy ? "Analyzing…" : (report ? "Re-analyze" : "Analyze channel")}
        </button>
        {report?.report_md && (
          <button type="button" onClick={exportMd}
            className="px-3 py-2 rounded-lg border border-gray-600 text-gray-200 text-sm hover:border-accent2 flex items-center gap-1.5">
            <Download size={14} /> Export
          </button>
        )}
      </div>

      {busy && (
        <div className="text-gray-400 text-sm flex items-center gap-2">
          <Loader2 className="animate-spin" size={15} /> {prog || "Reading your channel history and diagnosing…"} <span className="text-gray-600">(big channels take a minute)</span>
        </div>
      )}
      {err && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {err}
        </div>
      )}
      {note && !busy && (
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-[12px] rounded flex items-center gap-2">
          <RefreshCw size={13} /> {note}
        </div>
      )}

      {/* Report */}
      {!report && !busy && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-gray-500 text-sm">
          {gcid ? "No analysis yet for this channel — click Analyze." : "Pick a connected channel to begin."}
        </div>
      )}

      {report && (
        <div className="rounded-xl border border-border bg-panel p-5">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {mode && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${(MODE_BADGE[mode] || MODE_BADGE.deep).c}`}>
                {(MODE_BADGE[mode] || MODE_BADGE.deep).t}
              </span>
            )}
            {report.report_json?.channel_profile?.name && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/40">
                {report.report_json.channel_profile.name}{report.report_json.channel_profile.high_volume ? " · high-volume" : ""}
              </span>
            )}
            {report.report_json?.data_coverage?.access_mode === "public" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-gray-500/20 text-gray-300 border-gray-500/40">
                public data only
              </span>
            )}
            {channel && <span className="text-[12px] text-gray-500">{channel.youtube_channel_title}</span>}
          </div>

          {caveats.length > 0 && (
            <div className="mb-3 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-[11px] flex items-start gap-1.5">
              <Info size={13} className="mt-0.5 shrink-0" />
              <div>{caveats.map((c, j) => <div key={j}>{c}</div>)}</div>
            </div>
          )}

          {/* Visual charts (heatmap, per-day, tiers, drivers, glossary) for non-experts. */}
          <ReportCharts data={report.report_json} />

          <Markdown text={report.report_md} />
        </div>
      )}
    </div>
  );
}
