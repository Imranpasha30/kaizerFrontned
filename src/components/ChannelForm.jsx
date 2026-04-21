import React, { useState, useEffect } from "react";
import { Save, Loader2, Tag, Hash, Star } from "lucide-react";
import TagInput from "./TagInput";

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
