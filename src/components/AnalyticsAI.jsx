import React, { useState } from "react";
import {
  Sparkles, Loader2, AlertCircle, CheckCircle2, RefreshCw, Info,
  TrendingUp, TrendingDown, Minus, Swords, Search, Eye, Users,
  ThumbsUp, CalendarClock, Lightbulb, Wrench, ArrowRight,
} from "lucide-react";
import { api } from "../api/client";

/* ─────────────────────────────────────────────────────────────────────
   AI-powered Insights widgets — built for NON-TECHNICAL users.
   Every metric ships with a plain-language explanation; the AI Coach
   turns the raw numbers into "what's wrong + how to fix it".
   ──────────────────────────────────────────────────────────────────── */

// ── Plain-language metric dictionary ─────────────────────────────────
export const METRIC_HELP = {
  views:        "How many times people watched, added up.",
  typical:      "What a NORMAL video on this channel gets. Half the videos do better than this, half do worse — one viral hit can't inflate it.",
  best:         "The single most-watched video.",
  interaction:  "Out of every 100 views, how many people liked or commented. Higher = the audience cares, not just scrolls.",
  uploads_week: "How often this channel posts, averaged over the last 3 months. 1.0 = one video a week.",
  subs:         "People who clicked Subscribe.",
};

// 0.62/week → a sentence a human understands.
export function cadenceLabel(perWeek) {
  const v = Number(perWeek) || 0;
  if (v <= 0)   return "not posting lately";
  if (v < 0.5)  return `≈ ${Math.max(1, Math.round(v * 4.33))} video/month`;
  if (v < 1.5)  return `≈ ${Math.round(v * 4.33)} videos/month`;
  if (v < 7)    return `≈ ${Math.round(v)} videos/week`;
  return `≈ ${Math.round(v)} a week (daily+)`;
}

export function fmtN(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(v);
}

/* Circular progress gauge (SVG) — the dashboard's signature element.
   `value/max` drives the arc; `display` is the centered big text. */
export function RadialGauge({
  value = 0, max = 100, size = 72, stroke = 7,
  color = "#22d3ee", display, sublabel,
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, (Number(value) || 0) / max)) : 0;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - pct);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1b2430" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)",
                   filter: `drop-shadow(0 0 5px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-white leading-none"
              style={{ fontSize: size > 60 ? 14 : 11 }}>{display}</span>
        {sublabel && (
          <span className="text-[8px] text-gray-500 mt-0.5 uppercase tracking-wide">{sublabel}</span>
        )}
      </div>
    </div>
  );
}

/* A labelled KPI ring tile for the overview strip. */
export function KpiRing({ icon: Icon, label, value, max, color, display, sublabel, accentBg }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border p-3 ${accentBg || "bg-[#0e1218]"}`}>
      <RadialGauge value={value} max={max} color={color} display={display} sublabel={sublabel} size={66} />
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
          {Icon && <Icon size={12} style={{ color }} />} {label}
        </div>
      </div>
    </div>
  );
}

// Little ⓘ that reveals a plain-language explanation on hover/tap.
export function MetricHelp({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-gray-600 hover:text-accent2 align-middle"
        aria-label="What does this mean?"
      >
        <Info size={11} />
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-[#1a1a1a] border border-border rounded-lg p-2.5 text-[11px] leading-relaxed text-gray-200 shadow-xl normal-case font-normal tracking-normal text-left">
          {text}
        </span>
      )}
    </span>
  );
}

const STATUS_STYLE = {
  good:       { label: "Good",       cls: "bg-green-900/40 text-green-300 border-green-700/40", Icon: TrendingUp },
  okay:       { label: "Okay",       cls: "bg-yellow-900/30 text-yellow-300 border-yellow-700/40", Icon: Minus },
  needs_work: { label: "Needs work", cls: "bg-red-900/30 text-red-300 border-red-700/40", Icon: TrendingDown },
};

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.okay;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${s.cls}`}>
      <s.Icon size={10} /> {s.label}
    </span>
  );
}

const GRADE_CLS = {
  A: "bg-green-900/50 text-green-300 border-green-600/50",
  B: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  C: "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
  D: "bg-orange-900/30 text-orange-300 border-orange-700/40",
  F: "bg-red-900/40 text-red-300 border-red-700/40",
};

/* ─── AI COACH ───────────────────────────────────────────────────────
   Pick a channel (or "all channels") + optionally type a question →
   a validated, plain-language report: grade, what's working, what's
   broken (and why + how to fix), and next steps. */
export function AiCoachPanel({ ytChannels = [], initialGcid = "", hasData }) {
  // The coach has its OWN scope picker — defaults to the page's
  // selected channel but the user can retarget it right here.
  const [scope, setScope]     = useState(initialGcid || "");
  const [question, setQuestion] = useState("");
  const [report, setReport]   = useState(null);
  const [meta, setMeta]       = useState(null);   // {provider, cached, generated_at, question}
  const [ranScope, setRanScope] = useState(null); // what the visible report covers
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState("");

  React.useEffect(() => { setScope(initialGcid || ""); }, [initialGcid]);

  async function run(force = false) {
    setBusy(true); setErr("");
    try {
      const res = await api.analyticsAiReport({
        gcid: scope || null,
        force,
        question: question.trim() || null,
      });
      setReport(res.report || null);
      setMeta(res);
      setRanScope(scope || "");
    } catch (e) {
      setErr(e?.message || "AI analysis failed — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const scopeTitle = (g) => {
    if (!g) return "All channels — overview";
    const c = ytChannels.find((x) => x.google_channel_id === g);
    return c?.youtube_channel_title || "this channel";
  };

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Sparkles size={15} className="text-purple-400" /> AI Coach
        </h2>
        <span className="text-xs text-gray-500">· pick a channel, ask anything, get fixes in plain words</span>
        {meta?.cached && (
          <span className="text-[10px] text-gray-600">
            (saved report — <button className="underline hover:text-gray-400" onClick={() => run(true)}>refresh</button>)
          </span>
        )}
      </div>

      {/* Controls — channel picker + optional question + run. Always
          visible so the user can retarget or re-ask after a report. */}
      <div className="bg-gradient-to-br from-purple-950/40 to-[#111] border border-purple-800/30 rounded-lg p-3">
        <div className="flex flex-col lg:flex-row gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={busy}
            className="lg:w-64 bg-black border border-purple-800/40 rounded px-2.5 py-2 text-sm text-white disabled:opacity-50"
            title="Which channel should the AI look at?"
          >
            <option value="">🌐 All channels — overview</option>
            {ytChannels.map((c) => (
              <option key={c.google_channel_id} value={c.google_channel_id}>
                {c.youtube_channel_title || c.google_channel_id}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && hasData && !busy) run(false); }}
            maxLength={300}
            disabled={busy}
            placeholder='Ask anything (optional) — e.g. "why are my views low?", "focus on my titles"'
            className="flex-1 bg-black border border-purple-800/40 rounded px-3 py-2 text-sm text-white placeholder-gray-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy || !hasData}
            title={hasData ? "Run the AI analysis" : "Sync your channels first (Sync All button up top)"}
            className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex-shrink-0"
          >
            {busy ? <><Loader2 size={15} className="animate-spin" /> Analyzing…</>
                  : <><Sparkles size={15} /> Analyze</>}
          </button>
        </div>
        {!report && (
          <div className="text-[11px] text-gray-500 mt-2">
            The AI reads the stats of <span className="text-purple-300">{scopeTitle(scope)}</span> and
            explains — in plain words — what's going well, what's hurting, and exactly what to do next.
            {question.trim() && <> Focused on: <span className="text-purple-300">"{question.trim()}"</span></>}
          </div>
        )}
      </div>

      {err && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {err}
        </div>
      )}

      {report && (
        <div className="mt-3 bg-[#111] border border-purple-800/30 rounded-lg p-4 space-y-4">
          {/* Grade + headline */}
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-2xl font-black ${GRADE_CLS[report.grade] || GRADE_CLS.C}`}>
              {report.grade}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-medium leading-snug">{report.headline}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                {scopeTitle(ranScope)}
                {meta?.question && <> · asked: "{meta.question}"</>}
                {" · "}{meta?.provider || "ai"} · {meta?.generated_at ? new Date(meta.generated_at).toLocaleString() : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={busy}
              className="text-gray-500 hover:text-white flex-shrink-0"
              title="Re-run the analysis with fresh numbers"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
          </div>

          {/* Per-area verdicts */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ["views", "Views", METRIC_HELP.views],
              ["interaction", "Likes & comments", METRIC_HELP.interaction],
              ["upload_pace", "Posting rhythm", METRIC_HELP.uploads_week],
              ["titles", "Titles", "Are the video titles pulling clicks?"],
            ].map(([key, label, help]) => {
              const m = report[key];
              if (!m) return null;
              return (
                <div key={key} className="bg-black/40 border border-border/60 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      {label} <MetricHelp text={help} />
                    </span>
                    <StatusChip status={m.status} />
                  </div>
                  <div className="text-[11px] text-gray-300 leading-snug">{m.comment}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Working */}
            {(report.working || []).length > 0 && (
              <div className="bg-green-950/20 border border-green-900/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-green-300 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> Going well
                </div>
                <ul className="space-y-1.5">
                  {report.working.map((w, i) => (
                    <li key={i} className="text-[12px] text-gray-300 flex gap-1.5">
                      <span className="text-green-500 flex-shrink-0">•</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Issues + fixes */}
            {(report.issues || []).length > 0 && (
              <div className="bg-red-950/15 border border-red-900/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-red-300 mb-2 flex items-center gap-1.5">
                  <Wrench size={13} /> Problems & how to fix them
                </div>
                <div className="space-y-2.5">
                  {report.issues.map((iss, i) => (
                    <div key={i} className="text-[12px]">
                      <div className="text-gray-200 font-medium">{iss.problem}</div>
                      {iss.why_it_matters && (
                        <div className="text-gray-500 text-[11px] mt-0.5">{iss.why_it_matters}</div>
                      )}
                      <div className="text-accent2 text-[11px] mt-0.5 flex gap-1">
                        <Lightbulb size={11} className="flex-shrink-0 mt-0.5" /> {iss.how_to_fix}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Next steps */}
          {(report.next_steps || []).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-300 mb-1.5">Do this next:</div>
              <ol className="space-y-1">
                {report.next_steps.map((s, i) => (
                  <li key={i} className="text-[12px] text-gray-300 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-accent2/20 text-accent2 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ─── COMPARE: my channel vs my other channel OR any channel ───────── */

function SideCard({ side, label, accent }) {
  if (!side) return null;
  return (
    <div className={`flex-1 min-w-0 bg-black/40 border rounded-lg p-3 ${accent ? "border-accent2/40" : "border-border"}`}>
      <div className="flex items-center gap-2 mb-2">
        {side.thumbnail_url ? (
          <img src={side.thumbnail_url} className="w-9 h-9 rounded-full object-cover bg-gray-800" alt="" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-sm text-white">
            {(side.title || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{side.title || "(channel)"}</div>
          <div className="text-[10px] text-gray-500">
            {label} · {fmtN(side.subscriber_count)} subscribers
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, help, a, b, fmt = fmtN, higherWins = true }) {
  const av = Number(a) || 0;
  const bv = Number(b) || 0;
  const aWin = higherWins ? av > bv : av < bv;
  const bWin = higherWins ? bv > av : bv < av;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className={`text-right text-sm font-semibold ${aWin ? "text-green-300" : "text-gray-300"}`}>
        {fmt(av)} {aWin && <span className="text-[10px]">✓</span>}
      </div>
      <div className="text-[11px] text-gray-500 text-center w-40 flex items-center justify-center gap-1">
        {label} <MetricHelp text={help} />
      </div>
      <div className={`text-left text-sm font-semibold ${bWin ? "text-green-300" : "text-gray-300"}`}>
        {bWin && <span className="text-[10px]">✓</span>} {fmt(bv)}
      </div>
    </div>
  );
}

export function CompareChannelsPanel({ ytChannels }) {
  const [aGcid, setAGcid]   = useState("");
  const [bKind, setBKind]   = useState("external");   // "own" | "external"
  const [bGcid, setBGcid]   = useState("");
  const [bQuery, setBQuery] = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState("");
  const [result, setResult] = useState(null);

  const canRun = aGcid && (bKind === "own" ? (bGcid && bGcid !== aGcid) : bQuery.trim().length >= 2);

  async function run() {
    if (!canRun || busy) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      const res = await api.analyticsCompare({
        a_gcid: aGcid,
        b_kind: bKind,
        b_gcid: bKind === "own" ? bGcid : null,
        b_query: bKind === "external" ? bQuery.trim() : null,
        ai: true,
      });
      setResult(res);
    } catch (e) {
      setErr(e?.message || "Comparison failed");
    } finally {
      setBusy(false);
    }
  }

  const a = result?.a;
  const b = result?.b;
  const v = result?.verdict;

  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Swords size={15} className="text-sky-400" /> Compare Channels
        </h2>
        <span className="text-xs text-gray-500">· your channel vs anyone — even competitors</span>
      </div>

      <div className="bg-[#111] border border-border rounded-lg p-3">
        {/* Pickers */}
        <div className="flex flex-col lg:flex-row gap-2 items-stretch">
          <select
            value={aGcid}
            onChange={(e) => setAGcid(e.target.value)}
            className="flex-1 bg-black border border-border rounded px-2.5 py-2 text-sm text-white"
          >
            <option value="">Your channel…</option>
            {ytChannels.map((c) => (
              <option key={c.google_channel_id} value={c.google_channel_id}>
                {c.youtube_channel_title || c.google_channel_id}
              </option>
            ))}
          </select>

          <div className="text-center text-[11px] text-gray-500 self-center px-1 flex-shrink-0">VS</div>

          <div className="flex-1 flex gap-1.5">
            <select
              value={bKind}
              onChange={(e) => setBKind(e.target.value)}
              className="bg-black border border-border rounded px-2 py-2 text-sm text-white flex-shrink-0"
              title="Compare against one of your channels, or any channel on YouTube"
            >
              <option value="external">Any channel</option>
              <option value="own">My channel</option>
            </select>
            {bKind === "own" ? (
              <select
                value={bGcid}
                onChange={(e) => setBGcid(e.target.value)}
                className="flex-1 bg-black border border-border rounded px-2.5 py-2 text-sm text-white"
              >
                <option value="">Pick the other channel…</option>
                {ytChannels.filter((c) => c.google_channel_id !== aGcid).map((c) => (
                  <option key={c.google_channel_id} value={c.google_channel_id}>
                    {c.youtube_channel_title || c.google_channel_id}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex-1 relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={bQuery}
                  onChange={(e) => setBQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") run(); }}
                  placeholder="@handle, channel link, or name — e.g. @KaizerXTelugu"
                  className="w-full bg-black border border-border rounded pl-8 pr-2.5 py-2 text-sm text-white"
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={run}
            disabled={!canRun || busy}
            className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 flex-shrink-0"
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Comparing…</> : <>Compare <ArrowRight size={14} /></>}
          </button>
        </div>

        {err && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
            <AlertCircle size={14} /> {err}
          </div>
        )}

        {/* Result */}
        {a && b && (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <SideCard side={a} label="yours" accent />
              <SideCard side={b} label={b.kind === "own" ? "yours" : "competitor"} />
            </div>

            <div className="bg-black/30 border border-border/60 rounded-lg px-3 py-1">
              <CompareRow label="Subscribers"        help={METRIC_HELP.subs}         a={a.subscriber_count} b={b.subscriber_count} />
              <CompareRow label="Typical video"      help={METRIC_HELP.typical}      a={a.median_views}     b={b.median_views} />
              <CompareRow label="Best video"         help={METRIC_HELP.best}         a={a.max_views}        b={b.max_views} />
              <CompareRow label="Likes+comments /100 views" help={METRIC_HELP.interaction} a={a.engagement_rate} b={b.engagement_rate} fmt={(x) => `${x}`} />
              <CompareRow label="Posting rhythm"     help={METRIC_HELP.uploads_week} a={a.cadence_per_week} b={b.cadence_per_week}
                          fmt={(x) => cadenceLabel(x)} />
            </div>
            <div className="text-[10px] text-gray-600 text-center">
              Numbers come from each channel's recent uploads ({a.video_sample} vs {b.video_sample} videos sampled). ✓ marks who's ahead.
            </div>

            {/* AI verdict */}
            {v && (
              <div className="bg-gradient-to-br from-sky-950/30 to-black/20 border border-sky-800/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-sky-300 mb-1.5 flex items-center gap-1.5">
                  <Sparkles size={12} /> What the AI sees
                </div>
                <p className="text-[12px] text-gray-200 leading-relaxed mb-2">{v.summary}</p>
                {(v.key_differences || []).length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {v.key_differences.map((d, i) => (
                      <li key={i} className="text-[11px] text-gray-400 flex gap-1.5">
                        <span className="text-sky-500 flex-shrink-0">•</span> {d}
                      </li>
                    ))}
                  </ul>
                )}
                {(v.what_to_copy || []).length > 0 && (
                  <>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">Worth copying:</div>
                    <ul className="space-y-1 mb-2">
                      {v.what_to_copy.map((d, i) => (
                        <li key={i} className="text-[11px] text-gray-300 flex gap-1.5">
                          <Lightbulb size={11} className="text-yellow-400 flex-shrink-0 mt-0.5" /> {d}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {(v.quick_wins || []).length > 0 && (
                  <>
                    <div className="text-[11px] font-semibold text-gray-300 mb-1">Quick wins for you:</div>
                    <ul className="space-y-1">
                      {v.quick_wins.map((d, i) => (
                        <li key={i} className="text-[11px] text-accent2 flex gap-1.5">
                          <ArrowRight size={11} className="flex-shrink-0 mt-0.5" /> {d}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {result?.verdict_error && (
              <div className="text-[11px] text-gray-500 text-center">{result.verdict_error}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
