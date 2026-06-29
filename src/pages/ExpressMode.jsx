import React, { useEffect, useRef, useState } from "react";
import {
  Zap, Upload, Film, Loader2, AlertCircle, CheckCircle2, Info,
  Key, Sparkles, Rocket, RefreshCw,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Express Mode — "lazy user" auto-publish page.
 *
 * Mirrors the teammate's postiz-yt-dashboard one-click flow:
 *   API keys → pick video → brief + names → pick channels → 1 button
 *
 * Session 1 ships PUBLISH-AS-IS only (no AI trim, no shorts yet).
 * The other strategy toggles are rendered + disabled with "Coming in
 * Session 2" hints so the layout is final from day 1.
 *
 * Keys are stored in browser localStorage ONLY — never sent to the
 * Kaizer server except as the per-request multipart form field that
 * forwards them straight to the upstream API (Anthropic / Groq).
 */

// localStorage keys — namespaced so they don't collide with other panels.
const LS = {
  anthropic:        "kaizer_express_anthropic_key",
  transcribeKey:    "kaizer_express_transcribe_key",
  transcribeProv:   "kaizer_express_transcribe_provider",
  transcribeBase:   "kaizer_express_transcribe_base",
  transcribeModel:  "kaizer_express_transcribe_model",
  styleGuide:       "kaizer_express_style_guide",
  lastIntegrations: "kaizer_express_last_integrations",
  openai:           "kaizer_express_openai_key",
};

function lsGet(k, fallback = "") {
  try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}


export default function ExpressMode() {
  // ── Keys ────────────────────────────────────────────────────────
  const [anthropicKey, setAnthropicKey]    = useState(() => lsGet(LS.anthropic));
  const [openaiKey,    setOpenaiKey]       = useState(() => lsGet(LS.openai));
  const [transProvider, setTransProvider]  = useState(() => lsGet(LS.transcribeProv, "groq"));
  const [transKey,      setTransKey]       = useState(() => lsGet(LS.transcribeKey));
  const [transBase,     setTransBase]      = useState(() => lsGet(LS.transcribeBase));
  const [transModel,    setTransModel]     = useState(() => lsGet(LS.transcribeModel));
  const [styleGuide,    setStyleGuide]     = useState(() => lsGet(LS.styleGuide));
  const [revealKeys,    setRevealKeys]     = useState(false);

  // ── Video ──────────────────────────────────────────────────────
  const [file,  setFile]  = useState(null);
  const [batchFiles, setBatchFiles] = useState([]); // [{file, status: queued|running|done|failed, result?}]
  const [batchMode,  setBatchMode]  = useState(false);
  const dropRef = useRef(null);

  // ── Brief + names + strategy ───────────────────────────────────
  const [brief,        setBrief]       = useState("");
  const [namesHint,    setNamesHint]   = useState("");
  const [language,     setLanguage]    = useState("te");
  const [mode,         setMode]        = useState("publish-as-is");
  const [privacy,      setPrivacy]     = useState("private");
  const [madeForKids,  setMadeForKids] = useState(false);
  const [titleOver,    setTitleOver]   = useState("");
  const [tagsOver,     setTagsOver]    = useState("");
  const [scheduleAt,   setScheduleAt]  = useState("");      // ISO
  const [colorGrade,   setColorGrade]  = useState("subtle"); // off | subtle | cinematic | news-vivid | warm | cool
  const [cinematic,    setCinematic]   = useState(false);    // AI Trim + Shorts
  const [panelColor,   setPanelColor]  = useState("#dc2626"); // Shorts only
  const [footerText,   setFooterText]  = useState("KAIZER X NETWORK");
  const [shortCount,   setShortCount]  = useState("");        // blank = auto from duration
  const [insetStrategy,    setInsetStrategy]    = useState("frame"); // frame | ai
  const [thumbnailStrategy,setThumbnailStrategy]= useState("none");  // none | ai
  const [layout,           setLayout]           = useState("news");        // news | branded
  const [logoCorner,       setLogoCorner]       = useState("top-right");   // branded only

  // ── Postiz integrations ────────────────────────────────────────
  const [integrations, setIntegrations]     = useState([]);
  const [integLoading, setIntegLoading]     = useState(true);
  const [integError,   setIntegError]       = useState("");
  const [selectedIIds, setSelectedIIds]     = useState(() => {
    try { return new Set(JSON.parse(lsGet(LS.lastIntegrations, "[]")) || []); }
    catch { return new Set(); }
  });

  // ── Job state ──────────────────────────────────────────────────
  const [jobId,        setJobId]        = useState(null);
  const [jobStatus,    setJobStatus]    = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");
  const pollRef = useRef(null);

  // ── Job history (jobs from this user's TTL window) ────────────
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError,   setHistoryError]   = useState("");

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const r = await api.expressJobs();
      setHistory(r.jobs || []);
    } catch (e) {
      setHistoryError(e.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load on mount + refresh whenever a job finishes.
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    if (jobStatus && (jobStatus.status === "done" || jobStatus.status === "failed")) {
      loadHistory();
    }
  }, [jobStatus?.status]);

  // ── Server-side key status (env fallbacks) ────────────────────
  // The UI doesn't have access to ANTHROPIC_API_KEY / GROQ_API_KEY
  // in .env, so on mount we ask the backend which keys it already
  // has. Fields where the server has a fallback show a green badge
  // and the empty-input "required" validation is skipped.
  const [keyStatus, setKeyStatus] = useState({
    anthropic: false, groq: false, openai: false, postiz: false,
    anthropic_model: "",
  });

  // ── Persist keys on edit ───────────────────────────────────────
  useEffect(() => { lsSet(LS.anthropic, anthropicKey); }, [anthropicKey]);
  useEffect(() => { lsSet(LS.openai, openaiKey); }, [openaiKey]);
  useEffect(() => { lsSet(LS.transcribeProv, transProvider); }, [transProvider]);
  useEffect(() => { lsSet(LS.transcribeKey, transKey); }, [transKey]);
  useEffect(() => { lsSet(LS.transcribeBase, transBase); }, [transBase]);
  useEffect(() => { lsSet(LS.transcribeModel, transModel); }, [transModel]);
  useEffect(() => { lsSet(LS.styleGuide, styleGuide); }, [styleGuide]);

  // ── Load Postiz integrations on mount ─────────────────────────
  const loadIntegrations = async () => {
    setIntegLoading(true);
    setIntegError("");
    try {
      const r = await api.expressIntegrations();
      setIntegrations(r.integrations || []);
    } catch (e) {
      setIntegError(e.message || "Failed to load Postiz integrations");
    } finally {
      setIntegLoading(false);
    }
  };
  useEffect(() => { loadIntegrations(); }, []);

  // Poll the key-status endpoint once. The .env can change between
  // refreshes; on remount we re-check so a freshly-added env key
  // becomes visible without a full server restart.
  useEffect(() => {
    api.expressKeyStatus()
      .then((r) => setKeyStatus({
        anthropic:        !!r.anthropic,
        groq:             !!r.groq,
        openai:           !!r.openai,
        postiz:           !!r.postiz,
        anthropic_model:  r.anthropic_model || "",
      }))
      .catch(() => {/* non-fatal — UI still works, validation just stays strict */});
  }, []);

  // ── Drag-and-drop ─────────────────────────────────────────────
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over  = (e) => { e.preventDefault(); el.classList.add("border-accent2"); };
    const leave = () => el.classList.remove("border-accent2");
    const drop  = (e) => {
      e.preventDefault();
      el.classList.remove("border-accent2");
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("video/")) setFile(f);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, []);

  // ── Toggle integration selection ──────────────────────────────
  function toggleInteg(id) {
    setSelectedIIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { lsSet(LS.lastIntegrations, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  // ── Submit ───────────────────────────────────────────────────
  // Build a FormData for a single file using the current shared settings
  // (called once for single-video submit and N times for batch mode).
  function buildFormData(fileObj) {
    const fd = new FormData();
    fd.append("file", fileObj);
    fd.append("integration_ids", JSON.stringify([...selectedIIds]));
    fd.append("mode", mode);
    fd.append("anthropic_api_key", anthropicKey);
    fd.append("transcription_provider", transProvider);
    fd.append("transcription_api_key", transKey);
    if (transBase)  fd.append("transcription_base_url", transBase);
    if (transModel) fd.append("transcription_model",    transModel);
    fd.append("brief", brief);
    fd.append("names_hint", namesHint);
    fd.append("style_guide", styleGuide);
    fd.append("language", language || "");
    fd.append("privacy", privacy);
    fd.append("made_for_kids", madeForKids ? "true" : "false");
    fd.append("color_grade", colorGrade);
    fd.append("cinematic_edit", cinematic ? "true" : "false");
    if (openaiKey) fd.append("openai_api_key", openaiKey);
    if (mode === "shorts") {
      fd.append("panel_color", panelColor);
      fd.append("footer_text", footerText);
      if (shortCount) fd.append("short_count_override", shortCount);
      fd.append("inset_strategy", insetStrategy);
      fd.append("layout", layout);
      if (layout === "branded") fd.append("logo_corner", logoCorner);
    }
    if (mode === "ai-trim") {
      fd.append("thumbnail_strategy", thumbnailStrategy);
    }
    if (titleOver)  fd.append("title_override", titleOver);
    if (tagsOver)   fd.append("tags_override",  tagsOver);
    if (scheduleAt) fd.append("schedule_at_iso", scheduleAt);
    return fd;
  }

  // Helper: submit one /start, then poll /status until done/failed.
  // Resolves with the final job-status object (status === 'done' or 'failed').
  async function submitAndWait(fileObj, onTick) {
    const r = await api.expressStart(buildFormData(fileObj));
    const jid = r.job_id;
    let lastStatus = { status: "queued", step: "starting", progress: 0, message: "Queued" };
    for (;;) {
      const s = await api.expressStatus(jid);
      lastStatus = s;
      if (onTick) onTick(s);
      if (s.status === "done" || s.status === "failed") return s;
      await new Promise((res) => setTimeout(res, 2000));
    }
  }

  async function submit() {
    setSubmitError("");

    // ── Batch path: kick off N sequential jobs and track each one.
    if (batchMode) {
      if (batchFiles.length === 0) { setSubmitError("Add at least one video to the batch."); return; }
      if (selectedIIds.size === 0) { setSubmitError("Pick at least one Postiz channel."); return; }
      if (!anthropicKey.trim() && !keyStatus.anthropic) {
        setSubmitError("Anthropic key required (or set ANTHROPIC_API_KEY in .env).");
        return;
      }
      const provEnvOk =
        (transProvider === "groq"   && keyStatus.groq) ||
        (transProvider === "openai" && keyStatus.openai);
      if (!transKey.trim() && !provEnvOk) {
        setSubmitError("Transcription key required (or set GROQ_API_KEY / OPENAI_API_KEY in .env).");
        return;
      }
      setSubmitting(true);
      // Mark all as queued.
      setBatchFiles((prev) => prev.map((b) => ({ ...b, status: "queued", error: "", result: null })));
      for (let i = 0; i < batchFiles.length; i++) {
        // Mark current as running.
        setBatchFiles((prev) => prev.map((b, idx) => idx === i ? { ...b, status: "running" } : b));
        // Show this video's progress in the main bar.
        setJobId(`batch-${i}`);
        setJobStatus({ status: "running", step: "starting", progress: 0, message: `Video ${i + 1}/${batchFiles.length}` });
        try {
          const finalS = await submitAndWait(batchFiles[i].file, (s) => setJobStatus(s));
          setBatchFiles((prev) => prev.map((b, idx) => idx === i
            ? { ...b, status: finalS.status, result: finalS.results, error: finalS.error || "" }
            : b));
        } catch (e) {
          setBatchFiles((prev) => prev.map((b, idx) => idx === i
            ? { ...b, status: "failed", error: e.message || "Submit failed" }
            : b));
        }
      }
      setSubmitting(false);
      setJobId(null);
      setJobStatus(null);
      return;
    }

    // ── Single-video path
    if (!file) { setSubmitError("Pick a video first."); return; }
    if (selectedIIds.size === 0) {
      setSubmitError("Pick at least one Postiz channel below.");
      return;
    }
    // Anthropic + Whisper keys are only "required" client-side when
    // the server doesn't have an env fallback. With env in place the
    // pipeline picks the env key up automatically.
    if (!anthropicKey.trim() && !keyStatus.anthropic) {
      setSubmitError("Anthropic key is required for SEO generation.");
      return;
    }
    const provHasEnvFallback =
      (transProvider === "groq"   && keyStatus.groq) ||
      (transProvider === "openai" && keyStatus.openai);
    if (!transKey.trim() && !provHasEnvFallback) {
      setSubmitError("Transcription provider key is required (Groq or OpenAI).");
      return;
    }

    setSubmitting(true);
    try {
      const fd = buildFormData(file);
      const r = await api.expressStart(fd);
      setJobId(r.job_id);
      setJobStatus({ status: "queued", step: "starting", progress: 0, message: "Queued" });
    } catch (e) {
      setSubmitError(e.message || "Submit failed");
      setSubmitting(false);
    }
  }

  // ── Poll job status every 2s while running ───────────────────
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await api.expressStatus(jobId);
        if (cancelled) return;
        setJobStatus(s);
        if (s.status === "done" || s.status === "failed") {
          setSubmitting(false);
          return;   // stop polling
        }
      } catch (e) {
        if (cancelled) return;
        setJobStatus((cur) => ({ ...(cur || {}), message: `poll error: ${e.message}` }));
      }
      pollRef.current = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [jobId]);

  // ── Reset for next run ───────────────────────────────────────
  function resetRun() {
    setJobId(null);
    setJobStatus(null);
    setSubmitError("");
    setSubmitting(false);
    setFile(null);
  }

  // ── Render ───────────────────────────────────────────────────
  const isRunning = submitting && jobStatus && jobStatus.status !== "done" && jobStatus.status !== "failed";
  const isDone    = jobStatus && jobStatus.status === "done";
  const isFailed  = jobStatus && jobStatus.status === "failed";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Rocket className="text-accent2" size={24} /> Express Mode
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          One-click auto-publish — Whisper → Claude SEO → Postiz. Just upload, fill the brief, hit go.
        </p>
      </header>

      <div className="mb-5 p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 leading-relaxed flex items-start gap-2">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          For lazy users — skip the editor entirely. Upload a finished video, write 1-3 sentences about it,
          list any proper-noun names, pick channels, click <strong className="text-gray-100">Auto-publish</strong>.
          Session 1 ships <strong className="text-gray-100">publish-as-is</strong> mode (AI SEO + Postiz upload).
          Sessions 2–3 add Claude shorts cut + AI trim + cinematic mode.
        </div>
      </div>

      {/* ── Step 1: API keys ────────────────────────────────────── */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-1.5 mb-3">
          <Key size={14} className="text-accent2" /> 1. API keys
          <span className="text-[10px] font-normal text-gray-600 ml-1">stored in this browser only</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="block text-gray-400 mb-1">
              Anthropic <em className="text-gray-600 not-italic">(Claude for SEO)</em>
              {keyStatus.anthropic && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 not-italic">
                  ✓ server fallback {keyStatus.anthropic_model && <span className="opacity-70">({keyStatus.anthropic_model})</span>}
                </span>
              )}
            </span>
            <input
              type={revealKeys ? "text" : "password"}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder={keyStatus.anthropic ? "leave blank to use server key" : "sk-ant-…"}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            />
          </label>

          <label className="text-xs">
            <span className="block text-gray-400 mb-1">
              OpenAI <em className="text-gray-600 not-italic">(for AI inset photos + thumbnails — optional)</em>
              {keyStatus.openai && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 not-italic">
                  ✓ server fallback
                </span>
              )}
            </span>
            <input
              type={revealKeys ? "text" : "password"}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={keyStatus.openai ? "leave blank to use server key" : "sk-proj-… (blank = no AI images)"}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            />
          </label>

          <label className="text-xs">
            <span className="block text-gray-400 mb-1">Transcription provider</span>
            <select
              value={transProvider}
              onChange={(e) => setTransProvider(e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            >
              <option value="groq">Groq — free tier, best for Indic languages</option>
              <option value="openai">OpenAI — paid balance required</option>
              <option value="custom">Custom (Emergent / OpenRouter / self-hosted)</option>
            </select>
          </label>

          <label className="text-xs sm:col-span-2">
            <span className="block text-gray-400 mb-1">
              {transProvider === "groq" ? "Groq" : transProvider === "openai" ? "OpenAI" : "Custom provider"} key
              {((transProvider === "groq" && keyStatus.groq) || (transProvider === "openai" && keyStatus.openai)) && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 not-italic">
                  ✓ server fallback
                </span>
              )}
            </span>
            <input
              type={revealKeys ? "text" : "password"}
              value={transKey}
              onChange={(e) => setTransKey(e.target.value)}
              placeholder={
                (transProvider === "groq" && keyStatus.groq) || (transProvider === "openai" && keyStatus.openai)
                  ? "leave blank to use server key"
                  : "paste your provider key"
              }
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            />
          </label>

          {transProvider === "custom" && (
            <>
              <label className="text-xs">
                <span className="block text-gray-400 mb-1">Base URL</span>
                <input
                  type="text"
                  value={transBase}
                  onChange={(e) => setTransBase(e.target.value)}
                  placeholder="https://…/v1"
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                />
              </label>
              <label className="text-xs">
                <span className="block text-gray-400 mb-1">Model</span>
                <input
                  type="text"
                  value={transModel}
                  onChange={(e) => setTransModel(e.target.value)}
                  placeholder="whisper-large-v3"
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                />
              </label>
            </>
          )}

          <label className="text-xs sm:col-span-2">
            <span className="block text-gray-400 mb-1">
              SEO style guide <em className="text-gray-600 not-italic">(optional — Claude mimics this tone/branding)</em>
            </span>
            <textarea
              rows={4}
              value={styleGuide}
              onChange={(e) => setStyleGuide(e.target.value)}
              placeholder={`Title: ...\nDescription: ...\n#tag1 #tag2`}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs resize-y"
            />
          </label>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRevealKeys(!revealKeys)}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            {revealKeys ? "hide keys" : "show keys"}
          </button>
        </div>
      </section>

      {/* ── Step 2: Video ──────────────────────────────────────── */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-1.5">
          <Film size={14} className="text-accent" /> 2. Pick your video
          <label className="ml-auto text-[11px] text-gray-500 font-normal flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(e) => setBatchMode(e.target.checked)}
            />
            Batch (multi-video)
          </label>
        </h2>

        {!batchMode && (
          <label
            ref={dropRef}
            className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-gray-500 transition-colors"
          >
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files[0]; if (f) setFile(f); }}
            />
            {file ? (
              <>
                <Film size={32} className="text-accent" />
                <span className="text-white text-center break-all text-sm">{file.name}</span>
                <span className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                <Upload size={32} className="text-gray-600" />
                <span className="text-gray-400 text-sm">Drag & drop or click to select</span>
                <span className="text-gray-600 text-xs">MP4 recommended — up to 2 GB</span>
              </>
            )}
          </label>
        )}

        {batchMode && (
          <div className="flex flex-col gap-2">
            <label className="border-2 border-dashed border-border rounded-lg p-4 flex items-center justify-center gap-2 cursor-pointer hover:border-gray-500">
              <input
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const arr = Array.from(e.target.files || []);
                  if (arr.length === 0) return;
                  setBatchFiles((prev) => [
                    ...prev,
                    ...arr.map((f) => ({ file: f, status: "queued", error: "", result: null })),
                  ]);
                  e.target.value = "";
                }}
              />
              <Upload size={16} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                {batchFiles.length > 0
                  ? `Add more videos (${batchFiles.length} queued)`
                  : "Click to add multiple videos"}
              </span>
            </label>

            {batchFiles.length > 0 && (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {batchFiles.map((b, idx) => (
                  <li
                    key={idx}
                    className={`flex items-center gap-2 p-2 rounded border text-xs ${
                      b.status === "done"     ? "border-emerald-500/40 bg-emerald-500/5" :
                      b.status === "failed"   ? "border-red-500/40 bg-red-500/5" :
                      b.status === "running"  ? "border-accent2/40 bg-accent2/5" :
                                                "border-border bg-black/30"
                    }`}
                  >
                    {b.status === "running" && <Loader2 size={12} className="animate-spin text-accent2" />}
                    {b.status === "done"    && <CheckCircle2 size={12} className="text-emerald-400" />}
                    {b.status === "failed"  && <AlertCircle size={12} className="text-red-400" />}
                    {b.status === "queued"  && <Film size={12} className="text-gray-500" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate">{b.file.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {(b.file.size / 1024 / 1024).toFixed(1)} MB
                        {b.error && <span className="text-red-300 ml-2">— {b.error.slice(0, 100)}</span>}
                      </div>
                    </div>
                    {!submitting && (
                      <button
                        type="button"
                        onClick={() => setBatchFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-[10px] text-gray-500 hover:text-red-300"
                      >
                        remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-gray-500">
              Each video is processed sequentially with the SAME settings (brief, channels, mode).
              Failures don't block subsequent videos. Per-video brief override coming in a later release.
            </p>
          </div>
        )}
      </section>

      {/* ── Step 3: Brief + names + strategy ────────────────────── */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-1.5">
          <Sparkles size={14} className="text-accent2" /> 3. Tell Claude about it
        </h2>

        <label className="block text-xs mb-3">
          <span className="block text-gray-400 mb-1">
            Video brief <em className="text-gray-600 not-italic">(1-3 sentences — what's the video about?)</em>
          </span>
          <textarea
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="A debate between Andhra and Telangana ministers about the new water-sharing agreement…"
            className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs resize-y"
          />
        </label>

        <label className="block text-xs mb-3">
          <span className="block text-gray-400 mb-1">
            Names hint <em className="text-gray-600 not-italic">(comma-separated proper nouns the Whisper model should bias toward)</em>
          </span>
          <input
            type="text"
            value={namesHint}
            onChange={(e) => setNamesHint(e.target.value)}
            placeholder="Pawan Kalyan, Chandrababu Naidu, KCR, Hyderabad"
            className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <label>
            <span className="block text-gray-400 mb-1">Transcript language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            >
              <option value="">auto-detect</option>
              <option value="te">Telugu</option>
              <option value="hi">Hindi</option>
              <option value="en">English</option>
            </select>
          </label>

          <label>
            <span className="block text-gray-400 mb-1">Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            >
              <option value="publish-as-is">Publish-as-is</option>
              <option value="ai-trim">AI Trim (Claude picks segments)</option>
              <option value="shorts">Cut Shorts (TV news panel)</option>
            </select>
          </label>

          <label>
            <span className="block text-gray-400 mb-1">Privacy</span>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>

        {/* Shorts controls — TV news panel options */}
        {mode === "shorts" && (
          <div className="mt-3 p-3 rounded bg-accent2/5 border border-accent2/20 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-accent2 mb-2 font-semibold">
              Shorts panel + render options
            </div>

            {/* Layout selector + active badge so the user can confirm
                exactly which one will be applied to each cut. */}
            <div className="mb-3 p-2 rounded bg-black/40 border border-border flex items-center gap-3">
              <label className="text-[11px] flex items-center gap-2 flex-1">
                <span className="text-gray-400">Layout:</span>
                <select
                  value={layout}
                  onChange={(e) => setLayout(e.target.value)}
                  className="bg-black border border-border rounded px-2 py-1 text-white text-xs"
                >
                  <option value="news">News split-panel (TV9 / BIG TV style)</option>
                  <option value="branded">Branded reframe (blurred-bg)</option>
                </select>
              </label>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                layout === "news"
                  ? "bg-red-500/20 border border-red-500/40 text-red-200"
                  : "bg-sky-500/20 border border-sky-500/40 text-sky-200"
              }`}>
                using: {layout}
              </span>
            </div>

            {layout === "branded" && (
              <div className="mb-3 p-2 rounded bg-sky-500/5 border border-sky-500/20 text-[11px]">
                <label className="flex items-center gap-2">
                  <span className="text-gray-400">Logo corner:</span>
                  <select
                    value={logoCorner}
                    onChange={(e) => setLogoCorner(e.target.value)}
                    className="bg-black border border-border rounded px-2 py-1 text-white text-xs"
                  >
                    <option value="top-right">Top-right</option>
                    <option value="top-left">Top-left</option>
                    <option value="bottom-right">Bottom-right</option>
                    <option value="bottom-left">Bottom-left</option>
                  </select>
                </label>
                <p className="text-[10px] text-gray-500 mt-1">
                  Branded layout uses a blurred-background reframe of your source with a
                  title band on top and the logo in the chosen corner. Panel color, footer,
                  and inset photo are ignored in this layout.
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${
              layout === "branded" ? "opacity-50 pointer-events-none" : ""
            }`}>
            {layout === "branded" && (
              <div className="sm:col-span-3 text-[10px] text-amber-300">
                Panel color / footer / inset don't apply to the branded layout — switch to "News split-panel" to use them.
              </div>
            )}
              <label>
                <span className="block text-gray-400 mb-1">Panel color</span>
                <div className="flex gap-1.5">
                  <input
                    type="color"
                    value={panelColor}
                    onChange={(e) => setPanelColor(e.target.value)}
                    className="w-10 h-8 bg-black border border-border rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={panelColor}
                    onChange={(e) => setPanelColor(e.target.value)}
                    className="flex-1 bg-black border border-border rounded px-2 py-1.5 text-white text-xs font-mono"
                  />
                </div>
              </label>
              <label>
                <span className="block text-gray-400 mb-1">Color grade</span>
                <select
                  value={colorGrade}
                  onChange={(e) => setColorGrade(e.target.value)}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                >
                  <option value="off">Off</option>
                  <option value="subtle">Subtle</option>
                  <option value="news-vivid">News-vivid</option>
                  <option value="cinematic">Cinematic</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                </select>
              </label>
              <label>
                <span className="block text-gray-400 mb-1">
                  # shorts <em className="text-gray-600 not-italic">(blank = auto)</em>
                </span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={shortCount}
                  onChange={(e) => setShortCount(e.target.value)}
                  placeholder="auto"
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="block text-gray-400 mb-1">Footer text</span>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                />
              </label>
              <label>
                <span className="block text-gray-400 mb-1">
                  Inset photo <em className="text-gray-600 not-italic">(per short)</em>
                </span>
                <select
                  value={insetStrategy}
                  onChange={(e) => setInsetStrategy(e.target.value)}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                >
                  <option value="frame">Video frame (midpoint)</option>
                  <option value="ai" disabled={!openaiKey}>AI per short (gpt-image-1){!openaiKey ? " — needs OpenAI key" : ""}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={cinematic}
                  onChange={(e) => setCinematic(e.target.checked)}
                />
                <span className="text-gray-300">
                  Cinematic <span className="text-gray-500">(Ken Burns + grain)</span>
                </span>
              </label>
            </div>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
              Claude picks 2-5 self-contained 15-60s moments. Each gets the TV news split layout:
              source video top half, panel bottom with the bomb-word Telugu title overlay + a
              video-frame inset photo. Cut count auto-scales with source duration (3 min → 2, 6+ min → 5).
            </p>
          </div>
        )}

        {/* AI Trim controls — only relevant for ai-trim mode */}
        {mode === "ai-trim" && (
          <div className="mt-3 p-3 rounded bg-accent2/5 border border-accent2/20 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-accent2 mb-2 font-semibold">
              AI Trim render options
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="block text-gray-400 mb-1">Color grade</span>
                <select
                  value={colorGrade}
                  onChange={(e) => setColorGrade(e.target.value)}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                >
                  <option value="off">Off — no grade</option>
                  <option value="subtle">Subtle (pro polish)</option>
                  <option value="news-vivid">News-vivid (broadcast)</option>
                  <option value="cinematic">Cinematic (teal &amp; orange)</option>
                  <option value="warm">Warm (golden-hour)</option>
                  <option value="cool">Cool (blueish)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input
                  type="checkbox"
                  checked={cinematic}
                  onChange={(e) => setCinematic(e.target.checked)}
                />
                <span className="text-gray-300">
                  Cinematic edit
                  <span className="text-gray-500 ml-1">(crossfade + Ken Burns + grain)</span>
                </span>
              </label>
              <label className="sm:col-span-2">
                <span className="block text-gray-400 mb-1">YouTube thumbnail</span>
                <select
                  value={thumbnailStrategy}
                  onChange={(e) => setThumbnailStrategy(e.target.value)}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                >
                  <option value="none">None — YouTube auto-picks a frame</option>
                  <option value="ai" disabled={!openaiKey}>AI thumbnail (gpt-image-1){!openaiKey ? " — needs OpenAI key" : ""}</option>
                </select>
              </label>
            </div>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
              Claude marks which transcript segments to keep (dead air / filler / repetition removed).
              ffmpeg concatenates them with the grade chain applied. Target runtime is auto-picked from
              source duration (e.g. 5-min source → 2-3 min trimmed).
            </p>
          </div>
        )}

        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Overrides + scheduling (optional)</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <label>
              <span className="block text-gray-400 mb-1">Title override <em className="text-gray-600 not-italic">(blank = Claude writes it)</em></span>
              <input type="text" value={titleOver} onChange={(e) => setTitleOver(e.target.value)}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs" />
            </label>
            <label>
              <span className="block text-gray-400 mb-1">Tags override <em className="text-gray-600 not-italic">(comma-separated)</em></span>
              <input type="text" value={tagsOver} onChange={(e) => setTagsOver(e.target.value)}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs" />
            </label>
            <label>
              <span className="block text-gray-400 mb-1">Schedule at <em className="text-gray-600 not-italic">(ISO, blank = post now)</em></span>
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs" />
            </label>
            <label className="flex items-center gap-2 mt-5">
              <input type="checkbox" checked={madeForKids} onChange={(e) => setMadeForKids(e.target.checked)} />
              <span className="text-gray-400">Made for kids (COPPA)</span>
            </label>
          </div>
        </details>
      </section>

      {/* ── Step 4: Channels ───────────────────────────────────── */}
      <section className="card p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-1.5 justify-between">
          <span>4. Postiz channels <span className="text-gray-600 font-normal text-[10px]">— {selectedIIds.size} selected</span></span>
          <button
            type="button"
            onClick={loadIntegrations}
            className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </h2>

        {integLoading && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Loading from Postiz…
          </div>
        )}
        {integError && (
          <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2 flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5" /> {integError}
          </div>
        )}
        {!integLoading && !integError && integrations.length === 0 && (
          <div className="text-xs text-gray-500 italic">
            No Postiz integrations connected — add platforms in your Postiz dashboard first.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {integrations.map((it) => {
            const checked = selectedIIds.has(it.id);
            return (
              <button
                type="button"
                key={it.id}
                onClick={() => toggleInteg(it.id)}
                className={`flex items-center gap-2 p-2 rounded border text-left text-xs transition-colors ${
                  checked
                    ? "border-accent2 bg-accent2/10 text-white"
                    : "border-border bg-black/30 hover:border-gray-600 text-gray-300"
                }`}
              >
                {it.picture && (
                  <img src={it.picture} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.name || it.identifier || it.id}</div>
                  <div className="text-[10px] text-gray-500 truncate">{it.provider || it.identifier}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Submit + progress ─────────────────────────────────── */}
      <section className="card p-5">
        {submitError && (
          <div className="mb-3 text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2 flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-0.5" /> {submitError}
          </div>
        )}

        {(!jobId || submitting) && !batchMode && (
          <button
            type="button"
            onClick={submit}
            disabled={!file || selectedIIds.size === 0 || submitting}
            className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-40"
          >
            <Zap size={16} /> Auto-publish everything
          </button>
        )}
        {batchMode && (
          <button
            type="button"
            onClick={submit}
            disabled={batchFiles.length === 0 || selectedIIds.size === 0 || submitting}
            className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-40"
          >
            {submitting
              ? <><Loader2 size={16} className="animate-spin" /> Processing batch…</>
              : <><Zap size={16} /> Auto-publish {batchFiles.length} video{batchFiles.length === 1 ? "" : "s"}</>}
          </button>
        )}

        {jobStatus && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-300">
                {isRunning && <><Loader2 size={12} className="inline animate-spin mr-1" /></>}
                {isDone && <CheckCircle2 size={12} className="inline text-emerald-400 mr-1" />}
                {isFailed && <AlertCircle size={12} className="inline text-red-400 mr-1" />}
                {jobStatus.step || jobStatus.status} — {jobStatus.message}
              </span>
              <span className="text-gray-500">{jobStatus.progress || 0}%</span>
            </div>
            <div className="h-2 bg-black/60 border border-border rounded overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isFailed ? "bg-red-500" : isDone ? "bg-emerald-500" : "bg-accent2"
                }`}
                style={{ width: `${jobStatus.progress || 0}%` }}
              />
            </div>

            {jobStatus.log_tail && jobStatus.log_tail.length > 0 && (
              <details className="mt-3 text-[11px]">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Live log ({jobStatus.log_tail.length} entries)</summary>
                <pre className="mt-2 bg-black/60 border border-border rounded p-2 max-h-48 overflow-y-auto text-gray-400 font-mono">
                  {jobStatus.log_tail.join("\n")}
                </pre>
              </details>
            )}

            {isDone && jobStatus.results && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/40 rounded text-xs text-emerald-200">
                <div className="font-semibold mb-1">
                  Published.
                  {jobStatus.results.mode && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-300/70">
                      mode: {jobStatus.results.mode}
                    </span>
                  )}
                </div>
                {jobStatus.results.mode === "shorts" && Array.isArray(jobStatus.results.shorts) ? (
                  <>
                    <div className="text-emerald-300/80 mb-2">
                      {jobStatus.results.shorts_published} of {jobStatus.results.shorts_planned} shorts published
                    </div>
                    <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                      {jobStatus.results.shorts.map((s) => (
                        <li key={s.index} className="bg-black/30 border border-emerald-500/20 rounded p-2">
                          <div className="text-white text-[11px]">
                            #{s.index + 1} — {s.title}
                            <span className="text-emerald-300/60 ml-2">[{s.start.toFixed(1)}–{s.end.toFixed(1)}s]</span>
                          </div>
                          {s.subject && <div className="text-[10px] text-emerald-300/60">subject: {s.subject}</div>}
                          {s.media_url && (
                            <a className="text-[10px] text-accent2 underline break-all" href={s.media_url} target="_blank" rel="noopener">
                              {s.media_url}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="text-emerald-300/80">Title: <span className="text-white">{jobStatus.results.title}</span></div>
                    {jobStatus.results.postiz?.media_url && (
                      <div className="mt-1 text-emerald-300/80">
                        Media: <a className="text-accent2 underline break-all" href={jobStatus.results.postiz.media_url} target="_blank" rel="noopener">{jobStatus.results.postiz.media_url}</a>
                      </div>
                    )}
                    {jobStatus.results.mode === "ai-trim" && jobStatus.results.trim_summary && (
                      <div className="mt-1 text-emerald-300/70 text-[10px]">
                        Trim: {jobStatus.results.kept_segments} kept / {jobStatus.results.trimmed_s?.toFixed(0)}s
                        — {jobStatus.results.trim_summary}
                      </div>
                    )}
                  </>
                )}
                <button onClick={resetRun} className="mt-3 btn btn-secondary text-xs">Publish another</button>
              </div>
            )}

            {isFailed && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/40 rounded text-xs text-red-200">
                <div className="font-semibold mb-1">Job failed.</div>
                <div className="text-red-300/80 break-words">{jobStatus.error || jobStatus.message}</div>
                <button onClick={resetRun} className="mt-3 btn btn-secondary text-xs">Try again</button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── History ──────────────────────────────────────────── */}
      <section className="card p-5 mt-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-2 justify-between">
          <span className="flex items-center gap-1.5">
            History
            <span className="text-[10px] text-gray-600 font-normal">
              ({history.length} job{history.length === 1 ? "" : "s"} in last 6 h)
            </span>
          </span>
          <button
            type="button"
            onClick={loadHistory}
            disabled={historyLoading}
            className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1"
          >
            <RefreshCw size={11} className={historyLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </h2>

        {historyError && (
          <div className="text-[11px] text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2 flex items-start gap-1.5 mb-3">
            <AlertCircle size={12} className="mt-0.5" /> {historyError}
          </div>
        )}

        {!historyLoading && history.length === 0 && !historyError && (
          <div className="text-[11px] text-gray-500 italic">
            No Express Mode jobs yet. Submit one above to see it here.
          </div>
        )}

        <ul className="space-y-1.5">
          {history.map((j) => {
            const isMine = jobId === j.id;
            return (
              <li
                key={j.id}
                onClick={() => {
                  // Click to load this job's full status into the main panel.
                  setJobId(j.id);
                  setJobStatus(null);  // poll effect will pick it up
                }}
                className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer ${
                  isMine
                    ? "border-accent2 bg-accent2/10"
                    : j.status === "done"     ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60" :
                      j.status === "failed"   ? "border-red-500/30 bg-red-500/5 hover:border-red-500/60" :
                      j.status === "running"  ? "border-accent2/30 bg-accent2/5 hover:border-accent2/60" :
                                                "border-border bg-black/30 hover:border-gray-500"
                }`}
              >
                {j.status === "running" && <Loader2 size={12} className="animate-spin text-accent2" />}
                {j.status === "done"    && <CheckCircle2 size={12} className="text-emerald-400" />}
                {j.status === "failed"  && <AlertCircle size={12} className="text-red-400" />}
                {j.status === "queued"  && <Loader2 size={12} className="text-gray-500" />}
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">
                    {j.title || `[${j.mode || j.status}]`}
                    <span className="text-[10px] text-gray-500 ml-2 font-mono">{j.id}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    <span className={
                      j.status === "done"   ? "text-emerald-300" :
                      j.status === "failed" ? "text-red-300" :
                      j.status === "running"? "text-accent2"  : ""
                    }>
                      {j.status}
                    </span>
                    {j.mode && <span className="ml-2">mode: {j.mode}</span>}
                    {j.step && <span className="ml-2">step: {j.step}</span>}
                    {typeof j.progress === "number" && j.status === "running" &&
                      <span className="ml-2">{j.progress}%</span>}
                    {j.message && <span className="ml-2 opacity-70">— {j.message}</span>}
                  </div>
                </div>
                <span className="text-[10px] text-gray-600 whitespace-nowrap">
                  {j.created_at ? new Date(j.created_at * 1000).toLocaleTimeString() : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[10px] text-gray-600 mt-2">
          Jobs are kept in-memory for 6 h. They vanish on backend restart. Click any entry to re-load
          its status + log + render paths in the panel above.
        </p>
      </section>
    </div>
  );
}
