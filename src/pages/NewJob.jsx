import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, ChevronRight, ChevronLeft, Loader2, Film, Languages, Image as ImageIcon, Star, Mic } from "lucide-react";
import { api, getToken } from "../api/client";

// Stamps ?token=<jwt> onto backend URLs so plain <video src=...> /
// <img src=...> tags can authenticate. Browser tags can't attach
// Authorization: Bearer, so the bg-sample route falls back to query.
function withAuth(url) {
  if (!url) return url;
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

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


// ─── Frame-layout SVG mock for the wizard's Step 2 ──────────────────
// Small visual preview of each short template so the user can see
// the layout before picking, rather than guessing from a one-line
// description. Mirrors the live-preview SVG used in V4Editor's short
// inspector. Pure presentation — no state.
function FrameLayoutMock({ layoutKey }) {
  const W = 140, H = 248;     // ~9:16 mini canvas
  const fontFamily = "system-ui, sans-serif";

  if (layoutKey === "follow_bar") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded bg-black border border-gray-200">
        <rect x="0" y="0" width={W} height={H} fill="#1a0a2e" />
        <text x={W / 2} y="28" fill="#ffff00" fontSize="11" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>HEADLINE</text>
        <text x={W / 2} y="42" fill="#ffff00" fontSize="9" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>(top text)</text>
        <rect x="6" y="60" width={W - 12} height={W - 12} fill="#222" stroke="#444" />
        <text x={W / 2} y={60 + (W - 12) / 2 + 3} fill="rgba(255,255,255,.35)" fontSize="9" textAnchor="middle" fontFamily={fontFamily}>video (1:1)</text>
        <rect x="0" y={H - 38} width={W} height="38" fill="#0d0518" />
        <text x={W / 2} y={H - 22} fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>FOLLOW KAIZER NEWS</text>
        <circle cx={W / 2 - 16} cy={H - 10} r="4" fill="#fff" />
        <circle cx={W / 2}      cy={H - 10} r="4" fill="#fff" />
        <circle cx={W / 2 + 16} cy={H - 10} r="4" fill="#fff" />
      </svg>
    );
  }

  if (layoutKey === "split_frame") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded bg-black border border-gray-200">
        <rect x="0" y="0" width={W} height={H} fill="#1a0a2e" />
        <rect x="8" y="8" width={W - 16} height="74" fill="#333" stroke="#555" />
        <text x={W / 2} y="48" fill="rgba(255,255,255,.45)" fontSize="9" textAnchor="middle" fontFamily={fontFamily}>thumbnail</text>
        <rect x="8" y="88" width={W - 16} height={H - 96} fill="#222" stroke="#444" />
        <text x={W / 2} y={H / 2 + 30} fill="rgba(255,255,255,.35)" fontSize="9" textAnchor="middle" fontFamily={fontFamily}>video</text>
      </svg>
    );
  }

  if (layoutKey === "clean_card") {
    const half = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded bg-black border border-gray-200">
        <rect x="0" y="0" width={W} height={H} fill="#000" />
        <rect x="0" y="0" width={W} height={half} fill="#222" />
        <text x={W / 2} y={half / 2} fill="rgba(255,255,255,.3)" fontSize="10" textAnchor="middle" fontFamily={fontFamily}>video</text>
        <rect x="0" y={half} width={W} height={H - half} fill="#C10000" />
        <text x={W / 2} y={half + 18} fill="#fff" fontSize="9" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>HEADLINE</text>
        <rect x="14" y={half + 30} width={W - 28} height={H - half - 44} fill="#fff" />
        <rect x="17" y={half + 33} width={W - 34} height={H - half - 50} fill="#333" />
      </svg>
    );
  }

  // Default: torn_card
  const vH = Math.round(H * 0.4619);
  const iH = Math.round(H * 0.3690);
  const tH = H - vH - iH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded bg-black border border-gray-200">
      <rect x="0" y="0" width={W} height={H} fill="#000" />
      <rect x="0" y="0" width={W} height={vH} fill="#222" />
      <text x={W / 2} y={vH / 2} fill="rgba(255,255,255,.3)" fontSize="9" textAnchor="middle" fontFamily={fontFamily}>video</text>
      <rect x="0" y={vH + tH} width={W} height={iH} fill="#333" />
      <text x={W / 2} y={vH + tH + iH / 2} fill="rgba(255,255,255,.3)" fontSize="9" textAnchor="middle" fontFamily={fontFamily}>image</text>
      <rect x="0" y={vH - 4} width={W} height={tH + 8} fill="#C10000" />
      <polygon
        points={`0,${vH - 4} ${W * 0.15},${vH - 9} ${W * 0.32},${vH - 3} ${W * 0.5},${vH - 8} ${W * 0.7},${vH - 3} ${W * 0.85},${vH - 9} ${W},${vH - 4}`}
        fill="#C10000"
      />
      <text x={W / 2} y={vH + tH / 2 + 2} fill="#fff" fontSize="10" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>HEADLINE</text>
    </svg>
  );
}
function isV2(platform) {
  return platform === V2_PLATFORM_KEY;
}

// V3 platform key. V3 = Deepgram + (Claude|Gemini) -> V1 render. Shares
// the Stage 2 provider dropdown with V2 since both expose the same
// "which LLM decides the cuts" question.
const V3_PLATFORM_KEY = "full_video_shorts_v3";
function isV3(platform) {
  return platform === V3_PLATFORM_KEY;
}
function usesStage2Provider(platform) {
  return isV2(platform) || isV3(platform);
}

// V4 platform key. V4 = Deepgram + Claude KEEP/CUT + atomic ffmpeg
// trim+concat (Step 1) + canvas composite with audio passthrough
// (Step 2). Eliminates the lipsync drift class of bugs entirely. The
// canvas JSON is the source of truth for layout + timing; the editor
// reads/writes it. No Stage 2 provider — V4 always uses Claude.
const V4_PLATFORM_KEY = "full_video_shorts_v4";
function isV4(platform) {
  return platform === V4_PLATFORM_KEY;
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
  // V4-only: which looping background video the operator wants the
  // bulletin to render onto. "" or null = flat color (current default).
  // "sample:NAME.mp4" picks a bundled demo; "asset:N" picks one of the
  // user's previously-uploaded videos. The bg_video_volume slider
  // mirrors the editor's; defaults to muted so the studio-feel doesn't
  // step on the anchor audio.
  const [v4BgRef, setV4BgRef] = useState("");
  const [v4BgVolume, setV4BgVolume] = useState(0.0);
  // Intro reel — bg plays full-screen with audio for N seconds before
  // the bulletin layout fades in. 0 = no intro. Gives the channel-leader
  // / cold-open feel the operator asked for.
  const [v4BgIntroSec, setV4BgIntroSec] = useState(0);
  // Three-way mode selector the operator picks first. Drives which
  // sections of the bg step are shown + what gets submitted:
  //   "none"     → no bg video at all (flat colour background)
  //   "bg"       → bg looped behind the bulletin from t=0 (no intro)
  //   "intro_bg" → bg plays full-screen with audio first, then drops to
  //                background once the bulletin starts
  const [v4BgMode, setV4BgMode] = useState("none");
  const [v4BgSamples, setV4BgSamples] = useState([]);
  const [v4UserBgs, setV4UserBgs]     = useState([]);
  const [v4BgUploading, setV4BgUploading] = useState(false);
  const v4BgFileRef = useRef(null);
  // Sub-state for V4's Step 2 — flips from "frame" (show template grid)
  // to "bg" (show bg-video picker) after the operator picks a template.
  // Lets us add the new "studio background" choice without renumbering
  // every other step downstream (V1 = 5 steps, V2 = 6, V4 stays at 5
  // visually).
  const [v4StepPhase, setV4StepPhase] = useState("frame");
  const [v4Defaults, setV4Defaults] = useState(null);
  const [hasV4Defaults, setHasV4Defaults] = useState(false);
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
    // V4 auto-pipeline defaults — drive the one-click quick-start path.
    api.v4HasDefaults().then((r) => setHasV4Defaults(!!r?.has)).catch(() => {});
    api.v4GetDefaults().then(setV4Defaults).catch(() => {});
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
      // Send the chosen provider explicitly for any platform that uses it.
      // (We deliberately don't gate on != DEFAULT here so the backend
      // never has to guess -- it gets the exact value the user saw in
      // the dropdown. Backend create_job's form default of "gemini" is
      // only used when no value is sent at all, i.e. legacy V1 paths.)
      if (usesStage2Provider(platform) && stage2Provider) {
        form.append("stage_2_provider", stage2Provider);
      }
      // Phase 14 / V2 Beta (D-13.11): optional name. Backend caps at
      // 120 chars and falls back to the filename when blank.
      const trimmedName = (jobName || "").trim();
      if (trimmedName) {
        form.append("name", trimmedName);
      }
      // V4 background video — stamped onto the freshly-created canvas
      // so the very first render already uses the user-chosen studio
      // backdrop. Empty / null means flat colour (legacy behaviour).
      // Bg fields only travel when the operator actually picked one of
      // the two bg modes — "none" submits no bg, so the orchestrator
      // falls back to the flat-colour default. Intro seconds only count
      // for the "intro_bg" mode so picking "bg" alone gives a pure
      // looped background from t=0 even if the operator had previously
      // dialled a non-zero intro.
      if (isV4(platform) && v4BgMode !== "none" && v4BgRef) {
        form.append("v4_bg_video_path", v4BgRef);
        form.append("v4_bg_video_volume", String(v4BgVolume || 0));
        form.append("v4_bg_intro_seconds",
          String(v4BgMode === "intro_bg" ? (v4BgIntroSec || 0) : 0));
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
            {/* V4 auto-pipeline shortcut: when the user has saved
                defaults, surface a one-click path that skips Step 2,
                3 (and 4 for V2 STT) entirely. The pipeline applies the
                user's frame_layout / language / channels automatically
                and the consent banner in V4Editor handles the publish
                gate. */}
            {hasV4Defaults && v4Defaults && (
              <div className="mb-4 p-3 rounded-lg border border-accent2/40 bg-accent2/5 flex items-center gap-3">
                <div className="text-accent2 text-lg flex-shrink-0">⚡</div>
                <div className="flex-1 text-xs text-gray-300">
                  <div className="font-semibold text-white">Quick-start with your defaults</div>
                  <div className="text-gray-500">
                    Platform: <span className="text-accent2">{v4Defaults.platform || "full_video_shorts_v4"}</span>
                    {" · "}Frame: <span className="text-accent2">{v4Defaults.frame_layout}</span>
                    {" · "}Language: <span className="text-accent2">{v4Defaults.language}</span>
                    {v4Defaults.auto_publish && (
                      <> {" · "}<span className="text-amber-300">Auto-publish on{v4Defaults.require_consent ? " (with consent)" : ""}</span></>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Pre-fill every step and jump straight to confirm.
                    setPlatform(v4Defaults.platform || "full_video_shorts_v4");
                    setFrame(v4Defaults.frame_layout || "torn_card");
                    setLanguage(v4Defaults.language || "te");
                  }}
                  className="text-xs px-3 py-1.5 bg-accent2/20 text-accent2 rounded hover:bg-accent2/30"
                >
                  Apply defaults
                </button>
                <Link
                  to="/v4-defaults"
                  className="text-xs text-gray-500 hover:text-white"
                  title="Edit your defaults"
                >Edit</Link>
              </div>
            )}
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
                  {isV4(key) && (
                    <span
                      className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full
                                 text-[9px] font-bold tracking-widest uppercase
                                 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      title="V4 — trim + canvas architecture. Zero lipsync drift, editable canvas timeline."
                    >
                      New
                    </span>
                  )}
                  <div className="font-medium">{info.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{info.width} x {info.height}</div>
                  {isV4(key) && (
                    <div className="text-[10px] text-emerald-400/80 mt-1">
                      Lipsync locked · editable canvas
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Frame \u2014 Shorts only. Long-form (16:9) uses the bulletin
            compositor and bypasses this step entirely.
            V4 also inserts a "background video" sub-step here: after the
            user picks a shorts template, we swap this whole section to
            the bg picker so the operator can choose a studio backdrop
            before kicking off the pipeline. v4StepPhase tracks which
            sub-view is showing; non-V4 platforms ignore it. */}
        {step === 2 && !isLongForm(platform) && (!isV4(platform) || v4StepPhase === "frame") && (
          <div>
            <div className="mb-5">
              <h2 className="font-semibold text-white text-lg">Choose a Shorts Template</h2>
              <p className="text-xs text-gray-500 mt-1">
                Every template renders one 9:16 video per story. Same trim, same audio \u2014 different on-screen look.
                Pick one for now; you can swap any short to a different template later in the editor.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Object.entries(frames).map(([key, label]) => {
                const description = label.split("\u2014")[1]?.trim() || "";
                const isSelected = frame === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setFrame(key);
                      // V4 inserts a "background video" sub-step between
                      // template selection and language. V1/V2 jump
                      // straight to step 3.
                      if (isV4(platform)) {
                        setV4StepPhase("bg");
                        // Load sample + user-saved bg videos lazily on
                        // entering the sub-step.
                        api.v4ListBgSamples().then((s) => setV4BgSamples(s || [])).catch(() => {});
                        api.v4ListUserBgVideos().then((u) => setV4UserBgs(u || [])).catch(() => {});
                      } else {
                        setStep(3);
                      }
                    }}
                    className={`group relative rounded-xl overflow-hidden border-2 transition-all text-left
                      ${isSelected
                        ? "border-accent ring-2 ring-accent/40 shadow-lg shadow-accent/20"
                        : "border-border hover:border-accent/60 hover:shadow-md hover:-translate-y-0.5"}`}
                  >
                    {/* Big preview thumbnail \u2014 fills the top of the card,
                        same SVG mock the editor uses for the live preview */}
                    <div className="bg-black p-3 pb-2">
                      <FrameLayoutMock layoutKey={key} />
                    </div>
                    {/* Card meta */}
                    <div className="bg-panel px-3 py-2.5 border-t border-border">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-white text-sm capitalize truncate">
                          {key.replace("_", " ")}
                        </div>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full
                                         bg-accent2/15 text-accent2 border border-accent2/40 flex-shrink-0">
                          Shorts
                        </span>
                      </div>
                      {description && (
                        <div className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-tight">
                          {description}
                        </div>
                      )}
                    </div>
                    {/* Selected checkmark badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-white
                                      flex items-center justify-center text-xs font-bold shadow-md">
                        \u2713
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* V4 sub-step 2b: Background video. Comes between template
            selection and language. Skippable — proceeding without
            picking anything keeps the legacy flat-color background. */}
        {step === 2 && !isLongForm(platform) && isV4(platform) && v4StepPhase === "bg" && (
          <div>
            <div className="mb-5">
              <h2 className="font-semibold text-white text-lg">Studio background</h2>
              <p className="text-xs text-gray-500 mt-1">
                Choose how the background of your bulletin behaves. You can change all of this later in the editor
                before re-rendering — nothing here is permanent.
              </p>
            </div>

            {/* Three-way mode selector — drives the rest of this step. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              {[
                {
                  key: "none",
                  title: "No background video",
                  desc: "Plain colour fill behind the anchor — fastest render, smallest file.",
                },
                {
                  key: "bg",
                  title: "Background from the start",
                  desc: "A looping studio video plays behind the bulletin from the very first frame.",
                },
                {
                  key: "intro_bg",
                  title: "Intro reel, then background",
                  desc: "Bg plays full-screen with audio first (5–15s), then drops behind the bulletin (muted).",
                },
              ].map((m) => {
                const sel = v4BgMode === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setV4BgMode(m.key);
                      if (m.key === "none") { setV4BgRef(""); setV4BgIntroSec(0); }
                      // Default 8s intro the first time the user picks intro mode.
                      if (m.key === "intro_bg" && !v4BgIntroSec) setV4BgIntroSec(8);
                      if (m.key === "bg") setV4BgIntroSec(0);
                    }}
                    className={`text-left p-3 rounded-lg border-2 transition-all
                      ${sel
                        ? "border-accent ring-2 ring-accent/40 bg-accent/5"
                        : "border-border hover:border-accent/60"}`}
                  >
                    <div className={`font-semibold text-sm mb-1 ${sel ? "text-white" : "text-gray-200"}`}>{m.title}</div>
                    <div className="text-[11px] text-gray-500 leading-tight">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* When mode = "none", the rest of the step is just a continue button. */}
            {v4BgMode === "none" && (
              <div className="text-[11px] text-gray-500 italic p-3 border border-dashed border-border rounded mb-5">
                No background video will be used. The canvas will render with a flat colour fill (the layout's bg colour).
              </div>
            )}

            {/* Bundled demo backgrounds — only when bg or intro_bg picked */}
            {(v4BgMode === "bg" || v4BgMode === "intro_bg") && v4BgSamples.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
                  Demo backgrounds ({v4BgSamples.length})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {v4BgSamples.map((s) => {
                    const sel = v4BgRef === s.ref;
                    return (
                      <button
                        key={s.filename}
                        type="button"
                        onClick={() => setV4BgRef(s.ref)}
                        className={`relative text-left border-2 rounded-lg overflow-hidden transition-all
                          ${sel ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/60"}`}
                        title={s.filename}
                      >
                        <video
                          src={withAuth(s.url)}
                          muted autoPlay loop playsInline preload="metadata"
                          className="w-full aspect-video object-cover bg-black"
                        />
                        <div className="px-2 py-1.5 text-[11px] text-gray-300 truncate bg-panel">{s.filename}</div>
                        {sel && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* User's previously-uploaded bg videos — "previously used" */}
            {(v4BgMode === "bg" || v4BgMode === "intro_bg") && (
            <div className="mb-4">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Your uploads ({v4UserBgs.length})</span>
                <button
                  type="button"
                  onClick={() => v4BgFileRef.current?.click()}
                  disabled={v4BgUploading}
                  className="text-accent2 hover:text-white text-[11px] flex items-center gap-1 disabled:opacity-40"
                >
                  {v4BgUploading ? (<><Loader2 size={11} className="animate-spin" /> uploading…</>) : (<><Upload size={11} /> Upload from computer</>)}
                </button>
                <input
                  ref={v4BgFileRef}
                  type="file" accept="video/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setV4BgUploading(true);
                    try {
                      const r = await api.v4UploadBgVideo(f);
                      setV4BgRef(`asset:${r.id}`);
                      const u = await api.v4ListUserBgVideos().catch(() => []);
                      setV4UserBgs(u || []);
                    } catch (err) {
                      setError(err?.message || "bg upload failed");
                    } finally { setV4BgUploading(false); }
                  }}
                />
              </div>
              {v4UserBgs.length === 0 ? (
                <div className="text-[11px] text-gray-500 italic p-3 border border-dashed border-border rounded">
                  No saved bg videos yet. Upload one to use it now and on every future bulletin.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {v4UserBgs.map((a) => {
                    const ref = `asset:${a.id}`;
                    const sel = v4BgRef === ref;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setV4BgRef(ref)}
                        className={`relative text-left border-2 rounded-lg overflow-hidden transition-all
                          ${sel ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/60"}`}
                        title={a.filename}
                      >
                        <video
                          src={withAuth(a.url)}
                          muted autoPlay loop playsInline preload="metadata"
                          className="w-full aspect-video object-cover bg-black"
                        />
                        <div className="px-2 py-1.5 text-[11px] text-gray-300 truncate bg-panel">{a.filename}</div>
                        {sel && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Background-audio volume — only when a bg is picked AND not mode=none. */}
            {(v4BgMode === "bg" || v4BgMode === "intro_bg") && v4BgRef && (
              <div className="mb-4 p-3 rounded-lg border border-border bg-panel">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-300 font-medium">Background audio volume</span>
                  <span className="text-[11px] text-gray-400">{Math.round(v4BgVolume * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={v4BgVolume}
                  onChange={(e) => setV4BgVolume(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[10px] text-gray-500 mt-1">
                  0% = muted (recommended — keeps the anchor audio clean). Higher mixes the bg track under the talking-head while the bulletin plays.
                </div>
              </div>
            )}

            {/* Intro duration — only when mode = intro_bg */}
            {v4BgMode === "intro_bg" && v4BgRef && (
              <div className="mb-4 p-3 rounded-lg border border-amber-300/40 bg-amber-300/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-amber-200 font-medium">Intro reel duration</span>
                  <span className="text-[11px] text-amber-200">{v4BgIntroSec.toFixed(1)}s</span>
                </div>
                <input
                  type="range" min="2" max="20" step="0.5"
                  value={v4BgIntroSec}
                  onChange={(e) => setV4BgIntroSec(parseFloat(e.target.value) || 0)}
                  className="w-full"
                />
                <div className="text-[10px] text-gray-400 mt-1">
                  How long the bg plays full-screen at full audio BEFORE the bulletin starts. 5–10s gives a TV-channel cold-open feel.
                </div>
              </div>
            )}

            {/* Validation hint — modes that need a video but don't have one yet. */}
            {(v4BgMode === "bg" || v4BgMode === "intro_bg") && !v4BgRef && (
              <div className="mb-4 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[12px]">
                Pick a demo background or upload your own to continue.
              </div>
            )}

            {/* Continue + Back actions */}
            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => setV4StepPhase("frame")}
                className="text-[12px] text-gray-400 hover:text-white"
              >← Back to template</button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={(v4BgMode === "bg" || v4BgMode === "intro_bg") && !v4BgRef}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={(v4BgMode === "bg" || v4BgMode === "intro_bg") && !v4BgRef ? "Pick a background video first" : ""}
                >Continue</button>
              </div>
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

            {/* Item 114: Stage 2 provider selection. Shown for V2 and V3. */}
            {usesStage2Provider(platform) && (
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
