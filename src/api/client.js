// In production VITE_API_URL = https://your-backend.railway.app
// In dev, empty string → Vite proxy handles /api → localhost:8000
const ORIGIN = import.meta.env.VITE_API_URL || "";
const BASE   = `${ORIGIN}/api`;

// JWT storage — kept in localStorage so refreshes persist the session.
const TOKEN_KEY = "kaizer_jwt";
export function getToken()       { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } }
export function setToken(token)  { try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch {} }
export function clearToken()     { setToken(""); }

// Event emitted when a 401 comes back — AuthProvider listens and forces logout
const UNAUTHORIZED_EVENT = "kaizer:unauthorized";
export function onUnauthorized(cb) {
  const handler = () => cb();
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  const tok = getToken();
  if (tok) opts.headers["Authorization"] = `Bearer ${tok}`;
  if (body !== undefined && body !== null) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    if (res.status === 401) {
      // Token invalid/expired — bubble up so AuthProvider can log out
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    const err = await res.json().catch(() => ({}));
    // FastAPI puts the message in `detail`; fall back to `error` / statusText
    throw new Error(err.detail || err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Auth
  authConfig:   ()              => req("GET",  "/auth/config"),
  register:     (payload)       => req("POST", "/auth/register", payload),
  login:        (payload)       => req("POST", "/auth/login",    payload),
  googleLogin:  (credential)    => req("POST", "/auth/google",   { credential }),
  me:           ()              => req("GET",  "/auth/me"),
  logout:       ()              => req("POST", "/auth/logout"),
  getSocials:   ()              => req("GET",  "/auth/me/socials"),
  putSocials:   (socials)       => req("PUT",  "/auth/me/socials", { socials }),

  // Password management
  hasPassword:    ()                                                => req("GET",  "/auth/me/has-password"),
  changePassword: ({ current_password, new_password })              =>
    req("POST", "/auth/me/password", { current_password, new_password }),
  forgotPassword: (email)                                           => req("POST", "/auth/forgot-password", { email }),
  validateReset:  (token)                                           => req("GET",  `/auth/reset-password/validate?token=${encodeURIComponent(token)}`),
  resetPassword:  ({ token, new_password })                         => req("POST", "/auth/reset-password", { token, new_password }),

  // Config
  platforms:     () => req("GET", "/platforms/"),
  frameLayouts:  () => req("GET", "/frame-layouts/"),
  listLanguages: () => req("GET", "/languages/"),

  // Jobs
  listJobs:     ()           => req("GET",    "/jobs/"),
  // createJob uses XMLHttpRequest for upload progress
  createJob: (form, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/jobs/create/`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    const _tok = getToken();
    if (_tok) xhr.setRequestHeader("Authorization", `Bearer ${_tok}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        if (xhr.status === 401) window.dispatchEvent(new CustomEvent("kaizer:unauthorized"));
        try { reject(new Error(JSON.parse(xhr.responseText).detail || xhr.statusText)); }
        catch { reject(new Error(xhr.statusText || "Upload failed")); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 600000; // 10 minutes for large uploads
    xhr.send(form);
  }),
  getJob:       (id)         => req("GET",    `/jobs/${id}/`),
  getJobStatus: (id)         => req("GET",    `/jobs/${id}/status/`),
  exportJob:     (id)         => req("POST",   `/jobs/${id}/export/`),
  deleteJob:     (id)         => req("DELETE", `/jobs/${id}/delete/`),
  reimportClips: (id)         => req("POST",   `/jobs/${id}/reimport/`),
  // Stop a running/queued job. Backend tree-kills the pipeline
  // subprocess + any ffmpeg children and marks the job as cancelled.
  // Idempotent — calling on an already-terminal job returns the
  // current status with {already_final: true}.
  cancelJob:     (id)         => req("POST",   `/jobs/${id}/cancel/`),

  // Clips
  getClip:      (id)         => req("GET",  `/clips/${id}/`),

  // Raw upload — user brings an already-edited MP4; skip the pipeline.
  rawUpload: (form, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/clips/raw-upload/`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    const _tok = getToken();
    if (_tok) xhr.setRequestHeader("Authorization", `Bearer ${_tok}`);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        if (xhr.status === 401) window.dispatchEvent(new CustomEvent("kaizer:unauthorized"));
        try { reject(new Error(JSON.parse(xhr.responseText).detail || xhr.statusText)); }
        catch { reject(new Error(xhr.statusText || "Upload failed")); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 600000;
    xhr.send(form);
  }),
  rerenderClip: (id, edits)  => req("POST", `/clips/${id}/rerender/`, edits),
  uploadImage:  (id, form)   => req("POST", `/clips/${id}/upload-image/`, form, true),

  // ── Bulletin per-image management ─────────────────────────────
  // For full-video / bulletin clips: list every story's carousel
  // image, replace any individual slot, and trigger a compose-only
  // re-render (skips Gemini analysis + OpenAI gen via on-disk caches).
  listBulletinImages: (jobId) =>
    req("GET", `/jobs/${jobId}/bulletin-images`),
  replaceBulletinImage: (jobId, storyIndex, slotIndex, imageFile) => {
    const fd = new FormData();
    fd.append("story_index", String(storyIndex));
    fd.append("slot_index",  String(slotIndex));
    fd.append("image",       imageFile);
    return req("POST", `/jobs/${jobId}/bulletin-images/replace`, fd, true);
  },
  recomposeBulletin: (jobId, { scope = "auto", verify = false } = {}) => {
    const fd = new FormData();
    fd.append("scope", scope);
    fd.append("verify", verify ? "true" : "false");
    return req("POST", `/jobs/${jobId}/bulletin-images/recompose`, fd, true);
  },

  // ── Express Mode (auto-publish) ───────────────────────────────
  // Lazy-user "one-click" tab. Whisper transcribe -> Claude SEO ->
  // Postiz upload + post. All AI keys are sent per-request so they
  // live in the browser's localStorage (never on the server).
  expressIntegrations: () => req("GET", "/express/integrations"),
  expressKeyStatus:    () => req("GET", "/express/key-status"),
  expressJobs:         () => req("GET", "/express/jobs"),
  expressStart: (formData) =>
    req("POST", "/express/start", formData, true),
  expressStatus: (jobId) =>
    req("GET", `/express/status/${jobId}`),

  // Channels (phase 1)
  listChannels:   ()             => req("GET",    "/channels/"),
  getChannel:     (id)           => req("GET",    `/channels/${id}/`),
  createChannel:  (payload)      => req("POST",   "/channels/", payload),
  updateChannel:  (id, payload)  => req("PATCH",  `/channels/${id}/`, payload),
  deleteChannel:  (id)           => req("DELETE", `/channels/${id}/`),

  // Channel learning corpus (phase 7)
  getChannelCorpus: (id) => req("GET",  `/channels/${id}/corpus`),
  learnChannel:     (id) => req("POST", `/channels/${id}/learn`),

  // YouTube OAuth (phase 4)
  oauthStatus:      ()           => req("GET",    "/youtube/oauth/status"),
  oauthAuthorize:   (channelId)  => req("GET",    `/youtube/oauth/authorize?channel_id=${channelId}`),
  oauthDisconnect:  (channelId)  => req("DELETE", `/youtube/oauth/${channelId}`),
  listYtAccounts:   ()           => req("GET",    "/youtube/oauth/accounts"),
  newYtAccount:     ()           => req("POST",   "/youtube/oauth/new-account"),
  // Re-fetch live channel metadata (thumbnail, subs, description, etc.) and
  // update the DB cache.  Call this when the user changed their YT channel
  // settings — the UI will then reflect the new values without ever having
  // to hit YouTube again for normal page loads.
  refreshYtAccount: (channelId)  => req("POST",   `/youtube/oauth/accounts/${channelId}/refresh`),
  setYtAccountLogo: (channelId, logo_asset_id) => req("POST", `/youtube/oauth/accounts/${channelId}/logo`, { logo_asset_id }),
  // Per-YT-account upload route.  upload_provider ∈ {"postiz","kaizer",null}
  // (null = inherit channel / system default).
  setYtAccountUploadProvider: (channelId, upload_provider) =>
    req("POST", `/youtube/oauth/accounts/${channelId}/upload-provider`, { upload_provider }),
  // Revokes our refresh token for this YT account. Caller MUST confirm
  // — this is destructive: any pending uploads to that channel fail
  // until the user re-authorises. Also satisfies Google's policy
  // requirement that users can withdraw OAuth access in-app.
  disconnectYtAccount: (channelId) => req("DELETE", `/youtube/oauth/${channelId}`),

  // Channel groups — one-click presets for publish fan-out (e.g. "English",
  // "Telugu").  Stored per-user; each group holds a list of google_channel_ids.
  listChannelGroups:   ()                     => req("GET",    "/channel-groups/"),
  createChannelGroup:  (payload)              => req("POST",   "/channel-groups/", payload),
  updateChannelGroup:  (id, payload)          => req("PATCH",  `/channel-groups/${id}`, payload),
  deleteChannelGroup:  (id)                   => req("DELETE", `/channel-groups/${id}`),

  // Billing — plan tiers, current usage, Stripe checkout (stubbed until live).
  listPlans:         ()                              => req("GET",  "/billing/plans"),
  getMyBilling:      ()                              => req("GET",  "/billing/me"),
  createCheckout:    (plan_key, cycle = "monthly")   => req("POST", "/billing/checkout-session", { plan_key, cycle }),
  createPortal:      ()                              => req("POST", "/billing/portal-session"),
  devSetPlan:        (plan_key)                      => req("POST", `/billing/dev/set-plan?plan_key=${encodeURIComponent(plan_key)}`),

  // Many-to-many: which destinations a style profile is allowed to publish to
  setProfileDestinations: (channelId, googleChannelIds) =>
    req("PUT", `/channels/${channelId}/destinations`,
        { google_channel_ids: googleChannelIds }),

  // Toggle one Brand Account destination on/off without rewriting the
  // whole list. Used by the multi-channel picker after OAuth so users
  // can deselect Brand Accounts they don't want to publish to.
  toggleProfileDestination: (channelId, googleChannelId, enabled) =>
    req("PATCH",
        `/channels/${channelId}/destinations/${encodeURIComponent(googleChannelId)}`,
        { enabled: !!enabled }),

  // ── Postiz (admin-only cross-post scheduler) ────────────────────────
  // Backend gate: auth.admin_required → non-admins get 401 + nothing
  // leaks. Frontend also hides the UI for non-admins (belt + braces).
  postizStatus:        ()           => req("GET",  "/postiz/status"),
  postizIntegrations:  ()           => req("GET",  "/postiz/integrations"),
  postizSchedule:      (payload)    => req("POST", "/postiz/schedule", payload),

  // ── YouTube channel lookup (powers the Style References search) ─────
  // Paste a handle (@TV9Telugu), channel ID (UC…), URL, or free text →
  // backend hits the YouTube Data API and returns name / handle /
  // language / thumbnail / sub-count / etc. so the form auto-fills.
  ytLookup:        (q)         => req("GET", `/yt-lookup/?q=${encodeURIComponent(q)}`),
  ytLookupSearch:  (q, limit=5) => req("GET", `/yt-lookup/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // ── System settings (admin) ─────────────────────────────────────────
  // List + update global toggles. Today the only setting is
  // `upload_provider` ('postiz' default | 'kaizer'). PUT requires admin;
  // there's a separate /public read endpoint for non-admins so the
  // PublishModal can show "Uploading via X" to everyone.
  adminListSettings:        ()             => req("GET",  "/admin/settings"),
  adminUpdateSetting:       (key, value)   =>
    req("PUT", `/admin/settings/${encodeURIComponent(key)}`, { value }),
  getActiveUploadProvider:  ()             =>
    req("GET", "/admin/settings/upload-provider/public"),

  // Publish / Uploads (phase 5)
  publishClip:    (clipId, payload) => req("POST",   `/clips/${clipId}/publish`, payload),
  listUploads:    (opts = {})       => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.channel_id) q.set("channel_id", opts.channel_id);
    if (opts.limit) q.set("limit", opts.limit);
    const s = q.toString();
    return req("GET", `/uploads${s ? "?" + s : ""}`);
  },
  getUpload:      (id)              => req("GET",    `/uploads/${id}`),
  cancelUpload:   (id)              => req("DELETE", `/uploads/${id}`),
  retryUpload:    (id)              => req("POST",   `/uploads/${id}/retry`),
  getQuota:       ()                => req("GET",    `/quota`),

  // SEO (phase 2+3 + Content+Brand Overlay refactor)
  generateClipSEO: (clipId, payload) => req("POST",   `/clips/${clipId}/seo/generate`, payload),
  getClipSEOStatus: (clipId)         => req("GET",    `/clips/${clipId}/seo/status`),
  updateClipSEO:   (clipId, payload) => req("PUT",    `/clips/${clipId}/seo`, payload),
  clearClipSEO:    (clipId)          => req("DELETE", `/clips/${clipId}/seo`),
  // Copy this clip's SEO to every other Short in the same job (UPSERT).
  // Server-side single call — handles "no SEO yet on target" case.
  applySeoToJobShorts: (clipId)      => req("POST",   `/clips/${clipId}/seo/apply-to-job-shorts`),
  bulkGenerateSEO: (jobId, payload)  => req("POST",   `/jobs/${jobId}/seo/generate-all`, payload),
  // Compose-preview: returns exact title/desc/tags that WOULD be uploaded to
  // `channelId` for this clip (generic SEO + that destination's brand overlay).
  previewComposedSEO: (clipId, channelId, publishKind = "video") =>
    req("GET", `/clips/${clipId}/seo/compose-preview?channel_id=${channelId}&publish_kind=${encodeURIComponent(publishKind)}`),

  // Campaigns (phase A — multi-channel auto-publish)
  listCampaigns:    ()                   => req("GET",    "/campaigns/"),
  createCampaign:   (payload)            => req("POST",   "/campaigns/", payload),
  getCampaign:      (id)                 => req("GET",    `/campaigns/${id}`),
  updateCampaign:   (id, payload)        => req("PATCH",  `/campaigns/${id}`, payload),
  deleteCampaign:   (id)                 => req("DELETE", `/campaigns/${id}`),
  attachCampaign:   (id, jobId)          => req("POST",   `/campaigns/${id}/attach`, { job_id: jobId }),
  runCampaign:      (id, jobId)          => req("POST",   `/campaigns/${id}/run/${jobId}`),
  getJobCampaigns:  (jobId)              => req("GET",    `/campaigns/job/${jobId}`),

  // Performance / analytics (phase B)
  getLeaderboard:   (limit = 50, channelId = null) =>
    req("GET", `/performance/leaderboard?limit=${limit}`
              + (channelId ? `&channel_id=${encodeURIComponent(channelId)}` : "")),
  // Calibration histogram.  Pass channelId to scope to one style profile
  // — needed for per-channel analysis on the Performance page (otherwise
  // the histogram is mixed across every connected channel and you can't
  // tell which one is converting).
  getCalibration:   (channelId = null) =>
    req("GET", channelId
                 ? `/performance/calibration?channel_id=${encodeURIComponent(channelId)}`
                 : "/performance/calibration"),
  getPerfHistory:   (uploadId)           => req("GET",    `/performance/history/${uploadId}`),
  // Per-YouTube-channel rollup: total views/likes/comments + top clip +
  // engagement rate + avg SEO score. One entry per real YT channel
  // (grouped via google_channel_id, not style-profile id). Drives the
  // summary cards row at the top of the Performance page.
  getPerfChannels:  ()                   => req("GET",    "/performance/channels"),
  // Phase 2 — full-channel video catalogue
  syncChannelVideos: (gcid, maxVideos = 200) =>
    req("POST", `/performance/yt/${encodeURIComponent(gcid)}/sync?max_videos=${maxVideos}`),
  listChannelVideos: (gcid, { limit = 50, offset = 0, q = "", orderBy = "views" } = {}) => {
    const params = new URLSearchParams({ limit, offset, order_by: orderBy });
    if (q) params.set("q", q);
    return req("GET", `/performance/yt/${encodeURIComponent(gcid)}/videos?${params.toString()}`);
  },
  getChannelPercentiles: (gcid) =>
    req("GET", `/performance/yt/${encodeURIComponent(gcid)}/percentiles`),
  // Phase 3 — one video's rank in its channel + nearby peers
  compareVideo:  (videoId) =>
    req("GET", `/performance/compare/video/${encodeURIComponent(videoId)}`),
  // Feature 3: same video ranked within every connected channel's
  // distribution. Answers "would this hit have travelled to my other
  // channels?" with per-channel percentile + median context.
  compareVideoAcrossChannels: (videoId) =>
    req("GET", `/performance/compare/video/${encodeURIComponent(videoId)}/across-channels`),
  // Phase 4 — every connected channel side-by-side
  compareChannels: () => req("GET", "/performance/compare/channels"),
  // Stats poll trigger.  channelId null = poll every recent upload (old
  // behaviour); channelId set = refresh ONLY that channel's numbers,
  // saving YouTube Data API quota on the others.
  triggerPoll:      (channelId = null) =>
    req("POST", channelId
                  ? `/performance/poll?channel_id=${encodeURIComponent(channelId)}`
                  : "/performance/poll"),

  // Translation (phase D)
  translateClip:       (clipId, payload) => req("POST", `/clips/${clipId}/translate`, payload),
  listClipTranslations:(clipId)          => req("GET",  `/clips/${clipId}/translations`),

  // Trending radar (phase E)
  listCompetitors:  ()                   => req("GET",    "/trending/competitors"),
  createCompetitor: (payload)            => req("POST",   "/trending/competitors", payload),
  deleteCompetitor: (id)                 => req("DELETE", `/trending/competitors/${id}`),
  listTopics:       (opts = {})          => {
    const q = new URLSearchParams();
    if (opts.urgency)     q.set("urgency", opts.urgency);
    if (opts.unused_only) q.set("unused_only", "true");
    if (opts.limit)       q.set("limit", opts.limit);
    if (opts.since_hours) q.set("since_hours", opts.since_hours);
    if (opts.since)       q.set("since", opts.since);
    if (opts.until)       q.set("until", opts.until);
    if (opts.date_field)  q.set("date_field", opts.date_field);
    const s = q.toString();
    return req("GET", `/trending/topics${s ? "?" + s : ""}`);
  },
  refreshTrending:  (sinceHours)         => req(
    "POST",
    sinceHours ? `/trending/refresh?since_hours=${sinceHours}` : "/trending/refresh",
  ),
  markTopicUsed:    (topicId, jobId)     => req("POST",   `/trending/topics/${topicId}/use?job_id=${jobId}`),
  deleteTopic:      (id)                 => req("DELETE", `/trending/topics/${id}`),
  // ── HeyGen avatar generation from a trending topic ─────────────
  // (Replaces the prior Veo 3 flow — same endpoints under /api/heygen)
  heygenAvatars:        ()      => req("GET",  "/heygen/avatars"),
  heygenVoices:         ()      => req("GET",  "/heygen/voices"),
  heygenGetDefaults:    ()      => req("GET",  "/heygen/defaults"),
  heygenSaveDefaults:   (body)  => req("PUT",  "/heygen/defaults", body),
  heygenGenerateFromTopic:
    (topicId, payload)          => req("POST", `/heygen/generate-from-topic/${topicId}`, payload),
  heygenStatus:         (topicId) => req("GET", `/heygen/status/${topicId}`),

  // ── Live Studio (bulk RTMP-live publishing) ───────────────────
  // Multi-video × multi-channel batches. Each LiveStream row tracks
  // one (video × channel) pair. Browser uploads chunks via PATCH with
  // Content-Range, then POSTs /start to spawn the broadcast worker.
  liveChannels:        ()             => req("GET",  "/live-studio/channels"),
  liveGenerateSeo:     (body)         => req("POST", "/live-studio/seo/generate", body),
  liveBatches:         ()             => req("GET",  "/live-studio/batches"),
  liveBatch:           (id)           => req("GET",  `/live-studio/batches/${id}`),
  liveCreateBatch:     (body)         => req("POST", "/live-studio/batches", body),
  liveStream:          (id)           => req("GET",  `/live-studio/streams/${id}`),
  liveStartStream:     (id)           => req("POST", `/live-studio/streams/${id}/start`),
  liveCancelStream:    (id)           => req("POST", `/live-studio/streams/${id}/cancel`),
  liveHealth:          ()             => req("GET",  "/live-studio/health"),
  liveValidateSeo:     (body)         => req("POST", "/live-studio/seo/validate", body),
  /** Upload a single byte range to one stream. Returns
   * {bytes_written, total, is_complete, status}. ``onProgress`` is
   * called with the response's bytes_written each successful chunk. */
  liveUploadChunk: async (streamId, fileSlice, { start, end, total }) => {
    const tok = getToken();
    const headers = {
      "Content-Range": `bytes ${start}-${end}/${total ?? "*"}`,
      "Content-Type":  "application/octet-stream",
    };
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
    const res = await fetch(`${BASE}/live-studio/streams/${streamId}/chunk`, {
      method: "POST", headers, body: fileSlice,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      throw new Error(err.detail || err.error || `chunk upload ${res.status}`);
    }
    return res.json();
  },
  // Channel discovery for the competitor picker
  listYtCategories:  (region = "IN")     => req("GET", `/trending/yt-categories?region=${encodeURIComponent(region)}`),
  suggestChannels:   (opts = {}) => {
    const q = new URLSearchParams();
    q.set("region", opts.region || "IN");
    if (opts.category) q.set("category", opts.category);
    if (opts.limit)    q.set("limit", opts.limit);
    return req("GET", `/trending/suggest-channels?${q.toString()}`);
  },
  suggestFromProfiles: () => req("GET", "/trending/suggest-from-profiles"),

  // User assets (image library)
  // Assets (including virtual folders for organization).  `folder_path`
  // filter returns only assets directly in that folder (no subtree).
  listAssets:        (folderPath = null) =>
    req("GET", folderPath != null ? `/assets/?folder_path=${encodeURIComponent(folderPath)}` : "/assets/"),
  // Previously-generated assets tagged with a specific source video
  // fingerprint.  Powers the "we already generated images for this
  // video — reuse them?" prompt on the NewJob page after re-upload.
  listAssetsByVideoHash: (hash) =>
    req("GET", `/assets/by-video-hash?hash=${encodeURIComponent(hash || "")}`),
  listAssetFolders:  () => req("GET",    "/assets/folders"),
  createAssetFolder: (path) => req("POST",   "/assets/folders", { path }),
  renameAssetFolder: (old_path, new_path) => req("PATCH",  "/assets/folders", { old_path, new_path }),
  deleteAssetFolder: (path, cascade = false) =>
    req("DELETE", `/assets/folders?path=${encodeURIComponent(path)}&cascade=${cascade}`),
  moveAsset:         (assetId, folder_path) => req("PATCH", `/assets/${assetId}`, { folder_path }),
  // Multi-channel logo apply (power-user shortcut)
  applyLogoToChannels: (channel_ids, logo_asset_id) =>
    req("POST", "/channels/apply-logo", { channel_ids, logo_asset_id }),
  getDefaultAsset: ()        => req("GET",    "/assets/default"),
  patchAsset:      (id, p)   => req("PATCH",  `/assets/${id}`, p),
  deleteAsset:     (id)      => req("DELETE", `/assets/${id}`),
  uploadAsset: (form, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/assets/upload`);
    const _tok = getToken();
    if (_tok) xhr.setRequestHeader("Authorization", `Bearer ${_tok}`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        if (xhr.status === 401) window.dispatchEvent(new CustomEvent("kaizer:unauthorized"));
        try { reject(new Error(JSON.parse(xhr.responseText).detail || xhr.statusText)); }
        catch { reject(new Error(xhr.statusText || "Upload failed")); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(form);
  }),

  // File URL — points to backend for serving pipeline output files
  fileUrl: (path) => path ? `${ORIGIN}/api/file/?path=${encodeURIComponent(path)}` : "",

  // Resolve a URL the backend handed us. Absolute (http/https) URLs pass
  // through unchanged — that's the R2 path (public CDN URL or 1-hour
  // signed URL). Relative URLs (legacy /api/file/?path=...) get the
  // backend origin prepended so they resolve cross-origin in dev.
  mediaUrl: (relUrl) => {
    if (!relUrl) return "";
    if (/^https?:\/\//i.test(relUrl)) return relUrl;
    return `${ORIGIN}${relUrl}`;
  },

  // Append a cache-busting timestamp without breaking the URL. Picks `?`
  // or `&` based on whether the URL already has a query string. Critical
  // for R2 URLs (no `?`) — without this, naive concat produces
  // ".../02.mp4&t=..." which the CDN treats as a literal path and 404s.
  bustCache: (url, ts) => {
    if (!url) return "";
    const sep = url.indexOf("?") === -1 ? "?" : "&";
    return `${url}${sep}t=${ts || Date.now()}`;
  },

  // Cross-origin download via XHR + blob with progress callback
  downloadFile: (url, filename, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    if (onProgress) {
      xhr.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        else onProgress(-1); // indeterminate
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || "clip.mp4";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        resolve();
      } else {
        reject(new Error("Download failed — file may have expired after redeploy"));
      }
    };
    xhr.onerror = () => reject(new Error("Download failed — network error"));
    xhr.send();
  }),

  // POST /api/clips/{id}/download-with-logo/ — streams a branded copy of
  // the clip with the chosen channel's logo overlaid. Browser save
  // dialog is triggered automatically.
  downloadWithLogo: (clipId, channelId, filename, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/clips/${clipId}/download-with-logo/`);
    const tok = getToken();
    if (tok) xhr.setRequestHeader("Authorization", `Bearer ${tok}`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.responseType = "blob";
    if (onProgress) {
      xhr.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        else onProgress(-1);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename || `clip_${clipId}.mp4`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        resolve();
      } else {
        let msg = "Download failed";
        try {
          const txt = xhr.response && xhr.response.text ? xhr.response : null;
          if (txt) msg = txt.toString();
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Download failed — network error"));
    xhr.send(JSON.stringify({ channel_id: channelId }));
  }),

  // GET /api/clips/{id}/download-seo/ — downloads the clip's SEO
  // (title / description / tags / hashtags) as a plain-text file.
  // When channelId is supplied, the SEO is composed for that specific
  // channel (footer + mandatory hashtags + brand overlay applied) so
  // the user sees exactly what would land on that destination.
  // fmt="txt" (default, copy-paste friendly) or "json" (structured).
  downloadClipSeo: (clipId, { channelId = null, fmt = "txt" } = {}) =>
    new Promise((resolve, reject) => {
      const params = new URLSearchParams({ fmt });
      if (channelId) params.set("channel_id", String(channelId));
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `${BASE}/clips/${clipId}/download-seo/?${params.toString()}`);
      const tok = getToken();
      if (tok) xhr.setRequestHeader("Authorization", `Bearer ${tok}`);
      xhr.responseType = "blob";
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const ext = fmt === "json" ? "json" : "txt";
          const filename = `clip_${clipId}_seo.${ext}`;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(xhr.response);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          resolve();
        } else {
          // Read the backend's actual error message instead of swallowing
          // it as "HTTP 404".  FastAPI's HTTPException body is JSON
          // {"detail": "..."}; xhr.response is a Blob because we set
          // responseType="blob" for the happy path, so we re-read it as
          // text and JSON-parse to get the detail.
          const fail = (msg) => reject(new Error(msg));
          try {
            if (xhr.response instanceof Blob) {
              xhr.response.text().then((txt) => {
                let detail = txt;
                try { detail = (JSON.parse(txt) || {}).detail || txt; } catch {}
                fail(detail || `SEO download failed (HTTP ${xhr.status})`);
              }).catch(() => fail(`SEO download failed (HTTP ${xhr.status})`));
            } else {
              fail(`SEO download failed (HTTP ${xhr.status})`);
            }
          } catch {
            fail(`SEO download failed (HTTP ${xhr.status})`);
          }
        }
      };
      xhr.onerror = () => reject(new Error("SEO download failed — network error"));
      xhr.send();
    }),
};

// ── Phase 12 — Admin panel ──────────────────────────────────────────────────
export const adminApi = {
  system:       ()                          => req("GET",  "/admin/system"),
  listUsers:    (q = "", limit = 50, offset = 0) =>
    req("GET", `/admin/users?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
  getUser:      (id)                        => req("GET",  `/admin/users/${id}`),
  toggleAdmin:  (id)                        => req("POST", `/admin/users/${id}/toggle-admin`),
  listJobs:     (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    });
    const q = params.toString();
    return req("GET", `/admin/jobs${q ? `?${q}` : ""}`);
  },
  getJob:       (id)                        => req("GET",  `/admin/jobs/${id}`),
  geminiUsage:  (days = 30, userId = null)  =>
    req("GET", `/admin/gemini-usage?days=${days}${userId ? `&user_id=${userId}` : ""}`),
  // Multi-provider live dashboard — Gemini + OpenAI + YouTube quota in one shot.
  usageDashboard: (days = 30, userId = null) =>
    req("GET", `/admin/usage/dashboard?days=${days}${userId ? `&user_id=${userId}` : ""}`),
  // Persistent CPU/RAM/GPU history for capacity planning.
  // `bucketMinutes>0` server-side aggregates to keep large windows fast.
  systemHistory: (hours = 24, bucketMinutes = 0) =>
    req("GET", `/admin/system/history?hours=${hours}&bucket_minutes=${bucketMinutes}`),
  // Consolidated audit for the RTMP-live agent — totals, recent
  // broadcasts, quota saved vs videos.insert. Drives the small RTMP
  // Activity card on the AI & quota page.
  rtmpActivity: (days = 30) =>
    req("GET", `/admin/rtmp/activity?days=${days}`),
  // Live-log backlog — pair with `streamLogs` below for the live tail.
  recentLogs:   (limit = 500, level = null) =>
    req("GET", `/admin/logs/recent?limit=${limit}${level ? `&level=${level}` : ""}`),
  /**
   * Subscribe to the SSE log stream with proper Bearer auth.
   *
   * Browser EventSource doesn't support custom headers, so we use fetch +
   * ReadableStream and parse `data:` lines ourselves. Returns an `abort()`
   * that the caller invokes on unmount.
   *
   * onEvent({id, ts, level, source, line}) — fires for each `data:` JSON.
   * onError(err)                           — fires on network failure.
   */
  streamLogs: ({ onEvent, onError }) => {
    const ac  = new AbortController();
    const tok = getToken();
    (async () => {
      try {
        const res = await fetch(`${BASE}/admin/logs/stream`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);
        const reader  = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let pending = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let nlnl;
          while ((nlnl = pending.indexOf("\n\n")) !== -1) {
            const block = pending.slice(0, nlnl);
            pending = pending.slice(nlnl + 2);
            // Each block has lines like `data: {...}` or `: keepalive`.
            for (const line of block.split("\n")) {
              if (line.startsWith("data:")) {
                const payload = line.slice(5).trim();
                if (!payload) continue;
                try { onEvent?.(JSON.parse(payload)); } catch {}
              }
            }
          }
        }
      } catch (e) {
        if (e?.name !== "AbortError") onError?.(e);
      }
    })();
    return () => ac.abort();
  },
  liveEvents:   ()                          => req("GET",  "/admin/live-events"),
  audit:        ()                          => req("GET",  "/admin/audit"),
};

// ── Wave 2 — editor beta ────────────────────────────────────────────────────
export const editorApi = {
  listStyles:    ()         => req("GET",  "/editor/styles"),
  renderBeta:    (body)     => req("POST", "/editor/render-beta", body),
  getLastRender: (clipId)   => req("GET",  `/editor/render-beta/${clipId}`),
};

// ── Phase 6 — Autonomous Live Director ─────────────────────────────────────
export const liveApi = {
  listEvents:  ()               => req("GET",  "/live/events"),
  createEvent: (body)           => req("POST", "/live/events", body),
  getEvent:    (id)             => req("GET",  `/live/events/${id}`),
  getDebug:    (id)             => req("GET",  `/live/events/${id}/debug`),
  deleteEvent: (id)             => req("DELETE", `/live/events/${id}`),
  addCamera:   (id, body)       => req("POST", `/live/events/${id}/cameras`, body),
  deleteCamera:(id, cam_id)     => req("DELETE", `/live/events/${id}/cameras/${cam_id}`),
  addLocalCamera: (id, source=0, label="Laptop camera") =>
    req("POST", `/live/events/${id}/local-cameras`, { source, label }),
  enumerateDevices: () =>
    req("GET", `/live/devices/enumerate`),
  start:       (id)             => req("POST", `/live/events/${id}/start`),
  stop:        (id)             => req("POST", `/live/events/${id}/stop`),
  pin:         (id, cam_id)     => req("POST", `/live/events/${id}/pin`, { cam_id }),
  unpin:       (id)             => req("POST", `/live/events/${id}/unpin`),
  blacklist:   (id, cam_id)     => req("POST", `/live/events/${id}/blacklist`, { cam_id }),
  allow:       (id, cam_id)     => req("POST", `/live/events/${id}/allow`, { cam_id }),
  forceCut:    (id, cam_id)     => req("POST", `/live/events/${id}/force-cut`, { cam_id }),
  getLog:      (id, limit=200)  => req("GET",  `/live/events/${id}/log?limit=${limit}`),

  // ── Phase 9 — phone-as-camera test mode ─────────────────────────────────
  // Mints a one-shot ingest session for a phone browser to push webm over
  // WebSocket. Returns {cam_id, token, phone_url, ingest_ws_url} — the
  // frontend prepends window.location.origin to phone_url for the QR code.
  createPhoneSession: (eventId) =>
    req("POST", `/live/events/${eventId}/phone-sessions`),

  // ── Phase 7 — Relay / Broadcast destinations ────────────────────────────
  listRelayDestinations:  (eventId)            => req("GET",    `/live/events/${eventId}/relay/destinations`),
  addRelayDestination:    (eventId, dest)      => req("POST",   `/live/events/${eventId}/relay/destinations`, dest),
  removeRelayDestination: (eventId, destId)    => req("DELETE", `/live/events/${eventId}/relay/destinations/${destId}`),
  startRelay:             (eventId)            => req("POST",   `/live/events/${eventId}/relay/start`),
  stopRelay:              (eventId)            => req("POST",   `/live/events/${eventId}/relay/stop`),
  getRelayStatus:         (eventId)            => req("GET",    `/live/events/${eventId}/relay/status`),

  // ── Phase 7 — Per-camera chroma key ─────────────────────────────────────
  setCameraChroma:        (eventId, camId, config) =>
    req("PUT",    `/live/events/${eventId}/cameras/${camId}/chroma`, config),
  removeCameraChroma:     (eventId, camId)     =>
    req("DELETE", `/live/events/${eventId}/cameras/${camId}/chroma`),

  // ── Phase 7 — Dead-air bridge ───────────────────────────────────────────
  setBridge:              (eventId, config)    => req("PUT",    `/live/events/${eventId}/bridge`, config),

  // ── Phase 8 — Layout lock (forward-looking: endpoint may not exist yet) ──
  // When the user picks a layout tile in the LiveDirector and hits "Lock",
  // we POST here. If the backend hasn't shipped the endpoint yet, a 404 is
  // caught by the caller and surfaced as "Layout locking coming soon".
  setLockedLayout:        (eventId, body)      =>
    req("POST", `/live/events/${eventId}/lock-layout`, body),
  releaseLockedLayout:    (eventId)            =>
    req("POST", `/live/events/${eventId}/lock-layout`, { layout: null }),
};
