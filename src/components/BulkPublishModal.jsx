import React, { useEffect, useMemo, useState } from "react";
import {
  Youtube, Lock, Globe, Link as LinkIcon, Calendar,
  AlertCircle, CheckCircle2, Loader2, Layers, Clock,
  Clapperboard, Smartphone,
} from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";
import PostizCrossPostSection, { matchChannelForIntegration } from "./PostizCrossPostSection";
import { buildSeoCaption } from "./PublishModal";
import { useAuth } from "../auth/AuthProvider";

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
  const { user } = useAuth();
  // Admin-only Postiz cross-post — same component as the single-clip panel.
  // Each ticked Postiz channel receives every publishable clip (branded if
  // name-matched to one of our channels, else raw video + full SEO).
  const [postizState, setPostizState] = useState({ selectedIds: new Set(), text: "", integrations: [] });
  const [channels, setChannels]               = useState([]);
  const [loadingCh, setLoadingCh]             = useState(false);
  const [selectedDests, setSelectedDests]     = useState(() => new Set());
  const [profileByDest, setProfileByDest]     = useState({});
  const [privacy, setPrivacy]                 = useState("private");
  const [useSeo, setUseSeo]                   = useState(true);
  // publish_kind is now derived PER CLIP via kindForClip(c) at submit
  // time — bulletin → "video", everything else → "short". The KIND
  // dropdown was removed because a single value over a mixed batch
  // (5 Shorts + 1 bulletin) always uploaded one bucket at the wrong
  // aspect.
  const [scheduleMode, setScheduleMode]       = useState("immediate"); // immediate | staggered
  const [gapMinutes, setGapMinutes]           = useState(30);
  const [firstPublishAt, setFirstPublishAt]   = useState("");         // ISO local when staggered
  // ── Per-channel upload route ────────────────────────────────────
  // The upload method (native YouTube / Postiz / RTMP-live) is a
  // PER-CHANNEL decision, keyed by channel id-as-string. Each row's
  // "auto" means "use this channel's saved default" — the backend
  // resolves "" → Channel.upload_provider → account → system default.
  // (Per-clip and whole-batch overrides were removed: the channel
  // owns how its content is posted, not each clip or the whole batch.)
  const [providerByChannel, setProviderByChannel] = useState({});

  // Branding mode for the whole batch — matches the single-clip panel:
  //   per_channel → overlay each channel's logo+watermark at upload (default)
  //   as_is       → clips are already branded → upload verbatim to all
  const [brandMode, setBrandMode]             = useState("per_channel");
  const [submitting, setSubmitting]           = useState(false);
  const [progress, setProgress]               = useState({ done: 0, total: 0, failed: [] });
  const [error, setError]                     = useState("");
  // Friendly "already published" summary (dedupe-by-design) so a no-op
  // batch doesn't look broken.
  const [notice, setNotice]                   = useState("");
  // Explicit per-clip kind override { [clipId]: "video" | "short" }.
  // Auto-detection (kindForClip) occasionally mis-reads a Short as a
  // full video; clicking the kind badge in the clip-order list flips it
  // so the user can fix any wrong interpretation before publishing.
  const [kindOverrides, setKindOverrides]     = useState({});
  // Per-channel already-published status for the clips in this batch:
  // { "<channel_id>": { count, clip_ids, video_ids } }. Drives the
  // "already posted" badge + auto-deselect of fully-done channels.
  const [publishedByChannel, setPublishedByChannel] = useState({});
  // True when we narrowed the default selection to the channel(s) this batch
  // was targeted / edited for — drives a small "pre-selected" note.
  const [autoTargeted, setAutoTargeted] = useState(false);

  // Per-clip kind detection. Bulletin clips are 16:9 long-form → YouTube
  // "Regular video"; everything else is 9:16 vertical → YouTube Short
  // (#Shorts). Compound jobs (Full Video + Shorts) produce mixed lists,
  // so we MUST decide per-clip — a single dropdown over the whole batch
  // forces wrong-aspect uploads either way.
  function kindForClip(c) {
    if (!c) return "short";
    if ((c.frame_type || "").toLowerCase() === "bulletin") return "video";
    const plat = c?.meta?.platform || c?.meta?.preset?.key || "";
    if (plat === "youtube_full") return "video";
    if (plat === "youtube_short" || plat === "instagram_reel") return "short";
    // Last-resort heuristic: anything > 60s is probably a long-form.
    return Number(c?.duration || 0) > 60 ? "video" : "short";
  }

  // The kind actually used — an explicit user override wins over the
  // auto-detection. This is what the submit loop + summary read.
  function effectiveKind(c) {
    if (!c) return "short";
    return kindOverrides[c.id] || kindForClip(c);
  }

  // Flip a single clip between Short and Video (user fixing a wrong
  // auto-detection). Stored by clip id so it survives re-renders.
  function toggleKind(c) {
    if (!c) return;
    const next = effectiveKind(c) === "video" ? "short" : "video";
    setKindOverrides((prev) => ({ ...prev, [c.id]: next }));
  }

  // Used only for the "auto-detected mix" summary copy at the bottom
  // of the modal. The actual submit loop calls effectiveKind per row.
  const kindMix = useMemo(() => {
    let short = 0, video = 0;
    for (const c of (clips || [])) {
      if (effectiveKind(c) === "video") video++; else short++;
    }
    return { short, video };
  }, [clips, kindOverrides]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setProgress({ done: 0, total: 0, failed: [] });
    setPostizState({ selectedIds: new Set(), text: "", integrations: [] });
    setScheduleMode("immediate");
    setGapMinutes(30);
    // Default first publish = 5 minutes from now (staggered mode requires
    // privacy=private per YouTube; datetime-local uses local wall time)
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    setFirstPublishAt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );

    setAutoTargeted(false);
    setLoadingCh(true);
    const clipIds = (clips || []).map((c) => c.id).filter((x) => x != null);
    Promise.all([
      api.listChannels(),
      // Best-effort: which channels already have these clips. Never block
      // publishing if this lookup fails — just skip the badges.
      clipIds.length
        ? api.clipsPublishedStatus(clipIds).catch(() => ({ by_channel: {}, clip_count: 0 }))
        : Promise.resolve({ by_channel: {}, clip_count: 0 }),
      // The job's "Choose channels" selection (generate step) — used to
      // pre-select only the targeted destination(s). Best-effort: null on
      // failure → falls back to the existing select-all-minus-posted default.
      jobId ? api.getJob(jobId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([rows, pub, job]) => {
        const list = (rows || []).filter((c) => c.connected);
        setChannels(list);
        const byChannel = (pub && pub.by_channel) || {};
        setPublishedByChannel(byChannel);
        const clipCount = (pub && pub.clip_count) || clipIds.length;
        // Group by YouTube destination; map each to its first profile.
        const groups = new Map();
        for (const c of list) {
          const key = c.youtube_channel_title || c.youtube_channel_id || `__p_${c.id}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(c);
        }
        const pbd = {};
        for (const [key, profs] of groups) pbd[key] = profs[0].id;
        // Default-select every destination EXCEPT the ones that already
        // have ALL of this batch's clips (fully redundant) — so the user
        // proceeds with the new channels by default. They can re-check a
        // posted channel to force it (the backend still skips true dupes).
        let keep = Array.from(groups.keys()).filter((key) => {
          const info = byChannel[String(pbd[key])];
          const fullyPosted = info && clipCount > 0 && info.count >= clipCount;
          return !fullyPosted;
        });
        // "Publish what I targeted/edited": narrow the default to the
        // channel(s) this batch was made for — the job's "Choose channels"
        // selection ∪ any per-clip per-channel SEO edits. Only narrows when
        // that signal maps to a connected, not-fully-posted destination;
        // otherwise the select-all-minus-posted default stands (back-compat).
        const wantIds = new Set();
        let tids = job?.target_channel_ids;
        if (typeof tids === "string") { try { tids = JSON.parse(tids); } catch { tids = []; } }
        if (Array.isArray(tids)) {
          for (const t of tids) { const n = Number(t); if (!Number.isNaN(n)) wantIds.add(n); }
        }
        for (const c of (clips || [])) {
          const sv = c?.seo_variants;
          if (sv && typeof sv === "object") {
            for (const k of Object.keys(sv)) { const n = Number(k); if (!Number.isNaN(n)) wantIds.add(n); }
          }
        }
        if (wantIds.size > 0) {
          const targeted = keep.filter((key) =>
            (groups.get(key) || []).some((p) => wantIds.has(p.id))
          );
          if (targeted.length > 0 && targeted.length < keep.length) {
            keep = targeted;
            setAutoTargeted(true);
          }
        }
        setSelectedDests(new Set(keep));
        setProfileByDest(pbd);
      })
      .catch((e) => setError(e.message || "Failed to load channels"))
      .finally(() => setLoadingCh(false));
  }, [open]);

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
    setAutoTargeted(false);
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
    setNotice("");
    const postizCount = user?.is_admin ? postizState.selectedIds.size : 0;
    if (channelIdsForSubmit.length === 0 && postizCount === 0) {
      setError("Pick at least one YouTube destination or Postiz channel.");
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
    const results = { ok: [], failed: [], duplicate: [] };

    // Admin-only Postiz delivery for ONE clip. Branded lane (name-matched →
    // full pipeline + logo/watermark/SEO via upload_provider=postiz, with the
    // explicit live integration id) + raw lane (unmatched → verbatim video +
    // full SEO caption). Soft-fails; returns the count of FAILED lanes.
    const _publishPostizForClip = async (clip, publishAtISO) => {
      if (!(user?.is_admin && postizState.selectedIds.size > 0)) return 0;
      const selectedIntegrations = (postizState.integrations || []).filter(
        (it) => postizState.selectedIds.has(it.id)
      );
      const brandedChannelIds = [];
      const brandedBinding = {};
      const rawIntegrationIds = [];
      for (const integ of selectedIntegrations) {
        const m = matchChannelForIntegration(integ, channels);
        if (m) { brandedChannelIds.push(m.id); brandedBinding[String(m.id)] = integ.id; }
        else rawIntegrationIds.push(integ.id);
      }
      const ownsSeo = !!clip?.seo?.title;
      let failed = 0;
      if (brandedChannelIds.length > 0) {
        try {
          const p = {
            channel_ids: brandedChannelIds.map(Number),
            upload_provider: "postiz",
            postiz_integration_by_channel: brandedBinding,
            privacy_status: privacy,
            use_seo: useSeo,
            publish_kind: effectiveKind(clip),
            brand_mode: brandMode || "per_channel",
          };
          if (!ownsSeo && seoDonor && seoDonor.id !== clip.id) p.seo_source_clip_id = seoDonor.id;
          if (publishAtISO) p.publish_at = publishAtISO;
          await api.publishClip(clip.id, p);
        } catch (e) { failed += 1; console.warn("bulk branded Postiz failed:", e); }
      }
      if (rawIntegrationIds.length > 0) {
        try {
          const mediaUrl = clip.storage_url || (clip.video_url ? api.mediaUrl(clip.video_url) : "");
          await api.postizSchedule({
            integration_ids: rawIntegrationIds,
            text: postizState.text || buildSeoCaption(clip) || (clip?.seo?.title || ""),
            media_url: mediaUrl,
            type: publishAtISO ? "scheduled" : "now",
            schedule_at_iso: publishAtISO || null,
          });
        } catch (e) { failed += 1; console.warn("bulk raw Postiz failed:", e); }
      }
      return failed;
    };

    // Serial so per-clip publish_at offsets are deterministic + backend
    // DB sees predictable ordering. Also kinder to YouTube API quota.
    for (let i = 0; i < publishableClips.length; i++) {
      const clip = publishableClips[i];
      const ownsSeo = !!clip?.seo?.title;
      // Per-clip schedule time (null = immediate); shared by YT + Postiz lanes.
      const publishAtISO = baseTime
        ? new Date(baseTime.getTime() + i * gapMinutes * 60_000).toISOString()
        : null;

      // ── Native YouTube lane (only when YT destinations are selected) ──
      if (channelIdsForSubmit.length > 0) {
        const payload = {
          channel_ids:    channelIdsForSubmit.map(Number),
          privacy_status: privacy,
          use_seo:        useSeo,
          // Per-clip kind: bulletin → "video", else → "short". Explicit
          // per-clip override (kind badge click) wins over auto-detection.
          publish_kind:   effectiveKind(clip),
          // per_channel → overlay logo+watermark | as_is → upload verbatim
          brand_mode:     brandMode || "per_channel",
        };
        // Inheritors read SEO from the donor sibling; own SEO still wins server-side.
        if (!ownsSeo && seoDonor && seoDonor.id !== clip.id) {
          payload.seo_source_clip_id = seoDonor.id;
        }
        if (publishAtISO) payload.publish_at = publishAtISO;
        // Per-channel upload route — send only explicit non-auto choices.
        const upbc = {};
        for (const cid of channelIdsForSubmit.map(Number)) {
          const perCh = providerByChannel[cid] || "";
          if (perCh) upbc[String(cid)] = perCh;
        }
        if (Object.keys(upbc).length > 0) payload.upload_provider_by_channel = upbc;
        try {
          const res = await api.publishClip(clip.id, payload);
          if (res?.already_published) results.duplicate.push({ clipId: clip.id, res });
          else results.ok.push({ clipId: clip.id, res });
        } catch (err) {
          results.failed.push({ clipId: clip.id, reason: err.message || String(err) });
        }
      }

      // ── Admin-only Postiz lane (additive on top of YT; soft-fails) ──
      const pzFailed = await _publishPostizForClip(clip, publishAtISO);
      if (pzFailed > 0 && channelIdsForSubmit.length === 0) {
        // Postiz-only mode: surface the lane failure so the summary reflects it.
        results.failed.push({ clipId: clip.id, reason: `Postiz delivery failed (${pzFailed} lane(s))` });
      }

      setProgress((prev) => ({
        done:   prev.done + 1,
        total:  publishableClips.length,
        failed: results.failed.slice(),
      }));
    }

    setSubmitting(false);
    onDone?.(results);
    // Channels skipped per clip because that exact (clip, channel,
    // version) was already published — the publish still went through for
    // the NEW channels. Surface the count so a partial publish doesn't
    // look like it ignored anything.
    const skippedChannels = results.ok.reduce(
      (s, r) => s + (Number(r.res?.skipped_already_published) || 0), 0,
    );
    // Surface a clear "already published" summary so a batch that was
    // mostly/entirely deduped doesn't look like nothing happened.
    if (results.duplicate.length > 0) {
      const d = results.duplicate.length;
      const n = results.ok.length;
      setNotice(
        `${d} clip${d !== 1 ? "s were" : " was"} already published with these ` +
        `exact settings (no new upload created)` +
        (n > 0 ? `; ${n} newly queued.` : `.`) +
        (skippedChannels > 0 ? ` ${skippedChannels} channel(s) skipped (already had this version).` : ``) +
        ` Change SEO / privacy / thumbnail to publish a new version.`
      );
    } else if (skippedChannels > 0) {
      // Partial publish: new channels uploaded, some already had it.
      setNotice(
        `Published to the new channel(s). ${skippedChannels} channel(s) were ` +
        `skipped — they already had this clip at this version.`
      );
    }
    // Auto-close only on a fully clean run (no failures, no dedupe, no
    // per-channel skips) so the user always sees why something was a no-op.
    if (results.failed.length === 0 && results.duplicate.length === 0 && skippedChannels === 0) {
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
              const clipKind = effectiveKind(c);   // "short" | "video"
              const overridden = !!kindOverrides[c.id] && kindOverrides[c.id] !== kindForClip(c);
              return (
                <li
                  key={c.id}
                  className={`flex items-baseline gap-2 ${isPublishing ? "text-gray-200" : "text-gray-600 italic"}`}
                >
                  <span className="font-mono text-[10px] w-5 text-right">{i + 1}.</span>
                  <span className="flex-1 truncate" title={c?.seo?.title || c.filename}>
                    {c?.seo?.title || c.filename || `Clip ${c.id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleKind(c)}
                    className={`text-[10px] flex-shrink-0 px-1.5 py-px rounded-full font-medium uppercase tracking-wide cursor-pointer transition hover:brightness-125 ${
                      clipKind === "video"
                        ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                        : "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                    } ${overridden ? "ring-1 ring-white/50" : ""}`}
                    title={
                      (clipKind === "video"
                        ? "16:9 long-form — publishes as a regular YouTube video."
                        : "9:16 vertical — publishes as a YouTube Short (#Shorts).")
                      + ` Click to switch to ${clipKind === "video" ? "Short" : "Video"}.`
                      + (overridden ? " (manually set)" : "")
                    }
                  >
                    {clipKind}{overridden ? " ✎" : ""}
                  </button>
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
                  {/* Upload route is NOT chosen per clip — it's decided
                      per channel in the "Publish to" list below. */}
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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wider text-gray-500">
              Publish to
            </span>
            {destinations.length > 1 && (
              <span className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => { setAutoTargeted(false); setSelectedDests(new Set(destinations.map(([k]) => k))); }}
                  className="text-accent2 hover:text-white"
                >
                  Select all
                </button>
                <span className="text-gray-700">·</span>
                <button
                  type="button"
                  onClick={() => { setAutoTargeted(false); setSelectedDests(new Set()); }}
                  className="text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              </span>
            )}
            {destinations.length > 0 && (
              <span className="ml-auto text-[10px] text-gray-600">
                {selectedDests.size}/{destinations.length} selected
              </span>
            )}
          </div>
          {autoTargeted && (
            <div className="mb-2 text-[10px] text-accent2/90 bg-accent2/10 border border-accent2/30 rounded px-2 py-1.5 flex items-start gap-1.5">
              <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" />
              <span>
                Pre-selected the channel(s) this batch was made / edited for.
                Use <strong>Select all</strong> to publish everywhere instead.
              </span>
            </div>
          )}
          {loadingCh ? (
            <div className="text-xs text-gray-500 italic">Loading channels…</div>
          ) : destinations.length === 0 ? (
            <div className="text-xs text-amber-300">
              No connected YouTube accounts. Connect one at /channels first.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {destinations.map(([key, profs]) => {
                // Resolve the channel.id that this destination maps to.
                // profileByDest gives us the primary profile id —
                // which lines up with Channel.id in the DB.
                const chIdRaw = profileByDest[key];
                const chId    = chIdRaw ? Number(chIdRaw) : null;
                const selected = selectedDests.has(key);
                // Real YouTube identity for this destination, cached at
                // OAuth time. Falls back to the red YT icon if missing.
                const ytAvatar = profs.find((p) => p.youtube_channel_thumbnail_url)?.youtube_channel_thumbnail_url || "";
                const ytHandle = profs.find((p) => p.youtube_channel_custom_url)?.youtube_channel_custom_url || "";
                // Already-published status for THIS destination's channel.
                const posted       = chId != null ? publishedByChannel[String(chId)] : null;
                const totalClips   = publishableClips.length;
                const fullyPosted  = posted && totalClips > 0 && posted.count >= totalClips;
                const partlyPosted = posted && posted.count > 0 && !fullyPosted;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 bg-black/30 border rounded px-2.5 py-2 hover:border-border-hover ${
                      fullyPosted ? "border-green-900/50" : "border-border"
                    }`}
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleDest(key)}
                        className="accent-accent"
                      />
                      {ytAvatar ? (
                        <img
                          src={ytAvatar}
                          alt=""
                          className="w-5 h-5 rounded-full flex-shrink-0 object-cover border border-border"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <Youtube size={13} className="text-red-400" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="text-xs text-white block truncate">{key}</span>
                        {ytHandle && (
                          <span className="text-[10px] text-gray-500 block truncate">youtube.com/{ytHandle}</span>
                        )}
                      </span>
                      {posted && posted.count > 0 && (
                        <span
                          className={`text-[10px] flex-shrink-0 px-1.5 py-px rounded-full font-medium ${
                            fullyPosted
                              ? "bg-green-500/15 text-green-300 border border-green-500/40"
                              : "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                          }`}
                          title={
                            fullyPosted
                              ? "Already published to this channel — unchecked by default. Re-check to force (a true duplicate is still skipped)."
                              : `${posted.count} of ${totalClips} clip(s) already on this channel; the rest will publish.`
                          }
                        >
                          {fullyPosted ? "✓ posted" : `${posted.count}/${totalClips} posted`}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {profs.length} profile{profs.length > 1 ? "s" : ""}
                      </span>
                    </label>
                    {/* ── How THIS channel posts ───────────────
                         The upload method is a per-channel choice.
                         "auto" = the channel's saved default
                         (Channel.upload_provider → account → system),
                         resolved server-side. */}
                    {selected && chId != null && (
                      <select
                        value={providerByChannel[chId] || ""}
                        onChange={(e) =>
                          setProviderByChannel((prev) => ({
                            ...prev,
                            [chId]: e.target.value,
                          }))
                        }
                        className="text-[10px] bg-black/40 border border-border rounded px-1 py-0.5 text-gray-300"
                        title="How this channel posts — its saved default, or override just for this channel"
                      >
                        <option value="">auto · channel default</option>
                        <option value="kaizer">native</option>
                        <option value="postiz">postiz</option>
                        <option value="native_rtmp">rtmp-live</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Upload route is per-channel (set on each row above). This
            note just explains what the options mean. */}
        <p className="text-[11px] text-gray-500">
          <strong className="text-gray-400">Each channel posts its own way</strong> —
          set the route on its row above, or leave it <em>auto</em> to use
          that channel's saved default.
          <br />
          <strong className="text-gray-400">native</strong> = direct YouTube
          upload (best quality, ~1,600 quota units).
          {" "}<strong className="text-gray-400">rtmp-live</strong> saves ~6×
          quota (~250 units) but streams in real-time and appears as a
          "past stream" — still public, monetisable, and in the subscriber feed.
        </p>

        {/* Privacy. (Kind is auto-detected per clip — see the order list
            above; bulletin → Regular video, everything else → Short.) */}
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
          {(kindMix.short > 0 && kindMix.video > 0) ? (
            <p className="text-[11px] text-gray-500 mt-1.5">
              <span className="text-gray-300">Kind: auto-detected per clip</span> —
              <span className="text-accent2"> {kindMix.short} Short{kindMix.short === 1 ? "" : "s"}</span> +
              <span className="text-accent2"> {kindMix.video} Regular video{kindMix.video === 1 ? "" : "s"}</span>.
              <span className="text-gray-400"> Wrong? Click a clip's Short/Video badge above to fix it.</span>
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 mt-1.5">
              Kind: all <span className="text-gray-300">{kindMix.video > 0 ? "Regular video" : "Short (#Shorts)"}</span> — auto-detected from clip frame layout.
              <span className="text-gray-400"> Wrong? Click a clip's badge above to switch it.</span>
            </p>
          )}
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

        {/* Branding — same choice as the single-clip panel, applied to the
            whole batch. */}
        <section className="bg-black/30 border border-border rounded-lg p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Branding</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBrandMode("per_channel")}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                brandMode === "per_channel"
                  ? "border-accent/70 bg-accent/5"
                  : "border-border hover:border-border-hover"
              }`}
            >
              <div className="text-[12px] font-medium text-gray-200">Apply my channel branding</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Adds each channel's logo + watermark + social links at upload.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setBrandMode("as_is")}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                brandMode === "as_is"
                  ? "border-accent/70 bg-accent/5"
                  : "border-border hover:border-border-hover"
              }`}
            >
              <div className="text-[12px] font-medium text-gray-200">Clips already have my logo/watermark</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Publishes each clip as-is to every channel — no overlay added.
              </div>
            </button>
          </div>
        </section>

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

        {/* Postiz cross-post — admin-only, same component as the single-clip
            panel. Every publishable clip is delivered to the ticked Postiz
            channels (branded if name-matched, else raw video + full SEO). */}
        {user?.is_admin && (
          <PostizCrossPostSection
            value={postizState}
            onChange={setPostizState}
            defaultText={buildSeoCaption(seoDonor) || seoDonor?.seo?.title || ""}
            channels={channels}
          />
        )}

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded p-2">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-950/40 border border-amber-800/60 rounded p-2">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
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
