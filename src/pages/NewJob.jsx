import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Upload, ChevronRight, ChevronLeft, Loader2, Film, Languages, Image as ImageIcon, Star, Mic,
  Smartphone, Layers, Clapperboard, Video, Sparkles, Podcast } from "lucide-react";
import { api, getToken } from "../api/client";
import CustomTemplatePicker from "../components/CustomTemplatePicker";
import TemplateMediaPicker from "../components/TemplateMediaPicker";
import LibraryVideoPicker from "../components/LibraryVideoPicker";
import TemplateStep from "../components/TemplateStep";
import AuroraBackground from "../components/ui/AuroraBackground";
import { GlassCard, StepHeading, ChoiceGrid, ChoiceCard, Badge, Segmented, Toggle, Field } from "../components/wizard/kit";
import StyleDirector from "../components/wizard/StyleDirector";

// Pick a friendly icon for a platform/output tile from its key.
function tileIcon(key) {
  const k = String(key).toLowerCase();
  if (k.includes("anchor")) return Mic;
  if (k.includes("podcast")) return Podcast;
  if (k.includes("trailer")) return Clapperboard;
  if (k.includes("plus") || k === "full_video_shorts_v4" || k.includes("_v2") || k.includes("_v3")) return Layers;
  if (k.includes("short") || k.includes("reel")) return Smartphone;
  if (k.includes("full")) return Film;
  return Video;
}

// Stamps ?token=<jwt> onto backend URLs so plain <video src=...> /
// <img src=...> tags can authenticate. Browser tags can't attach
// Authorization: Bearer, so the bg-sample route falls back to query.
function withAuth(url) {
  if (!url) return url;
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

// Kind-first wizard: choose what you're making (the platform/output kind) FIRST, then
// the template step shows ONLY templates that fit that kind (short / full / both).
const STEPS         = ["Format", "Template", "Media", "Language", "Review"];
const STEPS_LONGFORM = ["Format", "Template", "Long-form", "Language", "Review"];
// V2 wizard inserts one extra "Transcription" step between Language and Review.
const STEPS_V2      = ["Format", "Template", "Media", "Language", "Transcription", "Review"];

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
        <text x={W / 2} y={H - 22} fill="#fff" fontSize="7" fontWeight="800" textAnchor="middle" fontFamily={fontFamily}>FOLLOW KAIZER X</text>
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
// Every platform tile either IS full_video_shorts_v4 or remaps to it
// (LEGACY_TO_V4_PRESET). Audio-first works for all of them, so the Audio Story
// toggle is offered on ANY V4-backed platform — not just the "Full Video +
// Shorts" tile. (LEGACY_TO_V4_PRESET is defined below; this runs at call time.)
function isV4Backed(platform) {
  return isV4(platform) || Object.prototype.hasOwnProperty.call(LEGACY_TO_V4_PRESET, platform);
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
  { name: "gemini", label: "Faster", description: "Quicker and lower cost. Great for most videos." },
  { name: "claude", label: "Most accurate (default)", description: "Best editorial judgment on Indian-language news. Recommended." },
];
const DEFAULT_STAGE_2_PROVIDER = "claude";

// V4 KEEP/CUT planner catalog. Both options receive the IDENTICAL
// system prompt + word-level transcript so the A/B comparison is
// apples-to-apples. The choice is stored per-job on Job.v4_trim_planner
// (read back by the V4 editor for the small "Planned by X" badge).
const V4_TRIM_PLANNER_CATALOG = [
  {
    name: "claude",
    label: "Anthropic (Claude)",
    description: "Sharpest sense of what to keep vs. cut on Telugu / Hindi news — repetition, trail-offs, story boundaries. Needs credit on the Anthropic API account, or the job fails at the first step.",
  },
  {
    name: "gemini",
    label: "Google (Gemini)",
    description: "Runs on your Google / Vertex account. Fast, low cost, reliable on clean audio. Use this when the Anthropic balance is empty.",
  },
  {
    name: "openai",
    label: "OpenAI (ChatGPT)",
    description: "Runs on your OpenAI account (GPT-4o). A third editorial opinion — handy when the other balances are empty.",
  },
];
// No forced default — the user picks the engine per job in the wizard.
const DEFAULT_V4_TRIM_PLANNER = "claude";

// V4 content type / edit profile. "auto" = the system classifies the
// transcript and picks the editing persona itself (asks you only when
// unsure); an explicit pick answers the question up front. Drives HOW
// the AI edits: what counts as junk, how stories/chapters are grouped,
// how aggressively silence is tightened.
const V4_CONTENT_TYPE_CATALOG = [
  { name: "auto",      label: "Auto detect (default)", hint: "System reads the transcript and decides" },
  { name: "news",      label: "News show",             hint: "Presenter, story segments, on-screen headline bar" },
  { name: "podcast",   label: "Podcast",               hint: "Conversation → chapters" },
  { name: "interview", label: "Interview",             hint: "Question-and-answer beats" },
  { name: "vlog",      label: "Vlog / creator",        hint: "Fast cuts, hook first" },
  { name: "generic",   label: "Other",                 hint: "Lecture, tutorial, speech…" },
];
const DEFAULT_V4_CONTENT_TYPE = "auto";

// V4 image-provider catalog. Controls how per-story sidebar images
// AND the thumbnail get generated. Persisted on Job.v4_image_provider.
const V4_IMAGE_PROVIDER_CATALOG = [
  {
    name: "auto",
    label: "Smart mix (default)",
    description: "Finds real reference photos (people, places, events) from the web, with AI as a fallback. Free for most. Recommended.",
  },
  {
    name: "gemini",
    label: "AI-generated",
    description: "Purely AI-drawn, illustrative images (never real photos). Best for opinion pieces or stories with no good reference photo.",
  },
  {
    name: "openai",
    label: "Premium AI images",
    description: "The sharpest, most cinematic AI images. Best when visual polish matters most.",
  },
];
const DEFAULT_V4_IMAGE_PROVIDER = "auto";

// V4 output-format catalog. Controls WHICH outputs get rendered. Persisted
// on Job.v4_output_format and forwarded to the orchestrator as
// KAIZER_V4_OUTPUT_FORMAT. "shorts-only" skips the full-video render
// entirely (faster); "full-only" skips all the short/reel carving.
const V4_OUTPUT_FORMAT_CATALOG = [
  {
    name: "both",
    label: "Full video + Shorts (default)",
    description: "Render the long-form bulletin AND the vertical shorts/reels. Best when you want a YouTube long-form upload plus clips for Shorts / Reels.",
  },
  {
    name: "shorts-only",
    label: "Shorts / Reels only",
    description: "Skip the full video entirely — only carve the vertical clips for YouTube Shorts, Instagram Reels and Facebook. Faster, no wasted render.",
  },
  {
    name: "full-only",
    label: "Full video only",
    description: "Render just the long-form bulletin — no shorts. Pick this when you only need the single long-form upload.",
  },
  {
    name: "trailer-only",
    label: "Trailer only",
    description: "No bulletin, no shorts — just a movie-style teaser of your video: the most dramatic moments, fast cuts, title cards and sound design. Delivered in 16:9 (plus a 9:16 companion).",
  },
];
const DEFAULT_V4_OUTPUT_FORMAT = "both";

// V4 full-form EFFECTS mode — how much of the editing engine treats the
// long-form video. Persisted on Job.v4_effects_mode; the per-story render
// applies (and caches) the resolved look. Off = exactly the classic render.
const V4_EFFECTS_CATALOG = [
  {
    name: "auto",
    label: "Polished (recommended)",
    description: "A tasteful news-channel finish on every story — subtle contrast, crispness and a soft vignette. Safe and professional.",
  },
  {
    name: "rich",
    label: "Cinematic (AI Director)",
    description: "The AI edits story-by-story like a TV editor: each story gets its own mood, color and transition based on what it's about (crime = cold, comedy = bright), plus matching sound.",
  },
  {
    name: "off",
    label: "Off (clean)",
    description: "No effects — the classic untouched render.",
  },
];
const DEFAULT_V4_EFFECTS_MODE = "auto";

// Legacy single-output platform tiles now run on the V4 canvas pipeline.
// Each maps to a V4 output-format so the job is a GENUINE
// full_video_shorts_v4 job (real canvas.json) that opens in the canvas
// editor with per-platform SEO — instead of the retired V1 subprocess +
// old editor. The map is the single source of truth for the user's intent
// once the platform string becomes full_video_shorts_v4.
const LEGACY_TO_V4_PRESET = {
  instagram_reel:           "shorts-only",
  youtube_short:            "shorts-only",
  facebook_reel:            "shorts-only",
  youtube_full:             "full-only",
  youtube_full_plus_shorts: "both",
  movie_trailer:            "trailer-only",
};

// Synthetic step-0 tile (not a backend platform): upload a video, get ONLY
// its movie-style trailer. Runs the V4 pipeline with the trailer-only
// output format; the template step is skipped (the trailer engine owns the
// whole look — 31 style packs, not canvas templates).
const TRAILER_TILE = ["movie_trailer", {
  label: "Movie Trailer",
  width: 1920, height: 1080,
}];

// Synthetic step-0 tile (not a backend platform): the News-Anchor studio.
// Clicking it NAVIGATES to /anchor (an AI presenter reads a typed script
// via /api/avatar) — it never submits through this wizard's create_job.
const ANCHOR_TILE = ["news_anchor", {
  label: "News Anchor",
  width: 1080, height: 1920,
}];

// Synthetic step-0 tile (not a backend platform): the Podcast editor.
// Clicking it NAVIGATES to /podcast-studio (AI multi-cam edit of a single
// camera via /api/podcast) — it never submits through this wizard's create_job.
const PODCAST_TILE = ["podcast_editor", {
  label: "Podcast Editor",
  width: 1920, height: 1080,
}];

// The original publish target each tile maps to — persisted on the job so the
// editor knows which platform's SEO to lead with (Instagram caption+hashtags
// vs YouTube title+tags). The remap to full_video_shorts_v4 would otherwise
// lose this. youtube_full_plus_shorts targets YouTube as the primary.
const TILE_TARGET_PLATFORM = {
  instagram_reel:           "instagram",
  youtube_short:            "youtube",
  facebook_reel:            "facebook",
  youtube_full:             "youtube",
  youtube_full_plus_shorts: "youtube",
  movie_trailer:            "youtube",
};

export default function NewJob() {
  const navigate = useNavigate();
  const loc      = useLocation();
  // Library handoff: when the user clicks "Use" on a Library card we
  // navigate here with the chosen item in router state. The Upload step
  // is then replaced with a "Using this video" preview card and the
  // submit payload carries library_item_id instead of a File body.
  const initialLibraryItem = loc.state?.libraryItem || null;
  const [libraryItem] = useState(initialLibraryItem);
  const [step, setStep]       = useState(0);
  const [file, setFile]       = useState(null);
  // V4 audio-first mode: the narration AUDIO is the master track; the uploaded
  // video (if any) becomes a MUTED reference b-roll; no video → fullscreen images.
  const [audioFirst, setAudioFirst] = useState(false);
  const [audioFile, setAudioFile]   = useState(null);
  const [platform, setPlatform]   = useState("");
  const [frame, setFrame]     = useState("");
  // Custom-template selection + per-slot media (the wizard's Media step).
  const [customTpl, setCustomTpl]   = useState(null);   // chosen custom template object
  const [templateMedia, setTemplateMedia] = useState({}); // {slot_key: asset_id}
  const [mainMediaSlot, setMainMediaSlot] = useState(""); // slot whose video is AI-trimmed
  const [mediaReady, setMediaReady] = useState(false);
  const [fullformLayout, setFullformLayout] = useState(""); // "" = default bulletin, "custom:<id>" = custom full template
  const [fullChosen, setFullChosen] = useState(false);      // user explicitly made a full-form choice (template or default)
  const [mediaTab, setMediaTab] = useState("upload");   // Media step: "upload" | "library"
  const [pickedLib, setPickedLib] = useState(null);     // a Library video chosen inline
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
  // Reference B-roll clips the AI cuts to full-screen. Each is uploaded to the
  // asset pool tagged with its subject, and its id rides bulletin_image_ids so
  // the render turns it into an AI-timed cutaway. [{id, name, tag}]
  const [refClips, setRefClips] = useState([]);
  const [refFile, setRefFile]   = useState(null);   // pending clip file
  const [refTag, setRefTag]     = useState("");      // pending clip subject/tag
  const [refBusy, setRefBusy]   = useState(false);
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
  // Optional: auto-publish this job's clips via a Publishing Plan when it
  // finishes. Links the job to the plan at submit; the plan fans out on done.
  const [plans, setPlans] = useState([]);
  const [attachPlanId, setAttachPlanId] = useState("");
  useEffect(() => {
    let alive = true;
    api.listCampaigns()
      .then((rows) => { if (alive) setPlans(rows || []); })
      .catch(() => { if (alive) setPlans([]); });
    return () => { alive = false; };
  }, []);

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

  // V4 KEEP/CUT planner — "claude" (Opus 4.7) or "gemini" (2.5 Flash).
  // Only meaningful for V4 platforms; backend stamps NULL for V1/V2
  // rows. Default is "claude" so existing users see no behaviour change.
  const [v4TrimPlanner, setV4TrimPlanner] = useState(DEFAULT_V4_TRIM_PLANNER);
  const [v4ContentType, setV4ContentType] = useState(DEFAULT_V4_CONTENT_TYPE);

  // V4 image provider — "auto" (V1 multi-source), "gemini" (Nano Banana),
  // or "openai" (gpt-image-1). Controls per-story sidebar images AND
  // the thumbnail. NULL persisted for non-V4 platforms.
  const [v4ImageProvider, setV4ImageProvider] = useState(DEFAULT_V4_IMAGE_PROVIDER);

  // V4 output format — "both" (full video + shorts), "shorts-only"
  // (skip the full video), or "full-only" (skip shorts). NULL persisted
  // for non-V4 platforms.
  const [v4OutputFormat, setV4OutputFormat] = useState(DEFAULT_V4_OUTPUT_FORMAT);
  const [v4EffectsMode, setV4EffectsMode] = useState("rich");
  // Which AI Director ENGINE plans the per-story direction: "v4" (ours,
  // full arsenal — default) | "platform" (classic 5-mood signal engine).
  const [v4DirectorEngine, setV4DirectorEngine] = useState("v4");
  // Which BRAIN writes the Director's plan. Gemini also LISTENS/LOOKS via
  // the sensors; Claude/ChatGPT direct text-only from transcript + facts.
  const [v4DirectorProvider, setV4DirectorProvider] = useState("gemini");
  // THEME PACK: the visual skin of the built-in render ("" = classic).
  // The theme only styles the look — layouts/animations run inside it.
  const [v4Theme, setV4Theme] = useState("");
  // User-directed style/effect picks ("edit using THESE"). Empty object = the
  // AI Director decides everything (the default). Any pinned category
  // constrains the render. Wired to v4_style_directives on submit.
  const [v4StyleDirectives, setV4StyleDirectives] = useState({});
  // "AI does everything" (default) vs "I'll choose myself" — the single
  // switch that hides all technical grids for normal users.
  const [aiAuto, setAiAuto] = useState(true);
  const enableAiAuto = () => {
    setAiAuto(true);
    setV4ContentType("auto");
    setV4TrimPlanner(DEFAULT_V4_TRIM_PLANNER);
    setV4ImageProvider("auto");
    setV4EffectsMode("rich");
    setV4DirectorEngine("v4");
    setV4DirectorProvider("gemini");
    setV4StyleDirectives({});   // hand every choice back to the AI Director
  };
  // Upload one tagged reference clip → add its id to the reference list AND to
  // bulletin_image_ids so it submits with the job and becomes an AI cutaway.
  const addRefClip = async () => {
    if (!refFile || refBusy) return;
    const tag = (refTag || refFile.name.replace(/\.[^.]+$/, "")).trim();
    setRefBusy(true);
    try {
      const asset = await api.uploadReferenceClip(refFile, tag);
      if (asset && asset.id) {
        setRefClips((prev) => [...prev, { id: asset.id, name: refFile.name, tag }]);
        setBulletinImageIds((prev) => (prev.includes(asset.id) ? prev : [...prev, asset.id]));
        setRefFile(null);
        setRefTag("");
      }
    } catch (e) {
      setError(e.message || "Reference clip upload failed");
    } finally {
      setRefBusy(false);
    }
  };
  const removeRefClip = (id) => {
    setRefClips((prev) => prev.filter((c) => c.id !== id));
    setBulletinImageIds((prev) => prev.filter((x) => x !== id));
  };
  // Stage 2/3: edit-first — defer the up-front render; refine the scene in the editor, then Export.
  const [v4DeferRender, setV4DeferRender] = useState(false);
  // Shorts cap — default 8/job; opt-in to allow more.
  const [v4MoreShorts, setV4MoreShorts] = useState(false);
  const [v4MaxShorts, setV4MaxShorts] = useState(8);

  // UI-only: which Step-1 tile the user clicked. Needed because legacy tiles
  // remap `platform` to full_video_shorts_v4, so `platform === key` no longer
  // identifies the clicked tile for the selected-highlight.
  const [selectedTileKey, setSelectedTileKey] = useState("");

  // Original publish target the operator picked (instagram / youtube /
  // facebook). Persisted on the job so the editor leads with that platform's
  // SEO. Defaults to youtube (the V4-native tile + any unmapped platform).
  const [v4TargetPlatform, setV4TargetPlatform] = useState("youtube");

  // "Choose channels" — connected accounts the operator wants this job
  // published to, picked at generate time (recorded on the Job; the editor +
  // Publish flow default to these). Empty = decide later at publish.
  const [pubChannels, setPubChannels] = useState([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  // PER-CHANNEL intro overrides for this job:
  //   { [channelId]: { mode:"own"|"demo"|"upload", assetId:number, demoFile?:string, busy?:bool } }
  // Absent / assetId 0 = that channel uses its own assigned intro.
  const [channelIntros, setChannelIntros] = useState({});
  const [introSamples, setIntroSamples]   = useState([]);  // platform demos (shared, loaded once)
  const [introErr, setIntroErr]           = useState("");
  const setChannelIntro = (cid, patch) =>
    setChannelIntros((prev) => ({ ...prev, [cid]: { ...(prev[cid] || { mode: "own", assetId: 0 }), ...patch } }));
  const ensureIntroSamples = () => {
    if (introSamples.length === 0) {
      api.v4ListBgSamples().then((r) => setIntroSamples(r || [])).catch(() => {});
    }
  };

  // Inline asset uploader for the bulletin image picker — files dropped
  // here go straight into UserAssets so the user doesn't have to leave
  // the wizard to upload. ref triggers the hidden <input type=file>.
  const bulletinUploadRef = useRef(null);
  const [bulletinUploading, setBulletinUploading] = useState(false);

  // V4 only: operator-supplied bulletin description. When non-empty
  // the orchestrator switches to source-preserved mode (no Claude
  // trim, bulletin SEO description = this text). Any language.
  const [v4PredefinedDescription, setV4PredefinedDescription] = useState("");

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
    // Connected YouTube accounts for the "Choose channels" step.
    api.listChannels({ kind: "accounts" })
      .then((rows) => setPubChannels((rows || []).filter((c) => c.connected)))
      .catch(() => setPubChannels([]));
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
  // bulletin pre-selected images. V4 (full_video_shorts_v4) also
  // produces a bulletin — without this gate it ALSO needs the multi-
  // image picker so the operator can supply their own carousel.
  const platformProducesBulletin =
    platform === "youtube_full"
    || platform === "youtube_full_plus_shorts"
    || platform === "full_video_shorts_v4";

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
      if (!f) return;
      // Accept by MIME *or* extension: Windows often hands a bare .mp4 with
      // an EMPTY type, which the old MIME-only check dropped SILENTLY — the
      // file looked attached but state stayed null → cryptic 422 on submit.
      const okType = f.type.startsWith("video/");
      const okExt = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|3gp)$/i.test(f.name || "");
      if (okType || okExt) { setFile(f); setPickedLib(null); setError(""); }
      else { setError(`"${f.name || "That file"}" isn't a video — drop an MP4/MOV/WebM.`); }
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
      if (isV4Backed(platform) && audioFirst && !audioFile) {
        setError("Select the narration audio first.");
        setSubmitting(false);
        return;
      }
      const form = new FormData();
      const _lib = pickedLib || libraryItem;   // inline Library pick OR the handoff item
      // Source gate: exactly one source must be present. Without this,
      // `form.append("video", null)` sends the STRING "null" and the API
      // rejects it with a cryptic 422 ("Expected UploadFile, received str").
      const _audioMode = isV4Backed(platform) && audioFirst;
      if (!_audioMode && !_lib && !file) {
        setError("Add a video first — drop a file above or pick one from your Library.");
        setSubmitting(false);
        return;
      }
      if (_audioMode) {
        // Audio-first: the narration audio is the master/source; the uploaded
        // video (if any) becomes the OPTIONAL muted reference b-roll.
        form.append("v4_audio_first", "true");
        form.append("audio", audioFile);
        if (file) form.append("video", file);
      } else if (_lib) {
        form.append("library_item_id", String(_lib.id));
      } else {
        form.append("video", file);   // guaranteed non-null by the gate above
      }
      form.append("platform", platform);
      form.append("frame_layout", frame);
      // "Full form video" (16:9) custom template, when the chosen template is landscape.
      if (fullformLayout) form.append("fullform_layout", fullformLayout);
      // Custom-template per-slot media: the non-main slots' uploaded assets +
      // which slot's video is the AI-trim "main" (for shorts OR full-form custom).
      if (String(frame).startsWith("custom:") || fullformLayout) {
        if (templateMedia && Object.keys(templateMedia).length) {
          form.append("template_media", JSON.stringify(templateMedia));
        }
        if (mainMediaSlot) form.append("main_media_slot", mainMediaSlot);
      }
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
      // V4 KEEP/CUT planner — backend coerces unknown to "claude" so
      // a stale frontend can't downgrade quality silently.
      if (isV4(platform) && v4TrimPlanner) {
        form.append("v4_trim_planner", v4TrimPlanner);
      }
      // Content type / edit profile — "auto" lets the system classify;
      // an explicit pick answers the type question up front.
      if (isV4(platform) && v4ContentType) {
        form.append("v4_content_type", v4ContentType);
      }
      // V4 image provider — same pattern; backend coerces unknown to "auto".
      if (isV4(platform) && v4ImageProvider) {
        form.append("v4_image_provider", v4ImageProvider);
      }
      if (isV4(platform) && v4OutputFormat) {
        form.append("v4_output_format", v4OutputFormat);
      }
      if (isV4(platform) && v4EffectsMode) {
        form.append("v4_effects_mode", v4EffectsMode);
      }
      // Director ENGINE pick — which AI plans per-story direction. The
      // guard mirrors the picker's visibility gates exactly, so a pick made
      // and then hidden (AI-auto re-enabled, effects downgraded, trailer-
      // only) can never silently govern a render; omitted → backend
      // defaults to "v4".
      if (isV4(platform) && !aiAuto && v4OutputFormat !== "trailer-only"
          && v4EffectsMode === "rich" && v4DirectorEngine) {
        form.append("v4_director_engine", v4DirectorEngine);
      }
      // Director BRAIN pick — same visibility-mirrored guard as the engine
      // pick above; omitted → backend defaults to "gemini" (the only brain
      // that also listens to the audio via the sensors).
      if (isV4(platform) && !aiAuto && v4OutputFormat !== "trailer-only"
          && v4EffectsMode === "rich" && v4DirectorProvider) {
        form.append("v4_director_provider", v4DirectorProvider);
      }
      // THEME PACK — only for built-in renders (a custom template IS its
      // own look; the backend validates the key against the registry).
      if (isV4(platform) && v4Theme && !fullformLayout) {
        form.append("v4_theme", v4Theme);
      }
      // User-directed style/effect picks — only when the user pinned something
      // AND effects aren't off. Empty/off ⇒ omitted ⇒ full AI-Director autonomy.
      if (isV4(platform) && !aiAuto && v4EffectsMode !== "off") {
        const _sd = v4StyleDirectives || {};
        const _hasPicks = Object.values(_sd).some(
          (x) => (Array.isArray(x) ? x.length > 0 : !!x));
        if (_hasPicks) form.append("v4_style_directives", JSON.stringify(_sd));
      }
      if (isV4(platform) && v4DeferRender) {
        form.append("v4_defer_render", "true");   // edit-first: pipeline skips the up-front render
      }
      // Shorts ceiling — default 8; only send a higher number when the
      // operator opted in. Harmless for full-only (orchestrator skips shorts).
      if (isV4(platform)) {
        form.append("v4_max_shorts", String(v4MoreShorts ? v4MaxShorts : 8));
      }
      if (isV4(platform) && v4TargetPlatform) {
        form.append("v4_target_platform", v4TargetPlatform);
      }
      // "Choose channels" — record the operator's intended publish targets
      // on the Job (comma-separated Channel ids). Editor + Publish default to
      // these. Empty = decide later at publish (the legacy flow).
      if (isV4(platform) && selectedChannelIds.length) {
        form.append("channel_ids", selectedChannelIds.join(","));
      }
      // PER-CHANNEL intro overrides — {channel_id: asset_id} for SELECTED
      // channels the operator gave a custom intro. Absent channels use their
      // own assigned intro. Only meaningful for V4.
      if (isV4(platform)) {
        const _introOv = {};
        for (const cid of selectedChannelIds) {
          const ci = channelIntros[cid];
          if (ci && ci.assetId > 0) _introOv[cid] = ci.assetId;
        }
        if (Object.keys(_introOv).length) {
          form.append("intro_overrides", JSON.stringify(_introOv));
        }
      }
      // V4 predefined description — when non-empty, backend skips
      // Claude KEEP/CUT and keeps the source video AS-IS. Trim to
      // 8000 chars (backend hard cap) so a giant paste doesn't 400.
      if (isV4(platform) && v4PredefinedDescription.trim()) {
        form.append("v4_predefined_description", v4PredefinedDescription.trim().slice(0, 8000));
      }
      const { id } = await api.createJob(form, pct => setUploadPct(pct));
      // Optional: link this job to a Publishing Plan so its clips auto-publish
      // when the render finishes. Best-effort — never block navigation on it.
      if (attachPlanId) {
        try {
          await api.attachCampaign(Number(attachPlanId), id);
        } catch (e) {
          console.warn("attach publishing plan failed:", e?.message || e);
        }
      }
      navigate(`/jobs/${id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  // Which template form the chosen platform/output requires. Custom templates only run
  // on the V4 pipeline; V1/V2 use the built-in 9:16 shorts frames. This drives the
  // filtered template step (step 1) — a Short job never even sees full-form templates.
  const templateKind = !isV4(platform) ? "short"
    : v4OutputFormat === "shorts-only" ? "short"
    // trailer-only: the 16:9 trailer engine owns the whole look — no
    // layout template applies, so treat it like a full-form job for the
    // wizard's template step (which it will simply skip choosing).
    : (v4OutputFormat === "full-only" || v4OutputFormat === "trailer-only") ? "full"
    : "both";

  // Drop selections that no longer apply when the output kind changes, so a stale
  // full-form template can never ride along on a shorts-only job (the backend would
  // reject it) and vice-versa. Runs when the chosen platform/output-format changes.
  useEffect(() => {
    if (templateKind === "short") { setFullformLayout(""); setFullChosen(false); }
    else if (templateKind === "full") { setFrame(""); setCustomTpl(null); }
  }, [templateKind]);

  // Audio-first is V4-only. If the operator navigates back and switches to a
  // non-V4 platform, clear the audio-first state so the Confirm screen + submit
  // never describe/attempt an audio-first job on a platform that can't run it.
  useEffect(() => {
    if (!isV4Backed(platform)) { setAudioFirst(false); setAudioFile(null); }
  }, [platform]);

  // canNext indexed by step. V2 has 6 steps (0-5); V1 has 5 (0-4).
  // Step order is now: 0 Platform · 1 Template · 2 Media · 3 Language · (STT) · Confirm.
  const _media = (isV4Backed(platform) && audioFirst)
    ? !!audioFile                                   // audio-first: narration required, video optional
    : (!!file || !!libraryItem || !!pickedLib);
  const _templateOk = (isV4(platform) && v4OutputFormat === "trailer-only")
    ? true                       // trailer: no canvas template — style packs own the look
    : templateKind === "short" ? !!frame
    : templateKind === "full" ? fullChosen
    : (!!frame && fullChosen);   // both: need a short template AND a full-form choice
  const canNext = isV2(platform)
    ? [!!platform, _templateOk, _media, !!language, !!sttProvider, true][step]
    : [!!platform, _templateOk, _media, !!language, true][step];
  const lastStep = isV2(platform) ? 5 : 4;
  const stepLabels = isV2(platform)
    ? STEPS_V2
    : (isLongForm(platform) ? STEPS_LONGFORM : STEPS);

  return (
    <div className="relative z-10 max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <AuroraBackground />
      <div className="mb-7">
        <div className="text-[11px] uppercase tracking-[0.28em] font-semibold text-accent2/90">Create</div>
        <h1 className="mt-1.5 text-3xl sm:text-4xl font-bold text-white tracking-tight">New video</h1>
        <p className="mt-2 text-sm text-gray-400 max-w-lg leading-relaxed">
          A few quick choices and Kaizer builds your full video and short clips.
          Pick what you want, or let AI handle everything.
        </p>
      </div>

      {/* Step indicators — labels swap based on platform.
          V1 4-platform path: STEPS or STEPS_LONGFORM (5 entries).
          V2 path: STEPS_V2 (6 entries — extra "Choose STT" step). */}
      <div className="flex items-center gap-2 mb-8 rounded-2xl border border-white/10 bg-white/[0.04]
                      backdrop-blur-xl px-3 py-2.5 shadow-[0_12px_44px_-14px_rgba(0,0,0,0.75)]">
        {stepLabels.map((label, i) => (
          <React.Fragment key={i}>
            <button
              onClick={() => i < step && !(libraryItem && i === 0) && setStep(i)}
              disabled={i >= step || (libraryItem && i === 0)}
              className={`flex items-center gap-2 text-xs font-medium transition-colors duration-300
                ${i === step ? "text-white" : i < step ? "text-emerald-300 cursor-pointer hover:text-emerald-200" : "text-gray-500"}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                ${i === step ? "bg-gradient-to-br from-accent to-accent2 text-white shadow-lg shadow-accent/40 scale-110"
                  : i < step ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                  : "bg-white/5 text-gray-500 border border-white/10"}`}>
                {i < step ? "\u2713" : i + 1}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < stepLabels.length - 1 && (
              <div className={`flex-1 h-px transition-colors duration-500 ${i < step ? "bg-emerald-400/30" : "bg-white/10"}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Library handoff banner — only present when the user came in
          via the Library "Use" button. Stays visible across all steps so
          they always know which source video the wizard is configuring. */}
      {libraryItem && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-xl border border-accent/40
                        bg-gradient-to-r from-accent/15 via-accent/5 to-transparent">
          {libraryItem.thumb_url ? (
            <img
              src={libraryItem.thumb_url}
              alt=""
              className="w-16 h-10 rounded-md object-cover border border-border flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-10 rounded-md bg-ink-800 border border-border flex-shrink-0
                            flex items-center justify-center">
              <Film size={14} className="text-gray-600"/>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent2">
              From Library
            </div>
            <div className="text-sm font-semibold text-white truncate">{libraryItem.title}</div>
          </div>
          <Link
            to="/library"
            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-md
                       border border-border hover:border-border-hover transition-all"
          >
            Change
          </Link>
        </div>
      )}

      <div className="relative rounded-3xl border border-white/10 bg-white/[0.045] backdrop-blur-2xl
                      shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        {/* Step 2: Add Media (video upload + per-slot media). Hidden while
            the V4 bg sub-phase is showing. */}
        {step === 2 && (!isV4(platform) || v4StepPhase !== "bg") && (
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
            <StepHeading eyebrow="Media" title="Add your video"
              hint="Upload a video (or pick one from your Library). Kaizer transcribes it, finds the best moments, and builds your full video and short clips." />

            {/* V4 audio-first: narration audio is the master track. */}
            {isV4Backed(platform) && (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <Toggle
                  checked={audioFirst}
                  onChange={(v) => { setAudioFirst(v); if (v) { setMediaTab("upload"); setPickedLib(null); } }}
                  label="Audio Story mode"
                  hint="Upload narration audio as the master track — the video below is optional (muted reference b-roll)."
                />
                {audioFirst && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Upload the <b className="text-gray-200">narration audio</b> (the voice explaining the story).
                      We transcribe it, write SEO from it, and show generated/uploaded images.
                      The video below is <b className="text-gray-200">optional</b> and will be
                      <b className="text-gray-200"> muted</b> (reference b-roll) — with no video, the images fill the screen.
                    </p>
                    <label className="border-2 border-dashed border-purple-500/40 rounded-lg p-4
                                      flex flex-col items-center gap-2 cursor-pointer hover:border-purple-400 transition-colors">
                      {/* Broad accept: WhatsApp audio downloads as .mpeg/.opus/.ogg which the
                          OS often maps to video/*, so "audio/*" alone hides them. List the
                          extensions explicitly. The backend runs any file through ffmpeg+Deepgram. */}
                      <input type="file"
                        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.oga,.opus,.mpeg,.mpga,.flac,.wma,.amr,.weba"
                        className="hidden"
                        onChange={e => { const f = e.target.files[0]; if (f) setAudioFile(f); }} />
                      {audioFile ? (
                        <>
                          <Mic size={26} className="text-purple-300" />
                          <span className="text-white font-medium text-center break-all">{audioFile.name}</span>
                          <span className="text-gray-500 text-xs">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span>
                        </>
                      ) : (
                        <>
                          <Mic size={26} className="text-gray-600" />
                          <span className="text-gray-400 text-center text-sm">Click to select the narration audio (MP3, M4A, WAV, MPEG, OGG, OPUS, AAC…)</span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Upload a new video OR pick one from your Library — no page-leave.
                When audio-first is on, this video is the OPTIONAL muted reference b-roll. */}
            {!(isV4Backed(platform) && audioFirst) && (
              <div className="mb-3">
                <Segmented value={mediaTab} onChange={setMediaTab}
                  options={[{ value: "upload", label: "Upload" }, { value: "library", label: "From Library" }]} />
              </div>
            )}
            {mediaTab === "upload" ? (
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
                  onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setPickedLib(null); } }}
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
            ) : (
              <LibraryVideoPicker selectedId={pickedLib?.id}
                onPick={(it) => { setPickedLib(it); setFile(null); }} />
            )}
            {pickedLib && (
              <div className="mt-2 text-sm text-accent2">
                ✓ Using from Library: <span className="font-medium">{pickedLib.title || `Video ${pickedLib.id}`}</span>
              </div>
            )}

            {/* Reference clips (B-roll) — extra videos the AI cuts to full-screen. */}
            {isV4Backed(platform) && !audioFirst && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clapperboard size={15} className="text-accent2" />
                  <div className="text-sm font-semibold text-white">
                    Reference clips <span className="text-[11px] text-gray-400 font-normal">(optional B-roll)</span>
                  </div>
                </div>
                <p className="text-[12px] text-gray-400 leading-relaxed mb-3">
                  Add extra videos the AI can cut to full-screen when their subject comes up — footage of an
                  incident, a person, or a place. Tag each clip with what it shows and the AI plays it at the right moment.
                </p>

                {refClips.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {refClips.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <Video size={15} className="text-accent2 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] text-white truncate">{c.name}</div>
                          <div className="text-[11px] text-gray-400 truncate">Shows: <span className="text-gray-300">{c.tag}</span></div>
                        </div>
                        <button type="button" onClick={() => removeRefClip(c.id)}
                          className="text-[11px] text-gray-500 hover:text-red-300 flex-shrink-0">Remove</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-gray-300 cursor-pointer hover:border-white/25">
                    <Upload size={14} />
                    {refFile ? <span className="truncate max-w-[150px]">{refFile.name}</span> : "Choose clip"}
                    <input type="file" accept="video/*" className="hidden"
                      onChange={(e) => { const f = e.target.files[0]; if (f) setRefFile(f); }} />
                  </label>
                  <input type="text" value={refTag}
                    onChange={(e) => setRefTag(e.target.value.slice(0, 200))}
                    placeholder="What does it show? e.g. flood in Hyderabad"
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white placeholder-gray-600 outline-none focus:border-accent" />
                  <button type="button" onClick={addRefClip} disabled={!refFile || refBusy}
                    className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-accent to-accent2 text-white text-[12px] font-semibold px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                    {refBusy ? <Loader2 size={13} className="animate-spin" /> : null}
                    Add clip
                  </button>
                </div>
              </div>
            )}

            {/* Per-slot Media step for the chosen custom template. Filled
                after the main video is uploaded. */}
            {customTpl && (
              <div className="mt-6 rounded-xl border border-gray-700 p-4">
                <h3 className="text-white font-semibold mb-3">Media for “{customTpl.name}”</h3>
                <TemplateMediaPicker
                  slots={customTpl.slots || []}
                  mainFile={file}
                  onMainFile={setFile}
                  engine={v4ImageProvider}
                  onChange={({ templateMedia, mainSlot, ready }) => {
                    setTemplateMedia(templateMedia);
                    setMainMediaSlot(mainSlot);
                    setMediaReady(ready);
                  }}
                />
                <div className="mt-4 flex justify-end">
                  <button type="button" disabled={!mediaReady}
                    onClick={() => setStep(3)}
                    className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white
                               font-semibold text-sm disabled:opacity-50">
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* V4 only: optional studio background sub-phase. */}
            {isV4(platform) && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setV4StepPhase("bg");
                    api.v4ListBgSamples().then((s) => setV4BgSamples(s || [])).catch(() => {});
                    api.v4ListUserBgVideos().then((u) => setV4UserBgs(u || [])).catch(() => {});
                  }}
                  className="text-[12px] text-accent2 hover:text-white underline"
                >
                  Studio background (optional) →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 0: Platform — choose what you're making FIRST. The output kind
            (short / full / both) this implies then filters the template step. */}
        {step === 0 && (
          <div>
            <StepHeading eyebrow="Format" title="What are you making?"
              hint="Pick the output first. The next step only shows templates that fit — a Short won't show full-video layouts, and vice-versa." />
            <ChoiceGrid min={210}>
              {[...Object.entries(platforms),
                ...(Object.keys(platforms).length ? [TRAILER_TILE, ANCHOR_TILE, PODCAST_TILE] : []),
              ].map(([key, info]) => (
                <ChoiceCard
                  key={key}
                  selected={selectedTileKey === key || platform === key}
                  icon={tileIcon(key)}
                  title={info.label}
                  desc={key === "news_anchor"
                    ? "An AI presenter reads your script on camera — pick an avatar + voice."
                    : key === "podcast_editor"
                    ? "One camera in, virtual multi-cam out — AI cuts filler, punches in, makes promos."
                    : key === "movie_trailer"
                    ? "Turn your video into a dramatic teaser — fast cuts, title cards, sound design."
                    : isV4(key)
                    ? `${info.width}×${info.height} · perfect audio sync · editable timeline`
                    : `${info.width}×${info.height}`}
                  badge={isV2(key) ? <Badge tone="accent">Beta</Badge>
                    : isV4(key) ? <Badge tone="emerald">Recommended</Badge>
                    : key === "movie_trailer" ? <Badge tone="violet">Cinematic</Badge>
                    : key === "news_anchor" ? <Badge tone="violet">AI Presenter</Badge>
                    : key === "podcast_editor" ? <Badge tone="violet">AI Multi-cam</Badge>
                    : null}
                  onClick={() => {
                    if (key === "news_anchor") {
                      // The Anchor Studio is its own page — it renders via
                      // /api/avatar, never through this wizard's create_job.
                      navigate("/anchor");
                      return;
                    }
                    if (key === "podcast_editor") {
                      // The Podcast editor is its own page — it renders via
                      // /api/podcast, never through this wizard's create_job.
                      navigate("/podcast-studio");
                      return;
                    }
                    setSelectedTileKey(key);
                    // Always land on the Media upload view (not a stale bg sub-phase).
                    setV4StepPhase("frame");
                    // Remember the publish target this tile represents (or
                    // youtube for the V4-native / any other tile).
                    setV4TargetPlatform(TILE_TARGET_PLATFORM[key] || "youtube");
                    if (key === "movie_trailer") {
                      // Upload video → trailer. No canvas template to pick —
                      // the trailer engine owns the whole look (style packs).
                      setPlatform("full_video_shorts_v4");
                      setV4OutputFormat("trailer-only");
                      setStep(2);   // straight to Add Media
                      return;
                    }
                    // Legacy single-output tiles (Reel / Short / Full Video /
                    // combined) now run on the V4 canvas pipeline. Remap to a
                    // genuine full_video_shorts_v4 job with the matching
                    // output-format and enter the V4 frame→bg sub-flow, so the
                    // job opens in the canvas editor with per-platform SEO.
                    if (key in LEGACY_TO_V4_PRESET) {
                      setPlatform("full_video_shorts_v4");
                      setV4OutputFormat(LEGACY_TO_V4_PRESET[key]);
                      setStep(1);   // -> filtered template step
                      return;
                    }
                    setPlatform(key);
                    // Platform is step 0 now — advance to the (kind-filtered) template step.
                    setStep(1);
                  }}
                />
              ))}
            </ChoiceGrid>
          </div>
        )}

        {/* Step 1: Choose Template -- FILTERED by the output kind chosen in step 0.
            short -> built-in 9:16 frames + short custom templates.
            full  -> built-in newsroom (default) + full custom templates.
            both  -> two sections, then an explicit Continue. A template is categorised
            by its canvas on the server, so a Short job never sees full-form templates. */}
        {step === 1 && (
          <TemplateStep
            templateKind={templateKind}
            isV4={isV4(platform)}
            frames={frames}
            FrameLayoutMock={FrameLayoutMock}
            frame={frame}
            setFrame={setFrame}
            fullformLayout={fullformLayout}
            setFullformLayout={setFullformLayout}
            fullChosen={fullChosen}
            setFullChosen={setFullChosen}
            customTpl={customTpl}
            setCustomTpl={setCustomTpl}
            setTemplateMedia={setTemplateMedia}
            setMainMediaSlot={setMainMediaSlot}
            setMediaReady={setMediaReady}
            templateOk={_templateOk}
            setStep={setStep}
          />
        )}
        {/* V4 sub-step 2b: Background video. Comes between template
            selection and language. Skippable — proceeding without
            picking anything keeps the legacy flat-color background. */}
        {step === 2 && !isLongForm(platform) && isV4(platform) && v4StepPhase === "bg" && (
          <div>
            <StepHeading eyebrow="Background" title="Studio background"
              hint="How the background behaves behind the anchor. Optional — you can change all of this later in the editor." />

            {/* Three-way mode selector — drives the rest of this step. */}
            <ChoiceGrid min={200} className="mb-5">
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
              ].map((m) => (
                <ChoiceCard
                  key={m.key}
                  selected={v4BgMode === m.key}
                  title={m.title}
                  desc={m.desc}
                  onClick={() => {
                    setV4BgMode(m.key);
                    if (m.key === "none") { setV4BgRef(""); setV4BgIntroSec(0); }
                    if (m.key === "intro_bg" && !v4BgIntroSec) setV4BgIntroSec(8);
                    if (m.key === "bg") setV4BgIntroSec(0);
                  }}
                />
              ))}
            </ChoiceGrid>

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

            {/* WHO DECIDES — the one switch normal users need. AI mode
                hides every technical grid; Manual reveals them all. */}
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-3">
                <h3 className="font-semibold text-white text-sm">How should this video be edited?</h3>
              </div>
              <ChoiceGrid min={240}>
                <ChoiceCard
                  selected={aiAuto}
                  icon={Sparkles}
                  title="AI edits everything"
                  badge={<Badge tone="emerald">Recommended</Badge>}
                  desc="The AI watches and listens to your video, then picks the style, effects, transitions, graphics, captions and sounds that fit each story — like a TV editor. You just upload."
                  onClick={enableAiAuto}
                />
                <ChoiceCard
                  selected={!aiAuto}
                  title="I'll choose myself"
                  desc="Unlock the expert controls: video type, effects level, AI engines and image source."
                  onClick={() => setAiAuto(false)}
                />
              </ChoiceGrid>
              {aiAuto && (
                <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-[11px] leading-relaxed" style={{ color: "#B9D9C7" }}>
                  ✓ AI will detect the video type, apply the matching cinematic look per story, place
                  graphics &amp; captions where they help, and mix the sound like a broadcast — automatically.
                </div>
              )}
            </div>

            {/* AI model — its OWN separate block, shown in BOTH modes (AI-auto
                and expert). Picks which provider/credit the keep-vs-cut step
                spends: Claude = Anthropic credit, Gemini = Google/Vertex. */}
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-3">
                <h3 className="font-semibold text-white text-sm">AI model</h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Which AI does the editing — deciding what to keep vs. cut.
                  <b className="text-gray-300"> Claude</b> uses your Anthropic credit;
                  <b className="text-gray-300"> Gemini</b> uses your Google / Vertex credit. If one
                  account is out of balance, switch to the other so the job doesn&apos;t fail at the first step.
                </p>
              </div>
              <ChoiceGrid min={220}>
                {V4_TRIM_PLANNER_CATALOG.map((p) => (
                  <ChoiceCard
                    key={p.name}
                    selected={v4TrimPlanner === p.name}
                    title={p.label}
                    desc={p.description}
                    onClick={() => setV4TrimPlanner(p.name)}
                  />
                ))}
              </ChoiceGrid>
            </div>

            {/* Content type / edit profile — what kind of video this is
                decides HOW the AI edits (news stories vs podcast
                chapters vs interview Q&A). Auto = classify from the
                transcript; the system asks only when it is unsure. */}
            {!aiAuto && (
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-3">
                <h3 className="font-semibold text-white text-sm">What type of video is this?</h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Drives the editing style — what counts as junk, how the video is chaptered, how tight the cuts are.
                  Leave on <b className="text-gray-300">Auto</b> and the system identifies it from the speech itself.
                </p>
              </div>
              <ChoiceGrid min={150}>
                {V4_CONTENT_TYPE_CATALOG.map((t) => (
                  <ChoiceCard
                    key={t.name}
                    selected={v4ContentType === t.name}
                    title={t.label}
                    desc={t.hint}
                    onClick={() => setV4ContentType(t.name)}
                  />
                ))}
              </ChoiceGrid>
            </div>

            )}

            {/* V4 predefined-description shortcut. When non-empty the
                orchestrator preserves the source video AS-IS (no
                Claude trim) and uses this text as the bulletin SEO
                description. Shorts still get carved from the same
                source. Any language is fine. */}
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-2">
                <h3 className="font-semibold text-white text-sm">
                  Predefined description{" "}
                  <span className="text-[10px] text-gray-500 font-normal">(optional — keeps your video as-is)</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Paste a finished description if your video is already polished and you don't want it re-trimmed.
                  Leave empty and the AI trims your video and writes the title &amp; description automatically. Any language works.
                </p>
              </div>
              <textarea
                rows={5}
                value={v4PredefinedDescription}
                onChange={(e) => setV4PredefinedDescription(e.target.value)}
                placeholder={"Optional. Paste your finished video description here.\nExample: 'తెలంగాణలో నేడు మోదీ ర్యాలీ. ముఖ్యాంశాలు ఇవీ...'"}
                className="w-full bg-black/30 border border-white/10 hover:border-white/20 focus:border-accent rounded-xl px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-y outline-none"
                maxLength={8000}
                style={{ color: "#F4F4F5" }}
              />
              <div className="flex items-center justify-between mt-1">
                <div className="text-[10px]" style={{ color: "#C8C8D0" }}>
                  {v4PredefinedDescription.trim() ? (
                    <>✓ <strong>Source-preserved mode</strong> will engage — your video stays full-length, this text becomes the SEO description.</>
                  ) : (
                    <>Leave empty to let the AI trim your video automatically.</>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 tabular-nums">
                  {v4PredefinedDescription.length}/8000
                </div>
              </div>
            </div>

            {/* V4 output-format picker. Controls WHICH outputs render —
                full video, shorts/reels, or both. "shorts-only" skips the
                full-video render entirely. */}
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-3">
                <h3 className="font-semibold text-white text-sm">What to create</h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Choose whether to render the full long-form video, the vertical
                  shorts/reels, or both. Picking one skips the other&apos;s render.
                </p>
              </div>
              <ChoiceGrid min={200}>
                {V4_OUTPUT_FORMAT_CATALOG.map((p) => (
                  <ChoiceCard
                    key={p.name}
                    selected={v4OutputFormat === p.name}
                    title={p.label}
                    desc={p.description}
                    onClick={() => setV4OutputFormat(p.name)}
                  />
                ))}
              </ChoiceGrid>
            </div>

            {/* Full-form EFFECTS: how much of the editing engine treats the
                long-form video (broadcast polish / cinematic pack / off). */}
            {!aiAuto && v4OutputFormat !== "trailer-only" && (
              <div className="mt-5">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-white">Effects on the full video</h3>
                  <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                    The trailer always gets the full treatment. This controls the LONG-FORM video&apos;s look.
                  </p>
                </div>
                <ChoiceGrid min={200}>
                  {V4_EFFECTS_CATALOG.map((p) => (
                    <ChoiceCard
                      key={p.name}
                      selected={v4EffectsMode === p.name}
                      title={p.label}
                      desc={p.description}
                      onClick={() => setV4EffectsMode(p.name)}
                    />
                  ))}
                </ChoiceGrid>

                {/* DIRECTOR ENGINE: which AI plans the per-story direction.
                    Both are real engines — "Kaizer V4" is our full-arsenal
                    per-story director; "Platform" is the classic 5-mood
                    signal engine (measures audio/pace/cuts/brightness, then
                    an LLM sanity-check). Only "rich" (Cinematic) actually
                    runs a director on the full video, so the picker shows
                    ONLY there — offering it on auto/off would be a silent
                    no-op of an explicit user choice. */}
                {v4EffectsMode === "rich" && (
                  <div className="mt-5">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-white">AI Director engine</h3>
                      <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                        Which director plans each story&apos;s look. Kaizer V4 is the default and most capable.
                      </p>
                    </div>
                    <ChoiceGrid min={200}>
                      <ChoiceCard
                        selected={v4DirectorEngine === "v4"}
                        title="Kaizer V4 — full arsenal"
                        desc="Per-story moods, 76 transitions, 75 effects, timed overlays, layout switching, sound design. Recommended."
                        onClick={() => setV4DirectorEngine("v4")}
                      />
                      <ChoiceCard
                        selected={v4DirectorEngine === "platform"}
                        title="Platform — classic"
                        desc="Simpler 5-mood engine: measures energy, pace, cuts & brightness per story, LLM tone-check, subtler treatment."
                        onClick={() => setV4DirectorEngine("platform")}
                      />
                    </ChoiceGrid>

                    {/* DIRECTOR BRAIN — which AI writes the per-story plan.
                        The pacing/vision/tone sensors stay on Gemini (they
                        listen to the audio and look at frames); Claude and
                        ChatGPT direct text-only from transcript + facts. */}
                    <div className="mt-4 mb-3">
                      <h3 className="text-sm font-semibold text-white">Director brain</h3>
                      <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                        Which AI writes the plan. Gemini also LISTENS to the audio and LOOKS at
                        frames; Claude and ChatGPT direct text-only. Missing key → quietly Gemini.
                      </p>
                    </div>
                    <ChoiceGrid min={180}>
                      <ChoiceCard
                        selected={v4DirectorProvider === "gemini"}
                        title="Gemini"
                        desc="Sees and hears the video via the sensors. Recommended."
                        onClick={() => setV4DirectorProvider("gemini")}
                      />
                      <ChoiceCard
                        selected={v4DirectorProvider === "claude"}
                        title="Claude"
                        desc="Text-only direction. Runs on your Anthropic account."
                        onClick={() => setV4DirectorProvider("claude")}
                      />
                      <ChoiceCard
                        selected={v4DirectorProvider === "openai"}
                        title="ChatGPT"
                        desc="Text-only direction. Runs on your OpenAI account (GPT-4o)."
                        onClick={() => setV4DirectorProvider("openai")}
                      />
                    </ChoiceGrid>
                  </div>
                )}

                {/* THEME: the visual skin of the built-in render. The theme
                    only styles the look (backdrop, frame colour, ticker) —
                    the AI's layout switching + animations run inside it.
                    Hidden when a custom template is picked (it IS the look). */}
                {!fullformLayout && (
                  <div className="mt-5">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-white">Theme</h3>
                      <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                        The look your video wears — layouts and animations run inside it.
                      </p>
                    </div>
                    <ChoiceGrid min={200}>
                      {[["", "Classic", "The standard studio look"],
                        ["obsidian", "Obsidian Editorial", "Dark newspaper-luxury, gold hairlines"],
                        ["ivory", "Ivory Light", "Bright airy premium, coral accents"],
                        ["nightline", "Nightline Horizon", "Dusk glow, prime-time feel"],
                        ["verde", "Studio Verde", "Deep emerald cinema, mint light"]].map(([k, label, desc]) => (
                        <ChoiceCard key={k || "classic"} selected={v4Theme === k}
                          title={label} desc={desc} onClick={() => setV4Theme(k)} />
                      ))}
                    </ChoiceGrid>
                  </div>
                )}

                {/* Direct the AI: optionally pin exact packs / transitions /
                    effects / overlays / captions. Empty = the AI Director
                    decides. Only shown when effects aren't turned off. */}
                {v4EffectsMode !== "off" && (
                  <StyleDirector value={v4StyleDirectives} onChange={setV4StyleDirectives} />
                )}
              </div>
            )}

            {/* Edit-first (defer render): the pipeline produces the scene fast and skips the
                up-front MP4 render; refine it in the editor, then Export. */}
            <div className="mt-5">
              <Toggle
                checked={v4DeferRender}
                onChange={setV4DeferRender}
                label="Edit first"
                hint="Finish fast with just the cut & scene (no video file yet). Refine everything in the editor, then export when it's perfect."
              />
            </div>

            {/* Shorts count cap + opt-in for more. Only shown when shorts
                will be produced (full-only skips shorts entirely). */}
            {v4OutputFormat !== "full-only" && (
              <div className="mt-6 pt-5 border-t border-gray-800">
                <div className="mb-3">
                  <h3 className="font-semibold text-white text-sm">How many shorts?</h3>
                  <p className="text-[11px] text-gray-500 mt-1">
                    By default we make up to <strong className="text-gray-300">8 shorts</strong> per video.
                    Turn this on to allow more.
                  </p>
                </div>
                <div className="mb-2">
                  <Toggle
                    checked={v4MoreShorts}
                    onChange={(v) => { setV4MoreShorts(v); if (!v) setV4MaxShorts(8); }}
                    label="Allow more than 8 shorts"
                  />
                </div>
                {v4MoreShorts && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] text-gray-400">Max shorts</span>
                    <input
                      type="number" min={1} max={50} value={v4MaxShorts}
                      onChange={(e) => setV4MaxShorts(Math.max(1, Math.min(50, Number(e.target.value) || 8)))}
                      className="w-20 bg-black border border-border rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                )}
                <p className="text-[11px] text-amber-400/90 mt-2 leading-snug">
                  ⚠ This is a ceiling, not a promise. We can only cut as many shorts as the video has
                  distinct segments for — a short video will produce fewer (sometimes just 1). Long videos
                  with many topics benefit most.
                </p>
              </div>
            )}

            {/* V4 image-provider picker. Controls how every story's
                sidebar image AND the final thumbnail get generated.
                Default "auto" keeps today's V1 multi-source chain. */}
            {!aiAuto && (
            <div className="mt-6 pt-5 border-t border-gray-800">
              <div className="mb-3">
                <h3 className="font-semibold text-white text-sm">AI engine for images</h3>
                <p className="text-[11px] text-gray-500 mt-1">
                  Used for the per-story sidebar image carousel AND the YouTube thumbnail. If you upload bulletin
                  images yourself, those always win and no AI generation runs.
                </p>
              </div>
              <ChoiceGrid min={200}>
                {V4_IMAGE_PROVIDER_CATALOG.map((p) => (
                  <ChoiceCard
                    key={p.name}
                    selected={v4ImageProvider === p.name}
                    title={p.label}
                    desc={p.description}
                    onClick={() => setV4ImageProvider(p.name)}
                  />
                ))}
              </ChoiceGrid>
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

        {/* Step 3: Language */}
        {step === 3 && (
          <div>
            <StepHeading eyebrow="Language" title="What language is the video in?" icon={Languages}
              hint="This sets the transcription, the titles, and the on-screen fonts — so everything reads naturally." />
            <ChoiceGrid min={150}>
              {languages.length === 0 && (
                <span className="text-gray-500 text-sm">Loading languages…</span>
              )}
              {languages.map((l) => (
                <ChoiceCard
                  key={l.code}
                  selected={language === l.code}
                  title={l.native}
                  desc={`${l.english} · ${l.script}`}
                  onClick={() => { setLanguage(l.code); setStep(4); }}
                />
              ))}
            </ChoiceGrid>
          </div>
        )}

        {/* Step 4 (V2 only): Choose STT provider.
            V1 platforms skip this step entirely -- on V1 step===4 is
            the Confirm screen below. */}
        {step === 4 && isV2(platform) && (
          <div>
            <StepHeading eyebrow="Transcription" title="How should we read the speech?" icon={Mic}
              hint="This turns the spoken audio into text so the AI can edit it. The recommended option gives the best results for Indian languages. Greyed-out options aren't available on your account yet." />
            <ChoiceGrid min={220}>
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
                  <ChoiceCard
                    key={p.id}
                    selected={selected}
                    disabled={disabled}
                    title={p.display_name}
                    desc={p.description}
                    badge={isRecommended
                      ? <Badge tone="emerald">Recommended for Telugu / Hindi</Badge>
                      : <Badge tone="slate">{p.tier}</Badge>}
                    onClick={() => { if (!disabled) { setSttProvider(p.id); setStep(5); } }}
                  >
                    <div className="mt-2 text-[11px] text-gray-400">
                      {p.cost_per_min_usd === 0
                        ? "Free"
                        : (p.cost_per_min_usd < 0.01 ? "Low cost" : `~$${(p.cost_per_min_usd).toFixed(2)}/min`)}
                      {!p.configured && <span className="ml-2 text-yellow-400/80">Not available on your account</span>}
                    </div>
                    {showWarnings && (
                      <div className="text-[10px] text-amber-400/90 mt-1.5 leading-snug border-t border-amber-900/40 pt-1.5">
                        {p.warnings.map((w, idx) => (
                          <div key={idx}>⚠ {w}</div>
                        ))}
                      </div>
                    )}
                  </ChoiceCard>
                );
              })}
            </ChoiceGrid>
          </div>
        )}

        {/* Confirm step — index depends on platform.
            V1 platforms: step === 4 (5-step wizard).
            V2 platform:  step === 5 (6-step wizard, STT is step 4). */}
        {((step === 4 && !isV2(platform)) || (step === 5 && isV2(platform))) && (
          <div>
            <StepHeading eyebrow="Review" title="Review & create"
              hint="Everything look good? Name it if you like, choose where to publish, and start." />
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 flex flex-col gap-3 mb-4 text-sm">
              <ConfirmRow label={audioFirst ? "Narration audio" : "Video"}
                value={audioFirst ? (audioFile?.name || "—") : file?.name} />
              {audioFirst && (
                <ConfirmRow label="Reference video"
                  value={file ? `${file.name} (muted)` : "none — fullscreen images"} />
              )}
              <ConfirmRow label="Platform" value={platforms[platform]?.label} />
              {isLongForm(platform) ? (
                <ConfirmRow label="Mode"  value="Full-length video (news studio layout)" />
              ) : (
                <>
                  <ConfirmRow label="Making" value={
                    templateKind === "both" ? "Full video + Shorts"
                      : templateKind === "full" ? "Full video only" : "Shorts only"} />
                  {(templateKind === "short" || templateKind === "both") && (
                    <ConfirmRow label="Short template" value={
                      String(frame).startsWith("custom:") ? (customTpl?.name || "Custom template")
                        : (frame ? frame.replace("_", " ") : "")} />
                  )}
                  {(templateKind === "full" || templateKind === "both") && (
                    <ConfirmRow label="Full-form" value={
                      fullformLayout ? "Custom full-form template" : "Built-in newsroom (default)"} />
                  )}
                </>
              )}
              <ConfirmRow label="Language" value={(() => {
                const l = languages.find((x) => x.code === language);
                return l ? `${l.native} (${l.english})` : language;
              })()} />
              {isV2(platform) && (
                <ConfirmRow
                  label="Transcription"
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
                  label="AI editor"
                  value={STAGE_2_PROVIDER_CATALOG.find((p) => p.name === stage2Provider)?.label || stage2Provider}
                />
              )}
            </div>

            {/* Item 104: V2 bulletin transition selection. Only shown
                for V2 -- the V1 stitcher does not support transitions. */}
            {isV2(platform) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
                <label htmlFor="transition-style"
                       className="text-sm font-medium text-gray-200 block mb-1.5">
                  Full Video transition
                </label>
                <select
                  id="transition-style"
                  value={transitionStyle}
                  onChange={(e) => setTransitionStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded
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
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
                <label htmlFor="stage-2-provider"
                       className="text-sm font-medium text-gray-200 block mb-1.5">
                  AI editor <span className="text-[11px] text-gray-500 font-normal">(which AI chooses the cuts)</span>
                </label>
                <select
                  id="stage-2-provider"
                  value={stage2Provider}
                  onChange={(e) => setStage2Provider(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded
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
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
              <label htmlFor="job-name" className="text-sm font-medium text-gray-200 block mb-1.5">
                Name this job <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
              </label>
              <input
                id="job-name"
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value.slice(0, 120))}
                maxLength={120}
                placeholder={file?.name ? file.name.slice(0, 80) : "My news video"}
                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded
                           text-sm text-white placeholder-gray-600
                           focus:outline-none focus:border-accent2"
              />
              <div className="text-[11px] text-gray-500 mt-1.5">
                Shown on the jobs list + job detail page. Leave blank to use the filename.
                Editable later.
              </div>
            </div>

            {/* Choose channels — record the intended publish targets at
                generate time. Per-channel SEO/branding/intro happen at publish
                for whichever channels are picked; this just records them on the
                Job so the editor + Publish flow default to them. Lives on the
                Confirm step (no wizard step changes). */}
            {isV4(platform) && pubChannels.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-200">
                    Choose channels{" "}
                    <span className="text-[11px] text-gray-500 font-normal">(optional — which channels this video is for)</span>
                  </label>
                  <div className="flex gap-2 text-[11px]">
                    <button type="button" className="text-accent2 hover:underline"
                      onClick={() => setSelectedChannelIds(pubChannels.map((c) => c.id))}>Select all</button>
                    <button type="button" className="text-gray-400 hover:underline"
                      onClick={() => setSelectedChannelIds([])}>Clear</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {pubChannels.map((c) => {
                    const on = selectedChannelIds.includes(c.id);
                    const ci = channelIntros[c.id] || { mode: "own", assetId: 0 };
                    return (
                      <div key={c.id}
                        className={`rounded border text-xs transition ${on
                          ? "border-accent2 bg-accent2/10"
                          : "border-border bg-black/30 hover:border-border-hover"}`}>
                        <button type="button"
                          onClick={() => setSelectedChannelIds((prev) =>
                            prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                          className={`w-full text-left px-2.5 py-2 ${on ? "text-white" : "text-gray-300"}`}>
                          <span className="block truncate">{c.youtube_channel_title || c.name}</span>
                          {on && <span className="text-[10px] text-accent2">✓ selected</span>}
                        </button>
                        {on && (
                          <div className="px-2.5 pb-2 pt-1 border-t border-accent2/20" onClick={(e) => e.stopPropagation()}>
                            <div className="text-[10px] text-gray-500 mb-1">Intro for this channel:</div>
                            <div className="flex items-center gap-1">
                              <select
                                className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-[10px] text-gray-200"
                                value={ci.assetId > 0 && ci.demoFile ? `demo:${ci.demoFile}` : (ci.assetId > 0 ? "uploaded" : "own")}
                                onFocus={ensureIntroSamples}
                                onChange={async (e) => {
                                  const v = e.target.value;
                                  if (v === "own") { setChannelIntro(c.id, { mode: "own", assetId: 0, demoFile: "" }); return; }
                                  if (v === "uploaded") return; // display-only sentinel for an already-uploaded intro
                                  if (v.startsWith("demo:")) {
                                    const fn = v.slice(5);
                                    setChannelIntro(c.id, { mode: "demo", demoFile: fn, busy: true });
                                    try {
                                      const a = await api.importSampleAsset(fn);
                                      setChannelIntro(c.id, { mode: "demo", demoFile: fn, assetId: a.id, busy: false });
                                    } catch (err) {
                                      setIntroErr(err.message || "import failed");
                                      setChannelIntro(c.id, { busy: false });
                                    }
                                  }
                                }}>
                                <option value="own">Its own intro</option>
                                {ci.assetId > 0 && !ci.demoFile && <option value="uploaded">Uploaded intro ✓</option>}
                                {introSamples.length > 0 && (
                                  <optgroup label="Platform demos">
                                    {introSamples.map((s) => (
                                      <option key={s.filename} value={`demo:${s.filename}`}>{(s.filename || "").slice(0, 22)}</option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                              <label className="text-[12px] text-accent2 cursor-pointer flex-shrink-0" title="Upload an intro for this channel">
                                {ci.busy ? "…" : "⬆"}
                                <input type="file" accept="video/*" className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0]; if (!f) return;
                                    setChannelIntro(c.id, { mode: "upload", busy: true, demoFile: "" });
                                    try {
                                      const a = await api.uploadIntroVideo(f);
                                      setChannelIntro(c.id, { mode: "upload", assetId: a.id, busy: false, demoFile: "" });
                                    } catch (err) {
                                      setIntroErr(err.message || "upload failed");
                                      setChannelIntro(c.id, { busy: false });
                                    }
                                  }} />
                              </label>
                            </div>
                            <div className={`text-[9px] mt-0.5 ${ci.assetId > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                              {ci.busy ? "saving…" : ci.assetId > 0 ? "✓ custom intro for this channel" : "uses this channel's own intro"}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {introErr && <div className="text-[11px] text-red-300 mt-1.5">{introErr}</div>}
                <div className="text-[11px] text-gray-500 mt-1.5">
                  Pick each channel's intro: its own (default), a platform demo, or
                  upload one (saved to Assets). Uploads/demos apply to that channel
                  for this job. You can still change targets when you publish.
                </div>
              </div>
            )}

            {/* (Per-channel intro pickers live INLINE on each channel card
                above — each selected channel sets its own intro.) */}

            {/* Optional: auto-publish via a Publishing Plan when the job
                finishes (Campaigns → live V2 publish pipeline). Only shown
                when the user has at least one plan. */}
            {plans.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
                <label htmlFor="attach-plan" className="text-sm font-medium text-gray-200 block mb-1.5">
                  Auto-publish with a Publishing Plan{" "}
                  <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
                </label>
                <select
                  id="attach-plan"
                  value={attachPlanId}
                  onChange={(e) => setAttachPlanId(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded
                             text-sm text-white focus:outline-none focus:border-accent2"
                >
                  <option value="">Don't auto-publish</option>
                  {plans.map((p) => {
                    const n = p.channel_ids?.length || 0;
                    return (
                      <option key={p.id} value={p.id} disabled={!p.active}>
                        {p.name} · {n} channel{n === 1 ? "" : "s"} · every {p.spacing_minutes}m
                        {p.active ? "" : " (paused)"}
                      </option>
                    );
                  })}
                </select>
                <div className="text-[11px] text-gray-500 mt-1.5">
                  When the render finishes, this job's clips fan out to the plan's
                  channels on its schedule. Manage plans under{" "}
                  <Link to="/campaigns" className="text-accent2 hover:underline">Publishing Plans</Link>.
                </div>
              </div>
            )}

            {/* Default image toggle */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
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
                      Every clip will use your default image instead of a generated or stock photo. Saves image-generation cost and keeps your branding consistent.
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
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 mb-4">
                <div className="text-sm font-medium text-gray-200 mb-1">
                  Your own images &amp; reference clips <span className="text-[11px] text-gray-500 font-normal">(optional)</span>
                </div>
                <div className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  Pick your own photos to use instead of AI-generated ones. You can also add short
                  <b className="text-gray-300"> reference video clips</b> (B-roll) here — tag each one with its
                  subject in the asset&apos;s description, and the AI will cut to it full-screen when that
                  subject is mentioned. Leave empty to let the AI choose everything.
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
                      generating new images again (saves time and cost)?
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
                    ✓ Reusing {cachedAssets.length} image{cachedAssets.length === 1 ? "" : "s"} from a previous job — no new images generated.
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

                {/* Inline uploader — drops new images straight into the
                    user's UserAssets so they show up in the grid below
                    without leaving the wizard. Multiple files accepted;
                    each one is uploaded sequentially with a tiny spinner. */}
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <input
                    ref={bulletinUploadRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      setBulletinUploading(true);
                      try {
                        for (const f of files) {
                          const fd = new FormData();
                          fd.append("file", f);
                          fd.append("kind", "image");
                          try {
                            const res = await api.uploadAsset(fd);
                            const newId = res?.id || res?.asset_id;
                            if (newId) {
                              setUserAssets((prev) => [res, ...prev]);
                              setBulletinImageIds((prev) =>
                                prev.includes(newId) ? prev : [...prev, newId],
                              );
                            }
                          } catch (err) {
                            console.warn("asset upload failed:", err);
                          }
                        }
                      } finally {
                        setBulletinUploading(false);
                        if (e.target) e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => bulletinUploadRef.current?.click()}
                    disabled={bulletinUploading}
                    className="text-[11px] bg-accent2 hover:bg-accent disabled:opacity-40 text-white px-3 py-1.5 rounded inline-flex items-center gap-1.5"
                  >
                    {bulletinUploading
                      ? <><Loader2 size={11} className="animate-spin" /> Uploading…</>
                      : <>+ Upload from system</>}
                  </button>
                  <span className="text-[10px] text-gray-500">
                    Or pick from your existing assets below. Selected images become the carousel — no AI generation runs when at least one is selected.
                  </span>
                </div>

                {userAssets.length === 0 ? (
                  <div className="text-[11px] text-gray-500">
                    No image assets yet — upload some via the button above, or visit the{" "}
                    <Link to="/assets" className="text-accent2 hover:text-white underline">
                      Assets
                    </Link>{" "}
                    page.
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
                  <span>{uploadPct < 100 ? "Uploading video\u2026" : "Preparing your video\u2026"}</span>
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
              disabled={submitting
                || (isV4Backed(platform) && audioFirst && !audioFile)
                /* non-audio path always needs a source: an uploaded file OR a
                   Library pick. Without this gate the button submitted with no
                   file → form "video"="null" → 422. */
                || (!(isV4Backed(platform) && audioFirst) && !file && !(pickedLib || libraryItem))}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {uploadPct < 100 ? `Uploading ${uploadPct}%` : "Preparing your video\u2026"}</>
                : "Create video"}
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
