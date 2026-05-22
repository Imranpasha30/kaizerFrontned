import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, ChevronRight, ChevronLeft, Loader2, Film, Languages, Image as ImageIcon, Star, Mic } from "lucide-react";
import { api } from "../api/client";

const STEPS         = ["Upload Video", "Choose Platform", "Choose Frame",   "Choose Language", "Confirm"];
const STEPS_LONGFORM = ["Upload Video", "Choose Platform", "Long-form mode", "Choose Language", "Confirm"];
// V2 wizard inserts one extra "Choose STT" step between Language and Confirm.
const STEPS_V2      = ["Upload Video", "Choose Platform", "Choose Frame",   "Choose Language", "Choose STT", "Confirm"];

// Platforms that skip the per-clip frame layout (16:9 long-form only).
const LONGFORM_PLATFORMS = new Set(["youtube_full"]);
function isLongForm(platform) {
  return LONGFORM_PLATFORMS.has(platform);
}

// V2 platform key (Step 11). Constants kept inline (single source =
// PLATFORMS["full_video_shorts_v2"] on the backend) so a typo here
// would surface immediately in the "wrong step count" UI bug.
const V2_PLATFORM_KEY = "full_video_shorts_v2";
function isV2(platform) {
  return platform === V2_PLATFORM_KEY;
}

// Step 12.5 / backlog 59: language codes the V2 wizard treats as
// "Indian-language" for STT-provider recommendation. When the user
// has picked one of these AND is considering Whisper-Groq, we surface
// the empirical timestamp-issue warning from the provider's
// `warnings` array (backend item 57). Deepgram is concurrently
// surfaced with a "Recommended" badge.
const INDIAN_LANG_CODES = new Set([
  "te", "hi", "ta", "kn", "ml", "bn", "mr", "gu",
]);
function isIndianLanguage(code) {
  return INDIAN_LANG_CODES.has(code);
}

// Item 104: bulletin transition catalog. Mirrors
// kaizer/KaizerBackend/pipeline_v2/pipeline_v2/transitions.py one-to-one
// -- backend is the source of truth; the UI just renders the labels.
// Stays inline (not /api/transitions-fetched) because the catalog is
// static + tiny + the wizard wants no extra round-trip.
const TRANSITION_CATALOG = [
  { name: "smart_cut",    label: "Smart Cut",     description: "Hard cut. Fastest. The default.",                        implemented: true  },
  { name: "crossfade",    label: "Crossfade",     description: "0.5s video + audio crossfade between clips.",            implemented: false },
  { name: "fade_to_black",label: "Fade to Black", description: "Fade out to black + fade in (~0.6s).",                   implemented: false },
  { name: "dip_to_white", label: "Dip to White",  description: "Fade out to white + fade in (~0.6s).",                   implemented: false },
  { name: "slide_left",   label: "Slide Left",    description: "Outgoing slides left, incoming slides in (~0.4s).",       implemented: false },
  { name: "wipe_right",   label: "Wipe Right",    description: "Vertical wipe revealing incoming clip (~0.4s).",          implemented: false },
  { name: "dissolve",     label: "Dissolve",      description: "Longer soft alpha dissolve (~1.0s).",                     implemented: false },
];
const DEFAULT_TRANSITION = "smart_cut";

// Item 114: Stage 2 provider catalog. Mirrors
// kaizer/KaizerBackend/pipeline_v2/pipeline_v2/stages/stage_2_providers.py
// (VALID_PROVIDERS). Backend is source of truth; UI just labels.
const STAGE_2_PROVIDER_CATALOG = [
  { name: "gemini", label: "Gemini 2.5 Pro", description: "Google's most capable model. Strong on Telugu / code-mixed transcripts. Default since V2 ship." },
  { name: "claude", label: "Claude Sonnet 4.6 (default)",        description: "Anthropic's alt option. Deterministic (T=0). Prompt caching reduces per-job cost after first run." },
];
const DEFAULT_STAGE_2_PROVIDER = "claude";

export default function NewJob() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0);
  const [file, setFile]       = useState(null);
  const [platform, setPlatform]   = useState("");
  const [frame, setFrame]     = useState("");
  const [language, setLanguage] = useState("te");
  const [platforms, setPlatforms] = useState({});
  const [frames, setFrames]   = useState({});
  const [languages, setLanguages] = useState([]);
  const [useDefaultImage, setUseDefaultImage] = useState(false);
  const [defaultAsset, setDefaultAsset] = useState(null);
  // Bulletin pre-selected images. Only relevant when the platform
  // produces a bulletin (youtube_full or youtube_full_plus_shorts).
  // When non-empty, the bulletin pass cycles through these instead of
  // calling OpenAI gpt-image-1 per story.
  const [userAssets, setUserAssets] = useState([]);
  const [bulletinImageIds, setBulletinImageIds] = useState([]);
  // Cached-images prompt: when the user picks a video file we hash it
  // and ask the backend if previously-generated images exist for that
  // exact source. Non-empty result drives the "reuse" / "regenerate"
  // banner above the bulletin pre-select grid.
  const [videoHash,        setVideoHash]        = useState("");
  const [cachedAssets,     setCachedAssets]     = useState([]);
  const [cachedDecision,   setCachedDecision]   = useState("");  // "" | "reuse" | "fresh"
  const [hashingFile,      setHashingFile]      = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct]  = useState(0);
  const [error, setError]     = useState("");
  const dropRef = useRef(null);
  // Phase 14 / V2 Beta (D-13.11): optional human-readable name.
  // Blank submits trigger the backend's filename-fallback default.
  const [jobName, setJobName] = useState("");

  // V2 STT provider state (Step 11.3). Fetched on first render and
  // only displayed when the user selects the V2 platform. The
  // backend's /api/v2/stt/providers endpoint returns all 3 providers
  // with a ``configured`` flag; we filter the picker to the
  // configured subset so users don't pick a provider that will then
  // fail at Stage 1 with "API key unset".
  const [sttProviders, setSttProviders] = useState([]);
  const [sttProvider, setSttProvider]   = useState("");

  // Item 104: V2 bulletin transition selection. Only meaningful for
  // the V2 platform; harmless for V1 platforms (the backend ignores
  // the form field unless platform=full_video_shorts_v2). Defaults
  // to "smart_cut" -- the catalog's only fully-implemented entry at
  // ship time. The dropdown surfaces the other six as "Coming soon".
  const [transitionStyle, setTransitionStyle] = useState(DEFAULT_TRANSITION);

  // Item 114: V2 Stage 2 provider selection. ("gemini" | "claude").
  // Same V2-only semantics as transitionStyle. Defaults to "gemini"
  // -- no behaviour change for existing users.
  const [stage2Provider, setStage2Provider] = useState(DEFAULT_STAGE_2_PROVIDER);

  // First-4-MiB SHA-256 of (size_string + first_4MiB_bytes), truncated
  // to 32 hex chars — matches the Python ``gemini_cache.hash_file_prefix``
  // exactly so the backend lookup hits the same key the runner stamped
  // on the previously-generated UserAssets.
  async function hashVideoFile(f) {
    const PREFIX = 4 * 1024 * 1024;
    const sizeBytes = new TextEncoder().encode(`${f.size}`);
    const prefixBuf = await f.slice(0, PREFIX).arrayBuffer();
    const combined = new Uint8Array(sizeBytes.length + prefixBuf.byteLength);
    combined.set(sizeBytes, 0);
    combined.set(new Uint8Array(prefixBuf), sizeBytes.length);
    const hashBuf = await crypto.subtle.digest("SHA-256", combined);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 32);
  }

  useEffect(() => {
    api.platforms().then(setPlatforms);
    api.frameLayouts().then(setFrames);
    api.listLanguages().then((list) => setLanguages(list || []));
    api.getDefaultAsset().then(setDefaultAsset).catch(() => setDefaultAsset(null));
    // V2 STT providers (Step 11.3). The endpoint is harmless to call
    // for users who never pick V2 -- just a tiny GET. Default the
    // selection to the first ``configured`` provider so V2 users
    // don't have to make a choice unless they want to.
    api.v2SttProviders().then((rows) => {
      setSttProviders(rows || []);
      const firstConfigured = (rows || []).find((p) => p.configured);
      if (firstConfigured) setSttProvider(firstConfigured.id);
    }).catch(() => setSttProviders([]));
    // Fetch the user's image assets once — used by the bulletin
    // pre-select grid. Filter to images (skip videos / fonts) and
    // sort newest first so freshly-generated assets appear at top.
    api.listAssets().then((all) => {
      const imgs = (all || []).filter(a =>
        (a.mime_type || "").startsWith("image/")
      );
      setUserAssets(imgs);
    }).catch(() => setUserAssets([]));
  }, []);

  // Hash the picked video and look up previously-generated assets for
  // the same source. Runs once per file pick — re-picking the same
  // File object is a no-op because the effect dep is the File reference.
  useEffect(() => {
    if (!file) {
      setVideoHash(""); setCachedAssets([]); setCachedDecision("");
      return;
    }
    let cancelled = false;
    setHashingFile(true);
    setCachedDecision("");
    hashVideoFile(file)
      .then((h) => {
        if (cancelled) return;
        setVideoHash(h);
        return api.listAssetsByVideoHash(h);
      })
      .then((rows) => {
        if (cancelled) return;
        setCachedAssets(rows || []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("video-hash lookup failed:", e);
        setCachedAssets([]);
      })
      .finally(() => { if (!cancelled) setHashingFile(false); });
    return () => { cancelled = true; };
  }, [file]);

  // Which platforms render a bulletin and therefore benefit from
  // bulletin pre-selected images.
  const platformProducesBulletin =
    platform === "youtube_full" || platform === "youtube_full_plus_shorts";

  function toggleBulletinImage(assetId) {
    setBulletinImageIds(prev =>
      prev.includes(assetId)
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  }

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e) => { e.preventDefault(); el.classList.add("border-accent2"); };
    const leave = () => el.classList.remove("border-accent2");
    const drop = (e) => {
      e.preventDefault();
      el.classList.remove("border-accent2");
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("video/")) { setFile(f); setStep(1); }
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragover", over); el.removeEventListener("dragleave", leave); el.removeEventListener("drop", drop); };
  }, []);

  async function submit() {
    setSubmitting(true);
    setUploadPct(0);
    setError("");
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("platform", platform);
      form.append("frame_layout", frame);
      form.append("language", language);
      if (useDefaultImage && defaultAsset) {
        form.append("use_default_image", "true");
      }
      // Bulletin pre-selected images. Backend only honours these when
      // the platform involves a bulletin (youtube_full or
      // youtube_full_plus_shorts); harmless to send for Shorts-only
      // platforms — the field is just ignored.
      if (platformProducesBulletin && bulletinImageIds.length > 0) {
        form.append("bulletin_image_ids", bulletinImageIds.join(","));
      }
      // V2 STT provider (Step 11.3). Only meaningful for the V2
      // platform; harmless for V1 platforms — the backend ignores
      // the field unless platform=full_video_shorts_v2.
      if (isV2(platform) && sttProvider) {
        form.append("stt_provider", sttProvider);
      }
      // Item 104: V2 bulletin transition selection. Backend coerces
      // unknown values to "smart_cut"; we only send a non-default
      // value when the user actually picked one.
      if (isV2(platform) && transitionStyle && transitionStyle !== DEFAULT_TRANSITION) {
        form.append("transition_style", transitionStyle);
      }
      // Item 114: V2 Stage 2 provider selection. Same pattern --
      // backend coerces unknown -> "gemini"; only send non-default.
      if (isV2(platform) && stage2Provider && stage2Provider !== DEFAULT_STAGE_2_PROVIDER) {
        form.append("stage_2_provider", stage2Provider);
      }
      // Phase 14 / V2 Beta (D-13.11): optional name. Backend caps at
      // 120 chars and falls back to the filename when blank.
      const trimmedName = (jobName || "").trim();
      if (trimmedName) {
        form.append("name", trimmedName);
      }
      const { id } = await api.createJob(form, pct => setUploadPct(pct));
      navigate(`/jobs/${id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  // canNext indexed by step. V2 has 6 steps (0-5); V1 has 5 (0-4).
  // Step 4 is "Choose STT" for V2, "Confirm" for V1.
  const canNext = isV2(platform)
    ? [!!file, !!platform, !!frame, !!language, !!sttProvider, true][step]
    : [!!file, !!platform, !!frame, !!language, true][step];
  const lastStep = isV2(platform) ? 5 : 4;
  const stepLabels = isV2(platform)
    ? STEPS_V2
    : (isLongForm(platform) ? STEPS_LONGFORM : STEPS);

  return (
    <div className="max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-white mb-6">New Job</h1>

      {/* Step indicators — labels swap based on platform.
          V1 4-platform path: STEPS or STEPS_LONGFORM (5 entries).
          V2 path: STEPS_V2 (6 entries — extra "Choose STT" step). */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => (
          <React.Fragment key={i}>
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              className={`flex items-center gap-1.5 text-xs font-medium
                ${i === step ? "text-accent2" : i < step ? "text-green-400 cursor-pointer" : "text-gray-600"}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i === step ? "bg-accent text-white" : i < step ? "bg-green-800 text-green-300" : "bg-surface text-gray-600"}`}>
                {i < step ? "\u2713" : i + 1}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < stepLabels.length - 1 && <div className="flex-1 h-px bg-border" />}
          </React.Fragment>
        ))}
      </div>

      <div className="card p-5 sm:p-6">
        {/* Step 0: Upload */}
        {step === 0 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Upload Video</h2>
            <label
              ref={dropRef}
              className="border-2 border-dashed border-border rounded-lg p-8 sm:p-10
                         flex flex-col items-center gap-3 cursor-pointer
                         hover:border-gray-500 transition-colors"
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setStep(1); } }}
              />
              {file ? (
                <>
                  <Film size={36} className="text-accent" />
                  <span className="text-white font-medium text-center break-all">{file.name}</span>
                  <span className="text-gray-500 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </>
              ) : (
                <>
                  <Upload size={36} className="text-gray-600" />
                  <span className="text-gray-400 text-center">Drag & drop or click to select video</span>
                  <span className="text-gray-600 text-xs">MP4, MKV, AVI supported</span>
                </>
              )}
            </label>
          </div>
        )}

        {/* Step 1: Platform */}
        {step === 1 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Choose Platform</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(platforms).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => {
                    setPlatform(key);
                    // Long-form (16:9) doesn't use the 9:16 frame layouts.
                    // Auto-fill the frame field with a sentinel that the
                    // backend ignores when render_mode=bulletin (which is
                    // also auto-set inside pipeline.run_pipeline when
                    // platform=youtube_full), and jump straight to the
                    // language step.
                    if (isLongForm(key)) {
                      setFrame("torn_card");
                      setStep(3);
                    } else {
                      setStep(2);
                    }
                  }}
                  className={`relative p-4 rounded-lg border text-left transition-all
                    ${platform === key
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  {/* Phase 14 / V2 Beta (D-13.7): amber BETA pill so the
                      V2 option is visually distinct from the four
                      production-stable V1 platforms. */}
                  {isV2(key) && (
                    <span
                      className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full
                                 text-[9px] font-bold tracking-widest uppercase
                                 bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    >
                      Beta
                    </span>
                  )}
                  <div className="font-medium">{info.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{info.width} x {info.height}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Frame \u2014 Shorts only. Long-form (16:9) uses the bulletin
            compositor and bypasses this step entirely. */}
        {step === 2 && !isLongForm(platform) && (
          <div>
            <h2 className="font-semibold text-white mb-4">Choose Frame Layout</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(frames).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setFrame(key); setStep(3); }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${frame === key
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  <div className="font-medium capitalize">{key.replace("_", " ")}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label.split("\u2014")[1]?.trim()}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 2 && isLongForm(platform) && (
          <div>
            <h2 className="font-semibold text-white mb-4">Long-form bulletin</h2>
            <p className="text-sm text-gray-400 mb-4">
              YouTube Full uses the long-form bulletin compositor \u2014
              TV9-style lower-third, scrolling ticker, channel bug, image
              carousel sidebar, and full-screen photo cut-aways. Frame
              layouts (torn card / split / follow bar) are 9:16 Shorts
              only and don't apply here.
            </p>
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold"
            >
              Continue \u2192
            </button>
          </div>
        )}

        {/* Step 3: Language */}
        {step === 3 && (
          <div>
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Languages size={18} className="text-accent2" /> Choose Language
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Drives Gemini analysis, title generation, on-screen card font, and follow-bar text.
              Pick the language the video is in so the output is authentic.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {languages.length === 0 && (
                <span className="text-gray-500 text-sm">Loading languages…</span>
              )}
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLanguage(l.code); setStep(4); /* V2: next step = STT picker; V1: next step = Confirm */ }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${language === l.code
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  <div className="text-xl font-semibold mb-1">{l.native}</div>
                  <div className="text-xs text-gray-500">{l.english}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">{l.script} · {l.code}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 (V2 only): Choose STT provider.
            V1 platforms skip this step entirely -- on V1 step===4 is
            the Confirm screen below. */}
        {step === 4 && isV2(platform) && (
          <div>
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Mic size={18} className="text-accent2" /> Choose Speech-to-Text Provider
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              V2 supports multiple STT providers with different cost / quality
              trade-offs. Defaults to the first configured provider. Unconfigured
              providers are visible but disabled — your operator needs to set the
              corresponding API key env var to enable them.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sttProviders.length === 0 && (
                <span className="text-gray-500 text-sm">Loading providers…</span>
              )}
              {sttProviders.map((p) => {
                const selected = sttProvider === p.id;
                const disabled = !p.configured;
                // Step 12.5: surface the recommendation + warning
                // only when the user has picked an Indian-language
                // code at the prior step. For English etc., the
                // catalog renders unchanged.
                const indianLang   = isIndianLanguage(language);
                const isRecommended = indianLang && p.id === "deepgram";
                const showWarnings  = indianLang
                  && Array.isArray(p.warnings)
                  && p.warnings.length > 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!disabled) { setSttProvider(p.id); setStep(5); } }}
                    disabled={disabled}
                    className={`p-4 rounded-lg border text-left transition-all
                      ${selected
                        ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                        : disabled
                          ? "border-border bg-black/20 text-gray-600 cursor-not-allowed"
                          : isRecommended
                            ? "border-green-500/60 hover:border-green-400 hover:bg-green-500/[0.04] text-gray-300"
                            : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.display_name}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase
                        ${p.tier === "free" ? "bg-green-900/40 text-green-300"
                          : p.tier === "mid" ? "bg-blue-900/40 text-blue-300"
                          : "bg-purple-900/40 text-purple-300"}`}>
                        {p.tier}
                      </span>
                    </div>
                    {isRecommended && (
                      <div className="text-[10px] text-green-300 mt-1 font-semibold uppercase tracking-wider">
                        Recommended for Telugu / Hindi
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {p.cost_per_min_usd === 0
                        ? "Free"
                        : `~$${(p.cost_per_min_usd).toFixed(4)}/min`}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                      {p.description}
                    </div>
                    {!p.configured && (
                      <div className="text-[10px] text-yellow-400/80 mt-1.5">
                        Not configured (operator must set API key env var)
                      </div>
                    )}
                    {showWarnings && (
                      <div className="text-[10px] text-amber-400/90 mt-1.5 leading-snug border-t border-amber-900/40 pt-1.5">
                        {p.warnings.map((w, idx) => (
                          <div key={idx}>⚠ {w}</div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirm step — index depends on platform.
            V1 platforms: step === 4 (5-step wizard).
            V2 platform:  step === 5 (6-step wizard, STT is step 4). */}
        {((step === 4 && !isV2(platform)) || (step === 5 && isV2(platform))) && (
          <div>
            <h2 className="font-semibold text-white mb-4">Confirm & Start</h2>
            <div className="bg-black/40 rounded-lg p-4 flex flex-col gap-3 mb-4 text-sm">
              <ConfirmRow label="Video"    value={file?.name} />
              <ConfirmRow label="Platform" value={platforms[platform]?.label} />
              {isLongForm(platform)
                ? <ConfirmRow label="Mode"  value="Long-form bulletin (TV9 broadcast layout)" />
                : <ConfirmRow label="Frame" value={frame?.replace("_", " ")} />
              }
              <ConfirmRow label="Language" value={(() => {
                const l = languages.find((x) => x.code === language);
                return l ? `${l.native} (${l.english})` : language;
              })()} />
              {isV2(platform) && (
                <ConfirmRow
                  label="STT Provider"
                  value={sttProviders.find((p) => p.id === sttProvider)?.display_name || sttProvider}
                />
              )}
              {isV2(platform) && (
                <ConfirmRow
                  label="Transition"
                  value={TRANSITION_CATALOG.find((t) => t.name === transitionStyle)?.label || transitionStyle}
                />
              )}
              {isV2(platform) && (
                <ConfirmRow
                  label="Editorial AI"
                  value={STAGE_2_PROVIDER_CATALOG.find((p) => p.name === stage2Provider)?.label || stage2Provider}
                />
              )}
            </div>

            {/* Item 104: V2 bulletin transition selection. Only shown
                for V2 -- the V1 stitcher does not support transitions. */}
            {isV2(platform) && (
              <div className="bg-surface border border-border rounded p-3 mb-4">
                <label htmlFor="transition-style"
                       className="text-sm font-medium text-gray-200 block mb-1.5">
                  Bulletin transition
                </label>
                <select
                  id="transition-style"
                  value={transitionStyle}
                  onChange={(e) => setTransitionStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-border rounded
                             text-sm text-white
                             focus:outline-none focus:border-accent2"
                >
                  {TRANSITION_CATALOG.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.label}{t.implemented ? "" : "  (Coming soon)"}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-gray-500 mt-1.5">
                  {(TRANSITION_CATALOG.find((t) => t.name === transitionStyle)?.description) || ""}
                  {(() => {
                    const sel = TRANSITION_CATALOG.find((t) => t.name === transitionStyle);
                    if (sel && !sel.implemented) {
                      return (
                        <div className="text-amber-400 mt-1">
                          Not yet implemented — will fall back to <b>Smart Cut</b> for this job.
                          Your choice is preserved on the job for when this transition ships.
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Item 114: Stage 2 provider selection. Only shown for V2. */}
            {isV2(platform) && (
              <div className="bg-surface border border-border rounded p-3 mb-4">
                <label htmlFor="stage-2-provider"
                       className="text-sm font-medium text-gray-200 block mb-1.5">
                  Editorial AI <span className="text-[11px] text-gray-500 font-normal">(which LLM picks the cuts)</span>
                </label>
                <select
                  id="stage-2-provider"
                  value={stage2Provider}
                  onChange={(e) => setStage2Provider(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-border rounded
                             text-sm text-white
                             focus:outline-none focus:border-accent2"
                >
                  {STAGE_2_PROVIDER_CATALOG.map((p) => (
                    <option key={p.name} value={p.name}>{p.label}</option>
                  ))}
                </select>
                <div className="text-[11px] text-gray-500 mt-1.5">
                  {(STAGE_2_PROVIDER_CATALOG.find((p) => p.name === stage2Provider)?.description) || ""}
                </div>
              </div>
            )}

            {/* Phase 14 / V2 Beta (D-13.11): optional human-readable
                name. Caps at 120 chars; blank falls back to the
                filename. Renamable mid-flight from JobDetail. */}
            <div className="bg-surface border border-border rounded p-3 mb-4">
              <label htmlFor="job-name" className="text-sm font-medium text-gray-200 block mb-1.5">
                Name this job <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="job-name"
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value.slice(0, 120))}
                maxLength={120}
                placeholder={file?.name ? file.name.slice(0, 80) : "Bandi Bhagirath bulletin"}
                className="w-full px-3 py-2 bg-black/40 border border-border rounded
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-accent2"
              />
              <div className="text-[11px] text-gray-500 mt-1.5">
                Shown on the jobs list + job detail page. Leave blank to use the filename.
                Editable later.
              </div>
            </div>

            {/* Default image toggle */}
            <div className="bg-surface border border-border rounded p-3 mb-4">
              {defaultAsset ? (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDefaultImage}
                    onChange={(e) => setUseDefaultImage(e.target.checked)}
                    className="mt-0.5 accent-accent2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
                      <Star size={12} className="text-yellow-400" fill="currentColor" /> Use my default image
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Every clip will use your default ad image instead of a generated / stock photo. Saves Pexels+Gemini quota and keeps branding consistent.
                    </div>
                  </div>
                  <img
                    src={api.mediaUrl(defaultAsset.thumb_url)}
                    alt=""
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                </label>
              ) : (
                <div className="flex items-start gap-2.5 text-xs">
                  <ImageIcon size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-gray-300">No default image set</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Upload one on the <Link to="/assets" className="text-accent2 hover:text-white underline">Assets</Link> page and mark it as default to have the pipeline reuse it automatically.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bulletin pre-selected images — only relevant when the
                pipeline will render a bulletin (youtube_full or
                youtube_full_plus_shorts). Skipping the OpenAI image-
                gen step saves ~$0.04 per image, ~$0.20-0.40 per
                bulletin, and avoids the 5-img/min rate-limit pause. */}
            {platformProducesBulletin && (
              <div className="bg-surface border border-border rounded p-3 mb-4">
                <div className="text-sm font-medium text-gray-200 mb-1">
                  Pre-select bulletin images <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
                </div>
                <div className="text-[11px] text-gray-500 mb-3">
                  Pick any number of images. The bulletin's per-story carousel will
                  cycle through your selection instead of generating fresh images
                  via OpenAI. Leave empty to keep auto-generation.
                </div>

                {/* "We've seen this video before — reuse its images?" prompt.
                    Only renders while the user hasn't decided yet, the
                    hash is computed, and the backend found prior
                    generated assets for THIS exact source. */}
                {hashingFile && (
                  <div className="text-[11px] text-gray-500 mb-3 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" />
                    Checking for previously-generated images for this video…
                  </div>
                )}
                {!hashingFile && cachedAssets.length > 0 && !cachedDecision && (
                  <div className="bg-accent2/10 border border-accent2/40 rounded p-3 mb-3">
                    <div className="text-sm font-medium text-accent2 mb-1 flex items-center gap-1.5">
                      <ImageIcon size={13} /> Same video detected
                    </div>
                    <div className="text-[12px] text-gray-300 mb-3">
                      We already generated{" "}
                      <span className="font-semibold text-white">{cachedAssets.length}</span>{" "}
                      image{cachedAssets.length === 1 ? "" : "s"} for this exact
                      source video in a previous job. Reuse them instead of
                      calling OpenAI gpt-image-1 again ($ + rate-limit saved)?
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBulletinImageIds(cachedAssets.map(a => a.id));
                          setCachedDecision("reuse");
                        }}
                        className="bg-accent2 hover:bg-accent text-white text-xs font-medium px-3 py-1.5 rounded"
                      >
                        Reuse {cachedAssets.length} image{cachedAssets.length === 1 ? "" : "s"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCachedDecision("fresh")}
                        className="bg-black/40 hover:bg-black/60 border border-border text-gray-200 text-xs px-3 py-1.5 rounded"
                      >
                        Generate fresh
                      </button>
                    </div>
                  </div>
                )}
                {!hashingFile && cachedDecision === "reuse" && (
                  <div className="text-[11px] text-accent2 mb-3 flex items-center gap-1.5">
                    ✓ Reusing {cachedAssets.length} image{cachedAssets.length === 1 ? "" : "s"} from previous job — no OpenAI call.
                  </div>
                )}
                {!hashingFile && cachedDecision === "fresh" && (
                  <div className="text-[11px] text-gray-500 mb-3">
                    Generating fresh images this run.
                    {" "}
                    <button
                      type="button"
                      onClick={() => setCachedDecision("")}
                      className="text-accent2 hover:text-white underline"
                    >
                      Reconsider
                    </button>
                  </div>
                )}

                {userAssets.length === 0 ? (
                  <div className="text-[11px] text-gray-500">
                    No image assets yet — upload some on the{" "}
                    <Link to="/assets" className="text-accent2 hover:text-white underline">
                      Assets
                    </Link>{" "}
                    page first.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
                      {userAssets.map((a) => {
                        const selected = bulletinImageIds.includes(a.id);
                        const order = bulletinImageIds.indexOf(a.id) + 1;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleBulletinImage(a.id)}
                            className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
                              selected
                                ? "border-accent2 ring-2 ring-accent2/40"
                                : "border-border hover:border-gray-500"
                            }`}
                            title={a.filename}
                          >
                            {a.thumb_url ? (
                              <img
                                src={api.mediaUrl(a.thumb_url)}
                                alt={a.filename}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full bg-black/40 flex items-center justify-center">
                                <ImageIcon size={14} className="text-gray-600" />
                              </div>
                            )}
                            {selected && (
                              <span className="absolute top-1 left-1 bg-accent2 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {order}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {bulletinImageIds.length > 0 && (
                      <div className="text-[11px] text-gray-400 mt-2 flex items-center justify-between">
                        <span>
                          <span className="text-accent2 font-medium">
                            {bulletinImageIds.length}
                          </span>{" "}
                          image{bulletinImageIds.length === 1 ? "" : "s"} selected
                          {" · "}cycle order matches the numbers
                        </span>
                        <button
                          type="button"
                          onClick={() => setBulletinImageIds([])}
                          className="text-gray-500 hover:text-white underline"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            {submitting && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{uploadPct < 100 ? "Uploading video\u2026" : "Starting pipeline\u2026"}</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={submit}
              disabled={submitting}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {uploadPct < 100 ? `Uploading ${uploadPct}%` : "Starting pipeline\u2026"}</>
                : "\u25B6 Start Pipeline"}
            </button>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn btn-secondary flex items-center gap-1.5 disabled:opacity-30"
        >
          <ChevronLeft size={16} /> Back
        </button>
        {step < lastStep && (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext}
            className="btn btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white capitalize">{value || "\u2014"}</span>
    </div>
  );
}
