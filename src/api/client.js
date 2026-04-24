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
  getLeaderboard:   (limit = 50)         => req("GET",    `/performance/leaderboard?limit=${limit}`),
  getCalibration:   ()                   => req("GET",    "/performance/calibration"),
  getPerfHistory:   (uploadId)           => req("GET",    `/performance/history/${uploadId}`),
  triggerPoll:      ()                   => req("POST",   "/performance/poll"),

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
  // Veo 3 video generation from a trending topic
  veoGenerateFromTopic: (topicId, payload = { platform: "youtube_short", language: "te" }) =>
    req("POST", `/veo/generate-from-topic/${topicId}`, payload),
  veoStatus: (topicId) => req("GET", `/veo/status/${topicId}`),
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

  // Prefix backend origin to a relative API URL (e.g. /api/file/?path=...)
  mediaUrl: (relUrl) => relUrl ? `${ORIGIN}${relUrl}` : "",

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
