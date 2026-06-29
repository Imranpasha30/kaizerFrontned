import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Upload, Film, Loader2, Zap, Languages, AlertCircle, Info,
  Check, ChevronRight, PenLine, FileText, Mic, Sparkles,
  Image as ImageIcon, Wand2, RotateCcw, SkipForward, Youtube, Download,
} from "lucide-react";
import { api } from "../api/client";
import PublishModal from "../components/PublishModal";

// Animated "improving" indicator — the SEO now runs several passes (generate → score → fix
// the weak parts → repeat to 85+), so this shows live activity instead of a frozen spinner.
const _SEO_STEPS = [
  "Drafting SEO from the video…",
  "Scoring relevance & keyword coverage…",
  "Improving the title hook…",
  "Tuning tags & description…",
  "Polishing toward 85+…",
];
function SeoProgress({ label = "Improving SEO" }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % _SEO_STEPS.length), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="rounded border border-accent2/30 bg-accent2/5 p-2.5 space-y-2">
      <style>{`@keyframes kxseoslide{0%{transform:translateX(-110%)}100%{transform:translateX(380%)}}`}</style>
      <div className="flex items-center gap-2 text-[11px]">
        <Loader2 size={13} className="animate-spin text-accent2" />
        <span className="font-medium text-accent2">{label}</span>
        <span className="text-gray-400 truncate">— {_SEO_STEPS[i]}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div className="h-full w-1/4 rounded-full bg-accent2/70"
          style={{ animation: "kxseoslide 1.3s ease-in-out infinite" }} />
      </div>
      <p className="text-[9.5px] text-gray-500">
        Each pass re-checks the score and fixes the weak parts until it reaches 85+.
      </p>
    </div>
  );
}

const PLATFORM_OPTIONS = [
  { key: "youtube_full",   label: "YouTube (regular)" },
  { key: "youtube_short",  label: "YouTube Short" },
  { key: "instagram_reel", label: "Instagram Reel" },
];

const SEO_MODES = [
  { key: "manual",      icon: PenLine,  label: "Write my own" },
  { key: "description", icon: FileText, label: "From my description" },
  { key: "transcript",  icon: Mic,      label: "From video content" },
];

// ── tiny helpers ────────────────────────────────────────────────────
function parseList(text) {
  return String(text || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// quick-state may hand SEO back as an object or a JSON string — accept both.
function parseSeo(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return typeof raw === "object" ? raw : null;
}

export default function QuickPublish() {
  const navigate = useNavigate();
  const dropRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Wizard position ──────────────────────────────────────────────
  // 1 Upload → 2 SEO → 3 Thumbnail (skipped for shorts) → 4 Publish
  const [step, setStep] = useState(1);
  const [resuming, setResuming] = useState(!!searchParams.get("clip"));

  // ── Step 1 (upload) state — unchanged from the original page ─────
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("youtube_full");
  const [language, setLanguage] = useState("te");
  const [languages, setLanguages] = useState([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Clip identity (set after upload / resume) ────────────────────
  const [clipId, setClipId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [duration, setDuration] = useState(0);
  const [filename, setFilename] = useState("");
  const [storageUrl, setStorageUrl] = useState("");

  // ── Step 2 (SEO) state ───────────────────────────────────────────
  const [seoMode, setSeoMode] = useState("manual");
  const [seo, setSeo] = useState(null); // last server-persisted SEO object
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [seoBusy, setSeoBusy] = useState(""); // "" | "generate" | "save" | "perchannel"
  const [perChannelMsg, setPerChannelMsg] = useState("");
  const [perChannelErr, setPerChannelErr] = useState(false);
  // Per-channel SEO variants from the generate step ({channelId: {title,description,tags,channel_name}}).
  // Feeds the publish modal (so each channel publishes with its OWN SEO) + the download buttons.
  const [seoVariants, setSeoVariants] = useState(null);
  const [dlStatus, setDlStatus] = useState({});   // {channelId|"_generic": "running"|"done"|"error"}
  // Connected publish channels + which ones to generate per-channel SEO for. Default NONE —
  // the operator picks, so we never blast SEO to every connected channel.
  const [accounts, setAccounts] = useState([]);
  const [selChannels, setSelChannels] = useState(() => new Set());
  // SEO scope chosen BEFORE generating — avoids double work:
  //  "all"  = one SEO for every channel (base only),
  //  "per"  = a distinct SEO per channel (base is just a light seed, no improve loop),
  //  "both" = both (improved base + per-channel).
  const [seoScope, setSeoScope] = useState("all");
  // Optional competitor style reference (SEO Settings). 0 = our own voice.
  const [styleSourceId, setStyleSourceId] = useState(0);
  const [styleRefs, setStyleRefs] = useState([]);

  // ── Step 3 (thumbnail) state ─────────────────────────────────────
  const [thumbUrl, setThumbUrl] = useState("");
  const [thumbVersion, setThumbVersion] = useState(0); // cache-bust on regenerate
  const [thumbBusy, setThumbBusy] = useState(false);     // AI generation
  const [thumbUploading, setThumbUploading] = useState(false);

  // ── Step 4 (publish) state ───────────────────────────────────────
  const [publishOpen, setPublishOpen] = useState(false);
  // (Branding mode now lives inside PublishModal so it's identical everywhere.)

  // Staged progress labels for the long synchronous backend calls.
  const [stageLabel, setStageLabel] = useState("");
  const stageTimers = useRef([]);
  function clearStages() {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
    setStageLabel("");
  }
  function startStages(stages) {
    clearStages();
    setStageLabel(stages[0].label);
    for (const s of stages.slice(1)) {
      stageTimers.current.push(setTimeout(() => setStageLabel(s.label), s.at * 1000));
    }
  }
  useEffect(() => () => { stageTimers.current.forEach(clearTimeout); }, []);

  const seoSaved = !!(seo && seo.title);

  // Steps shown in the header. Shorts have no thumbnail step at all.
  const STEPS = useMemo(() => {
    const s = [
      { id: 1, label: "Upload" },
      { id: 2, label: "SEO" },
    ];
    if (platform !== "youtube_short") s.push({ id: 3, label: "Thumbnail" });
    s.push({ id: 4, label: "Publish" });
    return s;
  }, [platform]);

  function fillSeoFields(s) {
    if (!s) return;
    setSeoTitle(s.title || "");
    setSeoDesc(s.description || "");
    setTagsText((s.keywords || s.tags || []).join(", "));
    setHashtagsText((s.hashtags || []).join(", "));
  }

  // Hydrate page state from a GET /quick-state payload (resume +
  // post-upload backfill share this).
  function applyQuickState(st) {
    if (!st) return;
    setClipId(st.clip_id);
    setJobId(st.job_id ?? null);
    setDuration(st.duration || 0);
    if (st.platform) setPlatform(st.platform);
    if (st.language) setLanguage(st.language);
    if (st.working_title) setTitle(st.working_title);
    setFilename(st.filename || "");
    setStorageUrl(st.storage_url || "");
    setThumbUrl(st.thumb_url || "");
    const s = parseSeo(st.seo);
    if (s) {
      setSeo(s);
      fillSeoFields(s);
    }
  }

  // ── Resume: ?clip= in the URL → rehydrate and jump to the right step
  useEffect(() => {
    const cid = searchParams.get("clip");
    if (!cid) return;
    let alive = true;
    setResuming(true);
    api.quickState(cid)
      .then((st) => {
        if (!alive) return;
        applyQuickState(st);
        const hasSeo = !!parseSeo(st.seo);
        let next = 2;
        if (hasSeo) next = st.platform === "youtube_short" ? 4 : 3;
        if (st.publish_thumbnail_key || st.thumb_url) next = 4;
        setStep(next);
      })
      .catch(() => {
        // 403/404/expired — clear the param and start fresh.
        if (!alive) return;
        setSearchParams({}, { replace: true });
        setStep(1);
      })
      .finally(() => { if (alive) setResuming(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defensive: shorts never see the thumbnail step.
  useEffect(() => {
    if (step === 3 && platform === "youtube_short") setStep(4);
  }, [step, platform]);

  // Clear stale errors when moving between steps.
  useEffect(() => { setError(""); }, [step]);

  useEffect(() => {
    api.listLanguages().then((list) => setLanguages(list || [])).catch(() => {});
    // Competitor style references (SEO Settings) the user can write in.
    api.listChannels({ kind: "styles" })
      .then((list) => setStyleRefs(Array.isArray(list) ? list : []))
      .catch(() => {});
    // Connected publish channels — the per-channel SEO picker chooses among these.
    api.listChannels({ kind: "accounts" })
      .then((list) => setAccounts(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  // Drag & drop (step 1 only — ref is absent on other steps)
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
  }, [title, step]);

  // ── Step 1: upload → stay on page, advance to SEO ─────────────────
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
      setClipId(res.clip_id);
      setJobId(res.job_id ?? null);
      setDuration(res.duration || 0);
      if (res.language) setLanguage(res.language);
      setFilename(file.name || "");
      setSubmitting(false);
      setSearchParams({ clip: String(res.clip_id) });
      setStep(2);
      // Backfill storage_url + canonical filename for the publish step.
      api.quickState(res.clip_id).then(applyQuickState).catch(() => {});
    } catch (e) {
      setError(e.message || "Upload failed");
      setSubmitting(false);
    }
  }

  // ── Step 2: SEO actions ───────────────────────────────────────────
  function advanceFromSeo() {
    setStep(platform === "youtube_short" ? 4 : 3);
  }

  async function saveSeoManual() {
    const t = seoTitle.trim();
    if (!t) {
      setError("Add a title first — it's required to save SEO.");
      return;
    }
    setSeoBusy("save");
    setError("");
    try {
      const res = await api.quickSeo(clipId, {
        mode: "manual",
        language,
        title: t,
        description: seoDesc,
        tags: parseList(tagsText),
        hashtags: parseList(hashtagsText),
      });
      setSeo(res.seo || null);
      advanceFromSeo();
    } catch (e) {
      setError(e.message || "Could not save SEO");
    } finally {
      setSeoBusy("");
    }
  }

  async function generateFromDescription() {
    const p = promptText.trim();
    if (!p) {
      setError("Describe the video first — that text is what the AI works from.");
      return;
    }
    setSeoBusy("generate");
    setError("");
    startStages([{ at: 0, label: "Writing SEO from your description…" }]);
    try {
      const res = await api.quickSeo(clipId, {
        mode: "description", language, description: p,
        style_source_id: styleSourceId || null,
        improve: seoScope !== "per",   // per-channel-only: base is a seed -> skip the 85+ loop
      });
      setSeo(res.seo || null);
      fillSeoFields(res.seo);
    } catch (e) {
      setError(e.message || "SEO generation failed");
    } finally {
      setSeoBusy("");
      clearStages();
    }
  }

  async function generateFromTranscript() {
    setSeoBusy("generate");
    setError("");
    startStages([
      { at: 0,  label: "Extracting audio…" },
      { at: 8,  label: "Transcribing speech…" },
      { at: 25, label: "Writing SEO…" },
    ]);
    try {
      const res = await api.quickSeo(clipId, {
        mode: "transcript", language,
        style_source_id: styleSourceId || null,
        improve: seoScope !== "per",   // per-channel-only: base is a seed -> skip the 85+ loop
      });
      setSeo(res.seo || null);
      fillSeoFields(res.seo);
    } catch (e) {
      setError(e.message || "Could not generate SEO from the video");
    } finally {
      setSeoBusy("");
      clearStages();
    }
  }

  // Channel-wise SEO — each connected channel gets its own keyword-tuned
  // title/tags (same engine as the V4 editor). Applied per channel at publish.
  function toggleSelChannel(id) {
    setSelChannels((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Per-channel SEO needs a base to adapt from. If none exists yet, write a quick base SEO
  // ("per" scope = single-pass seed, "both" = improved) from the chosen source, then continue.
  async function ensureBaseSeed() {
    const improve = seoScope !== "per";
    if (seoMode === "transcript") {
      const r = await api.quickSeo(clipId, { mode: "transcript", language, style_source_id: styleSourceId || null, improve });
      setSeo(r.seo || null); fillSeoFields(r.seo);
    } else if (seoMode === "description") {
      const p = promptText.trim();
      if (!p) throw new Error("Add a short video description above first — it seeds each channel's SEO.");
      const r = await api.quickSeo(clipId, { mode: "description", language, description: p, style_source_id: styleSourceId || null, improve });
      setSeo(r.seo || null); fillSeoFields(r.seo);
    } else {
      const t = seoTitle.trim();
      if (!t) throw new Error("Add a title above first — it seeds each channel's SEO.");
      const r = await api.quickSeo(clipId, { mode: "manual", language, title: t, description: seoDesc, tags: parseList(tagsText), hashtags: parseList(hashtagsText) });
      setSeo(r.seo || null);
    }
  }

  async function generatePerChannelSeo() {
    const ids = Array.from(selChannels);
    if (ids.length === 0) {
      setPerChannelErr(true);
      setPerChannelMsg("Pick at least one channel above — SEO is generated only for the channels you select.");
      return;
    }
    setSeoBusy("perchannel");
    setError("");
    setPerChannelMsg(""); setPerChannelErr(false);
    try {
      if (!seoSaved) await ensureBaseSeed();   // one click: seed the base, then split per channel
      const res = await api.quickSeoPerChannel(clipId, { mode: "per_channel", channel_ids: ids });
      const n = res?.applied || 0;
      // keep the generated variants so they flow into the publish modal (each channel
      // publishes with its OWN SEO) + power the per-channel download buttons.
      const map = {};
      for (const p of (res?.previews || [])) {
        if (p?.channel_id != null) {
          map[String(p.channel_id)] = {
            title: p.title || "",
            description: p.description || "",
            tags: p.tags || [],
            channel_name: p.channel_name || p.name || `Channel ${p.channel_id}`,
            seo_score: p.seo_score || p.score || 0,
          };
        }
      }
      setSeoVariants(Object.keys(map).length ? map : null);
      setPerChannelErr(false);
      setPerChannelMsg(
        `Tailored SEO for ${n} channel${n === 1 ? "" : "s"} — each publishes with its own title & tags.`
      );
    } catch (e) {
      setPerChannelErr(true);
      setPerChannelMsg(e.message || "Could not generate per-channel SEO");
    } finally {
      setSeoBusy("");
    }
  }

  // Download the SEO as a .txt — generic (channelId null) or a specific channel's tailored SEO.
  // Uses the existing /clips/{id}/download-seo endpoint (same composer as publish).
  async function downloadSeo(channelId) {
    const key = channelId == null ? "_generic" : String(channelId);
    setDlStatus((s) => ({ ...s, [key]: "running" }));
    try {
      await api.downloadClipSeo(clipId, channelId == null ? { fmt: "txt" } : { channelId, fmt: "txt" });
      setDlStatus((s) => ({ ...s, [key]: "done" }));
      setTimeout(() => setDlStatus((s) => { const n = { ...s }; delete n[key]; return n; }), 2500);
    } catch (e) {
      setDlStatus((s) => ({ ...s, [key]: "error" }));
      setError(e.message || "Couldn't download SEO");
    }
  }

  // ── Step 3: thumbnail actions ─────────────────────────────────────
  async function onThumbFile(f) {
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) {
      setError("Thumbnail must be a JPG or PNG image.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError("Thumbnail too large — max 4 MB.");
      return;
    }
    setThumbUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", f);
      const res = await api.quickThumbUpload(clipId, fd);
      setThumbUrl(res.thumb_url || "");
      setThumbVersion(Date.now());
    } catch (e) {
      setError(e.message || "Thumbnail upload failed");
    } finally {
      setThumbUploading(false);
    }
  }

  async function generateThumb() {
    setThumbBusy(true);
    setError("");
    startStages([
      { at: 0,  label: "Designing thumbnail…" },
      { at: 12, label: "Rendering image…" },
    ]);
    try {
      const res = await api.quickThumbGenerate(clipId);
      setThumbUrl(res.thumb_url || "");
      setThumbVersion(Date.now());
    } catch (e) {
      setError(e.message || "Thumbnail generation failed");
    } finally {
      setThumbBusy(false);
      clearStages();
    }
  }

  // ── Step 4: publish ───────────────────────────────────────────────
  const clipObj = useMemo(() => {
    if (!clipId) return null;
    return {
      id: clipId,
      seo: seo || undefined,
      // per-channel SEO -> PublishModal pre-selects those channels + sends variant_by_channel,
      // and the backend publishes each with its own _per_channel SEO.
      seo_variants: seoVariants || undefined,
      meta: { platform, raw_upload: true },
      duration,
      storage_url: storageUrl,
      filename,
      thumb_storage_url: thumbUrl || undefined,
    };
  }, [clipId, seo, seoVariants, platform, duration, storageUrl, filename, thumbUrl]);

  function startOver() {
    setStep(1);
    setFile(null);
    setTitle("");
    setPlatform("youtube_full");
    setUploadPct(0);
    setSubmitting(false);
    setClipId(null);
    setJobId(null);
    setDuration(0);
    setFilename("");
    setStorageUrl("");
    setSeoMode("manual");
    setSeo(null);
    setSeoTitle("");
    setSeoDesc("");
    setTagsText("");
    setHashtagsText("");
    setPromptText("");
    setSeoBusy("");
    setThumbUrl("");
    setThumbBusy(false);
    setThumbUploading(false);
    setPublishOpen(false);
    setError("");
    clearStages();
    setSearchParams({}, { replace: true });
  }

  // Only cache-bust when a NEW thumb landed this session (thumbVersion
  // set) — bustCache(url, undefined) would stamp Date.now() per render
  // and force the browser to refetch the image on every state change.
  const thumbSrc = thumbUrl
    ? (thumbVersion ? api.bustCache(api.mediaUrl(thumbUrl), thumbVersion) : api.mediaUrl(thumbUrl))
    : "";
  const langInfo = languages.find((l) => l.code === language);
  const anySeoBusy = !!seoBusy;

  // ── Render ────────────────────────────────────────────────────────
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

      {/* Stepper header */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {STEPS.map((s, i) => {
          const state = step > s.id ? "done" : step === s.id ? "current" : "todo";
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <ChevronRight size={12} className="text-gray-700 flex-shrink-0" />}
              <StepPill
                index={i + 1}
                label={s.label}
                state={state}
                // Completed SEO / Thumbnail pills are clickable to revisit;
                // Upload is immutable (use "Start over" instead).
                onClick={state === "done" && s.id >= 2 ? () => setStep(s.id) : undefined}
              />
            </React.Fragment>
          );
        })}
      </div>

      {resuming ? (
        <div className="card p-8 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Resuming your session…
        </div>
      ) : (
        <>
          {/* Shared error banner for steps 2–4 (step 1 keeps its own inline one) */}
          {step > 1 && error && (
            <div className="mb-4 bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Step 1 — Upload ─────────────────────────────────────── */}
          {step === 1 && (
            <>
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
            </>
          )}

          {/* ── Step 2 — SEO ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="card p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <Sparkles size={15} className="text-accent2" /> SEO — title, description, tags
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Write it yourself, or let AI draft it — everything stays editable before you save.
                </p>
              </div>

              {/* SEO scope — choose up front so nothing is generated twice. */}
              <div>
                <div className="text-[11px] text-gray-400 mb-1">This SEO is for…</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {[
                    { k: "all",  t: "All channels",   d: "One SEO for everyone" },
                    { k: "per",  t: "Each channel",   d: "A distinct SEO per channel" },
                    { k: "both", t: "Both",           d: "One shared + per-channel" },
                  ].map((o) => (
                    <button key={o.k} type="button" onClick={() => setSeoScope(o.k)} disabled={anySeoBusy}
                      className={`text-left rounded border px-2.5 py-1.5 disabled:opacity-50 ${seoScope === o.k ? "border-accent2 bg-accent2/10" : "border-border hover:border-gray-500"}`}>
                      <div className={`text-[12px] font-medium ${seoScope === o.k ? "text-accent2" : "text-gray-200"}`}>{o.t}</div>
                      <div className="text-[9.5px] text-gray-500">{o.d}</div>
                    </button>
                  ))}
                </div>
                {seoScope === "per" && (
                  <p className="text-[9.5px] text-gray-500 mt-1">
                    The base SEO below is written once as a quick seed (not improved) — each channel's
                    own SEO is what's tuned to 85+ and published.
                  </p>
                )}
              </div>

              {/* Mode tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {SEO_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    disabled={anySeoBusy}
                    onClick={() => setSeoMode(m.key)}
                    className={`flex items-center gap-2 rounded border px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50 ${
                      seoMode === m.key
                        ? "border-accent2 bg-accent2/10 text-white"
                        : "border-border bg-surface text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <m.icon size={14} className={seoMode === m.key ? "text-accent2" : "text-gray-600"} />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Writing voice — default, or emulate a competitor channel
                  saved under SEO Settings. Voice-only: title rhythm +
                  description style; the channel's name/handle/brand tags
                  are stripped before publish, so there's no strike risk.
                  Only relevant for the AI modes. */}
              {seoMode !== "manual" && styleRefs.length > 0 && (
                <div className="bg-surface border border-border rounded p-3 flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-300">
                    Writing voice <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <select
                    value={styleSourceId}
                    onChange={(e) => setStyleSourceId(parseInt(e.target.value, 10) || 0)}
                    disabled={anySeoBusy}
                    className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm disabled:opacity-50"
                  >
                    <option value="0">Default — our own voice</option>
                    {styleRefs.map((c) => (
                      <option key={c.id} value={c.id}>
                        In the style of {c.name || `Channel #${c.id}`}
                      </option>
                    ))}
                  </select>
                  {styleSourceId > 0 && (
                    <p className="text-[10px] text-gray-500 leading-snug">
                      Borrows title rhythm + description style only. The reference channel's
                      name, handle, URL and brand hashtags are stripped before publish.
                    </p>
                  )}
                </div>
              )}

              {/* Mode-specific generate block */}
              {seoMode === "description" && (
                <div className="bg-surface border border-border rounded p-3 flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-300">
                    What is this video about? Key people, places, events…
                  </label>
                  <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    rows={3}
                    placeholder="e.g. CM's speech at the Vijayawada flood-relief camp, promises ₹10,000 aid per family…"
                    className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm resize-y"
                    disabled={anySeoBusy}
                  />
                  <button
                    type="button"
                    onClick={generateFromDescription}
                    disabled={anySeoBusy || !promptText.trim()}
                    className="btn btn-primary self-start flex items-center gap-2 text-sm px-4 py-1.5"
                  >
                    {seoBusy === "generate"
                      ? <><Loader2 size={14} className="animate-spin" /> {stageLabel || "Generating…"}</>
                      : <><Sparkles size={14} /> Generate SEO</>}
                  </button>
                </div>
              )}

              {seoMode === "transcript" && (
                <div className="bg-surface border border-border rounded p-3 flex flex-col gap-2">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    We'll listen to the video and write SEO from what's actually said — takes ~30–60s.
                  </p>
                  <button
                    type="button"
                    onClick={generateFromTranscript}
                    disabled={anySeoBusy}
                    className="btn btn-primary self-start flex items-center gap-2 text-sm px-4 py-1.5"
                  >
                    {seoBusy === "generate"
                      ? <><Loader2 size={14} className="animate-spin" /> {stageLabel || "Working…"}</>
                      : <><Mic size={14} /> Generate from video</>}
                  </button>
                </div>
              )}

              {/* Improve-to-85: live animation while generating, score reveal when done. */}
              {seoBusy === "generate" ? (
                <SeoProgress label="Writing & improving SEO" />
              ) : (seo && (seo.seo_score || seo.tool_score)) ? (
                <div className="rounded border border-green-600/30 bg-green-600/5 p-2 flex items-center gap-2 text-[11px] text-green-300">
                  <Check size={13} />
                  <span className="font-medium">SEO score {seo.seo_score || seo.tool_score}/100</span>
                  {seo.seo_attempts > 1 && (
                    <span className="text-gray-400">— improved over {seo.seo_attempts} passes</span>
                  )}
                </div>
              ) : null}

              {/* Shared editable fields */}
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center justify-between">
                    <span>Title</span>
                    <span className="text-[10px] text-gray-600 font-normal">{seoTitle.length}/100</span>
                  </label>
                  <input
                    type="text"
                    value={seoTitle}
                    maxLength={100}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder="Video title (required to save)"
                    className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
                    disabled={anySeoBusy}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
                  <textarea
                    value={seoDesc}
                    onChange={(e) => setSeoDesc(e.target.value)}
                    rows={4}
                    placeholder="What viewers (and YouTube search) will read"
                    className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm resize-y"
                    disabled={anySeoBusy}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Tags <span className="text-gray-600">(comma-separated)</span></label>
                    <input
                      type="text"
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      placeholder="news, telugu, politics"
                      className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
                      disabled={anySeoBusy}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Hashtags <span className="text-gray-600">(comma-separated)</span></label>
                    <input
                      type="text"
                      value={hashtagsText}
                      onChange={(e) => setHashtagsText(e.target.value)}
                      placeholder="#Breaking, #TeluguNews"
                      className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
                      disabled={anySeoBusy}
                    />
                  </div>
                </div>
                {/* Language — same options as step 1, prefilled */}
                <div className="sm:max-w-xs">
                  <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1.5">
                    <Languages size={12} /> Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-black border border-border rounded px-3 py-2 text-white text-sm"
                    disabled={anySeoBusy}
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.native} — {l.english}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional: channel-wise SEO — each connected channel gets its
                  own keyword-tuned title/tags (same engine as the V4 editor).
                  Applied automatically per destination at publish. */}
              {seoScope !== "all" && (
                <div className="bg-surface border border-border rounded p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} className="text-accent2" />
                      <span className="text-xs font-medium text-gray-200">Channel-wise SEO</span>
                      <span className="text-[10px] text-gray-500">(optional)</span>
                    </div>
                    <button
                      type="button"
                      onClick={generatePerChannelSeo}
                      disabled={anySeoBusy || selChannels.size === 0}
                      className="btn btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      {seoBusy === "perchannel"
                        ? <><Loader2 size={13} className="animate-spin" /> Tailoring…</>
                        : <><Sparkles size={13} /> Generate for {selChannels.size || "selected"} channel{selChannels.size === 1 ? "" : "s"}</>}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug">
                    Pick the channels below, then generate — each selected channel gets its OWN
                    distinct title &amp; tags (tuned to its winning keywords), applied per channel at
                    publish. Only the channels you select are generated for.
                  </p>

                  {/* Channel picker — generate SEO ONLY for the chosen channels (not all). */}
                  {accounts.length > 0 ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500">
                          Channels {selChannels.size > 0 ? `(${selChannels.size} selected)` : "(none selected)"}
                        </span>
                        <div className="flex gap-2 text-[10px]">
                          <button type="button" onClick={() => setSelChannels(new Set(accounts.map((c) => c.id)))}
                            className="text-accent2 hover:underline">select all</button>
                          <button type="button" onClick={() => setSelChannels(new Set())}
                            className="text-gray-400 hover:underline">clear</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {accounts.map((c) => {
                          const on = selChannels.has(c.id);
                          return (
                            <button key={c.id} type="button" onClick={() => toggleSelChannel(c.id)}
                              className={`text-[11px] px-2 py-1 rounded border flex items-center gap-1 ${on ? "border-accent2 text-accent2 bg-accent2/10" : "border-border text-gray-400 hover:border-gray-500"}`}>
                              {on ? <Check size={11} /> : <span className="inline-block w-[11px]" />}
                              <span className="truncate max-w-[150px]">{c.name || c.google_channel_title || `Channel ${c.id}`}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-600">No connected channels to tailor SEO for.</p>
                  )}
                  {seoBusy === "perchannel" && (
                    <SeoProgress label={`Tailoring SEO for ${selChannels.size} channel${selChannels.size === 1 ? "" : "s"}`} />
                  )}
                  {perChannelMsg && seoBusy !== "perchannel" && (
                    <p className={`text-[11px] ${perChannelErr ? "text-red-400" : "text-green-400"}`}>
                      {perChannelMsg}
                    </p>
                  )}

                  {/* Download SEO — generic + one button per channel that has tailored SEO. */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60 mt-1">
                    <span className="text-[10px] text-gray-500 mr-0.5">Download:</span>
                    <button type="button" onClick={() => downloadSeo(null)}
                      className="text-[11px] px-2 py-1 rounded border border-border text-gray-300 hover:border-gray-500 flex items-center gap-1">
                      {dlStatus._generic === "running" ? <Loader2 size={11} className="animate-spin" />
                        : dlStatus._generic === "done" ? <Check size={11} className="text-green-400" />
                        : dlStatus._generic === "error" ? <AlertCircle size={11} className="text-red-400" />
                        : <Download size={11} />} SEO (.txt)
                    </button>
                    {seoVariants && Object.entries(seoVariants).map(([cid, v]) => (
                      <button key={cid} type="button" onClick={() => downloadSeo(Number(cid))}
                        title={`Download ${v.channel_name}'s tailored SEO`}
                        className="text-[11px] px-2 py-1 rounded border border-border text-gray-300 hover:border-gray-500 flex items-center gap-1 max-w-[160px]">
                        {dlStatus[cid] === "running" ? <Loader2 size={11} className="animate-spin" />
                          : dlStatus[cid] === "done" ? <Check size={11} className="text-green-400" />
                          : dlStatus[cid] === "error" ? <AlertCircle size={11} className="text-red-400" />
                          : <Download size={11} />}
                        <span className="truncate">{v.channel_name}</span>
                        {v.seo_score ? <span className="text-[9.5px] text-green-400/80 shrink-0">{v.seo_score}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer: skip / save */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={advanceFromSeo}
                  disabled={anySeoBusy}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                  title="Publish will use your working title + channel branding"
                >
                  <SkipForward size={12} /> Skip SEO →
                </button>
                <button
                  type="button"
                  onClick={saveSeoManual}
                  disabled={anySeoBusy || !seoTitle.trim()}
                  className="btn btn-primary flex items-center gap-2 text-sm px-4 py-2"
                >
                  {seoBusy === "save"
                    ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                    : <><Check size={14} /> Save & continue</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 — Thumbnail (never rendered for shorts) ──────── */}
          {step === 3 && platform !== "youtube_short" && (
            <div className="card p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <ImageIcon size={15} className="text-accent2" /> Thumbnail
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Upload your own, let AI design one from the SEO, or skip — YouTube will auto-pick a frame.
                </p>
              </div>

              {/* Current thumbnail preview */}
              {thumbSrc && (
                <div className="bg-black border border-border rounded p-2 flex justify-center">
                  <img
                    src={thumbSrc}
                    alt="Current thumbnail"
                    className="max-h-52 rounded object-contain"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Upload image */}
                <label
                  className={`bg-surface border border-border rounded p-3 flex flex-col gap-1.5 transition-colors ${
                    thumbBusy ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-gray-500"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={thumbBusy || thumbUploading}
                    onChange={(e) => {
                      const f = e.target.files[0];
                      e.target.value = ""; // allow re-picking the same file
                      onThumbFile(f);
                    }}
                  />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
                    {thumbUploading
                      ? <Loader2 size={14} className="animate-spin text-accent2" />
                      : <Upload size={14} className="text-accent2" />}
                    Upload image
                  </span>
                  <span className="text-[10px] text-gray-500">JPG or PNG, max 4 MB</span>
                </label>

                {/* Generate with AI */}
                <button
                  type="button"
                  onClick={generateThumb}
                  disabled={!seoSaved || thumbBusy || thumbUploading}
                  title={seoSaved ? "AI designs a thumbnail from your saved SEO" : "Save SEO first — the AI designs from your title & description"}
                  className={`bg-surface border rounded p-3 flex flex-col gap-1.5 text-left transition-colors ${
                    !seoSaved
                      ? "border-border opacity-50 cursor-not-allowed"
                      : "border-border hover:border-accent2"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
                    {thumbBusy
                      ? <Loader2 size={14} className="animate-spin text-accent2" />
                      : thumbSrc && seoSaved
                        ? <RotateCcw size={14} className="text-accent2" />
                        : <Wand2 size={14} className="text-accent2" />}
                    {thumbBusy
                      ? (stageLabel || "Designing thumbnail…")
                      : thumbSrc && seoSaved ? "Regenerate with AI" : "Generate with AI"}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {seoSaved ? "~15–40s, designed from your SEO" : "Needs saved SEO first"}
                  </span>
                </button>

                {/* Skip */}
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={thumbBusy || thumbUploading}
                  className="bg-surface border border-border rounded p-3 flex flex-col gap-1.5 text-left hover:border-gray-500 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
                    <SkipForward size={14} className="text-gray-500" /> Skip
                  </span>
                  <span className="text-[10px] text-gray-500">YouTube auto-picks a frame</span>
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  disabled={thumbBusy || thumbUploading}
                  className="btn btn-primary flex items-center gap-2 text-sm px-4 py-2"
                >
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4 — Publish ────────────────────────────────────── */}
          {step === 4 && (
            <div className="card p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                  <Youtube size={15} className="text-accent2" /> Ready to publish
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Check the summary, then pick your channels.
                </p>
              </div>

              {/* Summary card */}
              <div className="bg-surface border border-border rounded p-3 flex gap-3">
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt="Thumbnail"
                    className="w-28 h-16 rounded object-cover border border-border flex-shrink-0"
                  />
                ) : (
                  <div className="w-28 h-16 rounded bg-black border border-border flex items-center justify-center flex-shrink-0">
                    <Film size={20} className="text-gray-700" />
                  </div>
                )}
                <div className="min-w-0 flex flex-col gap-0.5 text-xs">
                  <div className="text-sm font-medium text-gray-100 truncate" title={seo?.title || title || filename}>
                    {seo?.title || title || filename || "Untitled"}
                  </div>
                  <div className="text-gray-500 truncate">{filename || "—"}</div>
                  <div className="text-gray-500 flex items-center gap-2 flex-wrap">
                    <span>{fmtDuration(duration)}</span>
                    <span className="text-gray-700">·</span>
                    <span>{langInfo ? `${langInfo.native} — ${langInfo.english}` : language}</span>
                    <span className="text-gray-700">·</span>
                    <span>{PLATFORM_OPTIONS.find((p) => p.key === platform)?.label || platform}</span>
                  </div>
                  <div className="mt-0.5">
                    {seoSaved ? (
                      <span className="text-[10px] text-green-400 flex items-center gap-1">
                        <Check size={10} /> SEO saved{seo?.edited_by_user ? " (edited by you)" : ""}
                      </span>
                    ) : (
                      <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                        <AlertCircle size={10} /> No SEO — publish uses your working title + channel branding
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="btn btn-primary w-full flex items-center justify-center gap-2 py-2.5"
              >
                <Youtube size={16} /> Choose channels & publish
              </button>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={startOver}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                >
                  <RotateCcw size={11} /> Start over
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {clipObj && (
        <PublishModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          clip={clipObj}
          onPublished={(res) =>
            navigate(res?.publish_task_id ? `/uploads/${res.publish_task_id}` : "/uploads")
          }
        />
      )}
    </div>
  );
}

// ── Stepper pill ──────────────────────────────────────────────────────
function StepPill({ index, label, state, onClick }) {
  const cls =
    state === "done"
      ? "border-green-700/60 bg-green-950/30 text-green-300"
      : state === "current"
        ? "border-accent2 bg-accent2/10 text-white"
        : "border-border bg-surface text-gray-500";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${cls} ${
        onClick ? "cursor-pointer hover:border-green-500" : ""
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
          state === "done"
            ? "bg-green-700/50"
            : state === "current"
              ? "bg-accent2/30"
              : "bg-black/40"
        }`}
      >
        {state === "done" ? <Check size={10} /> : index}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </Tag>
  );
}
