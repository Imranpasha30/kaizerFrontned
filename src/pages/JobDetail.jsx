import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Edit2, Download, Loader2, ArrowLeft } from "lucide-react";
import { api } from "../api/client";
import ProgressLog from "../components/ProgressLog";
import ClipCard from "../components/ClipCard";

const PLATFORM_LABEL = {
  instagram_reel: "Instagram Reel",
  youtube_short:  "YouTube Short",
  youtube_full:   "YouTube Full",
};

export default function JobDetail() {
  const { jobId } = useParams();
  const [job, setJob]           = useState(null);
  const [status, setStatus]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(null);

  // Load full job (for clips)
  const loadJob = useCallback(() =>
    api.getJob(jobId).then(setJob), [jobId]);

  // Poll lightweight status while running
  const pollStatus = useCallback(() =>
    api.getJobStatus(jobId).then(setStatus), [jobId]);

  useEffect(() => {
    loadJob();
    pollStatus();
    const t = setInterval(() => {
      api.getJobStatus(jobId).then(s => {
        setStatus(s);
        if (s?.status === "done" || s?.status === "failed") {
          clearInterval(t);
          loadJob();
        }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [jobId]);

  async function doExport() {
    setExporting(true);
    try {
      const res = await api.exportJob(jobId);
      setExportDone(res);
    } finally {
      setExporting(false);
    }
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const isRunning = status?.status === "running" || job.status === "running";
  const isDone    = status?.status === "done"    || job.status === "done";
  const isFailed  = status?.status === "failed"  || job.status === "failed";
  const pct       = status?.progress_pct ?? job.progress_pct;
  const logLines  = status?.log_lines ?? job.log?.split("\n") ?? [];
  const currentStatus = status?.status || job.status;

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link to="/" className="btn btn-secondary py-1.5 px-2.5 mt-0.5 flex items-center gap-1">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{job.video_name}</h1>
          <div className="text-sm text-gray-500 mt-0.5 flex gap-3">
            <span>{PLATFORM_LABEL[job.platform] || job.platform}</span>
            <span>·</span>
            <span className="capitalize">{job.frame_layout?.replace("_", " ")}</span>
            <span>·</span>
            <span>{new Date(job.created_at).toLocaleString()}</span>
          </div>
        </div>

        {isDone && (
          <div className="flex gap-2">
            <Link to={`/jobs/${jobId}/edit`} className="btn btn-secondary flex items-center gap-1.5">
              <Edit2 size={14} /> Editor
            </Link>
            <button
              onClick={doExport}
              disabled={exporting}
              className="btn btn-green flex items-center gap-1.5"
            >
              {exporting
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} />}
              Export All
            </button>
          </div>
        )}
      </div>

      {exportDone && (
        <div className="card p-3 mb-4 text-sm text-green-300 flex items-center gap-2">
          ✓ Exported {exportDone.count} clips → <code className="text-xs text-green-500">{exportDone.export_dir}</code>
        </div>
      )}

      {/* Progress */}
      {(isRunning || isFailed || (isDone && logLines.length > 0)) && (
        <div className="mb-6">
          <ProgressLog lines={logLines} pct={pct} status={currentStatus} />
        </div>
      )}

      {isFailed && status?.error && (
        <div className="card p-4 mb-6 border-red-900">
          <p className="text-red-400 text-sm font-medium mb-1">Pipeline failed</p>
          <pre className="text-xs text-red-300 whitespace-pre-wrap">{status.error}</pre>
        </div>
      )}

      {/* Clips */}
      {isDone && job.clips?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Clips ({job.clips.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {job.clips.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} jobId={jobId} index={i} />
            ))}
          </div>
        </div>
      )}

      {isRunning && (
        <div className="card p-8 text-center text-gray-600">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-accent" />
          <p>Pipeline running… clips will appear when done</p>
        </div>
      )}
    </div>
  );
}
