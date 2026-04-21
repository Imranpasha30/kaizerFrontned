import React, { useEffect, useMemo, useState } from "react";
import { Link as RLink } from "react-router-dom";
import {
  Youtube, Lock, Globe, Link as LinkIcon, Calendar,
  AlertCircle, CheckCircle2, Loader2, Sparkles, Smartphone, Clapperboard,
} from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";

/**
 * Publish-to-YouTube modal.
 * Props:
 *   open        - boolean
 *   onClose     - () => void
 *   clip        - { id, seo?, channel_id?, filename? }
 *   jobId       - used for "Edit this clip" deep link
 *   onPublished - (uploadJob) => void  (parent can navigate to /uploads)
 */
export default function PublishModal({ open, onClose, clip, jobId, onPublished }) {
  const [channels, setChannels] = useState([]);
  const [loadingCh, setLoadingCh] = useState(false);
  // channelId = "primary" profile used for SEO + style; still needed for the
  // single-target path.  selectedIds = full set of profiles to fan out to.
  const [channelId, setChannelId] = useState("");
  // One entry per unique YouTube destination (not per profile) — prevents
  // accidentally uploading the same video N times to the same YT account.
  const [selectedDests, setSelectedDests] = useState(() => new Set());
  const [profileByDest, setProfileByDest] = useState({});
  const [privacy, setPrivacy] = useState("private");
  const [publishAt, setPublishAt] = useState("");
  const [useSeo, setUseSeo] = useState(true);
  // "short" appends #Shorts to the title/description so YouTube's classifier
  // picks the clip up.  Default is auto-derived from the clip's platform:
  //   youtube_full         → video
  //   youtube_short / instagram_reel / anything vertical → short
  const defaultKind = useMemo(() => {
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

  // Publish presets: "global" | "individual" | "<group_id>"
  // - global   = every connected YT account auto-selected (default)
  // - individual = user ticks/unticks each destination manually
  // - <group_id> = only destinations in that named group
  const [preset, setPreset] = useState("global");
  const [groups, setGroups] = useState([]);

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
    const ids = channelIdsForSubmit;
    if (ids.length === 0) {
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
    if (!useSeo && !hasSeo) {
      // No SEO on the clip and user opted out — we'd have no title at all.
      setError("No SEO on this clip and 'Use AI SEO' is off. Generate SEO first.");
      return;
    }

    const payload = {
      channel_ids: ids.map(Number),
      privacy_status: effectivePrivacy,
      use_seo: useSeo && hasSeo,
      publish_kind: publishKind,
    };
    if (seoVariantOverride && seoVariantOverride !== "auto") {
      payload.seo_variant_override = Number(seoVariantOverride);
    }
    // Per-destination overrides — keyed by destination profile id.
    // Only send entries for destinations that are actually being published to.
    const perDest = {};
    for (const destKey of selectedDests) {
      const profiles = (destinations.find(([k]) => k === destKey) || [null, []])[1];
      for (const p of profiles) {
        const vid = variantByDest[String(p.id)];
        if (vid != null) perDest[String(p.id)] = Number(vid);
      }
    }
    if (Object.keys(perDest).length > 0) {
      payload.variant_by_channel = perDest;
    }
    if (needsPrivateForSchedule) {
      // datetime-local → treat as local, convert to ISO UTC
      payload.publish_at = new Date(publishAt).toISOString();
    }

    try {
      setSubmitting(true);
      const res = await api.publishClip(clip.id, payload);
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
        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
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
                      <Youtube size={16} className="text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-green-300 truncate">{destKey}</div>
                        <div className="text-[10px] text-gray-500">your YouTube channel</div>
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
                    onClick={() => setSelectedDests(new Set(destinations.map(([k]) => k)))}
                    className="text-accent2 hover:text-white"
                  >
                    Select all
                  </button>
                  <span className="text-gray-700">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDests(new Set())}
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
                  <RLink
                    to={`/jobs/${jobId}/edit/${clip.id}`}
                    className="underline hover:text-yellow-300"
                    onClick={onClose}
                  >
                    Generate SEO first
                  </RLink>
                </span>
              )}
              {hasSeo && useSeo && (
                <span className="text-[11px] text-gray-400 block mt-1 truncate" title={clip.seo.title}>
                  Title preview: <span className="text-gray-300">{clip.seo.title}</span>
                </span>
              )}
            </span>
          </label>
        </div>

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
            disabled={submitting || connectedChannels.length === 0 || selectedDests.size === 0}
            className="bg-accent hover:bg-accent2 text-white text-sm font-medium px-4 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> Queuing {selectedDests.size}…</>
              : <><Youtube size={14} /> {needsPrivateForSchedule ? `Schedule (${selectedDests.size})` : `Publish to ${selectedDests.size}`}</>}
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
