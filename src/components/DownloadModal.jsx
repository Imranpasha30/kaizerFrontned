import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Check, AlertCircle, FileText } from "lucide-react";
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
  // Throttle the per-channel progress callback. XHR's onprogress fires
  // dozens of times per second on a fast connection — left raw, every
  // tick triggered a setPerCh which re-rendered the full channel list
  // (and rippled through any parent component listening on the modal).
  // We commit a new state only when the integer % bumps AND when at
  // least ``THROTTLE_MS`` has elapsed since the last commit for that
  // channel.  Result: at most ~5 renders/sec/channel during a download.
  const lastProgressRef = useRef({});   // { [channelId]: { pct, ts } }
  const THROTTLE_MS = 200;
  // SEO download state — independent of the per-channel video download
  // loop so the user can fetch SEO even while a video render is
  // streaming.  null = idle, "running" = in flight, "done"/"error" =
  // terminal.  Surfaced inline below the action row.
  const [seoStatus, setSeoStatus] = useState(null);
  const [seoError,  setSeoError]  = useState("");

  useEffect(() => {
    if (!open) return;
    setTopError("");
    setPerCh({});
    setRunning(false);
    setLoadingCh(true);
    api.listChannels()
      .then((rows) => {
        const all = rows || [];
        // Only owned/connected YouTube destinations — i.e. accounts the
        // user has actually authenticated with via OAuth. Style profiles
        // without a connected token aren't valid download targets.
        const connected = all.filter((c) => c.connected === true);

        // Multiple style profiles can share one YT account (same OAuth
        // token). Dedupe so a single YT destination appears once,
        // labelled by its real YouTube channel title.
        const seen = new Map();
        for (const c of connected) {
          const key = c.youtube_channel_id || c.youtube_channel_title || `c${c.id}`;
          if (!seen.has(key)) seen.set(key, c);
        }
        const list = [...seen.values()];
        setChannels(list);

        // Default selection: every connected destination — server falls
        // back to a clean copy if no logo is configured for that account.
        setSelectedIds(new Set(list.map((c) => c.id)));
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

  // SEO download — fires one HTTP per selected channel so the user
  // gets per-channel composed SEO (with channel footer + mandatory
  // hashtags applied).  When no channel is selected, falls back to
  // a single generic SEO download keyed only on the clip.
  async function handleDownloadSeo() {
    if (!clip) return;
    setSeoStatus("running");
    setSeoError("");
    try {
      if (selectedCount === 0) {
        await api.downloadClipSeo(clip.id);
      } else {
        for (const channelId of selectedIds) {
          await api.downloadClipSeo(clip.id, { channelId });
        }
      }
      setSeoStatus("done");
      // Auto-clear the "done" badge after a moment so the modal looks
      // idle if the user wants to download again.
      setTimeout(() => setSeoStatus(null), 2500);
    } catch (e) {
      setSeoStatus("error");
      setSeoError(e.message || "SEO download failed");
    }
  }

  async function handleDownload() {
    if (selectedCount === 0 || !clip) return;
    setRunning(true);
    setTopError("");
    setPerCh({});
    lastProgressRef.current = {};

    const ids = [...selectedIds];
    // Sequential rather than parallel — the server's ffmpeg is single-
    // threaded per request and parallel would just queue at the backend.
    for (const channelId of ids) {
      const ch = channels.find((c) => c.id === channelId);
      const safeName = (ch?.name || `ch${channelId}`).replace(/[^A-Za-z0-9_-]/g, "_");
      const fname = `${safeName}_${clip.filename || `clip_${clip.id}.mp4`}`;
      setPerCh((s) => ({ ...s, [channelId]: { status: "downloading", pct: 0 } }));
      lastProgressRef.current[channelId] = { pct: 0, ts: Date.now() };
      try {
        await api.downloadWithLogo(clip.id, channelId, fname, (pct) => {
          // Throttled progress write — only commit state when:
          //  (a) the integer % moved, AND
          //  (b) THROTTLE_MS elapsed since the last commit on this channel,
          //  OR the download just hit 100% (always show the final tick).
          const next = pct < 0 ? -1 : pct;
          const prev = lastProgressRef.current[channelId] || { pct: -2, ts: 0 };
          const now  = Date.now();
          const stale = (now - prev.ts) >= THROTTLE_MS;
          if (next === prev.pct) return;
          if (!stale && next !== 100 && next !== -1) return;
          lastProgressRef.current[channelId] = { pct: next, ts: now };
          setPerCh((s) => ({
            ...s,
            [channelId]: { status: "downloading", pct: next },
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
          Pick the YouTube account(s) you want a branded copy for. Each
          variant will have that account&apos;s logo overlaid in the
          top-right (same look as the publish flow). Accounts without a
          configured logo will produce an unbranded copy.
        </p>

        {loadingCh ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center text-xs text-gray-500 py-6">
            You haven&apos;t connected a YouTube account yet.
            Authenticate one from the Style Profiles page first.
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
                    <div className="text-sm text-gray-200 truncate">
                      {c.youtube_channel_title || c.name || `Channel ${c.id}`}
                    </div>
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
            onClick={handleDownloadSeo}
            disabled={!clip || seoStatus === "running"}
            title={
              selectedCount > 0
                ? `Download SEO composed for ${selectedCount} selected channel${selectedCount === 1 ? "" : "s"} (one .txt each)`
                : "Download the generic SEO for this clip"
            }
            className="btn btn-secondary text-xs py-1.5 flex items-center gap-1.5"
          >
            {seoStatus === "running"
              ? <Loader2 size={12} className="animate-spin" />
              : seoStatus === "done"
                ? <Check size={12} className="text-green-400" />
                : <FileText size={12} />}
            {seoStatus === "running" ? "SEO…"
              : seoStatus === "done" ? "SEO saved"
              : selectedCount > 0 ? `SEO (${selectedCount})` : "SEO"}
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
        {seoStatus === "error" && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded p-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{seoError}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
