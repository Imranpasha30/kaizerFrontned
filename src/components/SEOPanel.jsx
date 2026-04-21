import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RLink } from "react-router-dom";
import {
  Loader2, Sparkles, RotateCcw, Save, Trash2, ChevronDown, ChevronUp,
  AlertCircle, ExternalLink, CheckCircle2,
} from "lucide-react";
import { api } from "../api/client";
import TagInput from "./TagInput";

const POLL_MS = 2000;

function ScoreBadge({ score }) {
  if (score == null) return null;
  const color =
    score >= 85 ? "bg-green-500/20 text-green-400 border-green-600/50" :
    score >= 70 ? "bg-yellow-500/20 text-yellow-400 border-yellow-600/50" :
                  "bg-red-500/20 text-red-400 border-red-600/50";
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

/**
 * SEO editor panel — pick a channel, generate via Gemini, manually edit fields,
 * view computed score. Polls /seo/status while generating.
 * Props:
 *   clip: current clip (with .seo field if already generated)
 *   onSeoChange: optional callback fired when clip.seo updates (so parent lists refresh)
 */
export default function SEOPanel({ clip, onSeoChange }) {
  const [channels, setChannels]       = useState([]);
  const [channelsLoading, setChLoad]  = useState(true);
  // Multi-select: which style profiles to generate SEO for (one variant each).
  const [channelIds, setChannelIds]   = useState(() => new Set());
  // Which variant is currently displayed in the read-only view below.
  const [viewChannelId, setViewChannelId] = useState(null);

  const [seo, setSeo]                 = useState(null);  // server-known SEO JSON (current)
  const [draft, setDraft]             = useState({});    // local editable copy
  const [dirty, setDirty]             = useState(false);

  const [status, setStatus]           = useState("idle"); // idle | generating | done | error:...
  const [includeNews, setIncludeNews] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [newsOpen, setNewsOpen]       = useState(false);

  const pollTimer = useRef(null);
  const prevClipId = useRef(null);

  // All generated variants: { "<channel_id>": seoJson }
  const variants = (clip?.seo_variants && typeof clip.seo_variants === "object")
    ? clip.seo_variants
    : {};
  const variantEntries = Object.entries(variants); // [[cid, seo], ...]

  // Load channels once
  useEffect(() => {
    let alive = true;
    setChLoad(true);
    api.listChannels()
      .then((list) => { if (alive) { setChannels(list || []); setChLoad(false); } })
      .catch((e) => { if (alive) { setError(e.message); setChLoad(false); } });
    return () => { alive = false; };
  }, []);

  // When clip changes → reset local state from clip.seo
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
      if (clip.seo.channel_id) {
        setChannelIds(new Set([clip.seo.channel_id]));
        setViewChannelId(clip.seo.channel_id);
      }
    } else {
      setSeo(null);
      setDraft({});
      setViewChannelId(null);
    }
  }, [clip]);

  // Only linked-to-YouTube profiles appear in the SEO picker — if a profile
  // isn't linked, generating SEO for it produces variants you can't actually
  // publish.  Keep unlinked ones hidden here; they're visible on the Style
  // Profiles page where the user can link them.
  const pickableChannels = useMemo(
    () => (channels || []).filter((c) => !!c.connected),
    [channels],
  );

  // Default channel pick — first priority LINKED profile, once channels load
  useEffect(() => {
    if (channelIds.size > 0 || pickableChannels.length === 0) return;
    const pri = pickableChannels.find((c) => c.is_priority) || pickableChannels[0];
    if (pri) setChannelIds(new Set([pri.id]));
  }, [pickableChannels, channelIds]);

  function toggleChannelPick(id) {
    setChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Stop polling on unmount
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
    if (!clip || channelIds.size === 0) return;
    setError("");
    setStatus("generating");
    try {
      await api.generateClipSEO(clip.id, {
        channel_ids: Array.from(channelIds),
        force: !!force,
        include_news: includeNews,
      });
      startPolling();
    } catch (e) {
      setError(e.message);
      setStatus("idle");
    }
  }

  function startPolling() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await api.getClipSEOStatus(clip.id);
        setStatus(res.status || "idle");
        if ((res.status === "done" || res.status?.startsWith("done_with_errors")) && res.seo) {
          setSeo(res.seo);
          setDraft(toDraft(res.seo));
          setDirty(false);
          if (res.seo.channel_id) setViewChannelId(res.seo.channel_id);
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          onSeoChange?.(res.seo);
        } else if (res.status?.startsWith("error:")) {
          setError(res.status.replace(/^error:\s*/, ""));
          clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      } catch (e) {
        setError(e.message);
        clearInterval(pollTimer.current);
        pollTimer.current = null;
        setStatus("idle");
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

  // Backend emits multi-variant statuses like "generating (1/5: Kaizer News)" —
  // match prefix so the progress card stays visible for the whole fan-out.
  const busy = typeof status === "string" && status.startsWith("generating");
  const hasSeo = !!seo;
  const titleLen = (draft.title || "").length;
  const descLen  = (draft.description || "").length;
  const kwCount  = (draft.keywords || []).length;
  const hashCount = (draft.hashtags || []).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky toolbar */}
      <div className="p-3 border-b border-border flex-shrink-0 space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[10px] uppercase tracking-wider text-gray-500">
              Write SEO in these styles
            </label>
            <span className="text-[10px] text-gray-500">
              {channelIds.size} selected
            </span>
          </div>
          {channelsLoading ? (
            <div className="text-xs text-gray-500 py-1">Loading style profiles…</div>
          ) : pickableChannels.length === 0 ? (
            <div className="text-xs text-yellow-300/90 bg-yellow-950/20 border border-yellow-900/40 rounded px-2 py-2 leading-relaxed">
              No style profiles are linked to YouTube yet.{" "}
              <RLink to="/channels" className="underline hover:text-yellow-200">Open Style Profiles</RLink>{" "}
              and click <strong>Link my YT</strong> on at least one profile — only linked profiles can produce publishable SEO.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
              {pickableChannels.map((c) => {
                const isSel = channelIds.has(c.id);
                const hasVariant = !!variants[String(c.id)];
                return (
                  <button
                    type="button"
                    key={c.id}
                    disabled={busy}
                    onClick={() => toggleChannelPick(c.id)}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                      isSel
                        ? "bg-accent/20 border-accent/60 text-white"
                        : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
                    } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
                    title={hasVariant ? "Already has a generated variant — regenerating will overwrite" : "Not generated yet"}
                  >
                    {c.is_priority ? "★ " : ""}{c.name}
                    {hasVariant && <span className="ml-1 text-accent2">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-gray-600 mt-1 leading-tight">
            Showing linked-to-YouTube profiles only ({pickableChannels.length} of {channels.length}). Each pick creates a variant that Publish can target per destination.
          </p>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeNews}
            onChange={(e) => setIncludeNews(e.target.checked)}
            disabled={busy}
            className="accent-accent"
          />
          Ground with live Google News
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerate(hasSeo)}
            disabled={busy || channelIds.size === 0 || !clip}
            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5"
          >
            {busy
              ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
              : hasSeo
                ? <><RotateCcw size={12} /> Regenerate</>
                : <><Sparkles size={12} /> Generate</>}
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
            No SEO generated yet for this clip.<br />
            Pick a style profile above and click <span className="text-accent">Generate</span>.
          </div>
        )}

        {/* Live progress card — parses "generating (2/5: TV9 Telugu)" from status. */}
        {busy && (() => {
          const m = (status || "").match(/generating\s*\((\d+)\/(\d+)(?::\s*([^)]+))?\)/i);
          const current  = m ? Number(m[1]) : 0;
          const total    = m ? Number(m[2]) : channelIds.size || 1;
          const chanName = m ? (m[3] || "").trim() : "…";
          const pct      = total > 0 ? Math.round((current / total) * 100) : 0;
          return (
            <div className="mb-3 p-3 rounded bg-[#0f0f17] border border-accent2/30">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 size={14} className="animate-spin text-accent2" />
                <span className="text-xs font-medium text-gray-200">
                  Generating SEO — {current}/{total}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-gray-500">{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-accent2 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[11px] text-gray-400 truncate" title={chanName}>
                {chanName
                  ? <>Currently: <span className="text-gray-200">{chanName}</span></>
                  : "Calling Gemini + grounding against Google News…"}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                ~10-15 s per channel. Generating {total} variant{total === 1 ? "" : "s"}.
              </div>
            </div>
          );
        })()}

        {hasSeo && (
          <>
            {/* Variant switcher — visible when the clip has 2+ per-channel SEO variants */}
            {variantEntries.length > 1 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Generated variants ({variantEntries.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {variantEntries.map(([cid, v]) => {
                    const ch = channels.find((c) => String(c.id) === String(cid));
                    const name = ch?.name || `#${cid}`;
                    const isActive = String(viewChannelId) === String(cid)
                      || (!viewChannelId && String(seo.channel_id) === String(cid));
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => {
                          setViewChannelId(Number(cid));
                          setSeo(v);
                          setDraft(toDraft(v));
                          setDirty(false);
                        }}
                        className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                          isActive
                            ? "bg-accent/20 border-accent/60 text-white"
                            : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {name} <span className="text-[9px] text-gray-500 ml-1">{v?.seo_score ?? "?"}/100</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  Publish automatically picks the variant that matches each destination.
                </p>
              </div>
            )}

            {/* Score strip */}
            <div className="flex items-center justify-between mb-3 px-1">
              <ScoreBadge score={seo.seo_score} />
              {seo.edited_by_user && (
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <CheckCircle2 size={10} /> manually edited
                </span>
              )}
            </div>

            {/* Title */}
            <SectionHead right={
              <span className={`text-[10px] tabular-nums ${titleLen > 100 ? "text-red-400" : titleLen >= 40 ? "text-green-500" : "text-yellow-500"}`}>
                {titleLen}/100
              </span>
            }>Title</SectionHead>
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
              <span className={`text-[10px] tabular-nums ${descLen >= 400 && descLen <= 2000 ? "text-green-500" : "text-yellow-500"}`}>
                {descLen}
              </span>
            }>Description</SectionHead>
            <textarea
              value={draft.description || ""}
              onChange={(e) => markDirty("description", e.target.value)}
              rows={6}
              className="w-full bg-surface border border-border text-gray-200 text-xs p-2 rounded resize-y focus:outline-none focus:border-accent"
            />

            {/* Keywords */}
            <SectionHead right={<CountHint count={kwCount} min={28} max={30} />}>
              Keywords (tags)
            </SectionHead>
            <TagInput
              value={draft.keywords || []}
              onChange={(next) => markDirty("keywords", next)}
              placeholder="Enter, or comma to add…"
              maxTags={40}
            />

            {/* Hashtags */}
            <SectionHead right={<CountHint count={hashCount} min={10} max={12} />}>
              Hashtags
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
              {seo.channel_name && <div>Style: <span className="text-gray-400">{seo.channel_name}</span></div>}
              {seo.model && <div>Model: <span className="text-gray-400">{seo.model}</span></div>}
              {seo.generated_at && <div>Generated: <span className="text-gray-400">{new Date(seo.generated_at).toLocaleString()}</span></div>}
              {seo.edited_at && <div>Last edit: <span className="text-gray-400">{new Date(seo.edited_at).toLocaleString()}</span></div>}
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
