import React, {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  Play, Trash2, Upload, Search, Sparkles, Star, StarHalf,
  Library as LibraryIcon, ImageOff, Flame, Download, Loader2,
  Maximize2, RectangleVertical, RectangleHorizontal, Square,
  ChevronLeft, ChevronRight, SlidersHorizontal, X, Eye,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import CustomTemplatePicker from "../components/CustomTemplatePicker";

const PAGE_SIZE = 24;
const SORT_OPTIONS = [
  { id: "newest",    label: "Newest" },
  { id: "trending",  label: "Trending" },
  { id: "most_used", label: "Most Used" },
  { id: "top_rated", label: "Top Rated" },
];

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

// ────────────────────────────────────────────────────────────────────

export function StarRow({ value = 0, count = 0, size = 12, className = "", showCount = true }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.floor(v);
  const hasHalf = (v - full) >= 0.25 && (v - full) < 0.75;
  const filled = hasHalf ? full : Math.round(v);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {[0,1,2,3,4].map(i => {
        if (i < filled) {
          return <Star key={i} size={size} className="text-amber-400" fill="currentColor"/>;
        }
        if (i === filled && hasHalf) {
          return <StarHalf key={i} size={size} className="text-amber-400" fill="currentColor"/>;
        }
        return <Star key={i} size={size} className="text-gray-700"/>;
      })}
      {showCount && (
        <span className="ml-1 text-[10px] text-gray-500 tabular-nums">
          {v ? v.toFixed(1) : "—"}
          {count > 0 && <span className="text-gray-700"> ({count})</span>}
        </span>
      )}
    </span>
  );
}

export function StarPicker({ value = 0, onPick, size = 16, busy = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
      {[1,2,3,4,5].map(i => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick?.(i); }}
          className="p-0.5 transition-transform hover:scale-125"
          aria-label={`Rate ${i} star${i !== 1 ? "s" : ""}`}
        >
          <Star
            size={size}
            className={i <= shown ? "text-amber-400" : "text-gray-600 hover:text-amber-300"}
            fill={i <= shown ? "currentColor" : "none"}
          />
        </button>
      ))}
    </span>
  );
}

function DimensionChip({ label }) {
  const Icon = label === "Vertical" ? RectangleVertical
             : label === "Horizontal" ? RectangleHorizontal
             : label === "Square"   ? Square
             : Maximize2;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                     bg-black/70 backdrop-blur-md border border-white/10
                     text-[10px] font-semibold text-white/90">
      <Icon size={10}/> {label}
    </span>
  );
}

function CategoryChip({ category, active, onClick }) {
  const color = category?.color || "#7f8c8d";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  border transition-all
                  ${active
                    ? "bg-white/10 text-white shadow-sm"
                    : "bg-panel text-gray-400 border-border hover:bg-panel-hover hover:text-gray-200"}`}
      style={active ? { borderColor: color, color } : undefined}
    >
      {category ? (
        <>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }}/>
          {category.name}
          {category.item_count > 0 && (
            <span className="tabular-nums text-[10px] text-gray-500">({category.item_count})</span>
          )}
        </>
      ) : (
        "All"
      )}
    </button>
  );
}

function WatchModal({ item, onClose }) {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Load + autoplay once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getLibraryPlayUrl(item.id);
        if (cancelled) return;
        if (!res?.play_url) throw new Error("No playback URL");
        const v = videoRef.current;
        if (v) {
          v.src = res.play_url;
          v.muted = false;
          v.volume = 1.0;
          v.play().catch(() => {});
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load video");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      const v = videoRef.current;
      if (v) { v.pause(); v.removeAttribute("src"); v.load?.(); }
    };
  }, [item.id]);

  // Body-scroll lock so the page beneath doesn't shift when the modal
  // mounts — shifting backdrop = flicker.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape closes — but ONLY when the video isn't in fullscreen mode.
  // Browser uses Escape natively to exit fullscreen; double-handling
  // that produces the close-mid-transition flicker.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only close on backdrop clicks that actually land on the backdrop.
  function handleBackdropClick(e) {
    if (document.fullscreenElement) return;
    if (e.target !== e.currentTarget) return;
    onClose();
  }

  // Render via a portal at document.body so the modal lives OUTSIDE
  // every card's React tree. Fullscreen transitions, hover-state
  // changes, and grid re-renders happening on the card no longer
  // ripple through the modal's DOM — that ripple is what was causing
  // the flicker on fullscreen enter/exit.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/95
                 flex flex-col items-center justify-center p-3 sm:p-6"
      onClick={handleBackdropClick}
      style={{ contain: "strict" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-[101] inline-flex items-center justify-center
                   w-10 h-10 rounded-full bg-black/70 border border-white/15
                   text-white/90 hover:bg-red-700 hover:border-red-500 transition-colors"
        aria-label="Close"
      >
        <X size={18}/>
      </button>

      <div
        className="w-full max-w-[min(96vw,1400px)] mb-3 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base sm:text-lg font-bold text-white truncate">
          {item.title}
        </h2>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          {item.uploader_name && (
            <span>by <span className="text-gray-200">{item.uploader_name}</span></span>
          )}
          {item.category && (
            <>
              <span className="text-gray-700">·</span>
              <span style={{ color: item.category.color || undefined }}>{item.category.name}</span>
            </>
          )}
          <span className="text-gray-700">·</span>
          <span>{item.dimension_label}</span>
        </div>
      </div>

      {/* Player box. Single relatively-positioned container — the video
          fills it via object-contain. No aspect-ratio classes that fight
          with fullscreen sizing. */}
      <div
        className="relative w-full max-w-[min(96vw,1400px)] flex-1 min-h-0
                   flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !error && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center text-gray-400 pointer-events-none">
            <Loader2 size={28} className="animate-spin"/>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center text-red-300 text-sm pointer-events-none">
            {error}
          </div>
        )}
        <video
          ref={videoRef}
          controls
          playsInline
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="block max-w-full max-h-full w-auto h-auto bg-black rounded-xl
                     border border-white/10"
        />
      </div>
    </div>,
    document.body,
  );
}

function CreatorAvatar({ name, url, size = 24 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return url ? (
    <img
      src={url}
      alt={name || ""}
      style={{ width: size, height: size }}
      className="rounded-full object-cover border border-border flex-shrink-0"
    />
  ) : (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="rounded-full bg-gradient-to-br from-accent to-accent2 text-white
                 flex items-center justify-center font-bold flex-shrink-0"
    >
      {initial}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

function LibraryCard({ item, canDelete, isPaid, onDelete, onUse, onRate, onDownload }) {
  const navigate = useNavigate();
  const isVertical = item.aspect === "9:16";
  const videoRef   = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [rating, setRating]   = useState(item.my_rating || 0);
  const [busy, setBusy]       = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [watchOpen, setWatchOpen]     = useState(false);
  const cacheRef = useRef({ url: "", expAt: 0 });

  useEffect(() => { setRating(item.my_rating || 0); }, [item.my_rating]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Pause the card's hover preview whenever the watch modal is open.
    // Two video elements decoding simultaneously contended for GPU
    // resources during the modal's fullscreen transitions — that
    // contention is what was causing the flicker.
    if (!hovered || watchOpen) {
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
  }, [hovered, watchOpen, item.id]);

  async function handlePickRating(stars) {
    setBusy(true);
    try {
      const res = await onRate(item.id, stars);
      if (res?.ok) setRating(stars);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border
                 bg-panel transition-all duration-200
                 hover:-translate-y-1 hover:shadow-elevated hover:border-border-hover"
    >
      <div className="relative w-full aspect-video bg-ink-900 overflow-hidden">
        <video
          ref={videoRef}
          muted loop playsInline preload="none"
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className={`absolute inset-0 w-full h-full ${isVertical ? "object-contain" : "object-cover"}
                      transition-opacity duration-300
                      ${hovered ? "opacity-100" : "opacity-0"}`}
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
            <div className="flex flex-col items-center gap-2">
              <ImageOff size={28}/>
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold opacity-70">No preview</span>
            </div>
          </div>
        )}

        {/* Trending badge */}
        {item.trending && (
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             bg-orange-500/20 backdrop-blur-md border border-orange-400/60
                             text-[10px] uppercase tracking-wider font-bold text-orange-200">
              <Flame size={10} fill="currentColor"/> Trending
            </span>
          </div>
        )}

        {/* Category chip — top-right (under hover actions) */}
        {item.category && (
          <div className="absolute top-2 right-2 z-10 group-hover:opacity-0 transition-opacity">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                         backdrop-blur-md border text-[10px] uppercase tracking-wider font-bold"
              style={{
                background: `${item.category.color || "#7f8c8d"}33`,
                borderColor: `${item.category.color || "#7f8c8d"}aa`,
                color: item.category.color || "#bbb",
              }}
            >
              {item.category.name}
            </span>
          </div>
        )}

        {/* Bottom strip — duration + dimension */}
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

        {/* Hover-revealed actions */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1
                        opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (downloading) return;
              setDownloading(true);
              try { await onDownload(item); } finally { setDownloading(false); }
            }}
            disabled={downloading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md
                       bg-black/70 backdrop-blur-md border border-white/15 text-white/90
                       hover:bg-accent hover:border-accent transition-all
                       disabled:opacity-40 disabled:pointer-events-none"
            title={isPaid ? "Download original" : "Download (with KAIZER X watermark)"}
          >
            {downloading
              ? <Loader2 size={12} className="animate-spin"/>
              : <Download size={12}/>}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md
                         bg-black/70 backdrop-blur-md border border-white/15 text-white/90
                         hover:bg-red-700 hover:border-red-500 transition-all"
              title="Delete from library"
            >
              <Trash2 size={12}/>
            </button>
          )}
        </div>

        {/* Click anywhere on the cover to open the full-screen player.
            The play button overlay is purely decorative — the whole
            cover is the hit area so users don't have to aim for a tiny
            circle. */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setWatchOpen(true); }}
          aria-label={`Watch ${item.title}`}
          className="absolute inset-0 z-[5] cursor-pointer"
        />
        <div className="absolute inset-0 z-0 flex items-center justify-center
                        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-accent/80 backdrop-blur-md
                          border border-white/40 flex items-center justify-center
                          shadow-glow">
            <Play size={22} className="text-white ml-0.5" fill="white"/>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-1 flex flex-col gap-2 px-3 py-3">
        <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">
          {item.title}
        </h3>

        {/* Creator row — clickable */}
        {item.uploader_id && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); navigate(`/library/creator/${item.uploader_id}`); }}
            className="inline-flex items-center gap-2 text-[11px] text-gray-400
                       hover:text-white transition-colors text-left -mx-1 px-1 py-0.5 rounded
                       hover:bg-white/[0.04]"
          >
            <CreatorAvatar name={item.uploader_name} url={item.uploader_avatar_url} size={20}/>
            <span className="truncate flex-1">{item.uploader_name}</span>
            {item.creator_rating_count > 0 ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
                               bg-amber-500/10 border border-amber-500/30 flex-shrink-0">
                <Star size={9} className="text-amber-400" fill="currentColor"/>
                <span className="text-[10px] font-bold tabular-nums text-amber-200">
                  {item.creator_rating_avg.toFixed(1)}
                </span>
                <span className="text-[9px] text-amber-300/60 tabular-nums">
                  ({item.creator_rating_count})
                </span>
              </span>
            ) : (
              <span className="text-[10px] text-gray-600 italic flex-shrink-0">unrated</span>
            )}
          </button>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>{fmtRelDate(item.created_at)}</span>
          <div className="flex items-center gap-2">
            {item.watch_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Eye size={10}/> {item.watch_count}
              </span>
            )}
            {item.use_count > 0 && (
              <span className="text-accent2/80">
                {item.use_count} use{item.use_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Rating row */}
        <div className="flex items-center justify-between gap-2 -mt-1">
          <StarPicker value={rating} onPick={handlePickRating} size={14} busy={busy}/>
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

      {watchOpen && (
        <WatchModal item={item} onClose={() => setWatchOpen(false)}/>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUpload  = !!(user?.is_creative || user?.is_admin);
  const isAdmin    = !!user?.is_admin;
  // Paid = any plan other than "free". Admins inherit paid privileges.
  const isPaid     = isAdmin || (user?.plan && user.plan.toLowerCase() !== "free");

  const [libTab, setLibTab]         = useState("videos");   // "videos" | "templates"
  const [categories, setCategories] = useState([]);
  const [page, setPage]             = useState(1);
  const [query, setQuery]           = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [sort, setSort]             = useState("newest");
  const [resp, setResp]             = useState({ items: [], total: 0, total_pages: 1 });
  const [loading, setLoad]          = useState(true);

  const deferredQuery = useDeferredValue(query);

  // Categories load once.
  useEffect(() => {
    api.listLibraryCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); }, [deferredQuery, categoryId, sort]);

  // Fetch library page.
  const refresh = useCallback(async () => {
    setLoad(true);
    try {
      const r = await api.listLibrary({
        q: deferredQuery, category_id: categoryId, sort, page, page_size: PAGE_SIZE,
      });
      setResp(r || { items: [], total: 0, total_pages: 1 });
    } catch {
      setResp({ items: [], total: 0, total_pages: 1 });
    } finally {
      setLoad(false);
    }
  }, [deferredQuery, categoryId, sort, page]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUse = useCallback((item) => {
    navigate("/new", { state: { libraryItem: item } });
  }, [navigate]);

  const handleDelete = useCallback(async (item) => {
    if (!confirm(`Delete "${item.title}" from the library?\n\nThis hides it from everyone; the cloud copy is removed by a separate sweep.`)) return;
    try {
      await api.deleteLibraryItem(item.id);
      setResp(prev => ({ ...prev, items: prev.items.filter(r => r.id !== item.id),
                                   total: Math.max(0, (prev.total || 0) - 1) }));
    } catch (e) {
      alert("Delete failed: " + (e.message || "unknown error"));
    }
  }, []);

  const handleDownload = useCallback(async (item) => {
    try {
      const res = await api.getLibraryDownloadUrl(item.id);
      if (!res?.download_url) throw new Error("No download URL returned");
      // Navigate to the signed URL — server sets Content-Disposition:
      // attachment so the browser shows "Save as…" instead of playing.
      // window.location works for downloads; opening in a new tab can
      // be blocked as a popup on some browsers.
      window.location.href = res.download_url;
    } catch (e) {
      alert("Download failed: " + (e.message || "unknown error"));
    }
  }, []);

  const handleRate = useCallback(async (id, stars) => {
    try {
      const res = await api.rateLibraryItem(id, stars);
      // Sync the rating aggregate in the local list so the StarRow updates.
      setResp(prev => ({
        ...prev,
        items: prev.items.map(it => it.id === id
          ? { ...it, my_rating: stars, rating_avg: res.rating_avg, rating_count: res.rating_count }
          : it),
      }));
      return res;
    } catch (e) {
      alert("Rating failed: " + (e.message || "unknown error"));
      return null;
    }
  }, []);

  const safePage   = Math.min(Math.max(1, page), Math.max(1, resp.total_pages));
  const startIdx   = (safePage - 1) * PAGE_SIZE;
  const pageList   = useMemo(() => buildPageList(safePage, Math.max(1, resp.total_pages)), [safePage, resp.total_pages]);

  return (
    <div className="max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 sm:px-6 py-6">
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border
                      bg-gradient-to-br from-panel via-panel to-surface px-5 py-5 sm:px-7 sm:py-6">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none"/>
        <div className="absolute -bottom-32 -left-16 w-64 h-64 rounded-full bg-accent3/10 blur-3xl pointer-events-none"/>
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                            bg-accent/15 border border-accent/30 text-[10px] uppercase
                            tracking-[0.18em] font-bold text-accent2 mb-2">
              <LibraryIcon size={10}/> Library
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Source videos
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Pick a video to start a job, or browse by creator and category.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to="/library/categories"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                               bg-panel text-gray-300 border border-border
                               hover:bg-panel-hover hover:text-white hover:border-border-hover transition-all">
                <SlidersHorizontal size={14}/> Categories
              </Link>
            )}
            {canUpload && (
              <Link to="/library/upload"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                               bg-accent text-white border border-accent
                               hover:bg-accent2 hover:border-accent2
                               shadow-glow active:scale-[0.97] transition-all">
                <Upload size={16}/> Manage uploads
              </Link>
            )}
          </div>
        </div>

      </div>

      {/* Videos | Templates */}
      <div className="flex gap-2 mb-5">
        {["videos", "templates"].map((tb) => (
          <button key={tb} type="button" onClick={() => setLibTab(tb)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition
              ${libTab === tb ? "border-accent bg-accent/10 text-white"
                              : "border-border text-gray-400 hover:border-gray-500"}`}>
            {tb === "videos" ? "Source videos" : "Templates"}
          </button>
        ))}
      </div>

      {libTab === "templates" && (
        <CustomTemplatePicker browseMode
          onSelect={() => navigate("/new-job")} />
      )}

      {libTab === "videos" && (<>
      {/* Toolbar — search + sort */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search title, creator, or notes..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-panel border border-border
                       text-sm text-gray-200 placeholder:text-gray-600
                       focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-panel border border-border">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.id} type="button" onClick={() => setSort(opt.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                          ${sort === opt.id
                            ? "bg-accent text-white shadow-sm"
                            : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500 tabular-nums">
          {resp.total} total
        </div>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <CategoryChip category={null} active={!categoryId} onClick={() => setCategoryId(null)}/>
        {categories.map(c => (
          <CategoryChip key={c.id} category={c} active={categoryId === c.id}
                        onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}/>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[0,1,2,3,4,5,6,7].map(i => (
            <div key={i} className="rounded-xl border border-border bg-panel/60 overflow-hidden">
              <div className="aspect-video bg-ink-800 animate-pulse"/>
              <div className="p-3 space-y-2">
                <div className="h-3 rounded bg-ink-800 animate-pulse"/>
                <div className="h-2 w-2/3 rounded bg-ink-800 animate-pulse"/>
                <div className="h-8 rounded bg-ink-800 animate-pulse mt-2"/>
              </div>
            </div>
          ))}
        </div>
      ) : resp.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel/60 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-accent/10 border border-accent/30 mb-4">
            <LibraryIcon size={22} className="text-accent2"/>
          </div>
          <p className="text-gray-300 font-medium mb-1">
            {query || categoryId ? "No videos match this view" : "The library is empty"}
          </p>
          <p className="text-sm text-gray-500 mb-5">
            {query || categoryId
              ? "Try clearing filters or search."
              : canUpload
                ? "Upload the first video to seed the team library."
                : "Ask a creative to upload some source footage."}
          </p>
          {!query && !categoryId && canUpload && (
            <Link to="/library/upload"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm
                             bg-accent text-white border border-accent hover:bg-accent2">
              <Upload size={16}/> Upload first video
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {resp.items.map(item => (
              <LibraryCard
                key={item.id}
                item={item}
                canDelete={item.uploader_id === user?.id || isAdmin}
                isPaid={isPaid}
                onDelete={handleDelete}
                onUse={handleUse}
                onRate={handleRate}
                onDownload={handleDownload}
              />
            ))}
          </div>

          {/* Pagination */}
          {resp.total_pages > 1 && (
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
                <button type="button" onClick={() => setPage(p => Math.min(resp.total_pages, p + 1))}
                        disabled={safePage === resp.total_pages}
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
      </>)}
    </div>
  );
}
