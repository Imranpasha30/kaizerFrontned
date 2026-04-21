import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RLink } from "react-router-dom";
import {
  Loader2, Sparkles, RotateCcw, Save, Trash2, ChevronDown, ChevronUp,
  AlertCircle, ExternalLink, CheckCircle2, TrendingUp, Youtube, ShieldCheck,
} from "lucide-react";
import { api } from "../api/client";
import TagInput from "./TagInput";

const POLL_MS = 2000;
const TARGET_SCORE = 95;

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color =
    score >= 95 ? "bg-green-500/20 text-green-400 border-green-600/50" :
    score >= 85 ? "bg-yellow-500/20 text-yellow-300 border-yellow-600/50" :
                  "bg-red-500/20 text-red-300 border-red-600/50";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${color}`}>
      SEO {score}/100
    </span>
  );
}

function SectionHead({ children, right }) {
  return (
    <div className="flex items-center justify-between mt-4 mb-1.5 first:mt-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-accent border-b border-border pb-0.5">
        {children}
      </span>
      {right}
    </div>
  );
}

function CountHint({ count, min, max, unit = "" }) {
  const ok = count >= min && count <= max;
  return (
    <span className={`text-[10px] tabular-nums ${ok ? "text-green-500" : "text-yellow-500"}`}>
      {count}{unit} / {min}-{max}{unit}
    </span>
  );
}

function BreakdownBar({ label, value, max }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = pct >= 85 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 text-[10px] text-gray-400 capitalize">{label}</div>
      <div className="flex-1 h-1.5 bg-black/40 rounded overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-[10px] tabular-nums text-gray-300">{value}/{max}</div>
    </div>
  );
}

/**
 * SEO editor panel — Content + Brand Overlay architecture.
 *
 * Generates ONE generic (channel-agnostic) SEO per clip that's reused across
 * every destination at publish time.  The composer injects destination-specific
 * branding (name suffix, mandatory hashtags, fixed tags, footer) at upload.
 *
 * Power-ups feed into generation: Google News, Google Trends, YouTube top-5.
 * Independent deterministic verifier scores the output; retry loop targets ≥95.
 */
export default function SEOPanel({ clip, onSeoChange }) {
  const [channels, setChannels]       = useState([]);
  const [channelsLoading, setChLoad]  = useState(true);

  // Optional writing-voice reference.  null = content-pure, no voice borrowing.
  const [styleSourceId, setStyleSourceId] = useState(null);

  const [seo, setSeo]                 = useState(null);
  const [draft, setDraft]             = useState({});
  const [dirty, setDirty]             = useState(false);

  const [status, setStatus]           = useState("idle");
  // Explicit "generation in flight" flag that only flips off when we have
  // SEO in hand (or an explicit error).  The backend's status text can be
  // "done" or "idle" momentarily before the fresh clip.seo propagates; we
  // keep the progress bar visible the whole time.
  const [generating, setGenerating]   = useState(false);
  const [includeNews,       setIncludeNews]       = useState(true);
  const [includeTrends,     setIncludeTrends]     = useState(true);
  const [includeYtBench,    setIncludeYtBench]    = useState(true);

  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [newsOpen, setNewsOpen]       = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const pollTimer = useRef(null);
  const prevClipId = useRef(null);

  useEffect(() => {
    let alive = true;
    setChLoad(true);
    api.listChannels()
      .then((list) => { if (alive) { setChannels(list || []); setChLoad(false); } })
      .catch((e) => { if (alive) { setError(e.message); setChLoad(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!clip) return;
    if (prevClipId.current === clip.id) return;
    prevClipId.current = clip.id;

    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setStatus("idle");
    setError("");
    setDirty(false);

    if (clip.seo && typeof clip.seo === "object") {
      setSeo(clip.seo);
      setDraft(toDraft(clip.seo));
      if (clip.seo.style_source_id) setStyleSourceId(clip.seo.style_source_id);
    } else {
      setSeo(null);
      setDraft({});
    }
  }, [clip]);

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  function toDraft(s) {
    return {
      title:          s?.title || "",
      description:    s?.description || "",
      keywords:       Array.isArray(s?.keywords) ? s.keywords : [],
      hashtags:       Array.isArray(s?.hashtags) ? s.hashtags : [],
      hook:           s?.hook || "",
      thumbnail_text: s?.thumbnail_text || "",
    };
  }

  function markDirty(key, val) {
    setDraft((d) => ({ ...d, [key]: val }));
    setDirty(true);
  }

  async function handleGenerate(force) {
    if (!clip) return;
    setError("");
    setGenerating(true);
    setStatus("generating: queued");
    try {
      await api.generateClipSEO(clip.id, {
        style_source_id: styleSourceId || undefined,
        force: !!force,
        include_news: includeNews,
        include_trends: includeTrends,
        include_yt_benchmark: includeYtBench,
      });
      startPolling();
    } catch (e) {
      setError(e.message);
      setStatus("idle");
      setGenerating(false);
    }
  }

  function startPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await api.getClipSEOStatus(clip.id);
        setStatus(res.status || "idle");
        // Finish when we actually have SEO in hand — not just on "done" text,
        // because the backend's status can flip "done" a beat before the DB
        // row is visible to the next read (session lag on the first poll).
        if (res.seo && (res.status === "done" || (res.status || "").startsWith("generating: verified"))) {
          setSeo(res.seo);
          setDraft(toDraft(res.seo));
          setDirty(false);
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setGenerating(false);
          onSeoChange?.(res.seo);
        } else if ((res.status || "").startsWith("error:")) {
          setError(res.status.replace(/^error:\s*/, ""));
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setGenerating(false);
        }
        // If status=="done" but no seo yet, keep polling — next tick will pick
        // up the committed row.  This prevents the UI from falling back to
        // "No SEO generated yet" after a brief race window.
      } catch (e) {
        setError(e.message);
        clearInterval(pollTimer.current);
        pollTimer.current = null;
        setStatus("idle");
        setGenerating(false);
      }
    }, POLL_MS);
  }

  async function handleSave() {
    if (!clip || !dirty) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.updateClipSEO(clip.id, draft);
      setSeo(res.seo);
      setDraft(toDraft(res.seo));
      setDirty(false);
      onSeoChange?.(res.seo);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    if (!seo) return;
    setDraft(toDraft(seo));
    setDirty(false);
  }

  async function handleClear() {
    if (!clip) return;
    if (!confirm("Clear the generated SEO for this clip?")) return;
    setSaving(true);
    try {
      await api.clearClipSEO(clip.id);
      setSeo(null);
      setDraft({});
      setDirty(false);
      setStatus("idle");
      onSeoChange?.(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Busy = explicit `generating` flag (set on click, cleared when SEO arrives
  // or error) OR any "generating*" status string.  The explicit flag bridges
  // the race window where the backend transitions to "done" before the DB
  // commit is visible to the next poll.
  const busy = generating || (typeof status === "string" && status.startsWith("generating"));
  const hasSeo = !!seo;
  const titleLen = (draft.title || "").length;
  const descLen  = (draft.description || "").length;
  const kwCount  = (draft.keywords || []).length;
  const hashCount = (draft.hashtags || []).length;
  const breakdown = seo?.verifier_breakdown || null;
  const reasons   = seo?.verifier_reasons || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky toolbar */}
      <div className="p-3 border-b border-border flex-shrink-0 space-y-2">
        {/* STYLE SOURCE — optional voice reference */}
        <div className="rounded border border-accent2/30 bg-accent2/5 p-2">
          <label className="block text-[10px] uppercase tracking-wider text-accent2 font-semibold mb-1">
            🎨 Writing voice (optional)
          </label>
          <p className="text-[10px] text-gray-300/90 mb-2 leading-snug">
            Pick a top-performing channel to teach Gemini its hook rhythm,
            title formula, and description cadence.  <strong>Only the voice
            is borrowed</strong> — that channel's name, hashtags, and footer
            will NEVER appear in the output.
          </p>
          <select
            value={styleSourceId ?? ""}
            onChange={(e) => setStyleSourceId(e.target.value ? Number(e.target.value) : null)}
            disabled={busy || channelsLoading}
            className="w-full bg-surface border border-border text-gray-200 text-xs p-1.5 rounded focus:outline-none focus:border-accent2"
          >
            <option value="">Content-pure (no voice borrowing)</option>
            {(channels || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.is_priority ? "★ " : ""}{c.name}{c.connected ? " · linked" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* POWER-UPS — what Gemini sees as context */}
        <div className="rounded border border-border bg-black/20 p-2 space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
            🧠 Grounded research layers
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={includeNews} onChange={(e) => setIncludeNews(e.target.checked)} disabled={busy} className="accent-accent" />
            <ExternalLink size={11} className="text-gray-500" /> Google News (factual grounding)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={includeTrends} onChange={(e) => setIncludeTrends(e.target.checked)} disabled={busy} className="accent-accent" />
            <TrendingUp size={11} className="text-gray-500" /> Google Trends (keywords people search now)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer select-none">
            <input type="checkbox" checked={includeYtBench} onChange={(e) => setIncludeYtBench(e.target.checked)} disabled={busy} className="accent-accent" />
            <Youtube size={11} className="text-gray-500" /> YouTube top-5 (titles winning this week)
          </label>
        </div>

        {/* Destination info — just so users know branding is deferred */}
        {!channelsLoading && (
          <div className="rounded border border-green-800/50 bg-green-950/10 p-2 flex items-start gap-2">
            <ShieldCheck size={13} className="text-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-green-200/80 leading-snug">
              One generic SEO is generated per clip and reused across every
              destination at publish time.  Each YouTube account's name,
              hashtags, and footer are injected by the Publish step — so the
              SAME high-score base works for all your channels.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerate(hasSeo)}
            disabled={busy || !clip}
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5"
          >
            {busy
              ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
              : hasSeo
                ? <><RotateCcw size={12} /> Regenerate</>
                : <><Sparkles size={12} /> Generate (target ≥{TARGET_SCORE})</>}
          </button>
          {hasSeo && (
            <button
              onClick={handleClear}
              disabled={busy || saving}
              title="Clear this clip's SEO"
              className="btn btn-secondary py-1 px-2"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {error && (
          <div className="text-red-400 text-xs mb-3 bg-red-950/30 p-2 rounded flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {!hasSeo && !busy && (
          <div className="text-center text-gray-500 text-xs py-8 px-2">
            <Sparkles size={22} className="mx-auto mb-2 text-gray-600" />
            No SEO generated yet.<br />
            Optionally pick a writing voice above, then click{" "}
            <span className="text-accent">Generate</span>.
          </div>
        )}

        {busy && (
          <div className="mb-3 p-3 rounded bg-[#0f0f17] border border-accent2/30">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 size={14} className="animate-spin text-accent2" />
              <span className="text-xs font-medium text-gray-200">
                {status.replace(/^generating:?\s*/i, "") || "Generating…"}
              </span>
            </div>
            <div className="text-[10px] text-gray-500">
              Research → Gemini → Verify → Retry (until ≥{TARGET_SCORE}/100 or 4 attempts)
            </div>
          </div>
        )}

        {hasSeo && (
          <>
            {/* Score + breakdown */}
            <div className="mb-3 p-2 rounded border border-border bg-black/30">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <ScoreBadge score={seo.seo_score} />
                  {seo.attempts_log?.length > 1 && (
                    <span className="text-[10px] text-gray-500">
                      {seo.attempts_log.length} attempts
                    </span>
                  )}
                  {seo.style_source_name && (
                    <span className="text-[10px] text-gray-500">
                      voice: <span className="text-accent2">{seo.style_source_name}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-0.5"
                >
                  breakdown {showBreakdown ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              </div>
              {showBreakdown && breakdown && (
                <div className="space-y-1 mt-2">
                  <BreakdownBar label="title"       value={breakdown.title ?? 0}       max={20} />
                  <BreakdownBar label="description" value={breakdown.description ?? 0} max={20} />
                  <BreakdownBar label="keywords"    value={breakdown.keywords ?? 0}    max={20} />
                  <BreakdownBar label="hashtags"    value={breakdown.hashtags ?? 0}    max={20} />
                  <BreakdownBar label="relevance"   value={breakdown.relevance ?? 0}   max={20} />
                  {reasons.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-yellow-400 cursor-pointer select-none">
                        {reasons.length} improvement note(s)
                      </summary>
                      <ul className="mt-1 space-y-0.5 text-[10px] text-yellow-200/80 pl-3 list-disc">
                        {reasons.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Title */}
            <SectionHead right={
              <span className={`text-[10px] tabular-nums ${titleLen > 95 ? "text-red-400" : titleLen >= 50 ? "text-green-500" : "text-yellow-500"}`}>
                {titleLen}/95
              </span>
            }>Title (generic — " | Channel" added at publish)</SectionHead>
            <input
              value={draft.title || ""}
              onChange={(e) => markDirty("title", e.target.value)}
              className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded focus:outline-none focus:border-accent"
            />

            {/* Hook */}
            <SectionHead>Hook</SectionHead>
            <textarea
              value={draft.hook || ""}
              onChange={(e) => markDirty("hook", e.target.value)}
              rows={2}
              className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded resize-y focus:outline-none focus:border-accent"
            />

            {/* Description */}
            <SectionHead right={
              <span className={`text-[10px] tabular-nums ${descLen >= 700 && descLen <= 1800 ? "text-green-500" : "text-yellow-500"}`}>
                {descLen}
              </span>
            }>Description (footer added at publish)</SectionHead>
            <textarea
              value={draft.description || ""}
              onChange={(e) => markDirty("description", e.target.value)}
              rows={6}
              className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded resize-y focus:outline-none focus:border-accent"
            />

            {/* Keywords */}
            <SectionHead right={<CountHint count={kwCount} min={28} max={30} />}>
              Keywords (fixed tags added at publish)
            </SectionHead>
            <TagInput
              value={draft.keywords || []}
              onChange={(next) => markDirty("keywords", next)}
              placeholder="Enter, or comma to add…"
              maxTags={40}
            />

            {/* Hashtags */}
            <SectionHead right={<CountHint count={hashCount} min={10} max={12} />}>
              Hashtags (mandatory hashtags added at publish)
            </SectionHead>
            <TagInput
              value={draft.hashtags || []}
              onChange={(next) => markDirty("hashtags", next)}
              hashtagMode
              placeholder="#CamelCase…"
              maxTags={15}
            />

            {/* Thumbnail text */}
            <SectionHead>Thumbnail text</SectionHead>
            <input
              value={draft.thumbnail_text || ""}
              onChange={(e) => markDirty("thumbnail_text", e.target.value)}
              placeholder="2-5 shouting words"
              className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded focus:outline-none focus:border-accent"
            />

            {/* Trending keywords that were used */}
            {Array.isArray(seo.trending_keywords) && seo.trending_keywords.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
                  <TrendingUp size={10} /> Trending keywords fed to Gemini
                </div>
                <div className="flex flex-wrap gap-1">
                  {seo.trending_keywords.slice(0, 10).map((k, i) => (
                    <span key={i} className="text-[10px] bg-black/30 border border-border px-1.5 py-0.5 rounded text-gray-300">{k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube top-5 benchmark that was used */}
            {Array.isArray(seo.yt_benchmark) && seo.yt_benchmark.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
                  <Youtube size={10} /> YouTube top-5 reference (last 7 days)
                </div>
                <ul className="space-y-0.5 text-[10px] text-gray-400">
                  {seo.yt_benchmark.slice(0, 5).map((v, i) => (
                    <li key={i} className="truncate">
                      <span className="tabular-nums text-gray-500">{v.views?.toLocaleString()}</span>{" "}
                      <span className="text-gray-300">{v.title}</span>
                      <span className="text-gray-600"> · {v.channel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* News context (collapsible) */}
            {Array.isArray(seo.news_context) && seo.news_context.length > 0 && (
              <>
                <button
                  onClick={() => setNewsOpen(!newsOpen)}
                  className="mt-4 w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-accent border-b border-border pb-0.5"
                >
                  News context ({seo.news_context.length})
                  {newsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {newsOpen && (
                  <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
                    {seo.news_context.map((n, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-gray-600 tabular-nums w-4 flex-shrink-0">{i + 1}.</span>
                        {n.link ? (
                          <a href={n.link} target="_blank" rel="noopener noreferrer"
                             className="flex-1 hover:text-accent2 underline-offset-2 hover:underline">
                            {n.title}
                            <span className="text-gray-600"> — {n.source}</span>
                            <ExternalLink size={10} className="inline ml-0.5" />
                          </a>
                        ) : (
                          <span className="flex-1">{n.title} <span className="text-gray-600">— {n.source}</span></span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* Footer metadata */}
            <div className="mt-5 pt-3 border-t border-border/60 text-[10px] text-gray-600 space-y-0.5">
              {seo.model && <div>Model: <span className="text-gray-400">{seo.model}</span></div>}
              {seo.generated_at && <div>Generated: <span className="text-gray-400">{new Date(seo.generated_at).toLocaleString()}</span></div>}
              {seo.edited_at && <div>Last edit: <span className="text-gray-400">{new Date(seo.edited_at).toLocaleString()}</span></div>}
              {seo.edited_by_user && (
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  <CheckCircle2 size={10} /> manually edited (score recomputed deterministically)
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Save bar */}
      {hasSeo && (
        <div className="p-3 border-t border-border flex-shrink-0 flex gap-2">
          <button
            onClick={handleRevert}
            disabled={!dirty || saving}
            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 disabled:opacity-40"
          >
            <RotateCcw size={12} /> Revert
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn btn-green flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 disabled:opacity-40"
          >
            {saving
              ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : <><Save size={12} /> Save edits</>}
          </button>
        </div>
      )}
    </div>
  );
}
