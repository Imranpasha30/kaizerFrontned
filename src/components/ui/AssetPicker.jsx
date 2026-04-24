import React, { useEffect, useRef, useState } from "react";
import {
  Upload, Image as ImageIcon, Film, X, Check, Loader2,
  AlertTriangle, Search, Trash2,
} from "lucide-react";
import { getToken } from "../../api/client";

/**
 * AssetPicker — reusable panel for "pick from my uploads OR upload a new file".
 *
 *   <AssetPicker
 *     kind="image|video|any"     // filter which assets show + which MIMEs accepted
 *     value={url}                 // the currently-selected asset URL (absolute or /api path)
 *     onChange={(pickedUrl) => setFoo(pickedUrl)}
 *     label="Background asset"
 *   />
 *
 * Talks to the existing /api/assets/ routes (GET / = list, POST /upload).
 * A selected item shows with a green Check; "Clear" unsets. Upload shows a
 * live progress bar; errors surface inline. Supports image + video.
 */
export default function AssetPicker({
  kind = "any",
  value = "",
  onChange,
  label = "Asset",
  accept,          // optional file-input accept attribute override
  className = "",
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const acceptAttr =
    accept
    ?? (kind === "image" ? "image/*"
      : kind === "video" ? "video/*"
      : "image/*,video/*");

  const loadAssets = async () => {
    setLoading(true);
    setErr("");
    try {
      const token = getToken();
      const res = await fetch("/api/assets/", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssets(); }, []);

  const isVideo = (a) => {
    const m = (a.mime || "").toLowerCase();
    if (m.startsWith("video/")) return true;
    const fname = (a.filename || "").toLowerCase();
    return /\.(mp4|webm|mov|mkv)$/.test(fname);
  };
  const filtered = items.filter((a) => {
    if (kind === "image" && isVideo(a)) return false;
    if (kind === "video" && !isVideo(a)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (a.filename || "").toLowerCase().includes(q)
        || (a.tags || []).some((t) => t.toLowerCase().includes(q));
  });

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    setErr("");
    const form = new FormData();
    form.append("file", file);
    form.append("kind", isFileVideo(file) ? "video" : "image");

    await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/assets/upload");
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const asset = JSON.parse(xhr.responseText);
            setItems((prev) => [asset, ...prev]);
            if (onChange) onChange(asset.url || asset.storage_url || "");
            setUploadPct(100);
          } else {
            const d = JSON.parse(xhr.responseText || "{}");
            setErr(d.detail || `Upload failed (${xhr.status})`);
          }
        } catch (e) { setErr(e.message); }
        finally { setUploading(false); resolve(); }
      };
      xhr.onerror = () => { setErr("Network error"); setUploading(false); resolve(); };
      xhr.send(form);
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeAsset = async (id) => {
    if (!window.confirm("Delete this asset permanently?")) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/assets/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div className={`ui-field ${className}`.trim()}>
      {label ? (
        <label className="ui-field-label">
          <ImageIcon size={12} />
          <span>{label}</span>
        </label>
      ) : null}

      {/* Selected-value row */}
      <div className="flex items-center gap-2 bg-black/40 border border-border rounded px-2 py-1.5 mb-2">
        {value ? (
          <>
            <Check size={13} className="text-green-400" />
            <code className="flex-1 text-[11px] text-gray-300 truncate" title={value}>
              {value}
            </code>
            <button
              onClick={() => onChange?.("")}
              className="text-[11px] text-gray-400 hover:text-white"
            >
              clear
            </button>
          </>
        ) : (
          <span className="text-[11px] text-gray-500 italic flex-1">
            No asset selected — pick one below or upload
          </span>
        )}
      </div>

      {/* Upload + search row */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded bg-accent/15 border border-accent/30 text-accent2 hover:bg-accent/25 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? `${uploadPct}%` : "Upload new"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={acceptAttr}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />

        <div className="flex-1 relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="filter by name or tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ui-input !text-[11px] !py-1.5 pl-7"
          />
        </div>
      </div>

      {/* Error banner */}
      {err ? (
        <div className="mb-2 text-[11px] text-red-400 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr("")} className="text-gray-400 hover:text-white">
            <X size={11} />
          </button>
        </div>
      ) : null}

      {/* Asset grid */}
      {loading ? (
        <div className="text-[11px] text-gray-500 italic">Loading assets…</div>
      ) : filtered.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic">
          {items.length === 0
            ? "You haven't uploaded any assets yet. Click Upload new."
            : `No ${kind === "any" ? "" : kind + " "}assets match "${query}".`}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
          {filtered.map((a) => {
            const selected = value && (value === a.url || value === a.storage_url || value.endsWith(a.filename));
            const video = isVideo(a);
            return (
              <div
                key={a.id}
                className={`relative rounded overflow-hidden border cursor-pointer group ${
                  selected ? "border-accent2 ring-2 ring-accent2/40" : "border-border hover:border-border-hover"
                }`}
                onClick={() => onChange?.(a.url || a.storage_url || "")}
                title={a.filename}
              >
                <div className="aspect-video bg-black flex items-center justify-center">
                  {video ? (
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <Film size={20} />
                      <span className="text-[9px] mt-0.5">VIDEO</span>
                    </div>
                  ) : a.thumb_url ? (
                    <img
                      src={a.thumb_url}
                      alt={a.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-gray-500" />
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] px-1.5 py-0.5 text-gray-300 truncate">
                  {a.filename}
                </div>
                {selected ? (
                  <div className="absolute top-1 left-1 bg-accent2 text-white rounded-full p-1">
                    <Check size={9} />
                  </div>
                ) : null}
                <button
                  onClick={(e) => { e.stopPropagation(); removeAsset(a.id); }}
                  className="absolute top-1 right-1 bg-black/70 text-gray-300 hover:text-red-400 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isFileVideo(file) {
  const m = (file.type || "").toLowerCase();
  if (m.startsWith("video/")) return true;
  const n = (file.name || "").toLowerCase();
  return /\.(mp4|webm|mov|mkv)$/.test(n);
}
