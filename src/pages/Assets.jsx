import React, { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, UploadCloud, Trash2, Star, StarOff, Loader2,
  AlertCircle, CheckCircle2, Info, X, Search,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Assets — Canva-style image library.
 *
 * Users drop/pick images here; one can be marked as "default image".
 * When the "Use my default image" toggle is on for a New Job, the pipeline
 * uses that image for every clip instead of fetching stock photos.
 */
export default function Assets() {
  const [assets, setAssets]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [uploadPct, setUploadPct] = useState(null);
  const [query, setQuery]       = useState("");
  const dropRef = useRef(null);
  const inputRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setAssets(await api.listAssets() || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function doUpload(files, markDefault = false) {
    if (!files || files.length === 0) return;
    setError(""); setNotice("");
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith("image/")) continue;
        const form = new FormData();
        form.append("file", f);
        form.append("kind", "image");
        // Only mark the first file as default (if requested) to respect
        // "at most one default" invariant.
        if (markDefault && i === 0) form.append("is_default_ad", "true");
        await api.uploadAsset(form, (pct) => setUploadPct(pct));
      }
      setNotice(`Uploaded ${files.length} image(s)`);
      setUploadPct(null);
      load();
    } catch (e) {
      setError(e.message || "Upload failed");
      setUploadPct(null);
    }
  }

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e) => { e.preventDefault(); el.classList.add("border-accent2"); };
    const leave = () => el.classList.remove("border-accent2");
    const drop = (e) => {
      e.preventDefault();
      el.classList.remove("border-accent2");
      doUpload(Array.from(e.dataTransfer.files || []));
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, []);

  async function setAsDefault(a) {
    try {
      await api.patchAsset(a.id, { is_default_ad: true });
      setNotice(`"${a.filename}" is now your default image`);
      load();
    } catch (e) { setError(e.message); }
  }
  async function unsetDefault(a) {
    try {
      await api.patchAsset(a.id, { is_default_ad: false });
      setNotice("Default image cleared");
      load();
    } catch (e) { setError(e.message); }
  }
  async function doDelete(a) {
    if (!confirm(`Delete "${a.filename}"?`)) return;
    try {
      await api.deleteAsset(a.id);
      setNotice("Deleted");
      load();
    } catch (e) { setError(e.message); }
  }

  const defaultAsset = assets.find((a) => a.is_default_ad);
  const filtered = query.trim()
    ? assets.filter((a) =>
        a.filename.toLowerCase().includes(query.toLowerCase()) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(query.toLowerCase()))
      )
    : assets;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <ImageIcon size={22} className="text-accent2" /> Assets
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload images once, reuse them across clips. Star one to make it the default that the AI uses on new jobs.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded flex items-center gap-2">
          <CheckCircle2 size={14} /> {notice}
          <button onClick={() => setNotice("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* How-it-works */}
      <div className="mb-4 p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 flex items-start gap-2">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          Uploaded images belong to you and never leave your server. The <strong className="text-gray-100">starred</strong> image becomes your
          <strong className="text-gray-100"> default advertising image</strong> — turn on <em>"Use my default image"</em> when creating a new
          job and every clip will use this image instead of a generated/stock photo.
        </div>
      </div>

      {/* Current default strip */}
      {defaultAsset && (
        <div className="mb-4 p-3 bg-yellow-950/20 border border-yellow-900/40 rounded flex items-center gap-3">
          <img
            src={api.mediaUrl(defaultAsset.thumb_url)}
            alt=""
            className="w-14 h-14 rounded object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-yellow-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
              <Star size={11} fill="currentColor" /> Current default
            </div>
            <div className="text-sm text-gray-200 truncate">{defaultAsset.filename}</div>
          </div>
          <button
            onClick={() => unsetDefault(defaultAsset)}
            className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1"
          >
            <StarOff size={12} /> Clear
          </button>
        </div>
      )}

      {/* Upload zone */}
      <label
        ref={dropRef}
        className="block mb-5 border-2 border-dashed border-border rounded-lg p-6 sm:p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-gray-500 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            doUpload(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
        {uploadPct !== null ? (
          <>
            <Loader2 size={24} className="text-accent animate-spin" />
            <span className="text-sm text-gray-300">Uploading… {uploadPct}%</span>
            <div className="w-64 h-1.5 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${uploadPct}%` }} />
            </div>
          </>
        ) : (
          <>
            <UploadCloud size={28} className="text-gray-600" />
            <span className="text-sm text-gray-300">Drag & drop images, or click to pick</span>
            <span className="text-[10px] text-gray-600">JPG / PNG / WebP / GIF — up to 20 MB each</span>
          </>
        )}
      </label>

      {/* Search */}
      {assets.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename or tag…"
              className="w-full bg-surface border border-border rounded px-7 py-1.5 text-sm text-gray-200 focus:border-accent2 outline-none"
            />
          </div>
          <span className="text-xs text-gray-500">{filtered.length} of {assets.length}</span>
        </div>
      )}

      {/* Grid */}
      {loading && assets.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded p-10 text-center text-gray-500">
          {assets.length === 0
            ? "No assets yet. Upload your first image above."
            : "No match for your search."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onSetDefault={() => setAsDefault(a)}
              onUnsetDefault={() => unsetDefault(a)}
              onDelete={() => doDelete(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onSetDefault, onUnsetDefault, onDelete }) {
  const src = api.mediaUrl(asset.thumb_url || asset.url);
  const kb = Math.round((asset.size_bytes || 0) / 1024);
  return (
    <div
      className={`relative bg-surface border rounded overflow-hidden group transition-colors ${
        asset.is_default_ad ? "border-yellow-500/60 ring-1 ring-yellow-500/30" : "border-border hover:border-accent/40"
      }`}
    >
      <div className="relative aspect-square bg-black">
        <img src={src} alt={asset.filename} loading="lazy" className="w-full h-full object-cover" />
        {asset.is_default_ad && (
          <span className="absolute top-1.5 left-1.5 bg-yellow-500/90 text-black text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
            <Star size={9} fill="currentColor" /> DEFAULT
          </span>
        )}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
          {asset.is_default_ad ? (
            <button
              onClick={onUnsetDefault}
              className="w-full px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 text-xs flex items-center justify-center gap-1.5"
            >
              <StarOff size={11} /> Unset default
            </button>
          ) : (
            <button
              onClick={onSetDefault}
              className="w-full px-2 py-1.5 rounded bg-yellow-500/80 hover:bg-yellow-500 text-black text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Star size={11} /> Set as default
            </button>
          )}
          <button
            onClick={onDelete}
            className="w-full px-2 py-1.5 rounded bg-red-500/80 hover:bg-red-500 text-white text-xs flex items-center justify-center gap-1.5"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>
      </div>
      <div className="px-2 py-1.5 text-[11px] text-gray-400 truncate" title={asset.filename}>
        {asset.filename}
      </div>
      <div className="px-2 pb-1.5 text-[10px] text-gray-600 flex justify-between">
        <span>{asset.width}×{asset.height}</span>
        <span>{kb} KB</span>
      </div>
    </div>
  );
}
