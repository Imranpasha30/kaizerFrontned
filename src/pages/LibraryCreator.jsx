import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Star, Loader2, Library as LibraryIcon, Film, ChevronLeft,
  ChevronRight, X, ImageOff, Play, Sparkles, Flame, RectangleVertical,
  RectangleHorizontal, Square, Maximize2,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { StarRow, StarPicker } from "./Library";

const PAGE_SIZE = 24;

function fmtDuration(secs) {
  if (!secs || secs < 0) return "";
  const s = Math.floor(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}:${String(r).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtRelDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diffDay = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (diffDay <= 0) return "Today";
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

function fmtJoinDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  } catch { return ""; }
}

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const out = [];
  let last = 0;
  for (const p of [...pages].filter(p => p >= 1 && p <= total).sort((a,b) => a-b)) {
    if (p - last > 1) out.push("…");
    out.push(p);
    last = p;
  }
  return out;
}

function DimensionChip({ label }) {
  const Icon = label === "Vertical" ? RectangleVertical
             : label === "Horizontal" ? RectangleHorizontal
             : label === "Square" ? Square : Maximize2;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                     bg-black/70 backdrop-blur-md border border-white/10
                     text-[10px] font-semibold text-white/90">
      <Icon size={10}/> {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────

function CreatorAvatar({ name, url, size = 80 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return url ? (
    <img
      src={url} alt={name || ""}
      style={{ width: size, height: size }}
      className="rounded-full object-cover border-2 border-border flex-shrink-0"
    />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="rounded-full bg-gradient-to-br from-accent to-accent2 text-white
                 flex items-center justify-center font-bold flex-shrink-0
                 border-2 border-border"
    >
      {initial}
    </div>
  );
}

function RateCreatorModal({ creator, onClose, onRated }) {
  const [stars, setStars] = useState(creator.my_rating || 0);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!stars) { setError("Pick a rating first"); return; }
    setBusy(true); setError("");
    try {
      const r = await api.rateCreator(creator.id, stars);
      onRated?.(r);
      onClose();
    } catch (e) {
      setError(e.message || "Rating failed");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={busy ? undefined : onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel shadow-elevated"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Star size={16} className="text-amber-400" fill="currentColor"/>
            Rate {creator.name}
          </h2>
          <button type="button" onClick={onClose} disabled={busy}
                  className="text-gray-500 hover:text-white disabled:opacity-30">
            <X size={18}/>
          </button>
        </div>
        <div className="p-6 space-y-5 text-center">
          <p className="text-sm text-gray-400">
            How would you rate this creator's library so far?
          </p>
          <div className="flex justify-center">
            <StarPicker value={stars} onPick={setStars} size={32} busy={busy}/>
          </div>
          {stars > 0 && (
            <p className="text-xs text-gray-500">
              You picked <span className="text-amber-400 font-semibold">{stars}/5</span>
              {creator.my_rating ? <span> (previously: {creator.my_rating})</span> : null}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-surface/30">
          <button type="button" onClick={onClose} disabled={busy}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300
                             hover:bg-panel-hover disabled:opacity-30 transition-all">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy || !stars}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                             bg-accent text-white border border-accent
                             hover:bg-accent2 hover:border-accent2
                             disabled:opacity-40 disabled:pointer-events-none transition-all">
            {busy
              ? <><Loader2 size={14} className="animate-spin"/> Saving</>
              : "Submit rating"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

function CreatorVideoCard({ item, onUse }) {
  const navigate = useNavigate();
  const isVertical = item.aspect === "9:16";
  const videoRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const cacheRef = useRef({ url: "", expAt: 0 });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!hovered) {
      v.pause();
      try { v.currentTime = 0; } catch {}
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const now = Date.now();
        if (!cacheRef.current.url || cacheRef.current.expAt - now < 5000) {
          const res = await api.getLibraryPlayUrl(item.id);
          cacheRef.current = {
            url:   res?.play_url || "",
            expAt: res?.expires_at ? Date.parse(res.expires_at) : (now + 55_000),
          };
        }
        if (cancelled || !cacheRef.current.url) return;
        if (v.src !== cacheRef.current.url) v.src = cacheRef.current.url;
        v.play().catch(() => {});
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [hovered, item.id]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-panel
                 transition-all duration-200 hover:-translate-y-1 hover:shadow-elevated hover:border-border-hover"
    >
      <div className="relative w-full aspect-video bg-ink-900 overflow-hidden">
        <video
          ref={videoRef}
          muted loop playsInline preload="none"
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className={`absolute inset-0 w-full h-full ${isVertical ? "object-contain" : "object-cover"}
                      transition-opacity duration-300 ${hovered ? "opacity-100" : "opacity-0"}`}
        />
        {item.thumb_url ? (
          isVertical ? (
            <>
              <img src={item.thumb_url} alt="" aria-hidden
                   className={`absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60
                                transition-opacity ${hovered ? "opacity-0" : ""}`} loading="lazy"/>
              <div className={`absolute inset-0 bg-black/30 transition-opacity ${hovered ? "opacity-0" : ""}`}/>
              <img src={item.thumb_url} alt={item.title}
                   className={`relative h-full mx-auto object-contain transition-opacity ${hovered ? "opacity-0" : ""}`} loading="lazy"/>
            </>
          ) : (
            <img src={item.thumb_url} alt={item.title}
                 className={`absolute inset-0 w-full h-full object-cover transition-opacity ${hovered ? "opacity-0" : ""}`} loading="lazy"/>
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center
                          bg-gradient-to-br from-ink-800 via-ink-900 to-black text-gray-600">
            <ImageOff size={24}/>
          </div>
        )}

        {item.trending && (
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             bg-orange-500/20 backdrop-blur-md border border-orange-400/60
                             text-[10px] uppercase tracking-wider font-bold text-orange-200">
              <Flame size={10} fill="currentColor"/> Trending
            </span>
          </div>
        )}

        {item.category && (
          <div className="absolute top-2 right-2 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             backdrop-blur-md border text-[10px] uppercase tracking-wider font-bold"
                  style={{
                    background: `${item.category.color || "#7f8c8d"}33`,
                    borderColor: `${item.category.color || "#7f8c8d"}aa`,
                    color: item.category.color || "#bbb",
                  }}>
              {item.category.name}
            </span>
          </div>
        )}

        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
          {item.duration_secs > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                             bg-black/70 backdrop-blur-md border border-white/10
                             text-[10px] font-semibold text-white/90 tabular-nums">
              {fmtDuration(item.duration_secs)}
            </span>
          )}
          <DimensionChip label={item.dimension_label}/>
        </div>

        {!hovered && (
          <div className="absolute inset-0 flex items-center justify-center
                          opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md
                            border border-white/30 flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="white"/>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-2 px-3 py-3">
        <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">
          {item.title}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>{fmtRelDate(item.created_at)}</span>
          <StarRow value={item.rating_avg} count={item.rating_count} size={11} showCount/>
        </div>
        <button
          type="button"
          onClick={() => onUse(item)}
          className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg
                     bg-accent text-white border border-accent text-sm font-semibold
                     hover:bg-accent2 hover:border-accent2 active:scale-[0.98] transition-all"
        >
          <Sparkles size={14}/> Use this video
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

export default function LibraryCreator() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [resp, setResp]       = useState(null);
  const [loading, setLoad]    = useState(true);
  const [page, setPage]       = useState(1);
  const [rateOpen, setRateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoad(true);
    try {
      const r = await api.getLibraryCreator(creatorId, { page, page_size: PAGE_SIZE });
      setResp(r);
    } catch {
      setResp(null);
    } finally {
      setLoad(false);
    }
  }, [creatorId, page]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUse = useCallback((item) => {
    navigate("/new", { state: { libraryItem: item } });
  }, [navigate]);

  const handleRated = useCallback((r) => {
    setResp(prev => prev ? {
      ...prev,
      creator: { ...prev.creator,
                 my_rating: r.stars,
                 rating_avg: r.rating_avg,
                 rating_count: r.rating_count },
    } : prev);
  }, []);

  if (loading && !resp) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin"/>
      </div>
    );
  }
  if (!resp || !resp.creator) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-border bg-panel/60 p-10 text-center">
          <p className="text-gray-300 font-medium mb-1">Creator not found</p>
          <Link to="/library"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg font-semibold text-sm
                           bg-accent text-white border border-accent hover:bg-accent2">
            <ArrowLeft size={14}/> Back to Library
          </Link>
        </div>
      </div>
    );
  }

  const c = resp.creator;
  const isSelf = user?.id === c.id;
  const totalPages = Math.max(1, resp.total_pages || 1);
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const startIdx   = (safePage - 1) * PAGE_SIZE;
  const pageList   = buildPageList(safePage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/library"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md
                         border border-border bg-panel text-gray-400
                         hover:bg-panel-hover hover:text-white hover:border-border-hover transition-all">
          <ArrowLeft size={14}/>
        </Link>
        <span className="text-xs text-gray-500">Back to Library</span>
      </div>

      {/* Creator hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border
                      bg-gradient-to-br from-panel via-panel to-surface px-5 py-6 sm:px-7 sm:py-7">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none"/>
        <div className="absolute -bottom-32 -left-16 w-64 h-64 rounded-full bg-accent3/10 blur-3xl pointer-events-none"/>
        <div className="relative flex items-center gap-5 flex-wrap">
          <CreatorAvatar name={c.name} url={c.avatar_url} size={88}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {c.name}
              </h1>
              {c.is_admin && (
                <span className="text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded
                                 bg-red-900/40 border border-red-700/50 text-red-300">Admin</span>
              )}
              {c.is_creative && !c.is_admin && (
                <span className="text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded
                                 bg-accent/15 border border-accent/40 text-accent2">Creator</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Film size={11}/> {c.upload_count} upload{c.upload_count !== 1 ? "s" : ""}
              </span>
              <span className="text-gray-700">·</span>
              <span>joined {fmtJoinDate(c.joined_at)}</span>
              <span className="text-gray-700">·</span>
              <StarRow value={c.rating_avg} count={c.rating_count} size={12} showCount/>
            </div>
          </div>
          {!isSelf && (
            <button
              type="button"
              onClick={() => setRateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                         bg-accent text-white border border-accent hover:bg-accent2 hover:border-accent2
                         shadow-glow active:scale-[0.97] transition-all"
            >
              <Star size={14} fill="currentColor"/>
              {c.my_rating ? "Update rating" : "Rate this creator"}
            </button>
          )}
        </div>
      </div>

      {/* Videos */}
      {resp.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel/60 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-accent/10 border border-accent/30 mb-4">
            <LibraryIcon size={22} className="text-accent2"/>
          </div>
          <p className="text-gray-300 font-medium">
            {isSelf ? "You haven't uploaded any videos yet." : "No videos from this creator yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {resp.items.map(item => (
              <CreatorVideoCard key={item.id} item={item} onUse={handleUse}/>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between
                            gap-3 mt-7 px-1">
              <p className="text-xs text-gray-500 tabular-nums">
                Showing{" "}
                <span className="text-gray-300 font-medium">
                  {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, resp.total)}
                </span>{" "}
                of <span className="text-gray-300 font-medium">{resp.total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md
                                   border border-border bg-panel text-gray-400
                                   hover:bg-panel-hover hover:text-white hover:border-border-hover
                                   disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <ChevronLeft size={14}/>
                </button>
                {pageList.map((p, idx) =>
                  p === "…" ? (
                    <span key={`e${idx}`} className="px-1.5 text-gray-600 text-xs select-none">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => setPage(p)}
                            className={`min-w-[32px] h-8 px-2 rounded-md text-xs font-semibold tabular-nums
                                        transition-all border
                                        ${p === safePage
                                          ? "bg-accent text-white border-accent shadow-sm"
                                          : "bg-panel text-gray-400 border-border hover:bg-panel-hover hover:text-white hover:border-border-hover"}`}>
                      {p}
                    </button>
                  )
                )}
                <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md
                                   border border-border bg-panel text-gray-400
                                   hover:bg-panel-hover hover:text-white hover:border-border-hover
                                   disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <ChevronRight size={14}/>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {rateOpen && (
        <RateCreatorModal
          creator={c}
          onClose={() => setRateOpen(false)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}
