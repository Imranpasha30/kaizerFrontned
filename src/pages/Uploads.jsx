import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RLink } from "react-router-dom";
import {
  Youtube, RefreshCw, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, ExternalLink, RotateCcw, Ban, Film, Calendar, X,
  CheckSquare, Square, ShieldAlert, Wrench, ChevronRight, PauseCircle,
} from "lucide-react";
import { api } from "../api/client";
import { openUploadsProgress } from "../api/ws";
import { classifyProviderFail, lastLineOf } from "../utils/uploadErrors";

const POLL_MS = 3000;
// When the live WebSocket is up it pushes change signals within ~2s,
// so polling drops to a slow safety heartbeat.
const POLL_MS_WITH_WS = 15000;

// Task statuses counted as "Active" by the publish-card filter tabs.
const ACTIVE_TASK_STATUSES = ["dispatched", "fanning_out", "queued"];

export default function Uploads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [quota, setQuota] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Job-wise publish cards (one card = one Publish click fanned out to
  // N channels). The legacy flat rows below become an audit fallback.
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState("all");
  // Legacy section open/closed. null = auto: collapsed while publish
  // cards exist, open when there are none but legacy rows do exist.
  // Once the user toggles it manually their choice sticks for the visit.
  const [legacyOpen, setLegacyOpen] = useState(null);
  const mounted = useRef(true);

  function toggleSelect(id) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function clearSelection() { setSelected(new Set()); }

  const cancellableIds = useMemo(
    () => rows.filter((r) => r.status === "queued" || r.status === "uploading").map((r) => r.id),
    [rows],
  );
  const retryableIds = useMemo(
    // provider_failed is retryable too — once the operator renews Postiz
    // or reconnects the channel, retry kicks the row back into the
    // queue. The worker will short-circuit again if the underlying
    // failure hasn't actually been fixed.
    () => rows.filter((r) => r.status === "failed" || r.status === "cancelled" || r.status === "provider_failed").map((r) => r.id),
    [rows],
  );

  async function handleBulkCancel() {
    const targets = Array.from(selected).filter((id) => cancellableIds.includes(id));
    if (targets.length === 0) {
      setError("None of the selected uploads can be cancelled (only queued/uploading can).");
      return;
    }
    if (!confirm(`Cancel ${targets.length} upload(s)?`)) return;
    setBulkBusy(true); setError("");
    const results = await Promise.allSettled(targets.map((id) => api.cancelUpload(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) setError(`Cancelled ${targets.length - failed}/${targets.length}. ${failed} failed.`);
    clearSelection();
    setBulkBusy(false);
    load();
  }
  async function handleBulkRetry() {
    const targets = Array.from(selected).filter((id) => retryableIds.includes(id));
    if (targets.length === 0) {
      setError("None of the selected uploads can be retried (only failed/cancelled can).");
      return;
    }
    setBulkBusy(true); setError("");
    const results = await Promise.allSettled(targets.map((id) => api.retryUpload(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) setError(`Retried ${targets.length - failed}/${targets.length}. ${failed} failed.`);
    clearSelection();
    setBulkBusy(false);
    load();
  }

  async function load() {
    try {
      const data = await api.listUploads(
        statusFilter ? { status: statusFilter, limit: 100 } : { limit: 100 }
      );
      if (mounted.current) {
        setRows(data || []);
        setError("");
      }
    } catch (e) {
      if (mounted.current) setError(e.message || "Failed to load uploads");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function loadTasks() {
    try {
      const data = await api.listPublishTasks({ limit: 50 });
      if (mounted.current) setTasks(data?.items || []);
    } catch (e) {
      if (mounted.current) setError(e.message || "Failed to load publishes");
    } finally {
      if (mounted.current) setTasksLoading(false);
    }
  }

  async function loadQuota() {
    try {
      const q = await api.getQuota();
      if (mounted.current) setQuota(q);
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    load();
    loadTasks();
    loadQuota();

    // WebSocket-first: the server pushes a frame whenever any of this
    // user's publish jobs changes; we use it purely as a change SIGNAL
    // and re-fetch through the existing endpoints so the rich row/card
    // shapes (titles, clip names, channel info, aggregate counts) stay
    // identical. Polling drops to a slow heartbeat while the socket is
    // alive and snaps back to the legacy 3s cadence if it dies.
    let pollMs = POLL_MS_WITH_WS;
    let iv = null;
    const refreshAll = () => { load(); loadTasks(); loadQuota(); };
    const startPolling = () => {
      if (iv) clearInterval(iv);
      iv = setInterval(refreshAll, pollMs);
    };
    let sock = null;
    try {
      sock = openUploadsProgress({
        onFrame: (f) => {
          if (f.type === "uploads") refreshAll();
        },
        onDown: () => {
          pollMs = POLL_MS;
          startPolling();
        },
      });
    } catch {
      pollMs = POLL_MS;
    }
    startPolling();

    return () => {
      mounted.current = false;
      if (iv) clearInterval(iv);
      if (sock) sock.close();
    };
  }, [statusFilter]);

  async function handleCancel(row) {
    if (!confirm(`Cancel upload "${row.title || row.clip_filename}"?`)) return;
    try {
      setBusyId(row.id);
      await api.cancelUpload(row.id);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetry(row) {
    try {
      setBusyId(row.id);
      await api.retryUpload(row.id);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const base = { queued: 0, uploading: 0, processing: 0, done: 0, failed: 0, cancelled: 0, provider_failed: 0 };
    for (const r of rows) if (base[r.status] !== undefined) base[r.status] += 1;
    return base;
  }, [rows]);

  const taskCounts = useMemo(() => ({
    all:            tasks.length,
    active:         tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status)).length,
    completed:      tasks.filter((t) => t.status === "completed").length,
    partial_failed: tasks.filter((t) => t.status === "partial_failed").length,
    failed:         tasks.filter((t) => t.status === "failed").length,
  }), [tasks]);

  // Client-side filtering over the loaded page — the list endpoint also
  // accepts ?status= but one page of 50 covers the dashboard use case.
  const filteredTasks = useMemo(() => {
    if (taskFilter === "all") return tasks;
    if (taskFilter === "active") return tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status));
    return tasks.filter((t) => t.status === taskFilter);
  }, [tasks, taskFilter]);

  // Group publishes that came from the SAME render (same source_job_id) so a
  // job's full video + its shorts sit under one parent instead of looking
  // like unrelated cards. Tasks with no source_job_id stand alone.
  const taskGroups = useMemo(() => {
    const groups = new Map();
    for (const t of filteredTasks) {
      const key = t.source_job_id != null ? `job-${t.source_job_id}` : `task-${t.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return Array.from(groups.values()).sort(
      (a, b) => Math.max(...b.map((t) => t.id)) - Math.max(...a.map((t) => t.id)),
    );
  }, [filteredTasks]);

  const legacyExpanded = legacyOpen !== null
    ? legacyOpen
    : (tasks.length === 0 && rows.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Youtube className="text-accent2" size={24} /> Publishes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            One card per Publish action — click a card for the per-channel audit trail.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota && (
            <QuotaBadge quota={quota} />
          )}
          <button
            onClick={() => { setLoading(true); load(); loadTasks(); loadQuota(); }}
            className="p-2 text-gray-400 hover:text-white"
            title="Refresh"
            disabled={loading}
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

      {/* ── Publish cards (job-wise fan-out) ─────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip active={taskFilter === "all"}            onClick={() => setTaskFilter("all")}            label={`All (${taskCounts.all})`} />
        <FilterChip active={taskFilter === "active"}         onClick={() => setTaskFilter("active")}         label={`Active (${taskCounts.active})`} />
        <FilterChip active={taskFilter === "completed"}      onClick={() => setTaskFilter("completed")}      label={`Completed (${taskCounts.completed})`} />
        <FilterChip active={taskFilter === "partial_failed"} onClick={() => setTaskFilter("partial_failed")} label={`Partly failed (${taskCounts.partial_failed})`} />
        <FilterChip active={taskFilter === "failed"}         onClick={() => setTaskFilter("failed")}         label={`Failed (${taskCounts.failed})`} />
      </div>

      {tasksLoading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading publishes…
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <Youtube size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">
            {tasks.length === 0
              ? "No publishes yet."
              : "No publishes matching this filter."}
          </p>
          {tasks.length === 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Click <span className="text-gray-400">Publish</span> on a rendered clip to fan it out here.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {taskGroups.map((group) =>
            group.length === 1 ? (
              <PublishTaskCard key={group[0].id} task={group[0]} />
            ) : (
              <RenderGroup key={`render-${group[0].source_job_id}`} group={group} />
            ),
          )}
        </div>
      )}

      {/* ── Legacy flat rows (pre-fanout) ─────────────────────────────
          Everything below is the original one-row-per-channel-upload
          list, unchanged — kept for the historical audit trail and for
          rows created before publish tasks existed. Collapsed by
          default once the new cards have data. */}
      <section className="mt-8">
        <button
          onClick={() => setLegacyOpen(!legacyExpanded)}
          className="w-full flex items-center gap-2 text-left py-2 text-gray-400 hover:text-gray-200"
        >
          <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${legacyExpanded ? "rotate-90" : ""}`} />
          <span className="text-sm font-medium">Legacy uploads (pre-fanout)</span>
          <span className="text-xs text-gray-600">({rows.length})</span>
        </button>

        {legacyExpanded && (
          <div className="mt-2">
            {/* Status chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <FilterChip active={statusFilter === ""} onClick={() => setStatusFilter("")} label={`All (${rows.length})`} />
              <FilterChip active={statusFilter === "queued"}     onClick={() => setStatusFilter("queued")}     label={`Queued (${counts.queued})`} />
              <FilterChip active={statusFilter === "uploading"}  onClick={() => setStatusFilter("uploading")}  label={`Uploading (${counts.uploading})`} />
              <FilterChip active={statusFilter === "processing"} onClick={() => setStatusFilter("processing")} label={`Processing (${counts.processing})`} />
              <FilterChip active={statusFilter === "done"}       onClick={() => setStatusFilter("done")}       label={`Done (${counts.done})`} />
              <FilterChip active={statusFilter === "failed"}     onClick={() => setStatusFilter("failed")}     label={`Failed (${counts.failed})`} />
              {counts.provider_failed > 0 && (
                <FilterChip
                  active={statusFilter === "provider_failed"}
                  onClick={() => setStatusFilter("provider_failed")}
                  label={`Needs Fix (${counts.provider_failed})`}
                />
              )}
              <FilterChip active={statusFilter === "cancelled"}  onClick={() => setStatusFilter("cancelled")}  label={`Cancelled (${counts.cancelled})`} />
            </div>

            {selected.size > 0 && (
              <div className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-3 bg-[#1a0f0f]/95 backdrop-blur border-y border-red-900/50 flex items-center gap-3 flex-wrap">
                <button onClick={clearSelection} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
                <span className="text-sm text-gray-200"><strong className="text-red-300">{selected.size}</strong> selected</span>
                <button
                  onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  {selected.size === rows.length ? "Unselect all" : "Select all"}
                </button>
                <div className="ml-auto flex gap-2 flex-wrap">
                  <button
                    onClick={handleBulkRetry}
                    disabled={bulkBusy}
                    className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-200 text-sm px-3 py-1.5 rounded flex items-center gap-1.5"
                  >
                    <RotateCcw size={13} /> Retry
                  </button>
                  <button
                    onClick={handleBulkCancel}
                    disabled={bulkBusy}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded flex items-center gap-1.5"
                  >
                    {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                    Cancel Selected
                  </button>
                </div>
              </div>
            )}

            {loading && rows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading uploads…
              </div>
            ) : rows.length === 0 ? (
              <div className="bg-surface border border-border rounded-lg p-12 text-center">
                <Youtube size={40} className="mx-auto text-gray-600 mb-3" />
                <p className="text-gray-400">
                  No uploads {statusFilter && <>matching <span className="text-gray-200">{statusFilter}</span></>} yet.
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Click <span className="text-gray-400">Publish</span> on a rendered clip to queue it here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <UploadRow
                    key={r.id}
                    row={r}
                    busy={busyId === r.id}
                    selected={selected.has(r.id)}
                    onToggleSelect={() => toggleSelect(r.id)}
                    onCancel={() => handleCancel(r)}
                    onRetry={() => handleRetry(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** One publish action (video → N channels) as a single clickable card. */
function PublishTaskCard({ task }) {
  const thumb = task.thumb_url ? api.mediaUrl(task.thumb_url) : "";
  const isShort = task.publish_kind === "short";
  const target = task.target_count || 0;
  const done = task.completed_count || 0;
  const failedTotal = (task.failed_count || 0) + (task.cancelled_count || 0);
  const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const preview = task.channels_preview || [];
  const moreCount = Math.max(0, target - preview.length);

  return (
    <RLink
      to={`/uploads/${task.id}`}
      className="block bg-surface border border-border rounded-lg p-3 hover:border-border-hover transition-colors"
    >
      <div className="flex gap-3">
        {/* Thumb — aspect matches the upload kind (9:16 Short, 16:9 video) */}
        <div
          className="flex-shrink-0 h-20 sm:h-24 bg-black rounded overflow-hidden"
          style={{ aspectRatio: isShort ? "9/16" : "16/9" }}
        >
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"
                 onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-700">
              <Film size={18} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-gray-100 flex items-center gap-1.5" title={task.video_title || ""}>
                <KindBadge kind={task.publish_kind} />
                <DeliveryBadge delivery={task.delivery} />
                {task.priority && task.priority !== "normal" && (
                  <PriorityBadge priority={task.priority} />
                )}
                <span className="truncate">
                  {task.video_title || `Publish #${task.id}`}
                </span>
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 flex-wrap">
                <span className="text-gray-400">{target} channel{target === 1 ? "" : "s"}</span>
                {preview.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[18rem]">
                      {preview.join(", ")}
                      {moreCount > 0 && <span className="text-gray-600"> +{moreCount} more</span>}
                    </span>
                  </>
                )}
                {task.created_at && (
                  <>
                    <span>•</span>
                    <span>{formatDateTime(task.created_at)}</span>
                  </>
                )}
              </div>
            </div>
            <StatusBadge status={task.status} />
          </div>

          {/* Aggregate per-channel chips */}
          <div className="flex items-center gap-2.5 flex-wrap text-[11px] tabular-nums">
            <span className="inline-flex items-center gap-1 text-emerald-300" title="Channels completed">
              <CheckCircle2 size={11} /> {done}
            </span>
            {failedTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-red-300" title="Channels failed or cancelled">
                <XCircle size={11} /> {failedTotal}
              </span>
            )}
            {(task.parked_count || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300" title="Parked until daily YouTube quota resets">
                <PauseCircle size={11} /> {task.parked_count} quota-parked
              </span>
            )}
            {(task.in_flight_count || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-sky-300" title="Channels currently uploading">
                <Loader2 size={11} className="animate-spin" /> {task.in_flight_count}
              </span>
            )}
          </div>

          {/* Slim completed/target progress */}
          <div className="w-full">
            <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 tabular-nums mt-0.5">
              <span>{done}/{target} done</span>
              <span>{pct}%</span>
            </div>
          </div>
        </div>
      </div>
    </RLink>
  );
}

/** Short (rose) / Full Video (emerald) — same palette as ClipCard's type tags. */
export function KindBadge({ kind }) {
  return kind === "short" ? (
    <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded flex-shrink-0">
      Short
    </span>
  ) : (
    <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded flex-shrink-0">
      Full Video
    </span>
  );
}

/** How this publish is delivered: Direct / RTMP / Postiz / Mixed. */
function DeliveryBadge({ delivery }) {
  if (!delivery) return null;
  const conf = {
    direct: { label: "Direct", cls: "bg-blue-500/15 text-blue-300" },
    rtmp:   { label: "RTMP",   cls: "bg-purple-500/15 text-purple-300" },
    postiz: { label: "Postiz", cls: "bg-fuchsia-500/15 text-fuchsia-300" },
    mixed:  { label: "Mixed",  cls: "bg-gray-700 text-gray-300" },
  }[delivery] || { label: String(delivery), cls: "bg-gray-700 text-gray-300" };
  return (
    <span
      className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${conf.cls}`}
      title={`Delivered via ${conf.label}`}
    >
      {conf.label}
    </span>
  );
}

/** All publishes from one render (same source job) under a single parent:
 *  the full video + its shorts, so they don't look like unrelated jobs. */
function RenderGroup({ group }) {
  const first = group[0];
  const videoTask = group.find((t) => t.publish_kind === "video");
  const head = videoTask || first;
  const title = head.video_title || `Render #${first.source_job_id}`;
  const thumb = head.thumb_url ? api.mediaUrl(head.thumb_url) : "";
  const shorts = group.filter((t) => t.publish_kind === "short").length;
  const totalUploads = group.reduce((s, t) => s + (t.target_count || 0), 0);
  const parts = [];
  if (videoTask) parts.push("1 full video");
  if (shorts) parts.push(`${shorts} short${shorts > 1 ? "s" : ""}`);
  return (
    <div className="bg-surface/40 border border-border rounded-lg p-2.5">
      <div className="flex items-center gap-2.5 mb-2 px-0.5">
        <div className="flex-shrink-0 h-10 w-10 bg-black rounded overflow-hidden flex items-center justify-center">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"
                 onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <Film size={14} className="text-gray-700" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-100 truncate" title={title}>{title}</div>
          <div className="text-[11px] text-gray-500">
            Render #{first.source_job_id} • {group.length} publishes
            {parts.length > 0 && <> • {parts.join(" + ")}</>}
            {totalUploads > 0 && <> • {totalUploads} channel uploads</>}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 pl-2 ml-3 border-l-2 border-border">
        {group.map((t) => (
          <PublishTaskCard key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}

/** Shown only when priority deviates from "normal". Critical pulses. */
export function PriorityBadge({ priority }) {
  const cls = {
    critical: "bg-red-500/20 text-red-300 animate-pulse",
    high:     "bg-amber-500/20 text-amber-300",
    low:      "bg-gray-800 text-gray-500",
  }[priority] || "bg-gray-800 text-gray-400";
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${cls}`}>
      {priority}
    </span>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "border-accent2 bg-accent2/15 text-white"
          : "border-border bg-surface text-gray-400 hover:text-gray-200 hover:border-border-hover"
      }`}
    >
      {label}
    </button>
  );
}

function QuotaBadge({ quota }) {
  if (!quota) return null;
  // Uploads (videos.insert) charge a SEPARATE 100/day bucket — that is the
  // number that actually limits publishing. The 10,000 "Queries" pool is for
  // other API calls and never moves on an upload, so it's shown secondary.
  const up = quota.uploads || {};
  const upUsed = up.used ?? 0;
  const upCap = up.cap ?? 100;
  const upPct = upCap > 0 ? Math.min(100, Math.round((upUsed / upCap) * 100)) : 0;
  const upColor = upPct >= 90 ? "text-red-400" : upPct >= 70 ? "text-yellow-400" : "text-emerald-400";

  // Queries pool (falls back to the flat legacy shape if `queries` absent).
  const q = quota.queries || quota;
  const qUsed = q.used ?? 0;
  const qLimit = q.limit ?? 10000;

  return (
    <div
      className="text-xs flex items-center gap-3"
      title={`Uploads today: ${upUsed}/${upCap} videos.insert · Queries pool: ${qUsed}/${qLimit} (${up.date || quota.date || ""})`}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-gray-500">Uploads</span>
        <span className={`tabular-nums font-semibold ${upColor}`}>{upUsed}/{upCap}</span>
      </span>
      <span className="flex items-center gap-1.5 opacity-70">
        <span className="text-gray-500">Queries</span>
        <span className="tabular-nums text-gray-400">{qUsed.toLocaleString()}/{qLimit.toLocaleString()}</span>
      </span>
    </div>
  );
}

function UploadRow({ row, onCancel, onRetry, busy, selected, onToggleSelect }) {
  const thumb = row.clip_thumb_url ? api.mediaUrl(row.clip_thumb_url) : "";
  const pct = row.progress_pct || 0;
  const canCancel = row.status === "queued" || row.status === "uploading";
  // `provider_failed` is also retryable — the operator may have fixed
  // the upstream config (renewed Postiz subscription, reconnected
  // OAuth). Retry kicks the row back into the queue; if the issue is
  // still there the worker will short-circuit to provider_failed again.
  const canRetry  = row.status === "failed" || row.status === "cancelled" || row.status === "provider_failed";
  const providerFailKind = row.status === "provider_failed" ? classifyProviderFail(row.last_error) : null;

  return (
    <div className={`bg-surface border rounded-lg p-3 flex gap-3 hover:border-border-hover transition-colors ${
      selected ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border"
    }`}>
      <button
        onClick={onToggleSelect}
        className={`self-start mt-1 flex-shrink-0 ${selected ? "text-red-400" : "text-gray-500 hover:text-gray-200"}`}
        title={selected ? "Deselect" : "Select"}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      {/* Thumb */}
      <div className="flex-shrink-0 w-16 sm:w-20 bg-black rounded overflow-hidden" style={{ aspectRatio: "9/16" }}>
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"
               onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Film size={18} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-gray-100 truncate flex items-center gap-1.5" title={row.title}>
              {row.publish_kind === "short" && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded flex-shrink-0">
                  Short
                </span>
              )}
              <span className="truncate">
                {row.title || <span className="text-gray-500 italic">(no title)</span>}
              </span>
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 flex-wrap">
              <span className="truncate max-w-[14rem]">{row.clip_filename || `clip #${row.clip_id}`}</span>
              <span>•</span>
              <span title="Style profile used for SEO generation">via {row.channel_name || `profile #${row.channel_id}`}</span>
              {row.publish_at && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-yellow-400">
                    <Calendar size={10} /> {formatDateTime(row.publish_at)}
                  </span>
                </>
              )}
            </div>
          </div>
          <StatusBadge status={row.status} />
        </div>

        {/* Progress */}
        {(row.status === "uploading" || row.status === "processing" || (row.bytes_uploaded > 0 && row.status !== "done")) && (
          <div className="w-full">
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  row.status === "failed" ? "bg-red-500" :
                  row.status === "processing" ? "bg-yellow-500 animate-pulse" :
                  "bg-accent2"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 tabular-nums mt-0.5">
              <span>{formatBytes(row.bytes_uploaded)} / {formatBytes(row.bytes_total)}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Error */}
        {row.last_error && row.status === "failed" && (
          <p className="text-[11px] text-red-400 line-clamp-2" title={row.last_error}>
            {lastLineOf(row.last_error)}
          </p>
        )}

        {/* Provider-level fix CTA — distinct from generic failure copy
            because the operator has to renew billing or reconnect
            OAuth before retry can possibly succeed. */}
        {row.status === "provider_failed" && (
          <div className="bg-orange-950/30 border border-orange-900/60 rounded p-2 text-[11px] text-orange-200 flex items-start gap-2">
            <ShieldAlert size={13} className="mt-0.5 flex-shrink-0 text-orange-400" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-orange-100 mb-0.5">
                {providerFailKind?.title || "Upstream provider rejected the upload"}
              </div>
              <div className="text-orange-300/90 leading-relaxed">
                {providerFailKind?.body || lastLineOf(row.last_error || "")}
              </div>
              {providerFailKind?.cta && (
                <RLink
                  to={providerFailKind.ctaHref}
                  className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-orange-200 hover:text-white underline underline-offset-2"
                >
                  <Wrench size={11} /> {providerFailKind.cta}
                </RLink>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-0.5">
          {row.upload_path === "postiz" ? (
            <span className="text-[11px] text-fuchsia-300 inline-flex items-center gap-1">
              <ExternalLink size={11} /> Delivered via Postiz
            </span>
          ) : row.video_url ? (
            <a
              href={row.video_url}
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
              title="Cancel this upload"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Cancel
            </button>
          )}
          {canRetry && (
            <button
              onClick={onRetry}
              disabled={busy}
              className="text-[11px] text-accent2 hover:text-white inline-flex items-center gap-1 disabled:opacity-50"
              title="Retry — resumes from where it stopped"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Retry
            </button>
          )}
          {row.attempts > 0 && (
            <span className="text-[10px] text-gray-600 ml-auto">
              attempt {row.attempts}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared by the legacy rows, the publish cards AND the per-channel rows
// on PublishDetail — covers legacy upload statuses, publish-task
// aggregate statuses and the per-channel child-job pipeline states.
export function StatusBadge({ status }) {
  const conf = {
    queued:     { icon: Clock,        cls: "bg-gray-800 text-gray-300",       label: "Queued" },
    uploading:  { icon: Loader2,      cls: "bg-blue-950/60 text-blue-300",    label: "Uploading", spin: true },
    processing: { icon: Loader2,      cls: "bg-yellow-950/60 text-yellow-300", label: "Processing", spin: true },
    done:       { icon: CheckCircle2, cls: "bg-green-950/60 text-green-300",  label: "Done" },
    failed:     { icon: XCircle,      cls: "bg-red-950/60 text-red-300",      label: "Failed" },
    cancelled:  { icon: Ban,          cls: "bg-gray-900 text-gray-500",       label: "Cancelled" },
    // Worker flipped the row here when the upstream provider returned
    // a terminal config error (dead Postiz subscription, revoked OAuth).
    // Distinct from `failed` so the UI can show a fix-the-config CTA
    // instead of generic "retry might work" copy.
    provider_failed: { icon: ShieldAlert, cls: "bg-orange-950/60 text-orange-300", label: "Needs Fix" },
    // Publish-task aggregate statuses (job-wise fan-out).
    fanning_out:    { icon: Loader2,      cls: "bg-sky-950/60 text-sky-300",     label: "Starting", spin: true },
    dispatched:     { icon: Loader2,      cls: "bg-blue-950/60 text-blue-300",   label: "Publishing", spin: true },
    completed:      { icon: CheckCircle2, cls: "bg-green-950/60 text-green-300", label: "Completed" },
    partial_failed: { icon: AlertCircle,  cls: "bg-amber-950/60 text-amber-300", label: "Partly failed" },
    // Per-channel child-job pipeline states (PublishDetail rows). All
    // pre-upload stages render as active spinners with their own label.
    claimed:         { icon: Loader2,     cls: "bg-sky-950/60 text-sky-300",     label: "Claimed", spin: true },
    branding:        { icon: Loader2,     cls: "bg-violet-950/60 text-violet-300", label: "Branding", spin: true },
    ready_to_upload: { icon: Loader2,     cls: "bg-sky-950/60 text-sky-300",     label: "Ready to upload", spin: true },
    parked_quota:    { icon: PauseCircle, cls: "bg-amber-950/60 text-amber-300", label: "Quota parked" },
  }[status] || { icon: Clock, cls: "bg-gray-800 text-gray-400", label: status };
  const Icon = conf.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${conf.cls}`}>
      <Icon size={10} className={conf.spin ? "animate-spin" : ""} /> {conf.label}
    </span>
  );
}

export function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
