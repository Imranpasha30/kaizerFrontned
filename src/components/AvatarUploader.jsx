import React, { useRef, useState } from "react";
import {
  Camera, Loader2, Trash2, CheckCircle2, AlertTriangle, ImagePlus,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

/**
 * Inline profile picture uploader. Renders a circular avatar with a
 * camera badge — click to pick a new image or GIF. Updates the auth
 * context so every place that renders the user (NavBar, library cards,
 * creator pages) refreshes on the next render.
 */
export default function AvatarUploader({ size = 96 }) {
  const { user, refresh } = useAuth();
  const inputRef = useRef(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState(false);

  // Local preview so the new image shows before /auth/me re-fetches.
  const [previewUrl, setPreviewUrl] = useState("");

  const displayName = user?.name?.trim() || user?.email?.split("@")[0] || "?";
  const initial     = (displayName[0] || "?").toUpperCase();
  const avatarUrl   = previewUrl || user?.avatar_url || "";

  async function pick() {
    inputRef.current?.click();
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please pick an image or GIF.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Image must be under 8 MB.");
      return;
    }
    setError(""); setBusy(true); setSuccess(false);
    // Optimistic preview using object URL.
    const localUrl = URL.createObjectURL(f);
    setPreviewUrl(localUrl);
    try {
      await api.uploadAvatar(f);
      await refresh?.();
      setSuccess(true);
      // Clear the preview once /auth/me brings back the real URL.
      setTimeout(() => {
        try { URL.revokeObjectURL(localUrl); } catch {}
        setPreviewUrl("");
      }, 1500);
    } catch (e) {
      setError(e.message || "Upload failed");
      setPreviewUrl("");
      try { URL.revokeObjectURL(localUrl); } catch {}
    } finally {
      setBusy(false);
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  async function clear() {
    if (!user?.avatar_url) return;
    if (!confirm("Remove your profile picture?")) return;
    setBusy(true); setError("");
    try {
      await api.deleteAvatar();
      await refresh?.();
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl} alt={displayName}
            style={{ width: size, height: size }}
            className="rounded-full object-cover border-2 border-border"
          />
        ) : (
          <div
            style={{ width: size, height: size, fontSize: size * 0.42 }}
            className="rounded-full bg-gradient-to-br from-accent to-accent2 text-white
                       flex items-center justify-center font-bold border-2 border-border"
          >
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-accent text-white
                     border-2 border-panel flex items-center justify-center
                     hover:bg-accent2 transition-all disabled:opacity-50"
          aria-label="Change profile picture"
          title="Change profile picture"
        >
          {busy ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>}
        </button>
        <input
          ref={inputRef} type="file" accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-[0.18em] font-bold text-gray-500 mb-0.5">
          Profile picture
        </p>
        <p className="text-sm text-gray-300">
          Image or GIF, up to 8 MB. Shown next to your uploads in the library
          and on your creator page.
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
          <button type="button" onClick={pick} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                             border border-border bg-panel text-gray-300
                             hover:bg-panel-hover hover:text-white hover:border-border-hover
                             transition-all disabled:opacity-40">
            <ImagePlus size={12}/> {user?.avatar_url ? "Replace" : "Upload"}
          </button>
          {(user?.avatar_url || previewUrl) && (
            <button type="button" onClick={clear} disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md
                               border border-border bg-panel text-gray-400
                               hover:bg-red-900/40 hover:border-red-700/60 hover:text-red-300
                               transition-all disabled:opacity-40">
              <Trash2 size={12}/> Remove
            </button>
          )}
          {success && (
            <span className="inline-flex items-center gap-1 text-green-300">
              <CheckCircle2 size={12}/> Saved
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-red-300">
              <AlertTriangle size={12}/> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
