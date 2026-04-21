import React, { useEffect, useMemo, useState } from "react";
import {
  Settings as GearIcon, Loader2, Save, AlertCircle, CheckCircle2, Info,
  Youtube, Globe, Twitter, Instagram, Facebook, MessageCircle, Send,
  Linkedin, Music2, AtSign, Mail,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

/**
 * Settings → Social Links.
 *
 * Saved links are appended by the SEO generator as a "— Follow us —"
 * footer in every generated description, which fixes the
 * "No social links found" YouTube-SEO warning.
 */
const SOCIALS = [
  { key: "youtube",   label: "YouTube",          icon: Youtube,        placeholder: "@yourchannel or full URL",                prefix: "",                        color: "text-red-500" },
  { key: "website",   label: "Website",          icon: Globe,          placeholder: "https://example.com",                     prefix: "",                        color: "text-gray-300" },
  { key: "twitter",   label: "X / Twitter",      icon: Twitter,        placeholder: "@handle or full URL",                     prefix: "https://twitter.com/",    color: "text-sky-400" },
  { key: "instagram", label: "Instagram",        icon: Instagram,      placeholder: "@handle or full URL",                     prefix: "https://instagram.com/",  color: "text-pink-400" },
  { key: "facebook",  label: "Facebook",         icon: Facebook,       placeholder: "Facebook page URL",                       prefix: "",                        color: "text-blue-500" },
  { key: "whatsapp",  label: "WhatsApp Channel", icon: MessageCircle,  placeholder: "https://whatsapp.com/channel/…",          prefix: "",                        color: "text-green-400" },
  { key: "telegram",  label: "Telegram",         icon: Send,           placeholder: "https://t.me/yourchannel",                prefix: "",                        color: "text-cyan-400" },
  { key: "linkedin",  label: "LinkedIn",         icon: Linkedin,       placeholder: "LinkedIn page URL",                       prefix: "",                        color: "text-blue-400" },
  { key: "tiktok",    label: "TikTok",           icon: Music2,         placeholder: "@handle or full URL",                     prefix: "https://tiktok.com/@",    color: "text-gray-200" },
  { key: "threads",   label: "Threads",          icon: AtSign,         placeholder: "@handle or full URL",                     prefix: "https://threads.net/@",   color: "text-gray-200" },
  { key: "email",     label: "Contact email",    icon: Mail,           placeholder: "you@example.com",                         prefix: "mailto:",                 color: "text-gray-300" },
];

export default function Settings() {
  const { user, refresh } = useAuth();
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");
  const [notice, setNotice]   = useState("");

  useEffect(() => {
    api.getSocials()
      .then((s) => setValues(s || {}))
      .catch((e) => setError(e.message || "Failed to load socials"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setError(""); setNotice(""); setSaving(true);
    try {
      await api.putSocials(values);
      setNotice("Social links saved. New SEO generations will include them automatically.");
      refresh?.();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => (v || "").trim()).length,
    [values],
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
          <GearIcon size={22} className="text-accent2" /> Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-promo links appended to every generated SEO description.
        </p>
      </header>

      {/* How it works */}
      <div className="mb-4 p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 flex items-start gap-2">
        <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          Whichever links you fill will be added as a <strong className="text-gray-100">— Follow us —</strong>
          section at the end of every AI-generated description — which eliminates the
          "No social links found" SEO warning and boosts cross-platform audience building.
          Leave a field blank to skip it. Changes apply on the <em>next</em> SEO generation.
        </div>
      </div>

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
          <Loader2 size={14} className="animate-spin" /> Loading your socials…
        </div>
      ) : (
        <>
          <div className="bg-surface border border-border rounded p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-200">Social Links</h2>
              <span className="text-xs text-gray-500">{filledCount} filled</span>
            </div>
            {SOCIALS.map(({ key, label, icon: Icon, placeholder, color }) => (
              <div key={key} className="grid grid-cols-[110px_1fr] sm:grid-cols-[150px_1fr] gap-2 items-center">
                <label className="flex items-center gap-1.5 text-xs text-gray-300">
                  <Icon size={13} className={color} />
                  <span className="truncate">{label}</span>
                </label>
                <input
                  type="text"
                  value={values[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  className="bg-black border border-border rounded px-2 py-1.5 text-sm text-gray-200 focus:border-accent2 outline-none"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-[11px] text-gray-600">
              Signed in as <span className="text-gray-400">{user?.email}</span>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="bg-accent hover:bg-accent2 text-white text-sm font-medium px-4 py-2 rounded flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>

          {/* Preview */}
          {filledCount > 0 && (
            <div className="mt-6 bg-[#0a0a0a] border border-border rounded p-4">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                Preview — what gets appended to descriptions
              </div>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
— Follow us —
{SOCIALS
  .filter((s) => (values[s.key] || "").trim())
  .map((s) => {
    const v = (values[s.key] || "").trim();
    const label = s.label;
    return `${s.icon === Youtube ? "▶" : s.icon === Globe ? "🌐" : s.icon === Mail ? "✉" : "🔗"} ${label}: ${v}`;
  })
  .join("\n")}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
