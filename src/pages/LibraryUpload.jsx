import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, Loader2, AlertTriangle, CheckCircle2, Film,
  Trash2, Library as LibraryIcon, Shield,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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

// ────────────────────────────────────────────────────────────────────

function UploadCard({ onUploaded, categories }) {
  const [file, setFile]        = useState(null);
  const [title, setTitle]      = useState("");
  const [description, setDesc] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy]        = useState(false);
  const [pct, setPct]          = useState(0);
  const [error, setError]      = useState("");
  const [success, setSuccess]  = useState(false);
  const [drag, setDrag]        = useState(false);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("Please pick a video file (mp4, mov, mkv, webm).");
      return;
    }
    setError(""); setSuccess(false); setFile(f);
    if (!title.trim()) {
      setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    }
  }

  function reset() {
    setFile(null); setTitle(""); setDesc(""); setCategoryId(""); setPct(0);
    setError(""); setSuccess(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    setBusy(true); setPct(0); setError("");
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      if (categoryId) fd.append("category_id", String(categoryId));
      const created = await api.uploadLibraryItem(fd, setPct);
      setSuccess(true);
      onUploaded?.(created);
      // Auto-reset after a short success blink so the user can upload another.
      setTimeout(() => { reset(); setBusy(false); }, 1500);
    } catch (e) {
      setError(e.message || "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-panel p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
          <Upload size={16} className="text-accent2"/>
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Upload a video</h2>
          <p className="text-xs text-gray-500">It goes into the shared library for everyone to use.</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !file && !busy && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed p-7 text-center cursor-pointer transition-all
                    ${drag    ? "border-accent2 bg-accent/10"
                    : file    ? "border-green-700/50 bg-green-900/10"
                              : "border-border bg-surface/50 hover:border-border-hover hover:bg-panel-hover"}`}
      >
        <input
          ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <CheckCircle2 size={16} className="text-green-300"/>
            <span className="font-medium text-green-200 truncate max-w-[360px]">{file.name}</span>
            <span className="text-gray-500 tabular-nums">({fmtBytes(file.size)})</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Upload size={28} className="text-gray-500"/>
            <p className="text-sm font-medium text-gray-300">Drop a video here, or click to pick</p>
            <p className="text-xs text-gray-500">mp4 · mov · mkv · webm · up to 4 GB</p>
          </div>
        )}
      </div>

      {/* Title + notes */}
      <div className="space-y-3 mt-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">Title</label>
          <input
            type="text" value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Telugu cricket highlights — Sept 15"
            maxLength={200} disabled={busy}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border
                       text-sm text-gray-200 placeholder:text-gray-600
                       focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
            Category <span className="text-gray-600 normal-case font-normal">(optional)</span>
          </label>
          {(categories || []).length === 0 ? (
            <p className="text-xs text-gray-500 italic px-1">No categories defined yet.</p>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button" disabled={busy}
                onClick={() => setCategoryId("")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                            border transition-all
                            ${!categoryId
                              ? "bg-white/10 text-white border-white/40 shadow-sm"
                              : "bg-panel text-gray-400 border-border hover:bg-panel-hover hover:text-gray-200"}`}
              >
                Uncategorized
              </button>
              {categories.map(c => {
                const active = String(categoryId) === String(c.id);
                const color  = c.color || "#7f8c8d";
                return (
                  <button
                    key={c.id} type="button" disabled={busy}
                    onClick={() => setCategoryId(c.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                                border transition-all
                                ${active ? "bg-white/10 text-white shadow-sm"
                                         : "bg-panel text-gray-400 border-border hover:bg-panel-hover hover:text-gray-200"}`}
                    style={active ? { borderColor: color, color } : undefined}
                  >
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }}/>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wider">
            Notes <span className="text-gray-600 normal-case font-normal">(optional)</span>
          </label>
          <textarea
            value={description} onChange={(e) => setDesc(e.target.value)}
            placeholder="What's this video about? Helps your team pick the right one."
            maxLength={2000} rows={2} disabled={busy}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border
                       text-sm text-gray-200 placeholder:text-gray-600 resize-none
                       focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      {/* Progress + feedback */}
      {busy && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>{success ? "Saved" : "Uploading…"}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
            <div className={`h-full transition-all duration-300 ${
              success ? "bg-green-500" : "bg-gradient-to-r from-accent to-accent2"
            }`} style={{ width: `${pct}%` }}/>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0"/>
          <span className="text-xs text-red-200">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-5">
        {(file || title || description) && !busy && (
          <button type="button" onClick={reset}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-300
                             hover:bg-panel-hover transition-all">
            Clear
          </button>
        )}
        <button type="button" onClick={submit} disabled={busy || !file}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                           bg-accent text-white border border-accent
                           hover:bg-accent2 hover:border-accent2
                           disabled:opacity-40 disabled:pointer-events-none transition-all">
          {busy
            ? <><Loader2 size={14} className="animate-spin"/> Uploading</>
            : <><Upload size={14}/> Upload to Library</>}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

function MyUploadCard({ item, isAdmin, onDelete }) {
  const isVertical = item.aspect === "9:16";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border
                    bg-panel transition-all duration-200
                    hover:-translate-y-0.5 hover:shadow-elevated hover:border-border-hover">
      <div className="relative w-full aspect-video bg-ink-900 overflow-hidden">
        {item.thumb_url ? (
          isVertical ? (
            <>
              <img src={item.thumb_url} alt="" aria-hidden
                   className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60"
                   loading="lazy"/>
              <div className="absolute inset-0 bg-black/30"/>
              <img src={item.thumb_url} alt={item.title}
                   className="relative h-full mx-auto object-contain" loading="lazy"/>
            </>
          ) : (
            <img src={item.thumb_url} alt={item.title}
                 className="absolute inset-0 w-full h-full object-cover" loading="lazy"/>
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-900 text-gray-600">
            <Film size={24}/>
          </div>
        )}
        {item.duration_secs > 0 && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                           bg-black/70 backdrop-blur-md border border-white/10
                           text-[10px] font-semibold text-white/90 tabular-nums">
            {fmtDuration(item.duration_secs)}
          </span>
        )}
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="absolute top-2 right-2 inline-flex items-center justify-center
                     w-7 h-7 rounded-md bg-black/70 backdrop-blur-md border border-white/15
                     text-white/90 hover:bg-red-700 hover:border-red-500
                     opacity-0 group-hover:opacity-100 transition-all"
          title="Delete from library"
        >
          <Trash2 size={12}/>
        </button>
      </div>
      <div className="px-3 py-2.5 flex-1">
        <h4 className="text-sm font-semibold text-white truncate">{item.title}</h4>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500 tabular-nums">
          <span>{fmtRelDate(item.created_at)}</span>
          <span className="text-gray-700">·</span>
          <span>{fmtBytes(item.file_size)}</span>
          {item.use_count > 0 && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-accent2/80">{item.use_count} use{item.use_count !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────

export default function LibraryUpload() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const canUpload = !!(user?.is_creative || user?.is_admin);
  const isAdmin   = !!user?.is_admin;

  const [items, setItems]           = useState([]);
  const [loading, setLoad]          = useState(true);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.listLibraryCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoad(true);
    try {
      // Use the creator endpoint scoped to the current user so the page
      // shows ALL of their uploads (not just the first 24 of the global
      // library). Returns { creator, items, total, ... }.
      const resp = await api.getLibraryCreator(user.id, { page_size: 60 });
      setItems(resp?.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoad(false);
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const myItems = items;

  const handleDelete = useCallback(async (item) => {
    if (!confirm(`Delete "${item.title}" from the library?\n\nThis hides it from everyone; the cloud copy is removed by a separate sweep.`)) return;
    try {
      await api.deleteLibraryItem(item.id);
      setItems(rows => rows.filter(r => r.id !== item.id));
    } catch (e) {
      alert("Delete failed: " + (e.message || "unknown error"));
    }
  }, []);

  const handleUploaded = useCallback((created) => {
    // Optimistic insert + fresh refetch so signed URLs are real.
    setItems(rows => [created, ...rows]);
    setTimeout(refresh, 500);
  }, [refresh]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  if (!canUpload) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-border bg-panel/60 p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-yellow-900/30 border border-yellow-700/40 mb-4">
            <Shield size={22} className="text-yellow-300"/>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Creator access only</h1>
          <p className="text-sm text-gray-400 mb-5">
            Uploading to the library is restricted to creative users and
            admins. Ask an admin to grant you the role if you need it.
          </p>
          <Link to="/library"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm
                           bg-accent text-white border border-accent hover:bg-accent2">
            <ArrowLeft size={14}/> Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link to="/library"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md
                         border border-border bg-panel text-gray-400
                         hover:bg-panel-hover hover:text-white hover:border-border-hover transition-all">
          <ArrowLeft size={14}/>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                          bg-accent/15 border border-accent/30 text-[10px] uppercase
                          tracking-[0.18em] font-bold text-accent2 mb-1">
            <LibraryIcon size={10}/> Creator Tools
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Upload to Library
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Add new source footage to the shared bucket. Everyone on the team can
            pick from it on the Library page.
          </p>
        </div>
      </div>

      {/* Upload form */}
      <UploadCard onUploaded={handleUploaded} categories={categories}/>

      {/* My uploads */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            Your uploads
            <span className="text-xs font-normal text-gray-500 tabular-nums">({myItems.length})</span>
          </h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0,1,2].map(i => (
              <div key={i} className="rounded-xl border border-border bg-panel/60 overflow-hidden">
                <div className="aspect-video bg-ink-800 animate-pulse"/>
                <div className="p-3 space-y-2">
                  <div className="h-3 rounded bg-ink-800 animate-pulse"/>
                  <div className="h-2 w-2/3 rounded bg-ink-800 animate-pulse"/>
                </div>
              </div>
            ))}
          </div>
        ) : myItems.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed bg-panel/40 p-8 text-center">
            <p className="text-sm text-gray-400">You haven't uploaded anything yet.</p>
            <p className="text-xs text-gray-600 mt-1">Drop a video above to seed the team library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {myItems.map(it => (
              <MyUploadCard key={it.id} item={it} isAdmin={isAdmin} onDelete={handleDelete}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
