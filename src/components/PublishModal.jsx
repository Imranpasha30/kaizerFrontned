import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link as RLink } from "react-router-dom";
import {
  Youtube, Lock, Globe, Link as LinkIcon, Calendar,
  AlertCircle, CheckCircle2, Loader2, Sparkles, Smartphone, Clapperboard,
} from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";
import PostizCrossPostSection, { matchChannelForIntegration } from "./PostizCrossPostSection";
import { useAuth } from "../auth/AuthProvider";

// Compose a FULL social caption from a clip's SEO — title + description +
// hashtags. Used for RAW Postiz posts (no style profile to brand with) so
// "SEO is compulsory" still holds: the post always carries the complete SEO,
// not just the title. Branded Postiz posts don't use this — the backend
// pipeline applies the channel's SEO + branding itself.
export function buildSeoCaption(clip) {
  const seo = clip?.seo || {};
  const parts = [];
  if (seo.title) parts.push(String(seo.title).trim());
  if (seo.description) parts.push(String(seo.description).trim());
  const tags = seo.tags || seo.hashtags || seo.keywords || [];
  if (Array.isArray(tags) && tags.length) {
    const hashed = tags
      .map((t) => String(t).trim().replace(/^#/, "").replace(/\s+/g, ""))
      .filter(Boolean)
      .map((t) => `#${t}`)
      .join(" ");
    if (hashed) parts.push(hashed);
  }
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Publish-to-YouTube modal.
 * Props:
 *   open        - boolean
 *   onClose     - () => void
 *   clip        - { id, seo?, channel_id?, filename? }
 *   jobId       - used for "Edit this clip" deep link
 *   onPublished - (uploadJob) => void  (parent can navigate to /uploads)
 */
// Admin-only comparison/cross-post tools ("Upload via (override)" + "Cross-post
// via Postiz"). Hidden by default to keep the publish panel clean; flip to true
// to bring them back without restoring any deleted code.
const SHOW_PUBLISH_ADMIN_TOOLS = false;

export default function PublishModal({ open, onClose, clip, jobId, onPublished }) {
  const { user } = useAuth();
  // Branding mode owned by the panel itself so EVERY surface (Jobs, Quick
  // Publish, Canvas, clip cards) gets the same control:
  //   per_channel → overlay each channel's logo+watermark+socials at upload
  //   as_is       → video already branded; upload verbatim to all channels
  const [brandMode, setBrandMode] = useState("per_channel");
  const [brandPlacement, setBrandPlacement] = useState("template");
  // Admin-only Postiz cross-post state. Holds the set of Postiz
  // integration IDs the admin ticked plus the caption to send. Empty
  // for non-admins (the section never renders) and ignored otherwise.
  const [postizState, setPostizState] = useState({
    selectedIds: new Set(),
    text: "",
  });
  // Active upload provider — visible to every authenticated user as a
  // small banner so they understand whether their click hits Postiz or
  // our native YouTube path. Read-only here; admins flip it from
  // /admin/settings.
  const [activeProvider, setActiveProvider] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loadingCh, setLoadingCh] = useState(false);
  // channelId = "primary" profile used for SEO + style; still needed for the
  // single-target path.  selectedIds = full set of profiles to fan out to.
  const [channelId, setChannelId] = useState("");
  // One entry per unique YouTube destination (not per profile) — prevents
  // accidentally uploading the same video N times to the same YT account.
  const [selectedDests, setSelectedDests] = useState(() => new Set());
  const [profileByDest, setProfileByDest] = useState({});
  // Meta (Facebook / Instagram) destinations — kept as an isolated section so
  // they never tangle with the YouTube preset/SEO-variant machinery. Empty +
  // hidden when no Meta accounts are configured.
  const [metaAccounts, setMetaAccounts] = useState([]);
  const [selectedMeta, setSelectedMeta] = useState(() => new Set());
  const [privacy, setPrivacy] = useState("private");
  const [publishAt, setPublishAt] = useState("");
  const [useSeo, setUseSeo] = useState(true);
  // "short" appends #Shorts to the title/description so YouTube's classifier
  // picks the clip up. Default precedence:
  //   1. frame_type === "bulletin" → "video" (16:9 long-form bulletins)
  //   2. clip.meta.platform        → youtube_full | youtube_short | instagram_reel
  //   3. duration heuristic        → ≤60s → short, else video
  const defaultKind = useMemo(() => {
    if ((clip?.frame_type || "").toLowerCase() === "bulletin") return "video";
    const plat = clip?.meta?.platform || clip?.meta?.preset?.key || "";
    const dur  = Number(clip?.duration || 0);
    if (plat === "youtube_full") return "video";
    if (plat === "youtube_short" || plat === "instagram_reel") return "short";
    // Fallback heuristic: ≤60s = short
    return dur > 0 && dur <= 60 ? "short" : "video";
  }, [clip]);
  const [publishKind, setPublishKind] = useState(defaultKind);
  // SEO variant to use for the upload(s).  "" / "auto" = let the backend
  // auto-match each destination to its own style profile's variant.  A
  // specific channel_id = force that variant on every destination.
  const [seoVariantOverride, setSeoVariantOverride] = useState("auto");
  // Per-destination variant overrides: { "<dest_channel_id>": <variant_channel_id> }
  // Lets each selected YouTube destination use a different SEO variant.
  const [variantByDest, setVariantByDest] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Non-error "already published" notice (dedupe-by-design) — shown in a
  // friendly amber banner so the user knows the no-op was intentional,
  // not a broken publish.
  const [notice, setNotice] = useState("");
  // SEO inheritance: pick a sibling clip in the same job whose SEO will
  // be used for this upload. Empty string = use this clip's own SEO.
  const [siblings, setSiblings] = useState([]);
  const [donorClipId, setDonorClipId] = useState("");
  // Per-publish upload route override.  "" = let the backend resolve
  // via Channel.upload_provider → system default.  Otherwise force
  // every destination on THIS publish to the chosen path. Useful
  // for side-by-side comparison runs.
  const [publishProvider, setPublishProvider] = useState("");

  // Publish presets: "global" | "individual" | "<group_id>"
  // - global   = every connected YT account auto-selected (default)
  // - individual = user ticks/unticks each destination manually
  // - <group_id> = only destinations in that named group
  const [preset, setPreset] = useState("global");
  const [groups, setGroups] = useState([]);
  // Channels chosen for THIS clip/job at generate time ("Choose channels"
  // step). Folded into the auto-preselect below alongside per-channel SEO
  // edits, so "publish what I edited/targeted" is one click. [] when absent.
  const [jobTargetIds, setJobTargetIds] = useState([]);
  // True once we've auto-narrowed the destination list to the edited/targeted
  // channel(s) — drives a small "pre-selected for you" note so the operator
  // can SEE the feature fired (and verify it on a real publish).
  const [autoPreselected, setAutoPreselected] = useState(false);
  // Flipped the moment the user touches the destination selection (toggle,
  // preset, select-all/clear) so the auto-preselect effect stops fighting a
  // deliberate manual choice when the job's target list resolves a beat later.
  const destsTouchedRef = useRef(false);

  const hasSeo = !!(clip && clip.seo && clip.seo.title);
  const variantMap = (clip?.seo_variants && typeof clip.seo_variants === "object")
    ? clip.seo_variants : {};
  const variantList = Object.entries(variantMap).map(([cid, v]) => ({
    channelId: Number(cid),
    score: Number(v?.seo_score || 0),
    title: v?.title || "",
  }));
  const bestVariant = variantList.length
    ? [...variantList].sort((a, b) => b.score - a.score)[0]
    : null;

  // Fetch the active upload provider once on open. Cheap (1 GET); only
  // fires when the modal opens, not on every render.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api.getActiveUploadProvider()
      .then((d) => { if (alive) setActiveProvider(d?.upload_provider || "postiz"); })
      .catch(() => { if (alive) setActiveProvider("postiz"); });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSubmitting(false);
    setUseSeo(hasSeo);
    setPublishKind(defaultKind);
    // Autonomous default: when variants exist, pre-select the highest score.
    // User can still switch to "auto (per destination)" or another variant.
    if (bestVariant) {
      setSeoVariantOverride(String(bestVariant.channelId));
    } else {
      setSeoVariantOverride("auto");
    }
    // Reset per-destination map — will be filled by the effect below once
    // the list of destinations is computed.
    setVariantByDest({});

    // Load the user's named publish presets — shows up as preset buttons.
    api.listChannelGroups().then(setGroups).catch(() => setGroups([]));
    setPreset("global");
    setPublishProvider("");

    // Reset auto-preselect bookkeeping each open so a fresh modal recomputes
    // from scratch (and a previous manual override doesn't leak across opens).
    setJobTargetIds([]);
    setAutoPreselected(false);
    destsTouchedRef.current = false;

    // Load sibling clips so user can borrow another clip's SEO.
    setDonorClipId("");
    setSiblings([]);
    if (jobId) {
      api.getJob(jobId)
        .then((job) => {
          const others = (job?.clips || []).filter(
            (c) => c.id !== clip?.id && c?.seo && c.seo.title
          );
          setSiblings(others);
          // Channels the user picked at "Choose channels" (generate step).
          // Serializer returns a parsed array; tolerate a raw JSON string too.
          let tids = job?.target_channel_ids;
          if (typeof tids === "string") {
            try { tids = JSON.parse(tids); } catch { tids = []; }
          }
          setJobTargetIds(
            Array.isArray(tids)
              ? tids.map(Number).filter((n) => !Number.isNaN(n))
              : []
          );
        })
        .catch(() => { setSiblings([]); setJobTargetIds([]); });
    }

    setLoadingCh(true);
    api.listChannels()
      .then((rows) => {
        const list = rows || [];
        setChannels(list);
        const connected = list.filter((c) => c.connected);
        const preferred =
          connected.find((c) => c.id === clip?.channel_id) ||
          connected.find((c) => c.id === clip?.seo?.channel_id) ||
          connected[0];
        const preferredId = preferred ? String(preferred.id) : "";
        setChannelId(preferredId);

        // Build one entry per unique destination.
        //   • selectedDests  = keys currently checked (default: all destinations)
        //   • profileByDest  = which profile's OAuth to use for that destination
        //                      (default to clip's SEO-owning profile; else first)
        const groups = new Map(); // destKey → profiles[]
        for (const c of connected) {
          const key = c.youtube_channel_title || c.youtube_channel_id || `__p_${c.id}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(c);
        }
        const initProfileByDest = {};
        for (const [key, profs] of groups.entries()) {
          const prefHere = (preferred && profs.find((p) => p.id === preferred.id)) || profs[0];
          initProfileByDest[key] = prefHere.id;
        }
        setSelectedDests(new Set(groups.keys()));
        setProfileByDest(initProfileByDest);
      })
      .catch((e) => setError(e.message || "Failed to load channels"))
      .finally(() => setLoadingCh(false));
  }, [open, clip?.id, hasSeo]);

  // Meta (FB/IG) destinations — quiet failure when Meta isn't configured, so
  // the section simply doesn't render. Mirrors the old canvas inline modal.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    try {
      const p = api.metaListAccounts && api.metaListAccounts();
      if (p && p.then) {
        p.then((r) => { if (alive) setMetaAccounts(Array.isArray(r) ? r : []); })
         .catch(() => { if (alive) setMetaAccounts([]); });
      }
    } catch { /* Meta not available — skip */ }
    return () => { alive = false; };
  }, [open]);

  const connectedChannels = useMemo(
    () => channels.filter((c) => c.connected),
    [channels]
  );

  const selected = useMemo(
    () => channels.find((c) => String(c.id) === String(channelId)),
    [channels, channelId]
  );

  // Group profiles by the YouTube destination (youtube_channel_title) so the
  // UI can show ONE destination when that's all the user has, even if they
  // have multiple style profiles OAuthed to the same account.
  const destinations = useMemo(() => {
    const groups = new Map(); // ytTitle → profiles[]
    for (const c of connectedChannels) {
      const key = c.youtube_channel_title || c.youtube_channel_id || "Your YouTube channel";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return Array.from(groups.entries()); // [[ytTitle, [profile1, profile2, …]], …]
  }, [connectedChannels]);

  // Auto-seed variantByDest with the best variant available per destination.
  // Prefers a variant generated by one of that destination's own profiles;
  // falls back to the top-scoring variant overall.
  useEffect(() => {
    if (!open || destinations.length === 0 || variantList.length === 0) return;
    setVariantByDest((prev) => {
      const next = { ...prev };
      for (const [, profiles] of destinations) {
        // Pick one "representative" profile to key this destination — use the
        // first profile in the group (same key we use elsewhere).
        const destKey = String(profiles[0].id);
        if (next[destKey] != null) continue; // user already picked
        // Find variants whose channel_id is one of this destination's profiles
        const localProfileIds = new Set(profiles.map((p) => p.id));
        const localVariants = variantList.filter((v) => localProfileIds.has(v.channelId));
        const best = (localVariants.length ? localVariants : variantList)
          .slice()
          .sort((a, b) => b.score - a.score)[0];
        if (best) next[destKey] = best.channelId;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, destinations.length, variantList.length]);

  // Auto-preselect the destination(s) this clip was EDITED or TARGETED for, so
  // "publish what I just edited" is one click. Two signals, unioned:
  //   • clip.seo_variants keys — channels with a per-channel SEO edit (editor)
  //   • job.target_channel_ids — channels picked at the "Choose channels" step
  // When neither maps to a connected destination we DON'T touch the selection,
  // leaving the existing "all destinations" default intact (back-compat). We
  // also bail once the user has manually changed the selection, so the job's
  // target list resolving a beat later never clobbers a deliberate choice.
  useEffect(() => {
    if (!open) return;
    if (destsTouchedRef.current) return;
    if (destinations.length === 0) return; // channels not loaded yet
    const wantIds = new Set();
    for (const cid of Object.keys(variantMap)) wantIds.add(Number(cid));
    for (const cid of jobTargetIds || []) wantIds.add(Number(cid));
    if (wantIds.size === 0) return; // no edit/target signal → keep default (all)
    const matched = new Set();
    for (const [key, profiles] of destinations) {
      if (profiles.some((p) => wantIds.has(p.id))) matched.add(key);
    }
    if (matched.size === 0) return; // edited channel not connected → keep default
    setSelectedDests(matched);
    const narrowed = matched.size < destinations.length;
    setPreset(narrowed ? "individual" : "global");
    setAutoPreselected(narrowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clip?.id, destinations.length, jobTargetIds]);

  const selectedDest = selected?.youtube_channel_title
    || selected?.youtube_channel_id
    || "";
  const profilesAtDest = destinations.find(([d]) => d === selectedDest)?.[1] || [];

  const needsPrivateForSchedule = privacy === "scheduled";
  const effectivePrivacy = needsPrivateForSchedule ? "private" : privacy;
  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000); // +5 min
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  function toggleDest(key) {
    destsTouchedRef.current = true;
    setAutoPreselected(false);
    setSelectedDests((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // Any manual toggle flips the mode to "individual" — the preset no
    // longer represents what's actually selected.
    setPreset("individual");
  }

  // Apply a preset = auto-select destinations according to its policy.
  // "global"     → every destination
  // "individual" → no change (leave current selection, user picks manually)
  // <groupId>    → only destinations whose google_channel_id is in the group
  function applyPreset(nextPreset) {
    destsTouchedRef.current = true;
    setAutoPreselected(false);
    setPreset(nextPreset);
    if (nextPreset === "global") {
      setSelectedDests(new Set(destinations.map(([k]) => k)));
      return;
    }
    if (nextPreset === "individual") {
      // Keep current selection — user edits manually from here
      return;
    }
    // Group preset
    const group = groups.find((g) => String(g.id) === String(nextPreset));
    if (!group) return;
    const wanted = new Set(group.google_channel_ids || []);
    const nextKeys = new Set();
    for (const [, profiles] of destinations) {
      const gid = profiles[0]?.youtube_channel_id;
      if (gid && wanted.has(gid)) {
        nextKeys.add(
          profiles[0].youtube_channel_title || profiles[0].youtube_channel_id || `__p_${profiles[0].id}`,
        );
      }
    }
    setSelectedDests(nextKeys);
  }
  function setProfileForDest(key, profileId) {
    setProfileByDest((prev) => ({ ...prev, [key]: Number(profileId) }));
  }

  // Resolve selected destinations → one channel_id per destination
  const channelIdsForSubmit = Array.from(selectedDests)
    .map((key) => profileByDest[key])
    .filter((id) => id != null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const ids = channelIdsForSubmit;
    const metaIds = Array.from(selectedMeta).map(Number);
    // Postiz integrations count as real destinations too (admin-only). A
    // Postiz-only publish (no native YouTube channel) is valid — it routes
    // each ticked integration to the branded or raw lane below.
    const postizCount = user?.is_admin ? postizState.selectedIds.size : 0;
    if (ids.length === 0 && metaIds.length === 0 && postizCount === 0) {
      setError("Pick at least one destination.");
      return;
    }
    if (needsPrivateForSchedule && !publishAt) {
      setError("Choose a scheduled date/time.");
      return;
    }
    if (needsPrivateForSchedule) {
      const chosen = new Date(publishAt);
      if (isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }
    if (!useSeo && !hasSeo && !donorClipId && !clip?.meta?.raw_upload) {
      // No SEO on the clip, no donor picked, user opted out — would
      // have no title at all. Raw-upload (Quick Publish) clips are
      // exempt: the backend falls back to the working title + channel
      // branding for those.
      setError("No SEO on this clip and 'Use AI SEO' is off. Generate SEO or pick another clip's SEO.");
      return;
    }

    // Meta (FB/IG) destinations are published one request per account (the
    // backend resolves them off the channel's provider). Shared helper used by
    // both the Meta-only path and the additive YT+Meta path below.
    const _publishMeta = async () => {
      for (const id of metaIds) {
        await api.publishClip(clip.id, {
          channel_ids: [id],
          privacy_status: effectivePrivacy,
          publish_kind: publishKind,
          use_seo: donorClipId ? true : (useSeo && hasSeo),
          brand_mode: brandMode || "per_channel", brand_placement: brandPlacement || "template",
          destination_kind: "meta",
        }).catch((e) => { throw new Error(`Meta destination #${id}: ${e?.message || e}`); });
      }
    };

    // Admin-only Postiz delivery — branded lane (name-matched → full pipeline
    // + logo/watermark/SEO via upload_provider=postiz) and raw lane (unmatched
    // → verbatim video + full SEO caption). Soft-fails per lane (sets a banner,
    // never throws) so a Postiz hiccup never unwinds an otherwise-good publish.
    // Returns the number of lanes that FAILED so callers can decide whether to
    // keep the modal open (Postiz is THE publish) or close anyway (Postiz is a
    // bonus on top of a native YouTube publish).
    const _publishPostiz = async () => {
      if (!(user?.is_admin && postizState.selectedIds.size > 0)) return 0;
      const selectedIntegrations = (postizState.integrations || []).filter(
        (i) => postizState.selectedIds.has(i.id)
      );
      const brandedChannelIds = [];
      const brandedBinding = {};        // channelId(str) → LIVE Postiz integration id
      const rawIntegrationIds = [];
      for (const integ of selectedIntegrations) {
        const m = matchChannelForIntegration(integ, channels);
        if (m) {
          brandedChannelIds.push(m.id);
          // Pass the live integration id explicitly — our DB may not have a
          // PostizIntegration row for this channel (it's connected straight in
          // Postiz), so name-resolution backend-side would miss and fall back
          // to native. The id is authoritative.
          brandedBinding[String(m.id)] = integ.id;
        } else {
          rawIntegrationIds.push(integ.id);
        }
      }
      let failed = 0;
      // BRANDED lane — full pipeline + branding + SEO via the native path.
      if (brandedChannelIds.length > 0) {
        try {
          const brandedPayload = {
            channel_ids: brandedChannelIds.map(Number),
            upload_provider: "postiz",
            postiz_integration_by_channel: brandedBinding,
            privacy_status: effectivePrivacy,
            use_seo: donorClipId ? true : (useSeo && hasSeo),
            publish_kind: publishKind,
            brand_mode: brandMode || "per_channel", brand_placement: brandPlacement || "template",
          };
          if (donorClipId) brandedPayload.seo_source_clip_id = Number(donorClipId);
          if (seoVariantOverride && seoVariantOverride !== "auto") {
            brandedPayload.seo_variant_override = Number(seoVariantOverride);
          }
          if (needsPrivateForSchedule) {
            brandedPayload.publish_at = new Date(publishAt).toISOString();
          }
          await api.publishClip(clip.id, brandedPayload);
        } catch (postizErr) {
          failed += 1;
          console.warn("Branded Postiz delivery failed:", postizErr);
          setError(`Branded Postiz delivery failed: ${postizErr.message || postizErr}`);
        }
      }
      // RAW lane — verbatim bytes + full SEO caption, no branding.
      if (rawIntegrationIds.length > 0) {
        try {
          // Use the R2 storage_url Kaizer already wrote so Postiz can fetch the
          // bytes server-side. Falls back to the local /api/file URL.
          const mediaUrl = clip.storage_url || (clip.video_url ? api.mediaUrl(clip.video_url) : "");
          await api.postizSchedule({
            integration_ids: rawIntegrationIds,
            text: postizState.text || buildSeoCaption(clip) || (clip?.seo?.title || ""),
            media_url: mediaUrl,
            type: needsPrivateForSchedule ? "scheduled" : "now",
            schedule_at_iso: needsPrivateForSchedule ? new Date(publishAt).toISOString() : null,
          });
        } catch (postizErr) {
          failed += 1;
          console.warn("Raw Postiz cross-post failed:", postizErr);
          setError(`Raw Postiz cross-post failed: ${postizErr.message || postizErr}`);
        }
      }
      return failed;
    };

    // No native YouTube destination selected — fire Meta and/or Postiz only.
    // This is what makes a Postiz-only (or Meta-only) publish work: the button
    // is no longer gated on a native YT pick.
    if (ids.length === 0) {
      setSubmitting(true);
      let keepOpen = false;
      if (metaIds.length > 0) {
        try { await _publishMeta(); }
        catch (err) { keepOpen = true; setError(err.message || "Meta publish failed"); }
      }
      // Postiz IS the publish here, so its failure keeps the modal open.
      const pzFailed = await _publishPostiz();
      if (pzFailed > 0) keepOpen = true;
      setSubmitting(false);
      if (!keepOpen) { onPublished?.(null); onClose?.(); }
      return;
    }

    const payload = {
      channel_ids: ids.map(Number),
      privacy_status: effectivePrivacy,
      // Donor wins: when user picks a sibling's SEO we always use it.
      use_seo: donorClipId ? true : (useSeo && hasSeo),
      publish_kind: publishKind,
      // 'per_channel' (overlay each channel's logo+watermark) | 'as_is'
      // (video already branded → upload verbatim). Default is per_channel,
      // so the main publish flow is unaffected.
      brand_mode: brandMode || "per_channel", brand_placement: brandPlacement || "template",
    };
    if (donorClipId) {
      payload.seo_source_clip_id = Number(donorClipId);
    }
    if (seoVariantOverride && seoVariantOverride !== "auto") {
      payload.seo_variant_override = Number(seoVariantOverride);
    }
    // Per-destination overrides — keyed by destination profile id.
    // Only send entries for destinations that are actually being published to.
    const perDest = {};
    for (const destKey of selectedDests) {
      const profiles = (destinations.find(([k]) => k === destKey) || [null, []])[1];
      if (!profiles.length) continue;
      // The dropdown + auto-seed key the chosen variant by the FIRST profile in the group.
      // Replicate it to EVERY profile in that YouTube destination so all of its channels
      // publish with the picked per-channel SEO — previously only the first profile got it
      // and the rest silently fell back to the generic title.
      const vid = variantByDest[String(profiles[0].id)];
      if (vid != null) {
        for (const p of profiles) perDest[String(p.id)] = Number(vid);
      }
    }
    if (Object.keys(perDest).length > 0) {
      payload.variant_by_channel = perDest;
    }
    if (needsPrivateForSchedule) {
      // datetime-local → treat as local, convert to ISO UTC
      payload.publish_at = new Date(publishAt).toISOString();
    }
    if (publishProvider) {
      // Forces this whole publish to the chosen route, overriding
      // both the per-channel default and the system default.
      payload.upload_provider = publishProvider;
    }

    try {
      setSubmitting(true);
      const res = await api.publishClip(clip.id, payload);
      // Dedupe-by-design: the clip was already published to these
      // channel(s) with the same video / SEO / privacy, so the backend
      // created NO new upload. Show a clear notice instead of silently
      // closing + navigating (which read as "publish is broken"). Keep
      // the modal open so the user can change a setting and re-publish.
      if (res?.already_published) {
        setNotice(
          res.message ||
          "This clip is already published with these exact settings — no new upload was created. Change the SEO, privacy, or thumbnail to publish a new version."
        );
        return;
      }
      // Fire the Postiz cross-post AFTER the YouTube call returns OK. Postiz
      // is a bonus on top of the native publish, so we ignore its failure
      // count here — the helper already surfaced a soft banner and we still
      // let onPublished + onClose fire.
      await _publishPostiz();
      // Additive Meta (FB/IG) destinations — soft-fail like Postiz so a Meta
      // hiccup never unwinds the successful YouTube publish.
      if (metaIds.length > 0) {
        try {
          await _publishMeta();
        } catch (metaErr) {
          console.warn("Meta cross-post failed:", metaErr);
          setError(`YouTube upload queued. Meta cross-post failed: ${metaErr.message || metaErr}`);
        }
      }
      onPublished?.(res);
      onClose?.();
    } catch (err) {
      setError(err.message || "Publish failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!clip) return null;

  return (
    <Modal open={open} onClose={onClose} title="Publish to YouTube" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Active upload provider banner — visible to ALL users so it
            is obvious whether the click hits Postiz or our native YT
            path. Only admins can flip it (Admin → Settings). */}
        {activeProvider && (
          <div className={`text-[11px] px-3 py-2 rounded border flex items-center gap-2 ${
            activeProvider === "postiz"
              ? "bg-purple-950/30 border-purple-900/50 text-purple-200"
              : "bg-red-950/30 border-red-900/50 text-red-200"
          }`}>
            {activeProvider === "postiz"
              ? (
                <><Globe size={12} className="flex-shrink-0" />
                  <span>
                    Uploading via <strong>Postiz</strong> — multi-platform routing
                    (YouTube + Twitter + Instagram + …). Admin-only toggle in{" "}
                    <RLink to="/admin/settings" className="underline hover:text-white">
                      Admin → Settings
                    </RLink>.
                  </span></>
              ) : (
                <><Youtube size={12} className="flex-shrink-0" />
                  <span>
                    Uploading via <strong>Kaizer native</strong> — direct YouTube
                    Data API. Subject to your project's daily quota.
                  </span></>
              )}
          </div>
        )}

        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="bg-amber-950/40 border border-amber-800/60 text-amber-200 px-3 py-2 rounded text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Upload kind — Short vs Video */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Upload as</label>
          <div className="grid grid-cols-2 gap-1.5">
            <KindOption
              active={publishKind === "short"}
              onClick={() => setPublishKind("short")}
              icon={Smartphone}
              label="YouTube Short"
              hint="Vertical, ≤60s, adds #Shorts"
            />
            <KindOption
              active={publishKind === "video"}
              onClick={() => setPublishKind("video")}
              icon={Clapperboard}
              label="Regular Video"
              hint="Standard upload, any length"
            />
          </div>
          {publishKind === "short" && Number(clip?.duration || 0) > 60 && (
            <p className="text-[11px] text-yellow-400 flex items-center gap-1">
              <AlertCircle size={11} /> This clip is {Math.round(clip.duration)}s — YouTube may reject Shorts longer than 60s.
            </p>
          )}
        </div>

        {/* Destinations — one checkbox per real YouTube account, not per profile. */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Youtube size={14} className="text-accent2" /> Upload to YouTube
            </span>
            <span className="text-[10px] text-gray-500 font-normal">
              {selectedDests.size} destination{selectedDests.size === 1 ? "" : "s"} selected
            </span>
          </label>

          {/* Auto-preselect note — surfaced only when we narrowed the list to
              the channel(s) this clip was edited / targeted for, so the
              operator can see (and trust) that it happened. */}
          {autoPreselected && (
            <div className="text-[10px] text-accent2/90 bg-accent2/10 border border-accent2/30 rounded px-2 py-1.5 flex items-start gap-1.5">
              <Sparkles size={11} className="mt-0.5 flex-shrink-0" />
              <span>
                Pre-selected the channel{selectedDests.size === 1 ? "" : "s"} you
                edited / chose for this video. Switch to <strong>Global</strong> above
                to publish to every channel instead.
              </span>
            </div>
          )}

          {/* Preset picker — Global / Individual / named groups.  One click
              sets the selection; ticking/unticking after that flips to
              Individual so the two stay in sync. */}
          {destinations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Preset:</span>
              <PresetChip
                active={preset === "global"}
                label="Global"
                hint="All channels"
                onClick={() => applyPreset("global")}
              />
              <PresetChip
                active={preset === "individual"}
                label="Individual"
                hint="Pick each manually"
                onClick={() => applyPreset("individual")}
              />
              {groups.map((g) => (
                <PresetChip
                  key={g.id}
                  active={String(preset) === String(g.id)}
                  label={g.name}
                  hint={`${(g.google_channel_ids || []).length} channels`}
                  onClick={() => applyPreset(String(g.id))}
                />
              ))}
              {groups.length === 0 && (
                <span className="text-[10px] text-gray-600">
                  (make named groups on the <strong>Style Profiles</strong> page to see them here)
                </span>
              )}
            </div>
          )}
          {loadingCh ? (
            <div className="text-xs text-gray-500 flex items-center gap-2 py-2">
              <Loader2 size={12} className="animate-spin" /> Loading accounts…
            </div>
          ) : connectedChannels.length === 0 ? (
            <div className="bg-yellow-950/30 border border-yellow-900 text-yellow-300 text-xs px-3 py-2 rounded">
              No YouTube account connected yet.{" "}
              <RLink to="/channels" className="underline hover:text-yellow-200" onClick={onClose}>
                Open Style Profiles
              </RLink>{" "}
              and click <strong>Link my YT</strong> to add one.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {destinations.map(([destKey, profiles]) => {
                const isSel = selectedDests.has(destKey);
                const activeProfileId = profileByDest[destKey] ?? profiles[0]?.id;
                const activeProfile   = profiles.find((p) => p.id === activeProfileId) || profiles[0];
                // Real YouTube identity for this destination — cached at
                // OAuth time on every profile in the group, so any one
                // works (they all point at the same YT channel).
                const ytAvatar = profiles.find((p) => p.youtube_channel_thumbnail_url)?.youtube_channel_thumbnail_url || "";
                const ytHandle = profiles.find((p) => p.youtube_channel_custom_url)?.youtube_channel_custom_url || "";
                return (
                  <div
                    key={destKey}
                    className={`bg-surface border rounded p-2.5 transition-colors ${
                      isSel ? "border-green-600/50 bg-green-950/10" : "border-border"
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleDest(destKey)}
                        className="accent-green-500 w-4 h-4"
                      />
                      {ytAvatar ? (
                        <img
                          src={ytAvatar}
                          alt=""
                          className="w-7 h-7 rounded-full flex-shrink-0 object-cover border border-border"
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <Youtube size={16} className="text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-green-300 truncate">{destKey}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {ytHandle ? `youtube.com/${ytHandle}` : "your YouTube channel"}
                        </div>
                      </div>
                      <CheckCircle2 size={14} className={`flex-shrink-0 ${isSel ? "text-green-500" : "text-gray-700"}`} />
                    </label>
                    {isSel && profiles.length > 1 && (
                      <div className="mt-2 pl-6 text-[10px] text-gray-500 leading-relaxed">
                        Upload logged under <span className="text-gray-300 font-medium">{activeProfile?.name}</span>
                        {" "}— {profiles.length} profiles share this YouTube account.
                      </div>
                    )}
                    {/* Composed-SEO preview — what WILL be uploaded to this destination */}
                    {isSel && hasSeo && useSeo && (
                      <ComposedPreview
                        clipId={clip.id}
                        channelId={activeProfileId}
                        publishKind={publishKind}
                      />
                    )}
                    {/* Per-destination SEO variant picker (legacy variants only) */}
                    {isSel && variantList.length > 0 && (() => {
                      const destKey = String(profiles[0].id);
                      const localIds = new Set(profiles.map((p) => p.id));
                      const localVariants = variantList
                        .filter((v) => localIds.has(v.channelId))
                        .sort((a, b) => b.score - a.score);
                      const otherVariants = variantList
                        .filter((v) => !localIds.has(v.channelId))
                        .sort((a, b) => b.score - a.score);
                      const current = variantByDest[destKey];
                      return (
                        <div className="mt-2 pl-6 flex items-center gap-2">
                          <Sparkles size={11} className="text-accent2 flex-shrink-0" />
                          <span className="text-[10px] text-gray-500 flex-shrink-0">SEO:</span>
                          <select
                            value={current == null ? "" : String(current)}
                            onChange={(e) =>
                              setVariantByDest((prev) => ({
                                ...prev,
                                [destKey]: Number(e.target.value),
                              }))
                            }
                            className="flex-1 bg-black border border-border rounded px-2 py-1 text-[11px] text-gray-200 min-w-0"
                          >
                            {localVariants.length > 0 && (
                              <optgroup label="Matches this destination's style">
                                {localVariants.map((v) => {
                                  const p = channels.find((c) => c.id === v.channelId);
                                  return (
                                    <option key={v.channelId} value={v.channelId}>
                                      {p?.name || `#${v.channelId}`} — {v.score}/100
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                            {otherVariants.length > 0 && (
                              <optgroup label="Other styles">
                                {otherVariants.map((v) => {
                                  const p = channels.find((c) => c.id === v.channelId);
                                  return (
                                    <option key={v.channelId} value={v.channelId}>
                                      {p?.name || `#${v.channelId}`} — {v.score}/100
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {destinations.length > 1 && (
                <div className="flex items-center gap-2 text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      destsTouchedRef.current = true;
                      setAutoPreselected(false);
                      setSelectedDests(new Set(destinations.map(([k]) => k)));
                    }}
                    className="text-accent2 hover:text-white"
                  >
                    Select all
                  </button>
                  <span className="text-gray-700">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      destsTouchedRef.current = true;
                      setAutoPreselected(false);
                      setSelectedDests(new Set());
                    }}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    Clear
                  </button>
                  <span className="ml-auto text-[10px] text-gray-600">
                    One upload per YouTube channel.
                  </span>
                </div>
              )}
              {hasSeo && (
                <div className="text-[10px] text-blue-300/80 bg-blue-950/20 border border-blue-900/40 rounded px-2 py-1.5 leading-relaxed">
                  ✓ SEO already generated — the same title, description, tags, and hashtags will be applied to every destination selected.
                </div>
              )}
            </div>
          )}
        </div>

        {/* SEO variant picker — only shown when multiple variants exist */}
        {variantList.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Sparkles size={13} className="text-accent2" /> SEO variant
            </label>
            <select
              value={seoVariantOverride}
              onChange={(e) => setSeoVariantOverride(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-gray-200"
            >
              <option value="auto">Auto — match each destination's style ({variantList.length} variant{variantList.length === 1 ? "" : "s"})</option>
              {[...variantList]
                .sort((a, b) => b.score - a.score)
                .map((v) => {
                  const prof = channels.find((c) => c.id === v.channelId);
                  const name = prof?.name || `#${v.channelId}`;
                  const isBest = bestVariant && v.channelId === bestVariant.channelId;
                  return (
                    <option key={v.channelId} value={v.channelId}>
                      {isBest ? "★ " : ""}{name} — score {v.score}/100{isBest ? " (best)" : ""}
                    </option>
                  );
                })}
            </select>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              {seoVariantOverride === "auto"
                ? "Each destination uses the SEO variant that matches its own style profile."
                : (() => {
                    const v = variantList.find((x) => String(x.channelId) === String(seoVariantOverride));
                    return v
                      ? `All destinations will use "${channels.find((c) => c.id === v.channelId)?.name || "selected"}" variant (score ${v.score}/100).`
                      : "Selected variant will be used for every destination.";
                  })()}
            </p>
          </div>
        )}

        {/* Meta (Facebook / Instagram) destinations — additive to YouTube.
            Only renders when Meta accounts are configured. */}
        {metaAccounts.length > 0 && (
          <div className="bg-surface border border-border rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
              Also post to (Meta)
            </div>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {metaAccounts.map((a) => {
                const sel = selectedMeta.has(a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => setSelectedMeta((prev) => {
                        const next = new Set(prev);
                        if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                        return next;
                      })}
                      className="accent-accent2"
                    />
                    <span className="text-gray-200">{a.name || a.page_name || `Meta #${a.id}`}</span>
                    {a.platform && (
                      <span className="text-[10px] text-gray-500 uppercase">{a.platform}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Per-publish upload provider override.  Hidden for non-admins
            because regular users shouldn't need to know this exists —
            the channel default already does the right thing. */}
        {user?.is_admin && SHOW_PUBLISH_ADMIN_TOOLS && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-300">Upload via (override)</label>
            <select
              value={publishProvider}
              onChange={(e) => setPublishProvider(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-gray-200"
            >
              <option value="">Channel / system default</option>
              <option value="postiz">Force Postiz</option>
              <option value="kaizer">Force Native YouTube</option>
              <option value="native_rtmp">Force Native RTMP-live (quota-friendly)</option>
            </select>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              For comparison runs — publish the same clip twice (once via
              each path) and diff the [compare:native] vs [compare:postiz]
              log lines on the Uploads page.
              <br />
              <strong className="text-gray-400">Native RTMP-live</strong> saves
              ~6× quota (250 units vs 1,600) but takes the video's real-time
              duration to push and lands as a "past stream" on the channel.
            </p>
          </div>
        )}

        {/* Privacy */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-300">Visibility</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <PrivacyOption
              active={privacy === "public"}
              onClick={() => setPrivacy("public")}
              icon={Globe}
              label="Public"
              hint="Goes live now"
            />
            <PrivacyOption
              active={privacy === "unlisted"}
              onClick={() => setPrivacy("unlisted")}
              icon={LinkIcon}
              label="Unlisted"
              hint="Link-only"
            />
            <PrivacyOption
              active={privacy === "private"}
              onClick={() => setPrivacy("private")}
              icon={Lock}
              label="Private"
              hint="Only you"
            />
            <PrivacyOption
              active={privacy === "scheduled"}
              onClick={() => setPrivacy("scheduled")}
              icon={Calendar}
              label="Scheduled"
              hint="Auto public"
            />
          </div>
        </div>

        {/* Schedule picker */}
        {needsPrivateForSchedule && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Calendar size={14} /> Publish at (local time)
            </label>
            <input
              type="datetime-local"
              value={publishAt}
              min={minDatetime}
              onChange={(e) => setPublishAt(e.target.value)}
              className="input text-sm"
              required
            />
            <p className="text-[11px] text-gray-500">
              Video is uploaded as <span className="text-gray-400">private</span> and YouTube will flip it public at your chosen time.
            </p>
          </div>
        )}

        {/* Use AI SEO */}
        <div className="bg-surface border border-border rounded p-3">
          <label className={`flex items-start gap-2.5 cursor-pointer ${!hasSeo ? "opacity-60" : ""}`}>
            <input
              type="checkbox"
              checked={useSeo && hasSeo}
              disabled={!hasSeo}
              onChange={(e) => setUseSeo(e.target.checked)}
              className="mt-0.5 accent-accent2"
            />
            <span className="flex-1">
              <span className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
                <Sparkles size={13} className="text-accent2" /> Use AI SEO
              </span>
              <span className="text-[11px] text-gray-500 block mt-0.5">
                Uses the generated title, description, tags, and hashtags from the SEO tab.
              </span>
              {!hasSeo && (
                <span className="text-[11px] text-yellow-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> No SEO on this clip.{" "}
                  {jobId ? (
                    <RLink
                      to={`/jobs/${jobId}/v4-edit`}
                      className="underline hover:text-yellow-300"
                      onClick={onClose}
                    >
                      Generate SEO first
                    </RLink>
                  ) : (
                    // Quick Publish embed (no jobId) — the working title
                    // + channel branding will be used instead.
                    <span>Your working title will be used.</span>
                  )}
                </span>
              )}
              {hasSeo && useSeo && !donorClipId && (
                <span className="text-[11px] text-gray-400 block mt-1 truncate" title={clip.seo.title}>
                  Title preview: <span className="text-gray-300">{clip.seo.title}</span>
                </span>
              )}
            </span>
          </label>
        </div>

        {/* Branding mode — applies to every selected channel. */}
        <div className="bg-surface border border-border rounded p-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Branding</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBrandMode("per_channel")}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                brandMode === "per_channel"
                  ? "border-accent2/70 bg-accent2/5"
                  : "border-border hover:border-border-hover"
              }`}
            >
              <div className="text-xs font-medium text-gray-200">Apply my channel branding</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Adds each channel's logo + watermark + social links at upload.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setBrandMode("as_is")}
              className={`text-left rounded-lg border p-2.5 transition-colors ${
                brandMode === "as_is"
                  ? "border-accent2/70 bg-accent2/5"
                  : "border-border hover:border-border-hover"
              }`}
            >
              <div className="text-xs font-medium text-gray-200">Video already has my logo/watermark</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Publishes your video as-is to every channel — no overlay added.
              </div>
            </button>
          </div>

          {/* WHERE the logo/watermark sits — only when we're overlaying. */}
          {brandMode === "per_channel" && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Logo / watermark placement</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" onClick={() => setBrandPlacement("template")}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    brandPlacement === "template" ? "border-accent2/70 bg-accent2/5" : "border-border hover:border-border-hover"}`}>
                  <div className="text-xs font-medium text-gray-200">Use the template's spot</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Each channel's logo/watermark lands where the template placed it.
                  </div>
                </button>
                <button type="button" onClick={() => setBrandPlacement("channel")}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    brandPlacement === "channel" ? "border-accent2/70 bg-accent2/5" : "border-border hover:border-border-hover"}`}>
                  <div className="text-xs font-medium text-gray-200">Use my channel position</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Force each channel's own watermark position / default corner, ignoring the template's spot.
                  </div>
                </button>
              </div>
              <div className="text-[10px] text-gray-500 mt-2 leading-snug">
                Note: the logo image, watermark text and opacity always come from each channel's settings —
                this only chooses <span className="text-gray-300">where</span> they sit. Templates with no marked
                spot always use your channel position.
              </div>
            </div>
          )}
        </div>

        {/* OPTIONAL / advanced: copy SEO from a sibling clip. Collapsed by
            default and never preselected — every clip publishes with its OWN
            SEO (handled by "Use AI SEO" above). Operator was clear: each clip
            goes with its own SEO, so this must NOT read as a forced choice.
            It stays only as an opt-in for the rare "make these two clips share
            one title" case. */}
        {siblings.length > 0 && (
          <details className="bg-surface border border-border rounded">
            <summary className="cursor-pointer select-none px-3 py-2 text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1.5">
              <Sparkles size={12} className="text-accent2/70" />
              Advanced: copy SEO from another clip
              {donorClipId ? <span className="text-accent2 font-medium">• active</span> : <span className="text-gray-600">(off — uses this clip&apos;s own SEO)</span>}
            </summary>
            <div className="px-3 pb-3 pt-2 flex flex-col gap-2 border-t border-border">
              <select
                value={donorClipId}
                onChange={(e) => setDonorClipId(e.target.value)}
                className="bg-[#0c0c0c] border border-border rounded px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="">— Use this clip&apos;s own SEO (default) —</option>
                {siblings.map((s) => {
                  const idx = (s.clip_index ?? 0) + 1;
                  const title = (s.seo?.title || "").slice(0, 60);
                  return (
                    <option key={s.id} value={s.id}>
                      Clip #{idx}{title ? ` — ${title}` : ""}
                    </option>
                  );
                })}
              </select>
              {donorClipId && (
                <span className="text-[11px] text-accent2/90">
                  This clip will publish with the picked sibling&apos;s title,
                  description, tags, and hashtags. Channel-related fields stay
                  per-destination.
                </span>
              )}
            </div>
          </details>
        )}

        {/* Postiz cross-post — admin-only, hidden for regular users
            until each platform's verification is complete. Backend
            also enforces is_admin on every Postiz endpoint, so this
            UI being conditionally mounted is just polish. */}
        {user?.is_admin && (
          <PostizCrossPostSection
            value={postizState}
            onChange={setPostizState}
            defaultText={buildSeoCaption(clip) || clip?.seo?.title || ""}
            channels={channels}
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-sm px-4 py-1.5"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || (selectedDests.size === 0 && selectedMeta.size === 0 && !(user?.is_admin && postizState.selectedIds.size > 0))}
            className="bg-accent hover:bg-accent2 text-white text-sm font-medium px-4 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {(() => {
              const postizN = user?.is_admin ? postizState.selectedIds.size : 0;
              const total = selectedDests.size + selectedMeta.size + postizN;
              if (submitting) return <><Loader2 size={14} className="animate-spin" /> Queuing {total}…</>;
              return <><Youtube size={14} /> {needsPrivateForSchedule ? `Schedule (${total})` : `Publish to ${total}`}</>;
            })()}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PrivacyOption({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded border px-2.5 py-2 text-left transition-colors ${
        active
          ? "border-accent2 bg-accent2/10 text-white"
          : "border-border bg-surface text-gray-300 hover:border-border-hover"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <Icon size={12} /> {label}
      </span>
      <span className="text-[10px] text-gray-500">{hint}</span>
    </button>
  );
}

/**
 * ComposedPreview — shows the EXACT title / description / tags that will be
 * uploaded to one YouTube destination, after the brand overlay is applied to
 * the generic SEO.  Collapsed by default to keep the modal compact; opened
 * on demand.  Also surfaces any cross-brand leak warnings from the backend
 * auditor as a prominent red banner so the user can bail before publish.
 */
function ComposedPreview({ clipId, channelId, publishKind }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    setErr("");
    api.previewComposedSEO(clipId, channelId, publishKind)
      .then((res) => setData(res))
      .catch((e) => setErr(e.message || "Preview failed"))
      .finally(() => setLoading(false));
  }, [open, clipId, channelId, publishKind]);

  // Invalidate cache if destination or publishKind changes while expanded
  useEffect(() => { setData(null); }, [channelId, publishKind]);

  return (
    <div className="mt-2 pl-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-accent2 hover:text-accent underline underline-offset-2"
      >
        {open ? "hide preview" : "preview what will be uploaded"}
      </button>
      {open && (
        <div className="mt-1.5 text-[11px] rounded border border-border bg-black/40 p-2 space-y-1.5">
          {loading && (
            <div className="flex items-center gap-1.5 text-gray-500"><Loader2 size={12} className="animate-spin" /> composing…</div>
          )}
          {err && (
            <div className="text-red-400 flex items-start gap-1.5"><AlertCircle size={12} className="mt-0.5" /> {err}</div>
          )}
          {data?.leak_warnings?.length > 0 && (
            <div className="text-red-300 bg-red-950/30 border border-red-900 rounded px-1.5 py-1">
              <div className="font-semibold flex items-center gap-1"><AlertCircle size={11} /> leak warning</div>
              <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                {data.leak_warnings.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {data?.composed && (
            <>
              <div>
                <span className="text-gray-500 uppercase text-[9px]">Title</span>
                <div className="text-gray-200 break-words">{data.composed.title}</div>
              </div>
              <div>
                <span className="text-gray-500 uppercase text-[9px]">Description (first 200 chars)</span>
                <div className="text-gray-300 whitespace-pre-wrap">{(data.composed.description || "").slice(0, 200)}{(data.composed.description || "").length > 200 ? "…" : ""}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(data.composed.keywords || []).slice(0, 12).map((k, i) => (
                  <span key={i} className="bg-black/50 border border-border rounded px-1 text-[10px] text-gray-400">{k}</span>
                ))}
                {(data.composed.keywords || []).length > 12 && (
                  <span className="text-[10px] text-gray-500">+{data.composed.keywords.length - 12}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {(data.composed.hashtags || []).map((h, i) => (
                  <span key={i} className="bg-accent2/10 border border-accent2/30 rounded px-1 text-[10px] text-accent2">{h}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PresetChip({ active, label, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? "bg-accent2/30 border-accent2 text-white"
          : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function KindOption({ active, onClick, icon: Icon, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-accent bg-accent/15 text-white ring-1 ring-accent/40"
          : "border-border bg-surface text-gray-300 hover:border-border-hover"
      }`}
    >
      <Icon size={18} className={active ? "text-accent2" : "text-gray-500"} />
      <span className="flex flex-col min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[10px] text-gray-500 truncate">{hint}</span>
      </span>
    </button>
  );
}
