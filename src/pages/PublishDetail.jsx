import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RLink, useParams } from "react-router-dom";
import {
  ArrowLeft, Film, Youtube, RefreshCw, Loader2, AlertCircle,
  ExternalLink, RotateCcw, Ban, ShieldAlert, Wrench, Clock,
} from "lucide-react";
import { api } from "../api/client";
import { openUploadsProgress } from "../api/ws";
import { classifyProviderFail } from "../utils/uploadErrors";
import { StatusBadge, KindBadge, PriorityBadge, formatBytes, formatDateTime } from "./Uploads";

// 5s fallback poll while any per-channel child is still moving. The WS
// feed usually beats it; once every child is terminal we stop fetching.
const POLL_MS = 5000;
const TERMINAL_JOB_STATUSES = ["completed", "failed", "cancelled"];
const IN_FLIGHT_JOB_STATUSES = ["claimed", "branding", "ready_to_upload", "uploading"];

/** Per-channel audit page for one publish task (route /uploads/:publishId). */
export default function PublishDetail() {
  const { publishId } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [busyJobId, setBusyJobId] = useState(null);
  const [retryAllBusy, setRetryAllBusy] = useState(false);
  const mounted = useRef(true);
  // Latest task snapshot for the poll-loop closure (avoids re-arming the
  // interval on every state change).
  const taskRef = useRef(null);

  async function load() {
    try {
      const t = await api.getPublishTask(publishId);
      if (!mounted.current) return;
      setTask(t);
      taskRef.current = t;
      setNotFound(false);
    } catch (e) {
      if (!mounted.current) return;
      // req() flattens FastAPI errors to a message string — a 404 reads
      // "Not Found" (or a custom not-found detail). Anything else is a
      // transient load error we surface in the banner instead.
      if (/not[ _-]?found/i.test(e?.message || "")) setNotFound(true);
      else setError(e.message || "Failed to load publish");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setTask(null);
    taskRef.current = null;
    setNotFound(false);
    setError("");
    load();

    // WS-first (mirrors Uploads.jsx): any frame mentioning one of OUR
    // children is a change signal → re-fetch the full audit shape.
    let sock = null;
    try {
      sock = openUploadsProgress({
        onFrame: (f) => {
          if (f.type !== "uploads") return;
          const hit = (f.jobs || []).some(
            (j) => String(j.publish_task_id) === String(publishId)
          );
          if (hit) load();
        },
        onDown: () => { /* the 5s poll below already covers WS death */ },
      });
    } catch { /* polling covers it */ }

    const iv = setInterval(() => {
      const t = taskRef.current;
      if (!t) { load(); return; }
      const anyLive = (t.upload_jobs || []).some(
        (j) => !TERMINAL_JOB_STATUSES.includes(j.status)
      );
      if (anyLive) load();
    }, POLL_MS);

    return () => {
      mounted.current = false;
      clearInterval(iv);
      if (sock) sock.close();
    };
  }, [publishId]);

  // 409s come back as {detail:{code:"not_retryable"|"not_cancellable"}} —
  // req() stringifies the object detail into "[object Object]", so map
  // that to honest copy instead of leaking it to the operator.
  function actionErrMsg(e) {
    const m = e?.message || "";
    if (!m || m === "[object Object]") return "Action not allowed in this job's current state.";
    return m;
  }

  async function handleRetryJob(job) {
    setBusyJobId(job.id);
    setError("");
    try {
      await api.retryPublishJob(publishId, job.id);
      await load();
    } catch (e) {
      setError(actionErrMsg(e));
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleCancelJob(job) {
    const name = job.channel_name || `Channel #${job.channel_id}`;
    if (!confirm(`Cancel the upload to "${name}"?`)) return;
    setBusyJobId(job.id);
    setError("");
    try {
      await api.cancelPublishJob(publishId, job.id);
      await load();
    } catch (e) {
      setError(actionErrMsg(e));
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleRetryAll() {
    setRetryAllBusy(true);
    setError("");
    try {
      await api.retryAllFailed(publishId);
      await load();
    } catch (e) {
      setError(actionErrMsg(e));
    } finally {
      setRetryAllBusy(false);
    }
  }

  const jobs = task?.upload_jobs || [];
  // Counts derived from the children — the authoritative view here
  // (the parent's cached counters can lag a beat behind the rows).
  const agg = useMemo(() => {
    const c = { completed: 0, failed: 0, cancelled: 0, parked: 0, inFlight: 0 };
    for (const j of jobs) {
      if (j.status === "completed") c.completed += 1;
      else if (j.status === "failed") c.failed += 1;
      else if (j.status === "cancelled") c.cancelled += 1;
      else if (j.status === "parked_quota") c.parked += 1;
      else if (IN_FLIGHT_JOB_STATUSES.includes(j.status)) c.inFlight += 1;
    }
    return c;
  }, [jobs]);
  const target = jobs.length || task?.target_count || 0;

  if (notFound) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-300 font-medium">Publish not found</p>
          <p className="text-xs text-gray-600 mt-2">
            Publish #{publishId} doesn't exist or belongs to another account.
          </p>
          <RLink
            to="/uploads"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-accent2 hover:text-white"
          >
            <ArrowLeft size={14} /> Back to publishes
          </RLink>
        </div>
      </div>
    );
  }

  if (loading && !task) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading publish…
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <RLink to="/uploads" className="inline-flex items-center gap-1.5 text-sm text-accent2 hover:text-white">
          <ArrowLeft size={14} /> Back to publishes
        </RLink>
      </div>
    );
  }

  const retryableTotal = agg.failed + agg.cancelled;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back nav */}
      <RLink
        to="/uploads"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4"
      >
        <ArrowLeft size={15} /> Publishes
      </RLink>

      {/* Header */}
      <header className="flex gap-3 mb-5">
        {/* The detail endpoint carries no thumbnail enrichment — a film
            placeholder keeps layout parity with the listing card. */}
        <div
          className="flex-shrink-0 h-20 sm:h-24 bg-black border border-border rounded overflow-hidden flex items-center justify-center text-gray-700"
          style={{ aspectRatio: task.publish_kind === "short" ? "9/16" : "16/9" }}
        >
          <Film size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-100 flex items-center gap-2 flex-wrap">
            <span className="truncate">{task.video_title || `Publish #${task.id}`}</span>
            <KindBadge kind={task.publish_kind} />
            {task.priority && task.priority !== "normal" && (
              <PriorityBadge priority={task.priority} />
            )}
            <StatusBadge status={task.status} />
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="text-gray-300 tabular-nums">{agg.completed}</span> of{" "}
            <span className="tabular-nums">{target}</span> channels done
            {agg.parked > 0 && <> • <span className="text-amber-300">{agg.parked} quota-parked</span></>}
            {agg.inFlight > 0 && <> • <span className="text-sky-300">{agg.inFlight} in flight</span></>}
            {task.created_at && <> • created {formatDateTime(task.created_at)}</>}
          </p>
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
          {retryableTotal > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryAllBusy}
              className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-200 text-sm px-3 py-1.5 rounded flex items-center gap-1.5"
              title="Re-queue every failed / cancelled channel"
            >
              {retryAllBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Retry all failed
            </button>
          )}
          <button
            onClick={() => load()}
            className="p-2 text-gray-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Per-channel audit rows */}
      {jobs.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Youtube size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No per-channel jobs yet.</p>
          <p className="text-xs text-gray-600 mt-2">
            The fan-out is still being created — this refreshes automatically.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((j) => (
            <ChannelJobRow
              key={j.id}
              job={j}
              busy={busyJobId === j.id}
              onRetry={() => handleRetryJob(j)}
              onCancel={() => handleCancelJob(j)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One destination channel's upload pipeline state, with retry/cancel. */
function ChannelJobRow({ job, busy, onRetry, onCancel }) {
  const canRetry  = ["failed", "cancelled", "parked_quota"].includes(job.status);
  const canCancel = ["queued", "parked_quota"].includes(job.status);
  const failKind  = job.status === "failed" && job.last_error
    ? classifyProviderFail(job.last_error)
    : null;
  const retryEta  = retryEtaSeconds(job.next_attempt_at);

  return (
    <div className="bg-surface border border-border rounded-lg p-3 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-100 flex items-center gap-1.5 flex-wrap">
            <Youtube size={13} className="text-red-400 flex-shrink-0" />
            <span className="truncate">{job.channel_name || `Channel #${job.channel_id}`}</span>
            {job.channel_handle && (
              <span className="text-[11px] text-gray-500 font-normal truncate">{job.channel_handle}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <PathBadge path={job.upload_path} />
            <KindBadge kind={job.publish_kind} />
            {job.attempts > 0 && (
              <span className="text-[10px] text-gray-600 tabular-nums">attempt {job.attempts}</span>
            )}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Live upload byte counter */}
      {job.status === "uploading" && job.bytes_uploaded > 0 && (
        <p className="text-[11px] text-sky-300/90 tabular-nums mt-1.5">
          {formatBytes(job.bytes_uploaded)} uploaded
        </p>
      )}

      {/* Backoff hint — worker scheduled the next automatic attempt */}
      {retryEta != null && (
        <p className="text-[11px] text-amber-300/90 mt-1.5 inline-flex items-center gap-1 tabular-nums">
          <Clock size={11} /> retrying ~{retryEta}s
        </p>
      )}

      {/* Quota-parked explainer */}
      {job.status === "parked_quota" && (
        <p className="text-[11px] text-amber-300/80 mt-1.5">
          Parked until the daily YouTube API quota resets — it resumes automatically, or retry now.
        </p>
      )}

      {/* Failure panel — same classified copy + fix CTA as the legacy rows */}
      {failKind && (
        <div className="bg-orange-950/30 border border-orange-900/60 rounded p-2 text-[11px] text-orange-200 flex items-start gap-2 mt-2">
          <ShieldAlert size={13} className="mt-0.5 flex-shrink-0 text-orange-400" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-orange-100 mb-0.5">{failKind.title}</div>
            <div className="text-orange-300/90 leading-relaxed">{failKind.body}</div>
            {failKind.cta && (
              <RLink
                to={failKind.ctaHref}
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-orange-200 hover:text-white underline underline-offset-2"
              >
                <Wrench size={11} /> {failKind.cta}
              </RLink>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2">
        {job.upload_path === "postiz" ? (
          <span className="text-[11px] text-purple-300 inline-flex items-center gap-1">
            <ExternalLink size={11} /> Delivered via Postiz
          </span>
        ) : job.video_url ? (
          <a
            href={job.video_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-accent2 hover:text-white inline-flex items-center gap-1"
          >
            <ExternalLink size={11} /> Open on YouTube
          </a>
        ) : null}
        {canCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-[11px] text-gray-500 hover:text-red-400 inline-flex items-center gap-1 disabled:opacity-50"
            title="Cancel this channel's upload"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Cancel
          </button>
        )}
        {canRetry && (
          <button
            onClick={onRetry}
            disabled={busy}
            className="text-[11px] text-accent2 hover:text-white inline-flex items-center gap-1 disabled:opacity-50"
            title="Re-queue this channel's upload"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Retry
          </button>
        )}
        {job.updated_at && (
          <span className="text-[10px] text-gray-600 ml-auto">
            updated {formatDateTime(job.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Upload route badge: Postiz (purple) vs RTMP (violet) vs Direct (sky). */
function PathBadge({ path }) {
  if (path === "postiz") {
    return (
      <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded flex-shrink-0">
        Postiz
      </span>
    );
  }
  if (path === "rtmp") {
    return (
      <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded flex-shrink-0">
        RTMP
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded flex-shrink-0">
      Direct
    </span>
  );
}

// Seconds until the worker's next scheduled attempt — null when there
// isn't one or it's already in the past. Refreshes naturally on every
// poll/WS-triggered re-render (no per-second ticker needed at ~5s cadence).
function retryEtaSeconds(nextAttemptAt) {
  if (!nextAttemptAt) return null;
  const t = new Date(nextAttemptAt).getTime();
  if (isNaN(t)) return null;
  const s = Math.round((t - Date.now()) / 1000);
  return s > 0 ? s : null;
}
