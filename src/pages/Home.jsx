import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Edit2, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { api } from "../api/client";

const STATUS_ICON = {
  pending: <Clock  size={14} className="text-gray-400" />,
  running: <Loader2 size={14} className="text-yellow-400 animate-spin" />,
  done:    <CheckCircle size={14} className="text-green-400" />,
  failed:  <XCircle size={14} className="text-red-400" />,
};

const STATUS_BADGE = {
  pending: "bg-gray-800/60 text-gray-400 border-gray-700/50",
  running: "bg-yellow-900/40 text-yellow-400 border-yellow-700/40",
  done:    "bg-green-900/40 text-green-400 border-green-700/40",
  failed:  "bg-red-900/40 text-red-400 border-red-700/40",
};

const PLATFORM_LABEL = {
  instagram_reel: "Instagram Reel",
  youtube_short:  "YouTube Short",
  youtube_full:   "YouTube Full",
};

export default function Home() {
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
                    {job.video_name}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[job.status]}`}>
                    {job.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span>{PLATFORM_LABEL[job.platform] || job.platform}</span>
                  <span className="text-gray-700">|</span>
                  <span className="capitalize">{job.frame_layout?.replace("_", " ")}</span>
                  <span className="text-gray-700">|</span>
                  <span>{job.clip_count} clip{job.clip_count !== 1 ? "s" : ""}</span>
                  <span className="hidden sm:inline text-gray-700">|</span>
                  <span className="hidden sm:inline">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions — always visible on mobile, hover on desktop */}
              <div className="flex items-center gap-2 flex-shrink-0
                              sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {job.status === "done" && (
                  <Link
                    to={`/jobs/${job.id}/edit`}
                    onClick={e => e.stopPropagation()}
                    className="btn btn-secondary py-1.5 px-2.5 flex items-center gap-1 text-xs"
                  >
                    <Edit2 size={12} /> <span className="hidden sm:inline">Editor</span>
                  </Link>
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
