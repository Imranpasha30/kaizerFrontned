import React, { useEffect, useMemo, useState } from "react";
import {
  Youtube, Lock, Globe, Link as LinkIcon, Calendar,
  AlertCircle, CheckCircle2, Loader2, Layers, Clock,
  Clapperboard, Smartphone,
} from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";

/**
 * BulkPublishModal — publishes a set of clips to YouTube in ORDER, optionally
 * staggered by a fixed gap between publishes. Reuses the existing per-clip
 * `api.publishClip(clip_id, payload)` endpoint so the backend stays unchanged.
 *
 * Props
 *   open      : boolean
 *   onClose   : () => void
 *   clips     : ordered array of clip objects (must include id + seo)
 *   jobId     : number (for navigation / logs)
 *   onDone    : (results) => void    — fires with {ok, fail} counts
 */
export default function BulkPublishModal({ open, onClose, clips, jobId, onDone }) {
  const [channels, setChannels]               = useState([]);
  const [loadingCh, setLoadingCh]             = useState(false);
  const [selectedDests, setSelectedDests]     = useState(() => new Set());
  const [profileByDest, setProfileByDest]     = useState({});
  const [privacy, setPrivacy]                 = useState("private");
  const [useSeo, setUseSeo]                   = useState(true);
  const [publishKind, setPublishKind]         = useState("short");
  const [scheduleMode, setScheduleMode]       = useState("immediate"); // immediate | staggered
  const [gapMinutes, setGapMinutes]           = useState(30);
  const [firstPublishAt, setFirstPublishAt]   = useState("");         // ISO local when staggered
  const [submitting, setSubmitting]           = useState(false);
  const [progress, setProgress]               = useState({ done: 0, total: 0, failed: [] });
  const [error, setError]                     = useState("");

  // Kind heuristic: fall back to the majority clip kind in the selection.
  const defaultKind = useMemo(() => {
    if (!clips?.length) return "short";
    let short = 0, full = 0;
    for (const c of clips) {
      const plat = c?.meta?.platform || c?.meta?.preset?.key || "";
      if (plat === "youtube_full") full++;
      else if (plat === "youtube_short" || plat === "instagram_reel") short++;
      else if (Number(c?.duration || 0) > 60) full++;
      else short++;
    }
    return short >= full ? "short" : "video";
  }, [clips]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setPublishKind(defaultKind);
    setProgress({ done: 0, total: 0, failed: [] });
    setScheduleMode("immediate");
    setGapMinutes(30);
    // Default first publish = 5 minutes from now (staggered mode requires
    // privacy=private per YouTube; datetime-local uses local wall time)
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    setFirstPublishAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );

    setLoadingCh(true);
    api.listChannels()
      .then((rows) => {
        const list = (rows || []).filter((c) => c.connected);
        setChannels(list);
        // Group by YouTube destination; default-select ALL destinations +
        // map each to its first profile (same logic PublishModal uses).
        const groups = new Map();
        for (const c of list) {
          const key = c.youtube_channel_title || c.youtube_channel_id || `__p_${c.id}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(c);
        }
        const pbd = {};
        for (const [key, profs] of groups) pbd[key] = profs[0].id;
        setSelectedDests(new Set(groups.keys()));
        setProfileByDest(pbd);
      })
      .catch((e) => setError(e.message || "Failed to load channels"))
      .finally(() => setLoadingCh(false));
  }, [open, defaultKind]);

  const destinations = useMemo(() => {
    const groups = new Map();
    for (const c of channels) {
      const key = c.youtube_channel_title || c.youtube_channel_id || `__p_${c.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return Array.from(groups.entries());
  }, [channels]);

  const toggleDest = (key) => {
    setSelectedDests((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const channelIdsForSubmit = Array.from(selectedDests)
    .map((key) => profileByDest[key])
    .filter((id) => id != null);

  // SEO inheritance: if at least one clip in the selection has its own SEO,
  // use it as the "donor" for siblings that don't. Each clip publishes either
  // with its OWN SEO (preferred) or with the donor's SEO via the backend's
  // `seo_source_clip_id` parameter. Channel-related variant logic is left to
  // the backend's per-destination defaults — we just pick the donor here.
  const seoDonor = useMemo(
    () => clips?.find((c) => c?.seo?.title) || null,
    [clips]
  );
  // The set of clips we'll actually publish. Every clip publishes when at
  // least one sibling has SEO; otherwise the old "skip" behaviour applies.
  const publishableClips = useMemo(() => {
    if (!clips) return [];
    return seoDonor ? clips : [];
  }, [clips, seoDonor]);
  const inheritedClips = useMemo(
    () => publishableClips.filter((c) => !c?.seo?.title && seoDonor),
    [publishableClips, seoDonor]
  );

  // Estimated last publish time for the summary line
  const estimatedLast = useMemo(() => {
    if (scheduleMode !== "staggered" || !firstPublishAt) return null;
    try {
      const first = new Date(firstPublishAt);
      const last = new Date(first.getTime() + (publishableClips.length - 1) * gapMinutes * 60_000);
      return last;
    } catch { return null; }
  }, [scheduleMode, firstPublishAt, gapMinutes, publishableClips.length]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (channelIdsForSubmit.length === 0) {
      setError("Pick at least one YouTube destination.");
      return;
    }
    if (publishableClips.length === 0) {
      setError("None of the selected clips have SEO generated. Generate SEO on at least one clip in this job and try again.");
      return;
    }
    if (scheduleMode === "staggered" && privacy !== "private") {
      setError("Scheduled publishes require Privacy=Private. YouTube flips to public at publish_at.");
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: publishableClips.length, failed: [] });

    // Compute per-clip publish_at (null = immediate).
    const baseTime = scheduleMode === "staggered" ? new Date(firstPublishAt) : null;
    const results = { ok: [], failed: [] };

    // Serial so per-clip publish_at offsets are deterministic + backend
    // DB sees predictable ordering. Also kinder to YouTube API quota.
    for (let i = 0; i < publishableClips.length; i++) {
      const clip = publishableClips[i];
      const ownsSeo = !!clip?.seo?.title;
      const payload = {
        channel_ids:    channelIdsForSubmit.map(Number),
        privacy_status: privacy,
        use_seo:        useSeo,
        publish_kind:   publishKind,
      };
      // For clips without their own SEO, ask the backend to read SEO from
      // the donor sibling. The clip's own SEO still wins server-side when
      // present, so this only fires for inheritors.
      if (!ownsSeo && seoDonor && seoDonor.id !== clip.id) {
        payload.seo_source_clip_id = seoDonor.id;
      }
      if (baseTime) {
        const t = new Date(baseTime.getTime() + i * gapMinutes * 60_000);
        payload.publish_at = t.toISOString();
      }
      try {
        const res = await api.publishClip(clip.id, payload);
        results.ok.push({ clipId: clip.id, res });
      } catch (err) {
        results.failed.push({ clipId: clip.id, reason: err.message || String(err) });
      }
      setProgress((prev) => ({
        done:   prev.done + 1,
        total:  publishableClips.length,
        failed: results.failed.slice(),
      }));
    }

    setSubmitting(false);
    onDone?.(results);
    // Keep modal open briefly so user sees the final progress state,
    // then close if everything succeeded.
    if (results.failed.length === 0) {
      setTimeout(() => onClose?.(), 1200);
    }
  }

  if (!clips?.length) return null;

  const donorIdx = seoDonor
    ? clips.findIndex((c) => c.id === seoDonor.id)
    : -1;

  return (
    <Modal open={open} onClose={onClose} title={`Publish ${publishableClips.length} clips to YouTube`} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Clip ordering */}
        <section className="bg-black/30 border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500 mb-2">
            <Layers size={12} /> Clip order (first → last)
          </div>
          <ol className="text-xs space-y-1 max-h-40 overflow-y-auto pr-1">
            {clips.map((c, i) => {
              const hasSeo = !!c?.seo?.title;
              const inheritsFromDonor = !hasSeo && !!seoDonor;
              const isPublishing = hasSeo || inheritsFromDonor;
              return (
                <li
                  key={c.id}
                  className={`flex items-baseline gap-2 ${isPublishing ? "text-gray-200" : "text-gray-600 italic"}`}
                >
                  <span className="font-mono text-[10px] w-5 text-right">{i + 1}.</span>
                  <span className="flex-1 truncate" title={c?.seo?.title || c.filename}>
                    {c?.seo?.title || c.filename || `Clip ${c.id}`}
                  </span>
                  {hasSeo && (
                    <span className="text-[10px] text-green-400/80 flex-shrink-0">own SEO</span>
                  )}
                  {inheritsFromDonor && (
                    <span
                      className="text-[10px] text-accent2/80 flex-shrink-0"
                      title={`Will use SEO from clip #${donorIdx + 1}: ${seoDonor?.seo?.title || ""}`}
                    >
                      uses SEO from clip {donorIdx + 1}
                    </span>
                  )}
                  {!hasSeo && !seoDonor && (
                    <span className="text-[10px] text-amber-400 flex-shrink-0">skipped — no SEO</span>
                  )}
                </li>
              );
            })}
          </ol>
          {seoDonor && inheritedClips.length > 0 && (
            <p className="mt-2 text-[11px] text-accent2/80 flex items-start gap-1.5">
              <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" />
              {inheritedClips.length} clip{inheritedClips.length > 1 ? "s" : ""} will inherit SEO from clip #{donorIdx + 1}.
              Generate SEO on a specific clip to give it its own metadata.
            </p>
          )}
          {!seoDonor && (
            <p className="mt-2 text-[11px] text-amber-300/80 flex items-start gap-1.5">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
              No clip in this selection has SEO. Generate SEO on at least one — every other clip can then share it.
            </p>
          )}
        </section>

        {/* Destinations */}
        <section>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
            Publish to
          </div>
          {loadingCh ? (
            <div className="text-xs text-gray-500 italic">Loading channels…</div>
          ) : destinations.length === 0 ? (
            <div className="text-xs text-amber-300">
              No connected YouTube accounts. Connect one at /channels first.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {destinations.map(([key, profs]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 bg-black/30 border border-border rounded px-2.5 py-2 cursor-pointer hover:border-border-hover"
                >
                  <input
                    type="checkbox"
                    checked={selectedDests.has(key)}
                    onChange={() => toggleDest(key)}
                    className="accent-accent"
                  />
                  <Youtube size={13} className="text-red-400" />
                  <span className="text-xs text-white flex-1 truncate">{key}</span>
                  <span className="text-[10px] text-gray-500">
                    {profs.length} profile{profs.length > 1 ? "s" : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Privacy + kind */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block">Privacy</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              className="ui-input w-full"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5 block">Kind</label>
            <select
              value={publishKind}
              onChange={(e) => setPublishKind(e.target.value)}
              className="ui-input w-full"
            >
              <option value="short">Short (#Shorts)</option>
              <option value="video">Regular video</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-[12px] text-gray-300">
          <input
            type="checkbox"
            checked={useSeo}
            onChange={(e) => setUseSeo(e.target.checked)}
            className="accent-accent"
          />
          Use AI-generated SEO (title / description / tags) for each clip
        </label>

        {/* Schedule */}
        <section className="bg-black/30 border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-gray-500">
            <Clock size={12} /> Schedule
          </div>
          <div className="flex gap-2">
            <label className={`flex-1 text-center text-xs px-3 py-2 rounded border cursor-pointer ${
              scheduleMode === "immediate"
                ? "border-accent2 bg-accent/10 text-white"
                : "border-border text-gray-400"
            }`}>
              <input
                type="radio"
                name="sched"
                value="immediate"
                checked={scheduleMode === "immediate"}
                onChange={() => setScheduleMode("immediate")}
                className="hidden"
              />
              Publish all now
            </label>
            <label className={`flex-1 text-center text-xs px-3 py-2 rounded border cursor-pointer ${
              scheduleMode === "staggered"
                ? "border-accent2 bg-accent/10 text-white"
                : "border-border text-gray-400"
            }`}>
              <input
                type="radio"
                name="sched"
                value="staggered"
                checked={scheduleMode === "staggered"}
                onChange={() => { setScheduleMode("staggered"); setPrivacy("private"); }}
                className="hidden"
              />
              Staggered (in clip order)
            </label>
          </div>

          {scheduleMode === "staggered" && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">First publish at</label>
                <input
                  type="datetime-local"
                  value={firstPublishAt}
                  onChange={(e) => setFirstPublishAt(e.target.value)}
                  className="ui-input w-full !text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Gap between clips</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={gapMinutes}
                    onChange={(e) => setGapMinutes(Math.max(5, Number(e.target.value) || 5))}
                    className="ui-input w-full !text-xs"
                  />
                  <span className="text-[11px] text-gray-500">min</span>
                </div>
              </div>
              {estimatedLast && (
                <p className="col-span-2 text-[11px] text-gray-500">
                  Last clip publishes at <span className="text-accent2">{estimatedLast.toLocaleString()}</span>
                  {" "}({publishableClips.length} clips × {gapMinutes} min gap).
                </p>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-2">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Progress */}
        {submitting && (
          <div className="bg-black/50 border border-border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-gray-300 mb-2">
              <Loader2 size={12} className="animate-spin text-accent2" />
              Publishing {progress.done} / {progress.total}…
            </div>
            <div className="h-1.5 bg-border rounded overflow-hidden">
              <div
                className="h-full bg-accent2 transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            {progress.failed.length > 0 && (
              <p className="text-[11px] text-red-300 mt-1.5">
                {progress.failed.length} failure{progress.failed.length > 1 ? "s" : ""} — will be listed after.
              </p>
            )}
          </div>
        )}

        {!submitting && progress.total > 0 && (
          <div className="bg-black/50 border border-border rounded-lg p-3 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={13} className="text-green-400" />
              <span className="text-green-300 font-medium">
                {progress.done - progress.failed.length} published, {progress.failed.length} failed
              </span>
            </div>
            {progress.failed.length > 0 && (
              <ul className="mt-1 text-[11px] text-red-300 space-y-0.5">
                {progress.failed.map((f) => (
                  <li key={f.clipId} className="truncate">Clip #{f.clipId}: {f.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary text-xs inline-flex items-center gap-1.5"
            disabled={submitting || loadingCh || publishableClips.length === 0}
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
            Publish {publishableClips.length} clip{publishableClips.length > 1 ? "s" : ""}
          </button>
        </div>
      </form>
    </Modal>
  );
}
