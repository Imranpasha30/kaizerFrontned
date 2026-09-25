import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound, Loader2, Save, AlertCircle, CheckCircle2, Info, Scissors,
  Sparkles, MessageSquare,
} from "lucide-react";
import { api, isDesktop } from "../api/client";
import { PasswordInput } from "../components/ui";

/**
 * Desktop Settings → AI Providers.
 *
 * Desktop-only panel (route /desktop-settings). The desktop backend keeps the
 * user's own AI keys on THEIR machine — this page never sees the full secret:
 * GET /api/desktop-local/keys returns masked previews, POST saves new keys.
 * GET /api/desktop-local/preflight reports per-feature readiness in plain
 * language so non-technical users know exactly what works and what's missing.
 */

const PROVIDERS = [
  {
    key: "gemini",
    label: "Google Gemini API key",
    hint: "Powers story analysis, the AI Director, and title/description writing. Get a free key at aistudio.google.com.",
  },
  {
    key: "openai",
    label: "OpenAI API key",
    hint: "Used for AI image generation. Get a key at platform.openai.com.",
  },
  {
    key: "anthropic",
    label: "Anthropic (Claude) API key",
    hint: "Optional second AI for trim planning and writing. Get a key at console.anthropic.com.",
  },
  {
    key: "deepgram",
    label: "Deepgram API key",
    hint: "Turns speech into text (transcription and captions). Get a key at deepgram.com.",
  },
  {
    key: "youtube",
    label: "YouTube Data API key",
    hint: "Powers competitor SEO learning and Trend Finder from public YouTube data — no channel connection needed. Free key at console.cloud.google.com (enable the YouTube Data API v3).",
  },
];

// UI field key → the backend env-var name. This is the keys contract:
// GET /desktop-local/keys returns {keys:[{name,label,set,masked},…]} keyed by
// these env names, and POST takes ONE {name, value} per call.
const ENV_NAMES = {
  gemini:    "GEMINI_API_KEY",
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepgram:  "DEEPGRAM_API_KEY",
  youtube:   "YOUTUBE_DATA_API_KEY",
};

// The trim-planner choice persists through the same endpoint (not a secret —
// the backend whitelists it and returns it unmasked in GET).
const PLANNER_ENV_NAME = "KAIZER_V4_TRIM_PLANNER";

// Friendly names for the preflight feature keys (routers/desktop_local.py).
const FEATURE_LABELS = {
  render: "Video rendering",
  seo: "Titles & descriptions",
  image_generation: "AI images",
  transcription: "Transcription",
  trim_planner: "Trim planner",
};

// Bound exactly to the backend's preflight shape (routers/desktop_local.py):
//   { features: { render: {ready, reason}, seo: {…}, image_generation: {…},
//                 transcription: {…}, trim_planner: {…} }, ready: bool }
// The plain-language explanation lives in `reason` (empty when all good).
function normalizePreflight(data) {
  const src = data && typeof data === "object" ? data.features : null;
  if (!src || typeof src !== "object" || Array.isArray(src)) return [];
  return Object.entries(src)
    .filter(([, v]) => v && typeof v === "object" && "ready" in v)
    .map(([k, v]) => ({
      key: k,
      label: FEATURE_LABELS[k] || k,
      ready: !!v.ready,
      message: v.reason || "",
    }));
}

// Turn any API error into a sentence a non-technical user can act on.
// FastAPI validation failures (422) arrive as a raw JSON array of technical
// objects — client.js stringifies that into e.message, and it must NEVER
// reach the screen.
function friendlyError(e, fallback) {
  if (e && (e.status === 422 || Array.isArray(e.detail))) {
    return "that key doesn't look right — please paste it exactly as your provider shows it.";
  }
  const msg = e && typeof e.message === "string" ? e.message.trim() : "";
  // Anything that still looks like raw JSON is developer noise, not help.
  if (!msg || msg.startsWith("[") || msg.startsWith("{")) return fallback;
  return msg;
}

export default function DesktopSettings() {
  const nav = useNavigate();
  const desktop = isDesktop();

  // Masked previews of already-saved keys, e.g. { gemini: "AIza…9f2c" }.
  const [saved, setSaved]   = useState({});
  // What the user is typing right now (empty = keep the saved key).
  const [drafts, setDrafts] = useState({});
  const [planner, setPlanner] = useState("gemini");
  // What the backend last confirmed — so save() only POSTs a real change.
  const [savedPlanner, setSavedPlanner] = useState("gemini");
  const [features, setFeatures] = useState([]);
  const [preflightErr, setPreflightErr] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");

  // This page only exists inside the desktop app.
  useEffect(() => {
    if (!desktop) nav("/", { replace: true });
  }, [desktop, nav]);

  async function loadAll() {
    try {
      const data = await api.desktopGetKeys();
      // Contract: { keys: [{ name:"GEMINI_API_KEY", label, set, masked }, …] }.
      // Index the array by env name, then map back onto our UI field keys.
      const rows = {};
      for (const row of (data && Array.isArray(data.keys) ? data.keys : [])) {
        if (row && row.name) rows[row.name] = row;
      }
      const masked = {};
      for (const p of PROVIDERS) {
        const row = rows[ENV_NAMES[p.key]];
        if (row && row.set && row.masked) masked[p.key] = row.masked;
      }
      setSaved(masked);
      // Trim planner is not a secret — the backend returns it unmasked.
      // (endsWith("aude") also tolerates a defensively-masked "****aude".)
      const tpRow = rows[PLANNER_ENV_NAME];
      const tpRaw = String((tpRow && (tpRow.value != null ? tpRow.value : tpRow.masked)) || "").toLowerCase();
      const tp = tpRaw.endsWith("aude") ? "claude" : "gemini";
      setPlanner(tp);
      setSavedPlanner(tp);
    } catch (e) {
      setError(friendlyError(e, "Could not load your saved keys. Please reopen this page to try again."));
    }
    try {
      const pf = await api.desktopPreflight();
      setFeatures(normalizePreflight(pf));
      setPreflightErr(false);
    } catch {
      setPreflightErr(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (desktop) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  const setDraft = (k, v) => setDrafts((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setError(""); setNotice(""); setSaving(true);
    // The backend accepts ONE {name, value} per POST — send each changed
    // field on its own, keep going if one fails, and report per key.
    const failed = [];
    let savedCount = 0;
    for (const p of PROVIDERS) {
      const v = (drafts[p.key] || "").trim();
      if (!v) continue; // empty box = keep the already-saved key
      try {
        await api.desktopSaveKeys({ name: ENV_NAMES[p.key], value: v });
        savedCount += 1;
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[p.key];
          return next;
        });
      } catch (e) {
        failed.push(`${p.label}: ${friendlyError(e, "could not be saved. Please try again.")}`);
      }
    }
    if (planner !== savedPlanner) {
      try {
        await api.desktopSaveKeys({ name: PLANNER_ENV_NAME, value: planner });
        savedCount += 1;
        setSavedPlanner(planner);
      } catch (e) {
        failed.push(`Trim planner: ${friendlyError(e, "could not be saved. Please try again.")}`);
      }
    }
    if (failed.length) {
      setError(failed.join(" "));
    } else if (savedCount) {
      setNotice("Saved. Your keys stay on this computer — they are never sent to Kaizer X servers.");
    } else {
      setNotice("Nothing new to save — paste a key (or change the trim planner) first.");
    }
    // Refresh masked previews + readiness with whatever did save.
    if (savedCount) await loadAll();
    setSaving(false);
  }

  if (!desktop) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
          <KeyRound size={22} className="text-accent2" /> AI Providers
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Kaizer X Desktop runs the AI features on your own accounts. Paste a key
          for each service you want to use — the keys are stored only on this
          computer.
        </p>
      </header>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded flex items-center gap-2">
          <CheckCircle2 size={14} /> {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-6">
          <Loader2 size={14} className="animate-spin" /> Loading your settings…
        </div>
      ) : (
        <>
          {/* Per-feature readiness — plain language, no jargon. */}
          <div className="mb-5 space-y-2">
            {features.map((f) => (
              <div
                key={f.key || f.label}
                className={`p-2.5 rounded border text-sm flex items-start gap-2 ${
                  f.ready
                    ? "bg-green-500/10 border-green-500/30 text-green-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}
              >
                {f.ready
                  ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                <span>
                  <strong className="font-semibold">{f.label}:</strong>{" "}
                  {f.ready
                    ? (f.message || "ready")
                    : (f.message || "needs a key below to work.")}
                </span>
              </div>
            ))}
            {preflightErr && (
              <div className="p-2.5 rounded border border-border bg-panel text-sm text-gray-400 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
                <span>
                  We couldn't check which features are ready right now. Save
                  your keys below, then reopen this page to see the checks.
                </span>
              </div>
            )}
          </div>

          {/* Key fields */}
          <div className="bg-surface border border-border rounded p-4 space-y-4 mb-5">
            <h2 className="text-sm font-semibold text-gray-200">Your API keys</h2>
            {PROVIDERS.map((p) => (
              <PasswordInput
                key={p.key}
                label={p.label}
                value={drafts[p.key] || ""}
                onChange={(e) => setDraft(p.key, e.target.value)}
                placeholder={
                  saved[p.key]
                    ? `Saved (${saved[p.key]}) — paste a new key to replace it`
                    : "Paste your key here"
                }
                hint={p.hint}
                autoComplete="off"
              />
            ))}
          </div>

          {/* Trim-planner picker */}
          <div className="bg-surface border border-border rounded p-4 mb-5">
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 mb-1">
              <Scissors size={14} className="text-accent2" /> Which AI plans your trims?
            </h2>
            <p className="text-[12px] text-gray-500 mb-3">
              The trim planner decides which parts of your source video to keep.
              Gemini is recommended — it has a generous free tier.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {[
                { value: "gemini", title: "Google Gemini", note: "Recommended" },
                { value: "claude", title: "Anthropic Claude", note: "Needs an Anthropic key" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanner(opt.value)}
                  className={`flex-1 text-left px-3 py-2.5 rounded border transition-colors ${
                    planner === opt.value
                      ? "border-accent2 bg-accent/10 text-gray-100"
                      : "border-border bg-black/30 text-gray-400 hover:border-border-hover"
                  }`}
                >
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    {planner === opt.value && <Sparkles size={12} className="text-accent2" />}
                    {opt.title}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">{opt.note}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sign in with ChatGPT — honestly disabled until OpenAI approves. */}
          <div className="bg-surface border border-border rounded p-4 mb-5">
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2 mb-1">
              <MessageSquare size={14} className="text-accent2" /> Sign in with ChatGPT
            </h2>
            <p className="text-[12px] text-gray-500 mb-3">
              Waiting on OpenAI third-party approval — use an API key meanwhile.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Waiting on OpenAI third-party approval — use an API key meanwhile."
              className="btn btn-secondary text-xs opacity-50 cursor-not-allowed"
            >
              Sign in with ChatGPT (coming soon)
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving…" : "Save keys"}
            </button>
            <span className="text-[11px] text-gray-600">
              Stored only on this computer. Never sent to Kaizer X servers.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
