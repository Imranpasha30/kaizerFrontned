import React, { useEffect, useMemo, useState } from "react";
import {
  Settings as GearIcon, Loader2, Save, AlertCircle, CheckCircle2, Info,
  Youtube, Globe, Twitter, Instagram, Facebook, MessageCircle, Send,
  Linkedin, Music2, AtSign, Mail, KeyRound, Eye, EyeOff, ShieldCheck,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { PasswordInput } from "../components/ui";
import AvatarUploader from "../components/AvatarUploader";
import PostizConnectPanel from "../components/PostizConnectPanel";

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
          Profile picture and cross-promo links appended to every generated SEO description.
        </p>
      </header>

      {/* Profile picture — image or GIF, surfaces next to every library
          card by this user + on the creator profile page. */}
      <div className="mb-5 p-5 rounded-2xl border border-border bg-panel">
        <AvatarUploader/>
      </div>

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

      {/* Password section — always visible regardless of socials loading */}
      <PasswordCard />

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-6">
          <Loader2 size={14} className="animate-spin" /> Loading your socials…
        </div>
      ) : (
        <>
          <div className="bg-surface border border-border rounded p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-200">Default Social Links</h2>
              <span className="text-xs text-gray-500">{filledCount} filled</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-snug mb-2">
              Used as a <span className="text-accent2">template</span> when you create a new YouTube channel —
              the values copy across automatically. Each channel can override its own socials in
              Channels → <span className="text-accent2">✦ Brand</span> so different audiences get the right handles.
            </p>
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

      <PostizConnectPanel />
    </div>
  );
}


/**
 * PasswordCard — change-or-set the password on the signed-in account.
 *
 * Loads /auth/me/has-password to know whether to render "Set a password"
 * (Google-only account, no current password to verify) or "Change password"
 * (the usual flow that requires the current password).
 */
function PasswordCard() {
  const { user, config } = useAuth();
  const [hp,        setHp]        = useState(null);   // null = loading; {has_password, signin_methods}
  const [hpErr,     setHpErr]     = useState("");
  const [current,   setCurrent]   = useState("");
  const [next1,     setNext1]     = useState("");
  const [next2,     setNext2]     = useState("");
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState("");
  const [notice,    setNotice]    = useState("");

  useEffect(() => {
    let alive = true;
    api.hasPassword()
      .then((r) => { if (alive) setHp(r); })
      .catch((e) => { if (alive) setHpErr(e.message || "Couldn't load password state"); });
    return () => { alive = false; };
  }, []);

  function reset() {
    setCurrent(""); setNext1(""); setNext2("");
  }

  function validateNew() {
    if (next1.length < 8) return "Password must be at least 8 characters.";
    if (!(/\d/.test(next1) || /[^a-zA-Z0-9]/.test(next1))) return "Add at least one digit or symbol.";
    if (next1 !== next2) return "Passwords don't match.";
    return "";
  }

  async function save() {
    setErr(""); setNotice("");
    if (hp?.has_password && !current.trim()) {
      setErr("Enter your current password to change it.");
      return;
    }
    const v = validateNew();
    if (v) { setErr(v); return; }

    setBusy(true);
    try {
      await api.changePassword({
        current_password: hp?.has_password ? current : null,
        new_password: next1,
      });
      // Re-fetch state — if this was a "set" it'll flip to "has_password=true"
      const r = await api.hasPassword();
      setHp(r);
      setNotice(hp?.has_password
        ? "Password updated."
        : "Password set. You can now sign in with email + password.");
      reset();
    } catch (e) {
      setErr(e.message || "Couldn't update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 bg-surface border border-border rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
          <KeyRound size={14} className="text-accent2" />
          {hp == null ? "Password" : hp.has_password ? "Change password" : "Set a password"}
        </h2>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <ShieldCheck size={11} />
          Signed in as <span className="text-gray-300">{user?.email}</span>
        </div>
      </div>

      {/* Sign-in method chips */}
      {hp && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-gray-500">Sign-in methods:</span>
          {hp.signin_methods.includes("password") && (
            <span className="px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent2">
              email + password
            </span>
          )}
          {hp.signin_methods.includes("google") && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300">
              Google
            </span>
          )}
          {hp.signin_methods.length === 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
              none yet — set one below
            </span>
          )}
        </div>
      )}

      {/* Google-only helper */}
      {hp && !hp.has_password && hp.google_linked && (
        <div className="p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 flex items-start gap-2">
          <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            You currently sign in with Google. Setting a password here lets you
            sign in with <strong>{user?.email}</strong> + password as a backup —
            useful if you lose access to your Google account.
            <em className="block text-gray-500 mt-1">Your Google sign-in keeps working either way.</em>
          </div>
        </div>
      )}

      {hpErr && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded flex items-center gap-2">
          <AlertCircle size={14} /> {hpErr}
        </div>
      )}
      {err && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded flex items-center gap-2">
          <AlertCircle size={14} /> {err}
        </div>
      )}
      {notice && (
        <div className="p-2 bg-green-500/10 border border-green-500/30 text-green-300 text-xs rounded flex items-center gap-2">
          <CheckCircle2 size={14} /> {notice}
        </div>
      )}

      {hp == null ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3 max-w-md">
          {hp.has_password && (
            <PasswordInput
              label="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          )}
          <PasswordInput
            label="New password"
            value={next1}
            onChange={(e) => setNext1(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 chars, with a digit or symbol"
            minLength={8}
            required
          />
          <PasswordInput
            label="Confirm new password"
            value={next2}
            onChange={(e) => setNext2(e.target.value)}
            autoComplete="new-password"
            placeholder="Repeat the new password"
            minLength={8}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            {(current || next1 || next2) && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy || !next1}
              className="bg-accent hover:bg-accent2 text-white text-sm font-medium px-4 py-2 rounded flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {hp.has_password ? "Update password" : "Set password"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
