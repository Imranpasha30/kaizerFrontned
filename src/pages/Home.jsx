import React, {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus, Trash2, Edit2, Loader2, CheckCircle, XCircle, Clock, StopCircle,
  Search, Film, Activity, Layers, Calendar, Video, Sparkles, AlertTriangle,
  Languages, ChevronLeft, ChevronRight, ImageOff, Play, MoreVertical, ExternalLink,
} from "lucide-react";
import { api } from "../api/client";

const PAGE_SIZE = 24;
const POLL_ACTIVE_MS = 3_000;
const POLL_IDLE_MS   = 12_000;

const STATUS_ICON = {
  pending:   <Clock        size={12} />,
  running:   <Loader2      size={12} className="animate-spin" />,
  done:      <CheckCircle  size={12} />,
  failed:    <XCircle      size={12} />,
  cancelled: <StopCircle   size={12} />,
};

const STATUS_PILL = {
  pending:   "bg-gray-900/80 text-gray-200  border-gray-600/60",
  running:   "bg-yellow-900/80 text-yellow-100 border-yellow-500/60",
  done:      "bg-green-900/80 text-green-100  border-green-500/60",
  failed:    "bg-red-900/80 text-red-100      border-red-500/60",
  cancelled: "bg-amber-900/80 text-amber-100  border-amber-500/60",
};

const STATUS_DOT = {
  pending:   "bg-gray-400",
  running:   "bg-yellow-400",
  done:      "bg-green-400",
  failed:    "bg-red-400",
  cancelled: "bg-amber-400",
};

const STATUS_PLACEHOLDER_BG = {
  pending:   "from-gray-800 via-gray-900 to-black",
  running:   "from-amber-900 via-orange-950 to-black",
  done:      "from-emerald-900 via-green-950 to-black",
  failed:    "from-red-900 via-rose-950 to-black",
  cancelled: "from-amber-900 via-amber-950 to-black",
};

const PLATFORM_LABEL = {
  instagram_reel: "Reel",
  youtube_short:  "Short",
  youtube_full:   "Long",
  full_video_shorts_v2: "Full Video + Shorts",
  full_video_shorts_v4: "Full Video + Shorts",
};

const LANG_LABEL = {
  te: "తెలుగు", hi: "हिन्दी", ta: "தமிழ்", kn: "ಕನ್ನಡ",
  ml: "മലയാളം", bn: "বাংলা", mr: "मराठी", gu: "ગુજરાતી", en: "EN",
};

// Quick Publish jobs = raw user-uploaded videos published as-is (no pipeline run, nothing to
// edit). They're kept in their OWN tab so they don't clutter the pipeline-job views.
const isQuickPub = j => (j.frame_layout || "") === "raw_upload";
const FILTERS = [
  { id: "all",     label: "All",           match: j => !isQuickPub(j) },
  { id: "running", label: "Active",        match: j => !isQuickPub(j) && (j.status === "running" || j.status === "pending") },
  { id: "done",    label: "Done",          match: j => !isQuickPub(j) && j.status === "done" },
  { id: "failed",  label: "Failed",        match: j => !isQuickPub(j) && (j.status === "failed" || j.status === "cancelled") },
  { id: "quick",   label: "Quick Publish", match: isQuickPub },
];

function fmtDuration(secs) {
  if (secs == null || secs < 0) return "";
  const s = Math.floor(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

function fmtRelDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffDay = Math.floor(diffMs / 86_400_000);
    if (diffDay <= 0) return "Today";
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

// Skip re-render when nothing material about the visible list changed.
function jobsShallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.elapsed_seconds !== y.elapsed_seconds ||
      x.clip_count !== y.clip_count ||
      x.name !== y.name ||
      x.video_name !== y.video_name ||
      x.thumbnail_url !== y.thumbnail_url
    ) return false;
  }
  return true;
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
// Sub-components
// ────────────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, tone, pulse }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-panel/80 px-4 py-3.5
                     transition-all duration-200 hover:bg-panel-hover hover:-translate-y-0.5
                     ${tone.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">
            {label}
          </div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${tone.text}`}>
            {value}
          </div>
        </div>
        <div className={`relative flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                         border ${tone.iconBg}`}>
          <Icon size={16} className={tone.icon} />
          {pulse && value > 0 && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400/70 opacity-75"/>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"/>
            </span>
          )}
        </div>
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${tone.bar}`}/>
    </div>
  );
}

function PlaceholderArt({ job }) {
  return (
    <div className={`absolute inset-0 job-thumb-ph bg-gradient-to-br ${STATUS_PLACEHOLDER_BG[job.status] || STATUS_PLACEHOLDER_BG.pending}
                     flex items-center justify-center`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.07),transparent_55%)]"/>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(224, 49, 43,0.18),transparent_50%)]"/>
      <div className="relative flex flex-col items-center gap-2 text-gray-500">
        <ImageOff size={28} className="opacity-60"/>
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-70">
          {job.status === "running" || job.status === "pending"
            ? "Rendering…"
            : "No preview"}
        </span>
      </div>
    </div>
  );
}

const JobCard = React.memo(function JobCard({ job, onDelete, onCancel, onEdit }) {
  const isActive  = job.status === "running" || job.status === "pending";
  const isRunning = job.status === "running";
  const isVertical = job.thumbnail_aspect === "9:16";
  const hasThumb = !!job.thumbnail_url;
  const platformLabel = PLATFORM_LABEL[job.platform] || job.platform;
  // Quick Publish uploads are raw user-edited videos with no pipeline run —
  // there's nothing to open in the canvas editor, so we label them and hide
  // the "Open editor" action.
  const isQuickPublish = (job.frame_layout || "") === "raw_upload";

  return (
    <Link
      to={`/jobs/${job.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-panel
                  transition-all duration-200
                  hover:-translate-y-1 hover:shadow-elevated
                  ${isRunning
                    ? "border-yellow-700/50 shadow-[0_0_40px_-18px_rgba(234,179,8,0.6)]"
                    : "border-border hover:border-border-hover"}`}
    >
      {/* ── Thumbnail (16:9 tile) ─────────────────────────── */}
      <div className="relative w-full aspect-video bg-ink-900 overflow-hidden">
        {hasThumb ? (
          isVertical ? (
            <>
              {/* Blurred backdrop fills the wide tile */}
              <img
                src={job.thumbnail_url}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60"
                loading="lazy"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/30"/>
              {/* Foreground 9:16 thumb, centered */}
              <img
                src={job.thumbnail_url}
                alt={job.name || job.video_name}
                className="relative h-full mx-auto object-contain"
                loading="lazy"
                draggable={false}
              />
            </>
          ) : (
            <img
              src={job.thumbnail_url}
              alt={job.name || job.video_name}
              className="absolute inset-0 w-full h-full object-cover
                         transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              draggable={false}
            />
          )
        ) : (
          <PlaceholderArt job={job}/>
        )}

        {/* Status pill — top-left */}
        <div className="absolute top-2 left-2 z-10">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                            border backdrop-blur-md text-[10px] uppercase tracking-wider
                            font-semibold ${STATUS_PILL[job.status]}`}>
            {STATUS_ICON[job.status]}
            <span>{job.status}</span>
          </span>
        </div>

        {/* Beta chip — top-right (under hover actions) */}
        {job.platform === "full_video_shorts_v2" && (
          <div className="absolute top-2 right-2 z-10 group-hover:opacity-0 transition-opacity">
            <span className="text-[9px] font-bold tracking-widest uppercase
                             px-1.5 py-0.5 rounded-full bg-amber-500/30 backdrop-blur-md
                             text-amber-100 border border-amber-300/60">
              Beta
            </span>
          </div>
        )}

        {/* Live running indicator — bottom-left */}
        {isRunning && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             bg-black/60 backdrop-blur-md border border-yellow-500/40
                             text-[10px] font-medium text-yellow-200 tabular-nums">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"/>
              live{job.elapsed_seconds != null ? ` · ${fmtDuration(job.elapsed_seconds)}` : ""}
            </span>
          </div>
        )}

        {/* Bottom gradient + platform/clips chip */}
        <div className="absolute inset-x-0 bottom-0 z-10 h-16
                        bg-gradient-to-t from-black/85 via-black/40 to-transparent
                        pointer-events-none"/>
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
          {isQuickPublish && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                             bg-emerald-500/25 backdrop-blur-md border border-emerald-300/40
                             text-[10px] font-semibold text-emerald-100">
              Quick Publish
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                           bg-black/60 backdrop-blur-md border border-white/10
                           text-[10px] font-semibold text-white/90">
            <Video size={10}/> {isQuickPublish ? "Uploaded" : platformLabel}
          </span>
          {job.clip_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                             bg-black/60 backdrop-blur-md border border-white/10
                             text-[10px] font-semibold text-white/90 tabular-nums">
              <Film size={10}/> {job.clip_count}
            </span>
          )}
        </div>

        {/* Hover-revealed actions — top-right */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1
                        opacity-0 group-hover:opacity-100 transition-opacity">
          {job.status === "done" && !isQuickPublish && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(job.id); }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md
                         bg-black/70 backdrop-blur-md border border-white/15 text-white/90
                         hover:bg-accent hover:border-accent transition-all"
              title="Open editor"
            >
              <Edit2 size={12}/>
            </button>
          )}
          {isActive && (
            <button
              type="button"
              onClick={(e) => onCancel(job.id, e)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md
                         bg-black/70 backdrop-blur-md border border-white/15 text-white/90
                         hover:bg-amber-700 hover:border-amber-500 transition-all"
              title="Stop job"
            >
              <StopCircle size={12}/>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => onDelete(job.id, e)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md
                       bg-black/70 backdrop-blur-md border border-white/15 text-white/90
                       hover:bg-red-700 hover:border-red-500 transition-all"
            title="Delete job"
          >
            <Trash2 size={12}/>
          </button>
        </div>

        {/* Play-over on hover for completed jobs */}
        {job.status === "done" && (
          <div className="absolute inset-0 z-0 flex items-center justify-center
                          opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-md
                            border border-white/30 flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="white"/>
            </div>
          </div>
        )}

        {/* Running shimmer at the very bottom edge */}
        {isRunning && (
          <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-yellow-900/40 overflow-hidden z-30">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-yellow-400 to-transparent
                            animate-shimmer"
                 style={{ backgroundSize: "200% 100%" }}/>
          </div>
        )}
      </div>

      {/* ── Card footer ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-1 px-3 py-2.5">
        <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2
                       group-hover:text-accent2 transition-colors">
          {job.name || job.video_name}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 ${
            isRunning ? "text-yellow-400" : ""
          }`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status]}`}/>
            {fmtRelDate(job.created_at)}
          </span>
          <span className="text-gray-700">·</span>
          <span className="text-accent2/80 font-medium">
            {LANG_LABEL[job.language] || job.language?.toUpperCase() || "TE"}
          </span>
        </div>

        {/* Quick Publish: link straight to the published YouTube video(s) — these jobs were
            never edited here, so the card IS the destination. Use a button (not <a>) so it
            doesn't nest inside the card's <Link>. */}
        {isQuickPublish && (
          (job.published_videos && job.published_videos.length > 0) ? (
            <button type="button"
              onClick={(e) => {
                e.preventDefault(); e.stopPropagation();
                window.open(job.published_videos[0].watch_url, "_blank", "noopener,noreferrer");
              }}
              title={job.published_videos[0].watch_url}
              className="mt-1 inline-flex items-center gap-1 self-start text-[11px] font-semibold
                         text-red-400 hover:text-red-300">
              <ExternalLink size={11}/> Watch on YouTube
              {job.published_videos.length > 1 ? ` (${job.published_videos.length})` : ""}
            </button>
          ) : (
            <span className="mt-1 text-[11px] text-gray-600">Uploaded — no YouTube link yet</span>
          )
        )}
      </div>
    </Link>
  );
});

// ────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [query, setQuery]     = useState("");
  const [page, setPage]       = useState(1);

  const deferredQuery = useDeferredValue(query);
  const jobsRef = useRef([]);
  jobsRef.current = jobs;

  const load = useCallback(() =>
    api.listJobs()
       .then(next => {
         setJobs(prev => jobsShallowEqual(prev, next) ? prev : next);
       })
       .catch(() => {})
       .finally(() => setLoading(false)),
  []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) { timer = setTimeout(tick, 1_000); return; }
      await load();
      if (cancelled) return;
      const hasActive = jobsRef.current.some(
        j => j.status === "running" || j.status === "pending"
      );
      timer = setTimeout(tick, hasActive ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };

    const onVis = () => {
      if (!document.hidden) { if (timer) clearTimeout(timer); tick(); }
    };

    tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => { setPage(1); }, [filter, deferredQuery]);

  const deleteJob = useCallback(async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this job?")) return;
    await api.deleteJob(id);
    setJobs(j => j.filter(x => x.id !== id));
  }, []);

  const cancelJob = useCallback(async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(
      "Stop this job?\n\n" +
      "The pipeline subprocess and any running ffmpeg renders will be " +
      "killed immediately. Any clips that finished before the stop will " +
      "still appear on the job page."
    )) return;
    try {
      await api.cancelJob(id);
      setJobs(j => j.map(x => x.id === id ? { ...x, status: "cancelled" } : x));
    } catch (err) {
      alert("Cancel failed: " + (err.message || "unknown error"));
    }
  }, []);

  const editJob = useCallback((id) => navigate(`/jobs/${id}/v4-edit`), [navigate]);

  // Stats count PIPELINE jobs only (Quick Publish lives in its own tab + count), so the cards
  // stay consistent with the All tab.
  const stats = useMemo(() => {
    const pipe = jobs.filter(j => !isQuickPub(j));
    return {
      total:   pipe.length,
      running: pipe.filter(j => j.status === "running" || j.status === "pending").length,
      done:    pipe.filter(j => j.status === "done").length,
      failed:  pipe.filter(j => j.status === "failed" || j.status === "cancelled").length,
      quick:   jobs.filter(isQuickPub).length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter) || FILTERS[0];
    const q = deferredQuery.trim().toLowerCase();
    return jobs.filter(j => {
      if (!f.match(j)) return false;
      if (!q) return true;
      const name = (j.name || j.video_name || "").toLowerCase();
      return name.includes(q);
    });
  }, [jobs, filter, deferredQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const startIdx   = (safePage - 1) * PAGE_SIZE;
  const visibleJobs = useMemo(
    () => filteredJobs.slice(startIdx, startIdx + PAGE_SIZE),
    [filteredJobs, startIdx]
  );
  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  if (loading) {
    return (
      <div className="max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-[88px] rounded-xl border border-border bg-panel/60 animate-pulse"/>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[0,1,2,3,4,5,6,7].map(i => (
            <div key={i} className="rounded-xl border border-border bg-panel/60 overflow-hidden">
              <div className="aspect-video bg-ink-800 animate-pulse"/>
              <div className="p-3 space-y-2">
                <div className="h-3 rounded bg-ink-800 animate-pulse"/>
                <div className="h-2 w-2/3 rounded bg-ink-800 animate-pulse"/>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 sm:px-6 py-6">
      {/* Hero header */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border
                      bg-gradient-to-br from-panel via-panel to-surface px-5 py-5 sm:px-7 sm:py-6">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none"/>
        <div className="absolute -bottom-32 -left-16 w-64 h-64 rounded-full bg-accent3/10 blur-3xl pointer-events-none"/>
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                            bg-accent/15 border border-accent/30 text-[10px] uppercase
                            tracking-[0.18em] font-bold text-accent2 mb-2">
              <Sparkles size={10}/> Studio
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Your jobs
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {stats.running > 0
                ? <><span className="text-yellow-400 font-medium">{stats.running} processing</span> · {stats.done} done · {stats.failed} failed</>
                : <>{stats.done} completed, {stats.failed} need attention</>}
            </p>
          </div>
          <Link
            to="/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                       bg-accent text-white border border-accent hover:bg-accent2 hover:border-accent2
                       shadow-glow active:scale-[0.97] transition-all"
          >
            <Plus size={16}/> New Job
          </Link>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatTile
            icon={Layers} label="Total" value={stats.total}
            tone={{ text: "text-white", icon: "text-gray-300",
                    iconBg: "bg-gray-800/60 border-gray-700/50",
                    border: "border-border hover:border-border-hover",
                    bar: "from-transparent via-gray-600/40 to-transparent" }}
          />
          <StatTile
            icon={Activity} label="Active" value={stats.running} pulse
            tone={{ text: "text-yellow-300", icon: "text-yellow-300",
                    iconBg: "bg-yellow-900/40 border-yellow-700/50",
                    border: "border-yellow-900/40 hover:border-yellow-700/60",
                    bar: "from-transparent via-yellow-500/50 to-transparent" }}
          />
          <StatTile
            icon={CheckCircle} label="Done" value={stats.done}
            tone={{ text: "text-green-300", icon: "text-green-300",
                    iconBg: "bg-green-900/40 border-green-700/50",
                    border: "border-green-900/30 hover:border-green-700/50",
                    bar: "from-transparent via-green-500/40 to-transparent" }}
          />
          <StatTile
            icon={AlertTriangle} label="Failed" value={stats.failed}
            tone={{ text: stats.failed > 0 ? "text-red-300" : "text-gray-500",
                    icon: "text-red-300",
                    iconBg: "bg-red-900/40 border-red-700/50",
                    border: "border-red-900/30 hover:border-red-700/50",
                    bar: "from-transparent via-red-500/40 to-transparent" }}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 sm:gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobs..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-panel border border-border
                       text-sm text-gray-200 placeholder:text-gray-600
                       focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-panel border border-border">
          {FILTERS.map(f => {
            const isActive = filter === f.id;
            const count = jobs.filter(f.match).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all
                            inline-flex items-center gap-1.5
                            ${isActive
                              ? "bg-accent text-white shadow-sm"
                              : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"}`}
              >
                {f.label}
                <span className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded
                                  ${isActive ? "bg-white/20" : "bg-white/[0.06]"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel/60 p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-accent/10 border border-accent/30 mb-4">
            <Film size={22} className="text-accent2"/>
          </div>
          <p className="text-gray-300 font-medium mb-1">
            {query || filter !== "all" ? "No jobs match this view" : "No jobs yet"}
          </p>
          <p className="text-sm text-gray-500 mb-5">
            {query || filter !== "all"
              ? "Try clearing the filter or search."
              : "Start by creating your first job."}
          </p>
          {!query && filter === "all" && (
            <Link
              to="/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm
                         bg-accent text-white border border-accent hover:bg-accent2"
            >
              <Plus size={16}/> Create your first job
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visibleJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onDelete={deleteJob}
                onCancel={cancelJob}
                onEdit={editJob}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between
                            gap-3 mt-7 px-1">
              <p className="text-xs text-gray-500 tabular-nums">
                Showing{" "}
                <span className="text-gray-300 font-medium">
                  {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filteredJobs.length)}
                </span>{" "}
                of <span className="text-gray-300 font-medium">{filteredJobs.length}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md
                             border border-border bg-panel text-gray-400
                             hover:bg-panel-hover hover:text-white hover:border-border-hover
                             disabled:opacity-30 disabled:pointer-events-none transition-all"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14}/>
                </button>
                {pageList.map((p, idx) =>
                  p === "…" ? (
                    <span key={`e${idx}`} className="px-1.5 text-gray-600 text-xs select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={`min-w-[32px] h-8 px-2 rounded-md text-xs font-semibold tabular-nums
                                  transition-all border
                                  ${p === safePage
                                    ? "bg-accent text-white border-accent shadow-sm"
                                    : "bg-panel text-gray-400 border-border hover:bg-panel-hover hover:text-white hover:border-border-hover"}`}
                      aria-current={p === safePage ? "page" : undefined}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md
                             border border-border bg-panel text-gray-400
                             hover:bg-panel-hover hover:text-white hover:border-border-hover
                             disabled:opacity-30 disabled:pointer-events-none transition-all"
                  aria-label="Next page"
                >
                  <ChevronRight size={14}/>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
