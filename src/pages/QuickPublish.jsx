import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Film, Loader2, Zap, Languages, AlertCircle, Info,
} from "lucide-react";
import { api } from "../api/client";

const PLATFORM_OPTIONS = [
  { key: "youtube_full",   label: "YouTube (regular)" },
  { key: "youtube_short",  label: "YouTube Short" },
  { key: "instagram_reel", label: "Instagram Reel" },
];

export default function QuickPublish() {
  const navigate = useNavigate();
  const dropRef = useRef(null);

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("youtube_full");
  const [language, setLanguage] = useState("te");
  const [languages, setLanguages] = useState([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listLanguages().then((list) => setLanguages(list || [])).catch(() => {});
  }, []);

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over  = (e) => { e.preventDefault(); el.classList.add("border-accent2"); };
    const leave = () => el.classList.remove("border-accent2");
    const drop  = (e) => {
      e.preventDefault();
      el.classList.remove("border-accent2");
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("video/")) {
        setFile(f);
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      }
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [title]);

  async function submit() {
    if (!file) {
      setError("Pick a video file first.");
      return;
    }
    setSubmitting(true);
    setUploadPct(0);
    setError("");
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("title", title.trim());
      form.append("platform", platform);
      form.append("language", language);
      const res = await api.rawUpload(form, (pct) => setUploadPct(pct));
      // Jump straight to the Editor for this clip — SEO + Publish live there
      navigate(`/jobs/${res.job_id}/edit/${res.clip_id}`);
    } catch (e) {
      setError(e.message || "Upload failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Zap className="text-accent2" size={24} /> Quick Publish
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Already-edited video? Skip the pipeline. Upload → generate SEO → publish to YouTube.
        </p>
      </header>

      <div className="mb-5 p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 leading-relaxed">
        <div className="flex items-start gap-2">
          <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            This path is for videos you've <strong className="text-gray-100">already edited</strong> and just need SEO +
            upload. For raw footage that needs cutting / thumbnails / on-screen
            cards, use <span className="text-accent2">New Job</span> instead.
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6 flex flex-col gap-5">
        {/* File picker */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-2">Video file</label>
          <label
            ref={dropRef}
            className="border-2 border-dashed border-border rounded-lg p-6 sm:p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-gray-500 transition-colors"
          >
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) {
                  setFile(f);
                  if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
            {file ? (
              <>
                <Film size={32} className="text-accent" />
                <span className="text-white font-medium text-center break-all">{file.name}</span>
                <span className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                <Upload size={32} className="text-gray-600" />
                <span className="text-gray-400 text-center text-sm">Drag & drop or click to select a finished video</span>
                <span className="text-gray-600 text-xs">MP4, MKV, MOV supported</span>
              </>
            )}
          </label>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Working title <span className="text-gray-600">(optional)</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Used until SEO generates the real title"
            className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
          />
        </div>

        {/* Platform + Language */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Target platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1.5">
              <Languages size={12} /> Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native} — {l.english}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitting && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{uploadPct < 100 ? "Uploading…" : "Preparing clip…"}</span>
              <span>{uploadPct}%</span>
            </div>
            <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all duration-300 rounded-full" style={{ width: `${uploadPct}%` }} />
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!file || submitting}
          className="btn btn-primary w-full flex items-center justify-center gap-2 py-2.5"
        >
          {submitting
            ? <><Loader2 size={16} className="animate-spin" /> {uploadPct < 100 ? `Uploading ${uploadPct}%` : "Creating clip…"}</>
            : <><Zap size={16} /> Upload & go to SEO / Publish</>}
        </button>
      </div>
    </div>
  );
}
