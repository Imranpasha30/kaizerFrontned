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

  // SEO (phase 2+3)
  generateClipSEO: (clipId, payload) => req("POST",   `/clips/${clipId}/seo/generate`, payload),
  getClipSEOStatus: (clipId)         => req("GET",    `/clips/${clipId}/seo/status`),
  updateClipSEO:   (clipId, payload) => req("PUT",    `/clips/${clipId}/seo`, payload),
  clearClipSEO:    (clipId)          => req("DELETE", `/clips/${clipId}/seo`),
  bulkGenerateSEO: (jobId, payload)  => req("POST",   `/jobs/${jobId}/seo/generate-all`, payload),

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
  listAssets:      ()        => req("GET",    "/assets/"),
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
