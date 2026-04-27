import React, { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Check, AlertCircle } from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";

/**
 * DownloadModal — pick one or more channels and download the clip with
 * each channel's logo burned in. Falls back to the unbranded clip if a
 * channel has no logo configured (server handles that automatically).
 *
 * Props:
 *   open    - boolean
 *   onClose - () => void
 *   clip    - { id, filename }
 */
export default function DownloadModal({ open, onClose, clip }) {
  const [channels, setChannels] = useState([]);
  const [loadingCh, setLoadingCh] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // perChannelStatus: { [channelId]: { status: "pending"|"downloading"|"done"|"error", pct?, error? } }
  const [perCh, setPerCh] = useState({});
  const [running, setRunning] = useState(false);
  const [topError, setTopError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTopError("");
    setPerCh({});
    setRunning(false);
    setLoadingCh(true);
    api.listChannels()
      .then((rows) => {
        const list = (rows || []).filter((c) => c.connected !== false);
        setChannels(list);
        // Default selection: every channel that actually has a logo.
        const withLogo = list.filter((c) => c.logo_asset_id || c.logo_url);
        setSelectedIds(new Set(withLogo.map((c) => c.id)));
      })
      .catch((e) => setTopError(e.message))
      .finally(() => setLoadingCh(false));
  }, [open]);

  const toggle = (id) => {
    if (running) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const allDone = useMemo(() => {
    if (!running) return false;
    const ids = [...selectedIds];
    return ids.length > 0 && ids.every((id) =>
      perCh[id]?.status === "done" || perCh[id]?.status === "error"
    );
  }, [running, perCh, selectedIds]);

  async function handleDownload() {
    if (selectedCount === 0 || !clip) return;
    setRunning(true);
    setTopError("");
    setPerCh({});

    const ids = [...selectedIds];
    // Sequential rather than parallel — the server's ffmpeg is single-
    // threaded per request and parallel would just queue at the backend.
    for (const channelId of ids) {
      const ch = channels.find((c) => c.id === channelId);
      const safeName = (ch?.name || `ch${channelId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      const fname = `${safeName}_${clip.filename || `clip_${clip.id}.mp4`}`;
      setPerCh((s) => ({ ...s, [channelId]: { status: "downloading", pct: 0 } }));
      try {
        await api.downloadWithLogo(clip.id, channelId, fname, (pct) => {
          setPerCh((s) => ({
            ...s,
            [channelId]: { status: "downloading", pct: pct < 0 ? -1 : pct },
          }));
        });
        setPerCh((s) => ({ ...s, [channelId]: { status: "done", pct: 100 } }));
      } catch (e) {
        setPerCh((s) => ({
          ...s,
          [channelId]: { status: "error", error: e.message || "Failed" },
        }));
      }
    }
    setRunning(false);
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Download with channel logo">
      <div className="space-y-3">
        {topError && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded p-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{topError}</span>
          </div>
        )}

        <p className="text-xs text-gray-400">
          Pick the channel(s) you want to download a branded copy for.
          Each variant will have that channel&apos;s logo overlaid in the
          top-right (same look as the publish flow). Channels without a
          configured logo will produce an unbranded copy.
        </p>

        {loadingCh ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center text-xs text-gray-500 py-6">
            You don&apos;t have any channels yet.
            Add one from the Style Profiles page.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
            {channels.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const status = perCh[c.id];
              const hasLogo = !!(c.logo_asset_id || c.logo_url);
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                    isSelected
                      ? "border-accent2/60 bg-accent2/5"
                      : "border-border hover:border-border-hover"
                  } ${running ? "opacity-70" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(c.id)}
                    disabled={running}
                    className="accent-accent2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{c.name || `Channel ${c.id}`}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {hasLogo ? "logo configured" : "no logo — clean copy"}
                    </div>
                  </div>
                  <div className="w-28 flex-shrink-0 text-right">
                    {status?.status === "downloading" && (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-gray-300">
                        <Loader2 size={12} className="animate-spin" />
                        <span>{status.pct >= 0 ? `${status.pct}%` : "…"}</span>
                      </div>
                    )}
                    {status?.status === "done" && (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-green-400">
                        <Check size={12} /> Saved
                      </div>
                    )}
                    {status?.status === "error" && (
                      <div className="flex items-center justify-end gap-1 text-[11px] text-red-400" title={status.error}>
                        <AlertCircle size={12} /> Failed
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={running && !allDone}
            className="btn btn-secondary text-xs py-1.5"
          >
            {allDone ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={selectedCount === 0 || running}
            className="btn btn-primary text-xs py-1.5 flex items-center gap-1.5"
          >
            {running
              ? <Loader2 size={12} className="animate-spin" />
              : <Download size={12} />}
            {running ? "Preparing…" : `Download ${selectedCount} ${selectedCount === 1 ? "copy" : "copies"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
