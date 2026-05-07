import React, { useState, useEffect } from "react";
import { Save, Loader2, Tag, Hash, Star, Search, AlertCircle, Youtube, CheckCircle2 } from "lucide-react";
import TagInput from "./TagInput";
import LogoPicker from "./LogoPicker";
import { api } from "../api/client";

const DESC_STYLES = [
  { value: "hook_first",     label: "Hook First — open with the viral sentence" },
  { value: "news_anchor",    label: "News Anchor — formal reporter tone" },
  { value: "shocking_hook",  label: "Shocking Hook — max emotion / curiosity gap" },
  { value: "analytical",     label: "Analytical — context + explanation" },
];

const LANGUAGES = [
  { value: "te", label: "Telugu" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];

/** Controlled form — works for both create (initial={}) and edit (initial=channel). */
export default function ChannelForm({ initial = null, onSubmit, onCancel }) {
  const [name,             setName]              = useState("");
  const [handle,           setHandle]            = useState("");
  const [language,         setLanguage]          = useState("te");
  const [titleFormula,     setTitleFormula]      = useState("");
  const [descStyle,        setDescStyle]         = useState("hook_first");
  const [footer,           setFooter]            = useState("");
  const [fixedTags,        setFixedTags]         = useState([]);
  const [hashtags,         setHashtags]          = useState([]);
  const [mandatoryHashtags,setMandatoryHashtags] = useState([]);
  const [isPriority,       setIsPriority]        = useState(false);
  // Channel-level logo — FK to a UserAsset.  Null = no logo on renders.
  const [logoAssetId,      setLogoAssetId]       = useState(null);
  const [logoPreview,      setLogoPreview]       = useState(null);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // Initialize from `initial` on mount / when it changes
  useEffect(() => {
    if (!initial) return;
    setName(initial.name || "");
    setHandle(initial.handle || "");
    setLanguage(initial.language || "te");
    setTitleFormula(initial.title_formula || "");
    setDescStyle(initial.desc_style || "hook_first");
    setFooter(initial.footer || "");
    setFixedTags(initial.fixed_tags || []);
    setHashtags(initial.hashtags || []);
    setMandatoryHashtags(initial.mandatory_hashtags || []);
    setIsPriority(!!initial.is_priority);
    setLogoAssetId(initial.logo_asset_id ?? null);
    setLogoPreview(
      initial.logo?.url
        ? { url: initial.logo.url, filename: initial.logo.filename }
        : null,
    );
  }, [initial?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Profile name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: name.trim(),
        handle: handle.trim(),
        language,
        title_formula: titleFormula,
        desc_style: descStyle,
        footer,
        fixed_tags: fixedTags,
        hashtags,
        mandatory_hashtags: mandatoryHashtags,
        is_priority: isPriority,
        logo_asset_id: logoAssetId,
      });
    } catch (err) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}

      <YouTubeChannelLookup
        onApply={(found) => {
          // Best-effort auto-fill: name / handle / language. We don't
          // overwrite custom user fields (titleFormula, footer, hashtags
          // — those are voice/style choices the user defines).
          if (found.name) setName(found.name);
          if (found.handle) setHandle(found.handle);
          if (found.language) setLanguage(found.language);
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-gray-400 text-xs uppercase tracking-wide">Profile name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kaizer News Telugu"
            maxLength={255}
            required
            className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-gray-400 text-xs uppercase tracking-wide">YouTube Handle</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@KaizerNewsTelugu"
            maxLength={100}
            className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-gray-400 text-xs uppercase tracking-wide">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none"
          >
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-gray-400 text-xs uppercase tracking-wide">Description Style</span>
          <select
            value={descStyle}
            onChange={(e) => setDescStyle(e.target.value)}
            className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none"
          >
            {DESC_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-gray-400 text-xs uppercase tracking-wide">Title Formula</span>
        <input
          type="text"
          value={titleFormula}
          onChange={(e) => setTitleFormula(e.target.value)}
          placeholder="English Hook (తెలుగు అనువాదం) | Channel Name"
          className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-gray-500 mt-1 block">
          Guides the AI — describe the title shape (bilingual, CTA, suffix). The system enforces the 100-char cap with "| {"{channel name}"}" suffix.
        </span>
      </label>

      <label className="block">
        <span className="text-gray-400 text-xs uppercase tracking-wide">Footer (appended to every description)</span>
        <textarea
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          rows={3}
          placeholder={"📺 Subscribe for latest news.\n#YourChannel #TeluguNews"}
          className="mt-1 w-full bg-black/40 border border-border rounded px-2.5 py-1.5 text-gray-100 focus:border-accent focus:outline-none font-mono text-xs"
        />
      </label>

      <div>
        <span className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1">
          <Tag size={12} /> Fixed Tags
        </span>
        <span className="text-xs text-gray-500 block mb-1">
          Always included in the 30-tag output. The AI fills the rest.
        </span>
        <TagInput value={fixedTags} onChange={setFixedTags} placeholder="telugu news, kaizer news" />
      </div>

      <div>
        <span className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1">
          <Hash size={12} /> Hashtags
        </span>
        <span className="text-xs text-gray-500 block mb-1">
          Default hashtag pool for this channel (will be normalized to CamelCase).
        </span>
        <TagInput value={hashtags} onChange={setHashtags} placeholder="#TeluguNews" hashtagMode />
      </div>

      <div>
        <span className="text-gray-400 text-xs uppercase tracking-wide flex items-center gap-1">
          <Hash size={12} /> Mandatory Hashtags
        </span>
        <span className="text-xs text-gray-500 block mb-1">
          Always prepended to every video (branding — usually the channel's own tag).
        </span>
        <TagInput value={mandatoryHashtags} onChange={setMandatoryHashtags} placeholder="#KaizerNews" hashtagMode />
      </div>

      {/* Logo moved to the YouTube Account cards at the top of the page —
          style templates (this form) don't have logos, only real YT
          accounts do.  See the "Your YouTube Accounts" section. */}

      <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
        <input
          type="checkbox"
          checked={isPriority}
          onChange={(e) => setIsPriority(e.target.checked)}
          className="accent-accent"
        />
        <Star size={14} className={isPriority ? "text-accent2" : "text-gray-500"} />
        <span className="text-gray-300">Priority profile</span>
        <span className="text-xs text-gray-500">— used as a reference for competitor analysis</span>
      </label>

      <div className="flex justify-end gap-2 pt-3 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-4 py-1.5 text-sm bg-accent hover:bg-accent2 text-white rounded flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {initial?.id ? "Save Changes" : "Create Profile"}
        </button>
      </div>
    </form>
  );
}


/**
 * Drop a handle / channel ID / URL / free-text query → backend hits
 * the YouTube Data API → preview card with Apply button.
 *
 * Visual states:
 *   idle          — input only
 *   loading       — spinner replaces button label
 *   error         — red banner under input
 *   single result — preview card with thumbnail + sub count + Apply
 *   no match      — gray "no match" notice
 *
 * The component never writes to the parent form directly — onApply
 * carries the normalized dict so the parent decides which fields to
 * populate (we don't clobber user edits to title_formula / footer).
 */
function YouTubeChannelLookup({ onApply }) {
  const [q, setQ]            = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]    = useState("");
  const [result, setResult]  = useState(null);

  function fmtN(n) {
    if (!n || n < 1000) return String(n || 0);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + "K";
    if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + "M";
    return (n / 1e9).toFixed(1) + "B";
  }

  async function lookup() {
    const v = q.trim();
    if (!v) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const found = await api.ytLookup(v);
      setResult(found);
    } catch (e) {
      setError(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-blue-950/15 border border-blue-900/40 rounded-md p-3 mb-2">
      <div className="text-xs font-medium text-blue-300 flex items-center gap-2 mb-2">
        <Youtube size={13} className="text-red-400" />
        Auto-fill from YouTube
        <span className="ml-auto text-[10px] text-blue-400/60 font-normal">
          paste a handle, channel ID, or URL
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();   // form submit hijack — only do lookup
                lookup();
              }
            }}
            placeholder="@TV9Telugu  ·  UCxxxxx  ·  youtube.com/@Channel"
            className="w-full bg-black/40 border border-border rounded pl-8 pr-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={lookup}
          disabled={loading || !q.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded inline-flex items-center gap-1.5 transition-colors"
        >
          {loading
            ? <><Loader2 size={11} className="animate-spin" /> Looking up…</>
            : <><Search size={11} /> Lookup</>}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-[11px] text-red-300 flex items-start gap-1">
          <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-2 flex items-center gap-3 p-2 rounded bg-black/40 border border-blue-900/30">
          {result.thumbnail_url ? (
            <img src={result.thumbnail_url}
                 alt={result.name}
                 className="w-12 h-12 rounded-full bg-black/40 object-cover flex-shrink-0"
                 onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div className="w-12 h-12 rounded-full bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <Youtube size={18} className="text-red-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-100 truncate">{result.name || "(no name)"}</div>
            <div className="text-[10px] text-gray-500 truncate">
              {result.handle && <span className="text-blue-300">{result.handle}</span>}
              {result.handle && (result.subscriber_count > 0 || result.video_count > 0) && <span> · </span>}
              {result.subscriber_count > 0 && <span>{fmtN(result.subscriber_count)} subs</span>}
              {result.video_count > 0 && <span> · {fmtN(result.video_count)} videos</span>}
              {result.country && <span> · {result.country}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onApply?.(result)}
            className="bg-green-600 hover:bg-green-500 text-white text-[11px] font-medium px-2.5 py-1.5 rounded inline-flex items-center gap-1 flex-shrink-0"
          >
            <CheckCircle2 size={11} /> Use this
          </button>
        </div>
      )}
    </div>
  );
}
