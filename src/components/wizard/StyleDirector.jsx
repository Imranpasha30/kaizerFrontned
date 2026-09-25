import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles, ChevronDown, Eye, Check, Loader2, RotateCcw, Wand2,
} from "lucide-react";
import { api, getToken } from "../../api/client";
import { Badge } from "./kit";

// Media tags (<img>/<video>/<audio>) can't send an Authorization header, so
// the file endpoint accepts the JWT as a ?token= query param (same as the
// admin catalog). Appended to the backend-returned /api/file/?path=… URL.
function withAuth(url) {
  if (!url) return url;
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

/**
 * StyleDirector — the user-facing "direct the AI" picker. By default the AI
 * Director chooses every style/effect. Here the user can OPTIONALLY pin exact
 * choices per category ("edit using THESE"): anything picked constrains the
 * Director to those ids; anything left blank stays AI-decided. Selections are
 * emitted as a directives object wired to Job.v4_style_directives.
 *
 * value shape (all optional):
 *   { style_packs:[], transitions:[], frame_fx:[], overlays:[],
 *     typography:[], story_category:"" }
 *
 * Only "directable" categories (the ones a pick actually changes in the
 * render) are shown, tagged by the backend. Each item has a CapCut-style
 * on-demand preview (rendered on real footage from this installation).
 */

// section.key that is a SINGLE choice (radio), stored as a scalar in `value`.
const SINGLE_KEY = { taxonomy: "story_category" };
// section.key → the `value` key it writes (arrays stay under their own key).
const VALUE_KEY = (k) => SINGLE_KEY[k] || k;

export default function StyleDirector({ value, onChange }) {
  const v = value || {};
  const [enabled, setEnabled] = useState(false);   // master "I'll direct it"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sections, setSections] = useState(null);
  const [open, setOpen] = useState({});            // per-section accordion
  const loadedRef = useRef(false);

  // Lazy-load the catalog the first time the user opts to direct.
  useEffect(() => {
    if (!enabled || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    api.styleCatalog(true)
      .then((res) => {
        setSections(res?.sections || []);
        setError("");
      })
      .catch((e) => {
        loadedRef.current = false;   // allow retry
        setError(e?.message || "Could not load the style catalog.");
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  const totalPicked = Object.entries(v).reduce((n, [, val]) => {
    if (Array.isArray(val)) return n + val.length;
    return n + (val ? 1 : 0);
  }, 0);

  const emit = (next) => onChange && onChange(next);

  const toggleMulti = (sectionKey, id) => {
    const key = VALUE_KEY(sectionKey);
    const cur = Array.isArray(v[key]) ? v[key] : [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    emit({ ...v, [key]: next });
  };

  const setSingle = (sectionKey, id) => {
    const key = VALUE_KEY(sectionKey);
    emit({ ...v, [key]: v[key] === id ? "" : id });
  };

  const isPicked = (sectionKey, id) => {
    const key = VALUE_KEY(sectionKey);
    return SINGLE_KEY[sectionKey] ? v[key] === id : (v[key] || []).includes(id);
  };

  const countFor = (sectionKey) => {
    const key = VALUE_KEY(sectionKey);
    return SINGLE_KEY[sectionKey] ? (v[key] ? 1 : 0) : (v[key] || []).length;
  };

  const clearAll = () => {
    const next = {};
    Object.keys(v).forEach((k) => { next[k] = Array.isArray(v[k]) ? [] : ""; });
    emit(next);
  };

  return (
    <div className="mt-6 pt-5 border-t border-gray-800">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white text-sm flex items-center gap-2">
            <Wand2 size={15} className="text-accent2" />
            Direct the AI (optional)
          </h3>
          <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-xl">
            By default the AI editor picks the look, effects, transitions, graphics
            and captions for you. Want a specific style? Pin your choices below —
            <span className="text-gray-300"> anything you pick, the AI must use</span>;
            anything you leave blank stays AI-decided.
          </p>
        </div>
        {totalPicked > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold
              text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw size={12} /> Reset to AI
          </button>
        )}
      </div>

      {/* Master choice: leave to AI vs direct it. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setEnabled(false)}
          aria-pressed={!enabled}
          className={`text-left rounded-2xl border p-3.5 transition-all duration-200 outline-none
            focus-visible:ring-2 focus-visible:ring-accent/60
            ${!enabled ? "border-emerald-400/50 bg-emerald-500/8"
                       : "border-white/10 bg-white/[0.035] hover:border-white/25"}`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles size={15} className="text-emerald-300" /> Let the AI decide
            {!enabled && <Badge tone="emerald" className="ml-auto">Default</Badge>}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Best-fit style per story, automatically.</p>
        </button>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          aria-pressed={enabled}
          className={`text-left rounded-2xl border p-3.5 transition-all duration-200 outline-none
            focus-visible:ring-2 focus-visible:ring-accent/60
            ${enabled ? "border-accent/60 bg-accent/10"
                      : "border-white/10 bg-white/[0.035] hover:border-white/25"}`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Wand2 size={15} className="text-accent2" /> I'll pick the styles
            {totalPicked > 0 && (
              <Badge tone="accent" className="ml-auto">{totalPicked} pinned</Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Choose exact packs, transitions, effects &amp; more.</p>
        </button>
      </div>

      {enabled && (
        <div className="mt-4 space-y-2.5">
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-gray-400 py-3">
              <Loader2 size={14} className="animate-spin" /> Loading the style catalog…
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[12px]">
              {error}
            </div>
          )}
          {!loading && !error && (sections || []).map((s) => (
            <SectionAccordion
              key={s.key}
              section={s}
              isOpen={!!open[s.key]}
              onToggleOpen={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
              single={!!SINGLE_KEY[s.key]}
              count={countFor(s.key)}
              isPicked={(id) => isPicked(s.key, id)}
              onPick={(id) => (SINGLE_KEY[s.key] ? setSingle(s.key, id) : toggleMulti(s.key, id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionAccordion({ section, isOpen, onToggleOpen, single, count, isPicked, onPick }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{section.label}</div>
          <div className="text-[10px] text-gray-500">{section.items.length} options{single ? " · pick one" : ""}</div>
        </div>
        {count > 0 && <Badge tone="accent">{count} pinned</Badge>}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {section.items.map((it) => (
            <StyleChip
              key={it.id}
              item={it}
              previewKind={section.preview_kind}
              picked={isPicked(it.id)}
              onPick={() => onPick(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StyleChip({ item, previewKind, picked, onPick }) {
  const [preview, setPreview] = useState(null);  // {url,media} | "loading" | "error"
  const [showPrev, setShowPrev] = useState(false);

  const loadPreview = (e) => {
    e.stopPropagation();
    if (!previewKind) return;
    setShowPrev((s) => !s);
    if (preview) return;
    setPreview("loading");
    api.stylePreview(previewKind, item.id)
      .then((r) => setPreview(r && r.url ? r : "error"))
      .catch(() => setPreview("error"));
  };

  const mediaUrl = preview && preview.url ? withAuth(preview.url) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={picked}
      onClick={onPick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      className={`relative rounded-xl border p-2.5 text-left cursor-pointer transition-all duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-accent/60
        ${picked ? "border-accent/70 bg-accent/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
      title={item.used_for || ""}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-white leading-snug truncate">{item.label}</div>
          {item.used_for && (
            <div className="text-[10px] text-gray-500 leading-tight mt-0.5 line-clamp-2">{item.used_for}</div>
          )}
        </div>
        {picked && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gradient-to-br from-accent to-accent2
            flex items-center justify-center">
            <Check size={10} className="text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      {previewKind && (
        <button
          type="button"
          onClick={loadPreview}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-accent2 transition-colors"
        >
          <Eye size={11} /> {showPrev ? "Hide" : "Preview"}
        </button>
      )}
      {showPrev && previewKind && (
        <div className="mt-2 rounded-lg overflow-hidden bg-black/40 border border-white/10">
          {preview === "loading" && (
            <div className="flex items-center justify-center gap-1.5 py-4 text-[10px] text-gray-400">
              <Loader2 size={12} className="animate-spin" /> Rendering…
            </div>
          )}
          {preview === "error" && (
            <div className="py-3 text-center text-[10px] text-amber-300">Preview unavailable</div>
          )}
          {preview && preview.url && (
            <PreviewMedia media={preview.media} url={mediaUrl} />
          )}
        </div>
      )}
    </div>
  );
}

function PreviewMedia({ media, url }) {
  if (media === "audio") {
    return <audio src={url} controls className="w-full" style={{ height: 34 }} />;
  }
  if (media === "image") {
    return <img src={url} alt="" className="w-full block" loading="lazy" />;
  }
  // "video" or "video_audio"
  return (
    <video
      src={url}
      className="w-full block"
      autoPlay
      loop
      muted={media !== "video_audio"}
      controls={media === "video_audio"}
      playsInline
    />
  );
}
