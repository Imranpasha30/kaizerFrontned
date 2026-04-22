import React, { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Upload, X, Loader2, Check, AlertCircle, FolderOpen,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Logo picker — two paths:
 *   1. Upload from computer  → creates a UserAsset, returns its id.
 *   2. Pick from Assets library → returns an existing UserAsset id.
 *
 * Value: `logoAssetId` (number | null). `null` = no logo (SaaS default).
 *
 * Props:
 *   value           - current logo_asset_id (number | null)
 *   onChange(id)    - called with new id or null when cleared
 *   initialPreview  - optional { url, filename } to show before any fetch
 */
export default function LogoPicker({ value, onChange, initialPreview = null, currentChannelId = null }) {
  const [mode, setMode]         = useState("preview");  // "preview" | "library"
  const [assets, setAssets]     = useState([]);
  const [folders, setFolders]   = useState([]);
  const [folder, setFolder]     = useState("");          // current folder within library mode
  const [loading, setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError]       = useState("");
  const [preview, setPreview]   = useState(initialPreview);
  // Multi-apply state — when user clicks "use for more channels", this
  // modal-within-picker shows a checklist of their other channels.
  const [applyOpen, setApplyOpen]   = useState(false);
  const [channels, setChannels]     = useState([]);
  const [applyIds, setApplyIds]     = useState(() => new Set());
  const [applying, setApplying]     = useState(false);
  const [applyNotice, setApplyNotice] = useState("");
  const fileRef = useRef(null);

  // Keep the preview in sync with incoming `value` — fetch the asset once
  // if we only have the id.
  useEffect(() => {
    if (!value) { setPreview(null); return; }
    if (initialPreview?.url) { setPreview(initialPreview); return; }
    // Lightweight cache: if we just uploaded or picked something, preview is
    // already set.  Otherwise we'll fetch when switching to "library" mode.
  }, [value, initialPreview?.url]);

  async function openLibrary() {
    setMode("library");
    setError("");
    setLoading(true);
    try {
      const [list, flds] = await Promise.all([
        api.listAssets(folder || ""),
        api.listAssetFolders(),
      ]);
      setAssets(list || []);
      setFolders(flds || []);
    } catch (e) {
      setError(e.message || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }

  async function switchFolder(path) {
    setFolder(path);
    setLoading(true);
    setError("");
    try {
      const list = await api.listAssets(path || "");
      setAssets(list || []);
    } catch (e) {
      setError(e.message || "Failed to load folder");
    } finally {
      setLoading(false);
    }
  }

  async function openApplyDialog() {
    if (!value) return;
    setApplyOpen(true);
    setApplyNotice("");
    try {
      const all = await api.listChannels();
      // Exclude the channel currently being edited — you can't "apply to
      // yourself" since you already picked this logo on this channel.
      const rest = (all || []).filter((c) => c.id !== currentChannelId);
      setChannels(rest);
      // Default: pre-check channels that already have the same logo so the
      // dialog's state reflects the truth.
      setApplyIds(new Set(rest.filter((c) => c.logo_asset_id === value).map((c) => c.id)));
    } catch (e) {
      setError(e.message || "Failed to load channels");
      setApplyOpen(false);
    }
  }

  async function confirmApply() {
    if (applyIds.size === 0) { setApplyOpen(false); return; }
    setApplying(true);
    try {
      await api.applyLogoToChannels(Array.from(applyIds), value);
      setApplyNotice(`Applied to ${applyIds.size} channel(s).`);
      setTimeout(() => { setApplyOpen(false); setApplyNotice(""); }, 1500);
    } catch (e) {
      setError(e.message || "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  async function handleUpload(file) {
    if (!file) return;
    setError("");
    setUploading(true);
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "logo");
      // Save into whichever folder the library view is currently in — or
      // the Assets root when picker opened fresh.
      form.append("folder_path", folder || "");
      const asset = await api.uploadAsset(form, (pct) => setUploadPct(pct));
      // uploadAsset returns the created asset record
      const logoId = asset?.id;
      const logoUrl = asset?.url || (asset?.file_path ? `/api/file/?path=${encodeURIComponent(asset.file_path)}` : "");
      setPreview({ url: logoUrl, filename: asset?.filename || file.name });
      onChange(logoId);
      setMode("preview");
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  function pickFromLibrary(asset) {
    const url = asset?.url || (asset?.file_path ? `/api/file/?path=${encodeURIComponent(asset.file_path)}` : "");
    setPreview({ url, filename: asset.filename });
    onChange(asset.id);
    setMode("preview");
  }

  function clearLogo() {
    setPreview(null);
    onChange(null);
    setMode("preview");
  }

  return (
    <div className="rounded border border-border bg-black/30 p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1">
          <ImageIcon size={12} /> Channel Logo (optional)
        </span>
        <div className="flex items-center gap-2">
          {value && currentChannelId && (
            <button
              type="button"
              onClick={openApplyDialog}
              className="text-[10px] text-accent2 hover:text-accent flex items-center gap-1"
              title="Use this same logo on other channels"
            >
              <Check size={10} /> apply to more channels
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={clearLogo}
              className="text-[10px] text-gray-500 hover:text-red-400 flex items-center gap-1"
            >
              <X size={10} /> remove
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mb-3 leading-relaxed">
        If set, this logo is overlaid on every video rendered for this profile.
        Leave empty for no logo (SaaS default).
      </p>

      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-300 text-[11px] px-2 py-1.5 rounded mb-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Preview mode — what's currently set */}
      {mode === "preview" && (
        <div className="flex items-center gap-3">
          {preview?.url ? (
            <div className="flex items-center gap-2 flex-1">
              <img
                src={preview.url}
                alt={preview.filename || "logo"}
                className="w-14 h-14 rounded border border-border bg-black/40 object-contain"
                onError={(e) => { e.target.style.display = "none"; }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-200 truncate">{preview.filename || "Logo"}</div>
                <div className="text-[10px] text-gray-500">Current logo</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 text-[11px] text-gray-500 italic">No logo — videos render with no overlay</div>
          )}
          <div className="flex flex-col sm:flex-row gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
              title="Upload a new logo from your computer"
            >
              <Upload size={11} /> Upload
            </button>
            <button
              type="button"
              onClick={openLibrary}
              className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"
              title="Pick from the Assets library"
            >
              <FolderOpen size={11} /> From Assets
            </button>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-[11px] text-accent2 mb-1">
            <Loader2 size={12} className="animate-spin" />
            Uploading… {uploadPct}%
          </div>
          <div className="h-1.5 bg-black/40 rounded overflow-hidden">
            <div className="h-full bg-accent2 transition-all" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      )}

      {/* Library picker — grid of user's assets */}
      {mode === "library" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-gray-400">
              Pick from your Assets library{folder && <span className="text-gray-500"> · {folder}</span>}
            </span>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <X size={11} /> cancel
            </button>
          </div>
          {/* Folder navigation — one pill per folder, "Root" first */}
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                type="button"
                onClick={() => switchFolder("")}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  folder === ""
                    ? "bg-accent2/30 border-accent2 text-white"
                    : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
                }`}
              >
                Root
              </button>
              {folders.filter((f) => f).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => switchFolder(f)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    folder === f
                      ? "bg-accent2/30 border-accent2 text-white"
                      : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
                  }`}
                  title={f}
                >
                  {f.split("/").slice(-1)[0]}
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-gray-500 py-3">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : assets.length === 0 ? (
            <div className="text-[11px] text-gray-500 text-center py-3">
              No assets yet.  Upload directly with the button above, or add some on the Assets page.
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {assets.map((a) => {
                const isSel = a.id === value;
                const url = a.thumb_url || a.url;
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => pickFromLibrary(a)}
                    className={`relative border rounded overflow-hidden bg-black/50 aspect-square hover:ring-2 ring-accent2 transition-all ${
                      isSel ? "ring-2 ring-accent2" : "border-border"
                    }`}
                    title={a.filename}
                  >
                    {url ? (
                      <img src={url} alt={a.filename} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <ImageIcon size={14} />
                      </div>
                    )}
                    {isSel && (
                      <div className="absolute top-0 right-0 bg-accent2 text-white text-[9px] p-0.5 rounded-bl">
                        <Check size={10} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";  // allow re-picking same file
        }}
      />

      {/* Multi-channel apply dialog — checklist of OTHER channels the user
          owns.  Confirm writes logo_asset_id on each selected channel in
          one round-trip. */}
      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setApplyOpen(false)}>
          <div
            className="bg-[#0c0c0c] border border-border rounded-lg p-4 max-w-md w-full mx-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-100">Apply this logo to…</h3>
              <button onClick={() => setApplyOpen(false)} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Pick the channels that should use the same logo.  Already-matching channels are pre-checked.
            </p>
            {applyNotice && (
              <div className="bg-green-950/30 border border-green-900 text-green-300 text-[11px] px-2 py-1.5 rounded mb-2 flex items-center gap-1.5">
                <Check size={12} /> {applyNotice}
              </div>
            )}
            {channels.length === 0 ? (
              <div className="text-[11px] text-gray-500 py-3">No other channels to apply to.</div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1 mb-3">
                {channels.map((c) => {
                  const checked = applyIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                        checked ? "bg-accent2/10 border-accent2/40" : "bg-black/30 border-border hover:border-accent2/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setApplyIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.id); else next.delete(c.id);
                            return next;
                          });
                        }}
                        className="accent-accent2"
                      />
                      <span className="text-xs text-gray-200 flex-1 truncate">
                        {c.is_priority ? "★ " : ""}{c.name}
                      </span>
                      {c.logo_asset_id === value && (
                        <span className="text-[9px] text-green-400 uppercase tracking-wider">has</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setApplyOpen(false)}
                className="btn btn-secondary text-xs py-1 px-3"
              >
                Cancel
              </button>
              <button
                onClick={confirmApply}
                disabled={applying || applyIds.size === 0}
                className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-50"
              >
                {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Apply to {applyIds.size}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
