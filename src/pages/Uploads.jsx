import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Youtube, RefreshCw, Loader2, AlertCircle, CheckCircle2, Clock,
  XCircle, ExternalLink, RotateCcw, Ban, Film, Calendar, X,
  CheckSquare, Square,
} from "lucide-react";
import { api } from "../api/client";

const POLL_MS = 3000;

export default function Uploads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [quota, setQuota] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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
    () => rows.filter((r) => r.status === "failed" || r.status === "cancelled").map((r) => r.id),
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
    loadQuota();
    const iv = setInterval(() => { load(); loadQuota(); }, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(iv);
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
    const base = { queued: 0, uploading: 0, processing: 0, done: 0, failed: 0, cancelled: 0 };
    for (const r of rows) if (base[r.status] !== undefined) base[r.status] += 1;
    return base;
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Youtube className="text-accent2" size={24} /> Upload Queue
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            YouTube uploads scheduled by the Publish button. Resumable and retried automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quota && (
            <QuotaBadge quota={quota} />
          )}
          <button
            onClick={() => { setLoading(true); load(); loadQuota(); }}
            className="p-2 text-gray-400 hover:text-white"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip active={statusFilter === ""} onClick={() => setStatusFilter("")} label={`All (${rows.length})`} />
        <FilterChip active={statusFilter === "queued"}     onClick={() => setStatusFilter("queued")}     label={`Queued (${counts.queued})`} />
        <FilterChip active={statusFilter === "uploading"}  onClick={() => setStatusFilter("uploading")}  label={`Uploading (${counts.uploading})`} />
        <FilterChip active={statusFilter === "processing"} onClick={() => setStatusFilter("processing")} label={`Processing (${counts.processing})`} />
        <FilterChip active={statusFilter === "done"}       onClick={() => setStatusFilter("done")}       label={`Done (${counts.done})`} />
        <FilterChip active={statusFilter === "failed"}     onClick={() => setStatusFilter("failed")}     label={`Failed (${counts.failed})`} />
        <FilterChip active={statusFilter === "cancelled"}  onClick={() => setStatusFilter("cancelled")}  label={`Cancelled (${counts.cancelled})`} />
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
  const used = quota.used || 0;
  const limit = quota.limit || 10000;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? "text-red-400" : pct >= 70 ? "text-yellow-400" : "text-gray-400";
  return (
    <div className="text-xs flex items-center gap-1.5" title={`YouTube Data API units used today (${quota.date})`}>
      <span className="text-gray-500">Quota</span>
      <span className={`tabular-nums font-medium ${color}`}>{used.toLocaleString()}/{limit.toLocaleString()}</span>
    </div>
  );
}

function UploadRow({ row, onCancel, onRetry, busy, selected, onToggleSelect }) {
  const thumb = row.clip_thumb_url ? api.mediaUrl(row.clip_thumb_url) : "";
  const pct = row.progress_pct || 0;
  const canCancel = row.status === "queued" || row.status === "uploading";
  const canRetry  = row.status === "failed" || row.status === "cancelled";

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

        {/* Actions */}
        <div className="flex items-center gap-2 mt-0.5">
          {row.video_url && (
            <a
              href={row.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-accent2 hover:text-white inline-flex items-center gap-1"
            >
              <ExternalLink size={11} /> Open on YouTube
            </a>
          )}
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

function StatusBadge({ status }) {
  const conf = {
    queued:     { icon: Clock,        cls: "bg-gray-800 text-gray-300",       label: "Queued" },
    uploading:  { icon: Loader2,      cls: "bg-blue-950/60 text-blue-300",    label: "Uploading", spin: true },
    processing: { icon: Loader2,      cls: "bg-yellow-950/60 text-yellow-300", label: "Processing", spin: true },
    done:       { icon: CheckCircle2, cls: "bg-green-950/60 text-green-300",  label: "Done" },
    failed:     { icon: XCircle,      cls: "bg-red-950/60 text-red-300",      label: "Failed" },
    cancelled:  { icon: Ban,          cls: "bg-gray-900 text-gray-500",       label: "Cancelled" },
  }[status] || { icon: Clock, cls: "bg-gray-800 text-gray-400", label: status };
  const Icon = conf.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${conf.cls}`}>
      <Icon size={10} className={conf.spin ? "animate-spin" : ""} /> {conf.label}
    </span>
  );
}

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function lastLineOf(s) {
  if (!s) return "";
  const lines = String(s).trim().split("\n");
  return lines[lines.length - 1];
}
