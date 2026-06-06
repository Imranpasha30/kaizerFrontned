import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit2, Loader2, CheckCircle, XCircle, Clock, StopCircle } from "lucide-react";
import { api } from "../api/client";

const STATUS_ICON = {
  pending:   <Clock  size={14} className="text-gray-400" />,
  running:   <Loader2 size={14} className="text-yellow-400 animate-spin" />,
  done:      <CheckCircle size={14} className="text-green-400" />,
  failed:    <XCircle size={14} className="text-red-400" />,
  cancelled: <StopCircle size={14} className="text-amber-400" />,
};

const STATUS_BADGE = {
  pending:   "bg-gray-800/60 text-gray-400 border-gray-700/50",
  running:   "bg-yellow-900/40 text-yellow-400 border-yellow-700/40",
  done:      "bg-green-900/40 text-green-400 border-green-700/40",
  failed:    "bg-red-900/40 text-red-400 border-red-700/40",
  cancelled: "bg-amber-900/40 text-amber-400 border-amber-700/40",
};

const PLATFORM_LABEL = {
  instagram_reel: "Instagram Reel",
  youtube_short:  "YouTube Short",
  youtube_full:   "YouTube Full",
};

const LANG_LABEL = {
  te: "తెలుగు", hi: "हिन्दी", ta: "தமிழ்", kn: "ಕನ್ನಡ",
  ml: "മലയാളം", bn: "বাংলা", mr: "मराठी", gu: "ગુજરાતી", en: "EN",
};

// "8m23s" / "1h05m" — compact runtime formatter for the list row.
function fmtDuration(secs) {
  if (secs == null || secs < 0) return "";
  const s = Math.floor(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

// "14:32" — local-time HH:MM, used for start/end timestamps.
function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function Home() {
  const navigate = useNavigate();
  const [jobs, setJobs]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    api.listJobs()
       .then(setJobs)
       .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function deleteJob(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this job?")) return;
    await api.deleteJob(id);
    setJobs(j => j.filter(x => x.id !== id));
  }

  async function cancelJob(id, e) {
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
      // Optimistic UI — flip the status locally; the next poll will
      // reconcile with the server's authoritative value.
      setJobs(j => j.map(x => x.id === id ? { ...x, status: "cancelled" } : x));
    } catch (err) {
      alert("Cancel failed: " + (err.message || "unknown error"));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{jobs.length} total</p>
        </div>
        <Link to="/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={16} /> New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No jobs yet</p>
          <Link to="/new" className="btn btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Create your first job
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {jobs.map(job => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="card px-4 py-3.5 sm:px-5 flex items-center gap-3 sm:gap-4
                         hover:border-border-hover hover:bg-panel-hover group"
            >
              {/* Status icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                {STATUS_ICON[job.status]}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white truncate max-w-[200px] sm:max-w-none">
                    {/* Phase 14 / V2 Beta (D-13.11): prefer the user's
                        human-readable name; fall back to the filename
                        so pre-Phase-14 jobs render unchanged. */}
                    {job.name || job.video_name}
                  </span>
                  {job.platform === "full_video_shorts_v2" && (
                    <span className="text-[9px] font-bold tracking-widest uppercase
                                     px-1.5 py-0.5 rounded-full bg-amber-500/15
                                     text-amber-300 border border-amber-500/40">
                      Beta
                    </span>
                  )}
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[job.status]}`}>
                    {job.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span>{PLATFORM_LABEL[job.platform] || job.platform}</span>
                  <span className="text-gray-700">|</span>
                  <span className="capitalize">{job.frame_layout?.replace("_", " ")}</span>
                  <span className="text-gray-700">|</span>
                  <span className="inline-flex items-center gap-1 text-accent2">
                    {LANG_LABEL[job.language] || job.language?.toUpperCase() || "TE"}
                  </span>
                  <span className="text-gray-700">|</span>
                  <span>{job.clip_count} clip{job.clip_count !== 1 ? "s" : ""}</span>
                  <span className="hidden sm:inline text-gray-700">|</span>
                  <span className="hidden sm:inline">{new Date(job.created_at).toLocaleDateString()}</span>
                  {/* Timing: live elapsed for running, start-end + total for done.
                      Re-renders every 3s via the parent polling loop, so the
                      live counter ticks for the user without extra timers. */}
                  {job.started_at && (
                    <>
                      <span className="hidden sm:inline text-gray-700">|</span>
                      <span className="hidden sm:inline">
                        {job.status === "running" ? (
                          <span className="text-yellow-400">
                            {fmtTime(job.started_at)} - live {fmtDuration(job.elapsed_seconds)}
                          </span>
                        ) : job.finished_at ? (
                          <span className="text-gray-400">
                            {fmtTime(job.started_at)} - {fmtTime(job.finished_at)}
                            {job.elapsed_seconds != null && (
                              <span className="text-gray-600"> ({fmtDuration(job.elapsed_seconds)})</span>
                            )}
                          </span>
                        ) : (
                          <span>started {fmtTime(job.started_at)}</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions — always visible on mobile, hover on desktop */}
              <div className="flex items-center gap-2 flex-shrink-0
                              sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {job.status === "done" && (
                  // Rendered as a button (NOT a Link) because the whole row
                  // is already wrapped in <Link to=...>, and nesting <a>
                  // inside <a> is invalid HTML — React Router warns about
                  // it. Programmatic navigate() gives the same behaviour.
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/jobs/${job.id}/edit`);
                    }}
                    className="btn btn-secondary py-1.5 px-2.5 flex items-center gap-1 text-xs"
                  >
                    <Edit2 size={12} /> <span className="hidden sm:inline">Editor</span>
                  </button>
                )}
                {(job.status === "running" || job.status === "pending") && (
                  <button
                    type="button"
                    onClick={(e) => cancelJob(job.id, e)}
                    className="btn btn-secondary py-1.5 px-2.5 hover:border-amber-700 hover:text-amber-400 flex items-center gap-1 text-xs"
                    title="Stop this job and kill its renders"
                  >
                    <StopCircle size={12} /> <span className="hidden sm:inline">Stop</span>
                  </button>
                )}
                <button
                  onClick={(e) => deleteJob(job.id, e)}
                  className="btn btn-secondary py-1.5 px-2.5 hover:border-red-800 hover:text-red-400 text-xs"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
