import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Edit2, Download, Loader2, ArrowLeft, AlertCircle, RotateCcw, Clock } from "lucide-react";
import { api } from "../api/client";
import ProgressLog from "../components/ProgressLog";
import ClipCard from "../components/ClipCard";

const PLATFORM_LABEL = {
  instagram_reel: "Instagram Reel",
  youtube_short:  "YouTube Short",
  youtube_full:   "YouTube Full",
};

const LANG_LABEL = {
  te: "తెలుగు · Telugu", hi: "हिन्दी · Hindi", ta: "தமிழ் · Tamil",
  kn: "ಕನ್ನಡ · Kannada", ml: "മലയാളം · Malayalam", bn: "বাংলা · Bengali",
  mr: "मराठी · Marathi", gu: "ગુજરાતી · Gujarati", en: "English",
};

export default function JobDetail() {
  const { jobId } = useParams();
  const [job, setJob]           = useState(null);
  const [status, setStatus]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(null);
  const [reimporting, setReimporting] = useState(false);
  const [reimportError, setReimportError] = useState("");

  const loadJob = useCallback(() =>
    api.getJob(jobId).then(setJob), [jobId]);

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

  async function doReimport() {
    setReimporting(true);
    setReimportError("");
    try {
      await api.reimportClips(jobId);
      await loadJob();
      await pollStatus();
    } catch (e) {
      setReimportError(e.message || "Reimport failed");
    } finally {
      setReimporting(false);
    }
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const currentStatus = status?.status || job.status;
  const isRunning = currentStatus === "running" || currentStatus === "pending";
  const isDone    = currentStatus === "done";
  const isFailed  = currentStatus === "failed";
  const pct       = status?.progress_pct ?? job.progress_pct;
  const logLines  = status?.log_lines ?? job.log?.split("\n") ?? [];

  return (
    <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-6">
        <Link to="/" className="btn btn-secondary py-1.5 px-2.5 self-start flex items-center gap-1">
          <ArrowLeft size={14} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-white truncate">{job.video_name}</h1>
          <div className="text-sm text-gray-500 mt-0.5 flex gap-2 sm:gap-3 flex-wrap">
            <span>{PLATFORM_LABEL[job.platform] || job.platform}</span>
            <span className="text-gray-700">|</span>
            <span className="capitalize">{job.frame_layout?.replace("_", " ")}</span>
            <span className="text-gray-700">|</span>
            <span className="text-accent2">{LANG_LABEL[job.language] || job.language?.toUpperCase() || "TE"}</span>
            <span className="text-gray-700">|</span>
            <span>{new Date(job.created_at).toLocaleString()}</span>
          </div>
        </div>

        {isDone && (
          <div className="flex gap-2 self-start flex-shrink-0">
            <Link to={`/jobs/${jobId}/edit`} className="btn btn-secondary flex items-center gap-1.5 text-sm">
              <Edit2 size={14} /> Editor
            </Link>
            <button
              onClick={doExport}
              disabled={exporting}
              className="btn btn-green flex items-center gap-1.5 text-sm"
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
          Exported {exportDone.count} clips
        </div>
      )}

      {/* Elapsed-time pill — counts up while running, freezes on done/failed */}
      {(status?.started_at || job.started_at) && (
        <ElapsedPill
          startedAt={status?.started_at || job.started_at}
          finishedAt={status?.finished_at || job.finished_at}
          running={isRunning}
          serverElapsed={status?.elapsed_seconds ?? job.elapsed_seconds}
        />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {job.clips.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} jobId={jobId} index={i} />
            ))}
          </div>
        </div>
      )}

      {isRunning && (
        <div className="card p-8 text-center text-gray-600">
          <Loader2 size={32} className="animate-spin mx-auto mb-3 text-accent" />
          <p>Pipeline running... clips will appear when done</p>
        </div>
      )}

      {/* Pipeline finished but nothing landed in the DB — usually an import
          error.  Show a one-click recovery path instead of a dead screen. */}
      {(isDone || isFailed) && job.clips?.length === 0 && (
        <div className="card p-4 mb-6 border-yellow-900 bg-yellow-950/30">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-yellow-300 text-sm font-medium mb-1">
                Pipeline finished but no clips were imported.
              </p>
              <p className="text-xs text-yellow-200/80 mb-3 whitespace-pre-wrap break-words">
                {status?.error || job.error ||
                  "This usually means editor_meta.json couldn't be read. The rendered mp4 files are likely still on disk — click Retry Import to re-scan."}
              </p>
              {reimportError && (
                <p className="text-xs text-red-400 mb-3">{reimportError}</p>
              )}
              <button
                onClick={doReimport}
                disabled={reimporting}
                className="btn btn-primary text-sm inline-flex items-center gap-1.5"
              >
                {reimporting
                  ? <><Loader2 size={14} className="animate-spin" /> Reimporting…</>
                  : <><RotateCcw size={14} /> Retry Import</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/** Live-updating wall-clock timer for a pipeline run. */
function ElapsedPill({ startedAt, finishedAt, running, serverElapsed }) {
  const [nowTick, setNowTick] = useState(0);
  const timer = useRef(null);
  useEffect(() => {
    if (!running || finishedAt) {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      return;
    }
    timer.current = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, finishedAt]);

  const seconds = (() => {
    if (finishedAt && startedAt) {
      return Math.max(0, Math.floor((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    }
    if (running && startedAt) {
      return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }
    return serverElapsed ?? 0;
  })();

  const label = formatDuration(seconds);
  const color = running ? "text-yellow-300 border-yellow-700/60 bg-yellow-950/20"
               : finishedAt ? "text-green-300 border-green-700/60 bg-green-950/20"
               : "text-gray-400 border-border bg-surface";

  return (
    <div className={`mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${color}`}>
      <Clock size={13} className={running ? "animate-pulse" : ""} />
      <span className="font-mono tabular-nums">{label}</span>
      <span className="text-[10px] text-gray-500">
        {running ? "elapsed · live" : finishedAt ? "total runtime" : "pending"}
      </span>
    </div>
  );
}

function formatDuration(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}
