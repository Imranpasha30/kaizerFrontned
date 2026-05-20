import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Edit2, Download, Loader2, ArrowLeft, AlertCircle, RotateCcw, Clock,
  Clapperboard, CheckSquare, Square, StopCircle, ExternalLink,
  Check, X, Star, Pencil,
} from "lucide-react";
import { api } from "../api/client";
import { parseV2Error } from "../api/errorMessages";
import { useAuth } from "../auth/AuthProvider";
import ProgressLog from "../components/ProgressLog";
import ClipCard from "../components/ClipCard";
import BulkPublishModal from "../components/BulkPublishModal";

const PLATFORM_LABEL = {
  instagram_reel:         "Instagram Reel",
  youtube_short:          "YouTube Short",
  youtube_full:           "YouTube Full",
  youtube_full_plus_shorts: "Full Video + Shorts",
  full_video_shorts_v2:   "Full Video + Shorts (V2 Beta)",
};

// V2 per-step progress label map (Step 11.5, D-11.9). Slugs are
// written by the V2 orchestrator at the start of each Inngest step
// (see Job.current_stage column from Step 10.7 / D-10.7).
const V2_STAGE_ORDER = [
  "stage_0_ingest",
  "stage_1_transcribe",
  "stage_2_continuity",
  "stage_2_5_entities",
  "stage_3_fanout",
  "stage_4_render",
  "finalize",
];
const V2_STAGE_LABELS = {
  stage_0_ingest:     "Ingesting video",
  stage_1_transcribe: "Transcribing audio",
  stage_2_continuity: "Identifying cuts",
  stage_2_5_entities: "Canonicalizing entities",
  stage_3_fanout:     "Generating shorts + metadata + image plan",
  stage_4_render:     "Rendering bulletin + shorts",
  finalize:           "Finishing up",
};

const LANG_LABEL = {
  te: "తెలుగు · Telugu", hi: "हिन्दी · Hindi", ta: "தமிழ் · Tamil",
  kn: "ಕನ್ನಡ · Kannada", ml: "മലയാളം · Malayalam", bn: "বাংলা · Bengali",
  mr: "मराठी · Marathi", gu: "ગુજરાતી · Gujarati", en: "English",
};

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob]           = useState(null);
  const [status, setStatus]     = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(null);
  const [reimporting, setReimporting] = useState(false);
  const [reimportError, setReimportError] = useState("");
  // Bulk-publish selection state: Set of clip_ids that are currently ticked.
  // Clicking a clip checkbox toggles membership; the header "Publish N" button
  // opens BulkPublishModal with those clips (in original order).
  const [selectedClipIds, setSelectedClipIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

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
        // Stop polling on ALL terminal states — including the new
        // "cancelled" one set by the Stop button.
        if (s?.status === "done" || s?.status === "failed" || s?.status === "cancelled") {
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

  // ─── Cancel / Stop ────────────────────────────────────────────────
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  async function doCancel() {
    if (!window.confirm(
      "Stop this job?\n\n" +
      "The pipeline subprocess and any running ffmpeg renders will be " +
      "killed immediately. Any clips that finished before the stop will " +
      "still appear on the job page; in-progress files will be discarded."
    )) return;
    setCancelling(true);
    setCancelError("");
    try {
      await api.cancelJob(jobId);
      await loadJob();
      await pollStatus();
    } catch (e) {
      setCancelError(e.message || "Cancel failed");
    } finally {
      setCancelling(false);
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
  const isRunning   = currentStatus === "running" || currentStatus === "pending";
  const isDone      = currentStatus === "done";
  const isFailed    = currentStatus === "failed";
  const isCancelled = currentStatus === "cancelled";
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
          {/* Phase 14 / V2 Beta (D-13.14): name with inline rename. */}
          <RenamableTitle
            jobId={jobId}
            initialName={job.name || job.video_name || ""}
            videoName={job.video_name || ""}
            onRenamed={(nm) => setJob((j) => ({ ...j, name: nm }))}
          />
          <div className="text-sm text-gray-500 mt-0.5 flex gap-2 sm:gap-3 flex-wrap">
            <span>{PLATFORM_LABEL[job.platform] || job.platform}</span>
            <span className="text-gray-700">|</span>
            <span className="capitalize">{job.frame_layout?.replace("_", " ")}</span>
            <span className="text-gray-700">|</span>
            <span className="text-accent2">{LANG_LABEL[job.language] || job.language?.toUpperCase() || "TE"}</span>
            {/* Item 104: surface the bulletin transition the operator
                picked. Only meaningful for V2 jobs (V1 stitcher does
                not support transitions). */}
            {job.platform === "full_video_shorts_v2" && job.transition_style && (
              <>
                <span className="text-gray-700">|</span>
                <span className="capitalize">{job.transition_style.replace(/_/g, " ")}</span>
              </>
            )}
            <span className="text-gray-700">|</span>
            <span>{new Date(job.created_at).toLocaleString()}</span>
          </div>
          {/* Show the underlying filename in small text when the
              user has set a custom name, so they can still see what
              the source file was. */}
          {job.name && job.video_name && job.name !== job.video_name && (
            <div className="text-[11px] text-gray-600 mt-1 truncate">
              File: <span className="text-gray-500">{job.video_name}</span>
            </div>
          )}
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
        {isRunning && (
          <div className="flex gap-2 self-start flex-shrink-0">
            <button
              onClick={doCancel}
              disabled={cancelling}
              className="btn btn-red flex items-center gap-1.5 text-sm"
              title="Kill the pipeline subprocess and stop processing this job"
            >
              {cancelling
                ? <Loader2 size={14} className="animate-spin" />
                : <StopCircle size={14} />}
              {cancelling ? "Stopping…" : "Stop Job"}
            </button>
          </div>
        )}
      </div>

      {cancelError && (
        <div className="card p-3 mb-4 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle size={14} /> {cancelError}
        </div>
      )}
      {isCancelled && (
        <div className="card p-3 mb-4 text-sm text-amber-300 flex items-center gap-2">
          <StopCircle size={14} /> Job cancelled. Clips that finished
          before the stop are listed below (if any).
        </div>
      )}

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

      {/* V2 per-step progress (Step 11.5). Only renders when the
          V2 orchestrator has written Job.current_stage. V1 jobs +
          V2 jobs at start/end leave this null -> hidden.

          Step 12.5 / backlog 75: when the user has clicked Cancel
          (status.cancel_requested=true) AND the run is still
          executing, the pill shifts to a "Cancellation requested
          - finishing <stage>" state so the user understands the
          latency between click and Job.status flipping to failed
          (up to 60-90s for non-Stage-4 stages while the current
          step finishes). */}
      {status?.current_stage && V2_STAGE_LABELS[status.current_stage] && (
        <V2StagePill
          currentStage={status.current_stage}
          cancelRequested={Boolean(status?.cancel_requested)}
        />
      )}

      {/* V2 Inngest dashboard deep-link -- admin-gated per D-11.10
          REFINEMENT. End users don't need to see raw Inngest traces;
          showing them creates support burden + confusion. */}
      {user?.is_admin
       && (status?.platform === "full_video_shorts_v2"
           || job?.platform   === "full_video_shorts_v2") && (
        <V2InngestDeepLink jobId={jobId} />
      )}

      {/* Progress */}
      {(isRunning || isFailed || (isDone && logLines.length > 0)) && (
        <div className="mb-6">
          <ProgressLog lines={logLines} pct={pct} status={currentStatus} />
        </div>
      )}

      {isFailed && status?.error && (
        <FailureCard rawError={status.error} />
      )}

      {/* Clips */}
      {isDone && job.clips?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Clips ({job.clips.length})
            </h2>
            {/* Bulk-select controls: select all / none + "Publish N clips" */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allIds = job.clips.map((c) => c.id);
                  const allSelected = allIds.every((id) => selectedClipIds.has(id));
                  setSelectedClipIds(new Set(allSelected ? [] : allIds));
                }}
                className="text-[11px] text-gray-400 hover:text-white inline-flex items-center gap-1.5"
                title="Toggle select all clips"
              >
                {job.clips.every((c) => selectedClipIds.has(c.id)) && job.clips.length > 0
                  ? <CheckSquare size={13} className="text-accent2" />
                  : <Square size={13} />}
                Select all
              </button>
              <button
                type="button"
                disabled={selectedClipIds.size === 0}
                onClick={() => setBulkOpen(true)}
                className="btn btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Publish every selected clip, in order"
              >
                <Clapperboard size={13} />
                Publish {selectedClipIds.size || ""} selected
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {job.clips.map((clip, i) => {
              const isSelected = selectedClipIds.has(clip.id);
              return (
                <div key={clip.id} className="relative">
                  {/* Selection checkbox — sits on top-left of the card. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(clip.id)) next.delete(clip.id);
                        else next.add(clip.id);
                        return next;
                      });
                    }}
                    className={`absolute top-2 left-2 z-10 w-6 h-6 rounded border flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-accent2 border-accent2 text-white"
                        : "bg-black/70 border-white/20 text-white/60 hover:border-white/40"
                    }`}
                    aria-label={isSelected ? "Deselect clip" : "Select clip"}
                    title={isSelected ? "Deselect" : "Select for bulk publish"}
                  >
                    {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                  <ClipCard clip={clip} jobId={jobId} index={i} />
                </div>
              );
            })}
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

      {/* Phase 14 / V2 Beta (D-13.13): feedback panel. Only on
          completed jobs the current user owns. Backend's POST
          /feedback also enforces ownership + done-status. */}
      {isDone && (
        <FeedbackPanel jobId={jobId} />
      )}

      {/* Bulk-publish modal — opened from the "Publish N selected" header
          button. Clips are passed in job-order so scheduled publishes go
          out in the order the editor sees them. */}
      <BulkPublishModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        clips={(job?.clips || []).filter((c) => selectedClipIds.has(c.id))}
        jobId={jobId}
        onDone={(results) => {
          // Clear only the clips that succeeded so the user can still
          // retry failures from the same selection.
          if (results?.ok?.length) {
            setSelectedClipIds((prev) => {
              const next = new Set(prev);
              for (const r of results.ok) next.delete(r.clipId);
              return next;
            });
          }
          // Optimistic nav to /uploads when everything succeeded.
          if (results?.failed?.length === 0 && results?.ok?.length > 0) {
            setTimeout(() => navigate("/uploads"), 1300);
          }
        }}
      />
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


/**
 * Failure card with V2 error-slug parsing (Step 11.6, D-11.11).
 *
 * If the raw error matches a V2 permanent-failure prefix
 * ("permanent: <slug>: ..." or "permanent render: <slug>: ..."), we
 * show the human message + a collapsed "Technical details" expander
 * with the raw error for support debugging. V1 errors (and V2
 * errors that don't match the prefix) show the raw error verbatim
 * with no expander.
 */
function FailureCard({ rawError }) {
  const [showRaw, setShowRaw] = useState(false);
  const parsed = parseV2Error(rawError);
  const hasHumanMessage = parsed.slug !== null;

  return (
    <div className="card p-4 mb-6 border-red-900">
      <p className="text-red-400 text-sm font-medium mb-1">Pipeline failed</p>
      {hasHumanMessage ? (
        <>
          <p className="text-sm text-red-200 mb-2">{parsed.message}</p>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-[11px] text-gray-500 hover:text-gray-300 underline"
          >
            {showRaw ? "Hide" : "Show"} technical details
          </button>
          {showRaw && (
            <pre className="text-xs text-red-300 whitespace-pre-wrap mt-2">
              {rawError}
            </pre>
          )}
        </>
      ) : (
        <pre className="text-xs text-red-300 whitespace-pre-wrap">
          {rawError}
        </pre>
      )}
    </div>
  );
}


/**
 * V2 per-stage progress pill (Step 11.5, D-11.9).
 * Renders "Stage X of 7: <human label>" when the V2 orchestrator
 * has written Job.current_stage. Hidden for V1 jobs + V2 jobs at
 * start/end (when current_stage is null).
 *
 * Step 12.5 / backlog 75: when ``cancelRequested`` is true, the pill
 * shifts to an amber "Cancellation requested - finishing X" state.
 * This communicates that the user's cancel was registered but the
 * pipeline is finishing the current Inngest step before the
 * cooperative ``_check_cancelled`` at the next step boundary fires.
 * Empirically that gap is ~14s for Stage 1 and up to ~60-90s for
 * Stage 2's Gemini Pro call (see Step 12.3 Test 1 manifest).
 */
function V2StagePill({ currentStage, cancelRequested = false }) {
  const stageIndex = V2_STAGE_ORDER.indexOf(currentStage);
  if (stageIndex < 0) return null;
  const stageNum = stageIndex + 1;
  const total = V2_STAGE_ORDER.length;
  const label = V2_STAGE_LABELS[currentStage] || currentStage;
  if (cancelRequested) {
    return (
      <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs">
        <Loader2 size={11} className="animate-spin text-amber-300" />
        <span className="text-gray-300">
          Cancellation requested — finishing{" "}
          <span className="text-amber-300 font-medium">{label}</span>
          {" "}(stage {stageNum} of {total})…
        </span>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-accent2/10 border border-accent2/20 text-xs">
      <Loader2 size={11} className="animate-spin text-accent2" />
      <span className="text-gray-300">
        Stage {stageNum} of {total}:{" "}
        <span className="text-accent2 font-medium">{label}</span>
      </span>
    </div>
  );
}


/**
 * V2 Inngest dashboard deep-link button (Step 11.5, D-11.10
 * REFINEMENT). Admin-only -- end users don't see raw Inngest traces.
 *
 * fn_id uses the Inngest 0.5.18 prefix pattern ``<app_id>-<fn_id>``
 * per backlog item 48 (Step 10.1 finding pinned by the orchestrator
 * test ``test_has_expected_fn_id``). URL is from
 * ``VITE_INNGEST_DASHBOARD_URL`` (set per-deployment in the
 * frontend env); when unset the button is hidden so a misconfigured
 * dev env doesn't surface a broken link.
 */
function V2InngestDeepLink({ jobId }) {
  const baseUrl = import.meta.env.VITE_INNGEST_DASHBOARD_URL || "";
  if (!baseUrl) return null;
  // Query format chosen for human-readability; Inngest's search
  // accepts both fn_id + event-data-substring filters.
  const url = (
    `${baseUrl.replace(/\/$/, "")}/runs` +
    `?q=fn_id%3Akaizer-v2-process-video-v2` +
    `+job_id%3A${encodeURIComponent(jobId)}`
  );
  return (
    <div className="mb-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                   border border-border bg-surface text-xs text-gray-300
                   hover:text-white hover:border-gray-500 transition-colors"
        title="Admin only: opens the Inngest dashboard's run page for this V2 job"
      >
        <ExternalLink size={12} /> Open in Inngest
        <span className="text-[10px] text-gray-600 ml-1">(admin)</span>
      </a>
    </div>
  );
}


/**
 * Inline-editable job title (Phase 14 / V2 Beta — D-13.14).
 *
 * Click the pencil → input + save/cancel buttons. PATCH on save.
 * Empty / over-120-char inputs are bounced by the backend with a 400;
 * we surface that into a small inline error.
 */
function RenamableTitle({ jobId, initialName, videoName, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(initialName);
  const [saving,  setSaving]  = useState(false);
  const [errMsg,  setErrMsg]  = useState("");

  // Re-sync draft when the parent passes a fresh initialName (poll
  // re-fetch after a successful rename, or hard navigation).
  useEffect(() => { setDraft(initialName); }, [initialName]);

  async function save() {
    const trimmed = (draft || "").trim();
    if (!trimmed) { setErrMsg("Name can't be empty"); return; }
    if (trimmed.length > 120) { setErrMsg("Name too long (max 120)"); return; }
    setSaving(true);
    setErrMsg("");
    try {
      const res = await api.renameJob(jobId, trimmed);
      onRenamed(res.name);
      setEditing(false);
    } catch (e) {
      setErrMsg(e.message || "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-lg sm:text-xl font-bold text-white truncate">
          {initialName || videoName || "Untitled job"}
        </h1>
        <button
          type="button"
          onClick={() => { setDraft(initialName); setErrMsg(""); setEditing(true); }}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5
                     transition-colors flex-shrink-0"
          title="Rename this job"
          aria-label="Rename job"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 120))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={120}
          disabled={saving}
          placeholder="Job name…"
          className="flex-1 min-w-0 px-2 py-1 bg-black/40 border border-border rounded
                     text-base sm:text-lg font-bold text-white
                     focus:outline-none focus:border-accent2 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="p-1.5 rounded bg-accent2/20 border border-accent2/40
                     text-accent2 hover:bg-accent2/30 disabled:opacity-50"
          title="Save"
          aria-label="Save rename"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setErrMsg(""); }}
          disabled={saving}
          className="p-1.5 rounded border border-border text-gray-400
                     hover:text-white hover:border-gray-500 disabled:opacity-50"
          title="Cancel"
          aria-label="Cancel rename"
        >
          <X size={14} />
        </button>
      </div>
      {errMsg && (
        <div className="text-[11px] text-red-400">{errMsg}</div>
      )}
    </div>
  );
}


/**
 * 0–100 rating + optional comment, one feedback per job per user.
 * Backend returns 409 if the user already submitted — UI gracefully
 * collapses to a "you've already rated" notice in that case.
 */
function FeedbackPanel({ jobId }) {
  const [rating,    setRating]    = useState(70);
  const [comment,   setComment]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  // status: "idle" | "submitted" | "already" | "error"
  const [status,    setStatus]    = useState("idle");
  const [errMsg,    setErrMsg]    = useState("");

  async function submit() {
    setSubmitting(true);
    setErrMsg("");
    try {
      await api.submitJobFeedback(jobId, Number(rating), comment.trim());
      setStatus("submitted");
    } catch (e) {
      const msg = e.message || "Submit failed";
      // Backend returns 409 when the user already submitted feedback.
      if (/already/i.test(msg)) {
        setStatus("already");
      } else {
        setStatus("error");
        setErrMsg(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "submitted") {
    return (
      <div className="card p-4 mb-6 border-green-900 bg-green-950/20 text-sm text-green-300
                      flex items-start gap-2">
        <Star size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
        <span>Thanks! Your feedback helps improve V2 Beta.</span>
      </div>
    );
  }
  if (status === "already") {
    return (
      <div className="card p-4 mb-6 text-sm text-gray-400 flex items-start gap-2">
        <Star size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
        <span>You've already rated this job.</span>
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5 mb-6">
      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
        <Star size={14} className="text-amber-400" />
        Rate this job
      </h3>
      <p className="text-[12px] text-gray-500 mb-3">
        How did the V2 Beta do? Your rating + comment goes straight to the
        operator triaging Beta health.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="flex-1 accent-accent2"
          disabled={submitting}
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono tabular-nums text-2xl font-bold text-white w-12 text-right">
            {rating}
          </span>
          <span className="text-xs text-gray-500">/ 100</span>
        </div>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={submitting}
        rows={3}
        placeholder="What worked, what didn't? (optional)"
        className="w-full px-3 py-2 mb-3 bg-black/40 border border-border rounded
                   text-sm text-white placeholder-gray-600
                   focus:outline-none focus:border-accent2 disabled:opacity-50"
      />

      {status === "error" && errMsg && (
        <div className="text-[11px] text-red-400 mb-3">{errMsg}</div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="btn btn-primary text-sm inline-flex items-center gap-1.5"
      >
        {submitting
          ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
          : <>Submit feedback</>}
      </button>
    </div>
  );
}
