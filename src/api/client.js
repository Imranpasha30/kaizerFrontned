// In production VITE_API_URL = https://your-backend.railway.app
// In dev, empty string → Vite proxy handles /api → localhost:8000
const ORIGIN = import.meta.env.VITE_API_URL || "";
const BASE   = `${ORIGIN}/api`;

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Config
  platforms:    () => req("GET", "/platforms/"),
  frameLayouts: () => req("GET", "/frame-layouts/"),

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
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
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
  exportJob:    (id)         => req("POST",   `/jobs/${id}/export/`),
  deleteJob:    (id)         => req("DELETE", `/jobs/${id}/delete/`),

  // Clips
  getClip:      (id)         => req("GET",  `/clips/${id}/`),
  rerenderClip: (id, edits)  => req("POST", `/clips/${id}/rerender/`, edits),
  uploadImage:  (id, form)   => req("POST", `/clips/${id}/upload-image/`, form, true),

  // File URL — points to backend for serving pipeline output files
  fileUrl: (path) => path ? `${ORIGIN}/api/file/?path=${encodeURIComponent(path)}` : "",

  // Prefix backend origin to a relative API URL (e.g. /api/file/?path=...)
  mediaUrl: (relUrl) => relUrl ? `${ORIGIN}${relUrl}` : "",

  // Cross-origin download via fetch + blob (download attribute ignored cross-origin)
  downloadFile: async (url, filename) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed — file may have expired after redeploy");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "clip.mp4";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
};
