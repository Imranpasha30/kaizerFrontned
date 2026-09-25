/* The one-time details form, shown on a new account's first sign-in.
 *
 * There is deliberately no skip. The brief was explicit, and the reason is
 * sound: these are the details the product needs to do its job -- the
 * language decides transcription, cut prompts and on-screen font; the
 * channel link is what per-channel SEO learns from. Collected later, they
 * are collected never.
 *
 * SHOWN ONCE. The gate is "does this account have an onboarding row", so a
 * successful submission ends it permanently, and accounts that existed
 * before this shipped were given rows at startup -- they are never asked.
 * Whichever way someone signed in (Google, emailed code, password) they
 * arrive here the same way, because the flag rides on _public_user, which
 * every auth response goes through.
 *
 * NO SKIP IS NOT NO EXIT. Sign out is always available. A form you cannot
 * leave, on an account you cannot reach, is a trap -- and someone who signed
 * in with the wrong Google account must be able to get out.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, AlertCircle, User as UserIcon, Phone, Building2,
  Mail, Globe, Link2, Check, LogOut,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Input } from "../components/ui";
import { api } from "../api/client";
import { HOME_PATH } from "../lib/previewGate";
import "./auth-theme.css";

/* The nine the product supports on air -- the same set the landing names.
 * Native script first: these are the people who read it. */
const LANGUAGES = [
  { code: "te", native: "తెలుగు",   name: "Telugu" },
  { code: "hi", native: "हिन्दी",    name: "Hindi" },
  { code: "ta", native: "தமிழ்",    name: "Tamil" },
  { code: "kn", native: "ಕನ್ನಡ",    name: "Kannada" },
  { code: "ml", native: "മലയാളം",  name: "Malayalam" },
  { code: "bn", native: "বাংলা",     name: "Bengali" },
  { code: "mr", native: "मराठी",     name: "Marathi" },
  { code: "gu", native: "ગુજરાતી",   name: "Gujarati" },
  { code: "en", native: "English",  name: "English" },
];

/* Mirrors the server's rule (routers/onboarding.normalise_channel_link) so
 * the form can say what is wrong before a round trip. The server is still
 * the authority; this only spares someone a submit to be told. */
const YT_CHANNEL = new RegExp(
  "^(https?://)?(www\\.|m\\.|music\\.)?youtube\\.com/" +
    "(@[A-Za-z0-9._-]{3,30}" +
    "|channel/UC[A-Za-z0-9_-]{22}" +
    "|c/[A-Za-z0-9._-]{1,100}" +
    "|user/[A-Za-z0-9._-]{1,100})/?($|\\?)",
  "i",
);

function looksLikeYouTubeChannel(v) {
  const t = String(v || "").trim();
  if (!t) return false;
  if (t.startsWith("@")) return /^@[A-Za-z0-9._-]{3,30}$/.test(t);
  return YT_CHANNEL.test(t);
}

export default function Onboarding() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();

  const [fullName, setFullName] = useState("");
  const [mobile,   setMobile]   = useState("");
  const [company,  setCompany]  = useState("");
  const [email,    setEmail]    = useState("");
  const [website,  setWebsite]  = useState("");
  const [channel,  setChannel]  = useState("");
  const [langs,    setLangs]    = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");

  /* Prefill what the account already knows. Editable, because the address
   * that should receive invoices is often not the one used to sign in. */
  useEffect(() => {
    if (!user) return;
    setFullName((v) => v || (user.name || "").trim());
    setEmail((v) => v || (user.email || "").trim());
  }, [user]);

  function toggleLang(code) {
    setLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }

  /* Mirrors the server's rules so the first thing someone sees is the field
   * to fix, not a round trip. The server still validates -- this is
   * courtesy, not security. */
  const problem = useMemo(() => {
    if (fullName.trim().length < 2)          return "Please enter your full name.";
    if (mobile.replace(/\D/g, "").length < 8) return "Please enter a valid mobile number with country code.";
    if (company.trim().length < 2)           return "Please enter your company or channel name.";
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email.trim()))
                                             return "Please enter a valid email address.";
    if (langs.length === 0)                  return "Please choose at least one language.";
    if (!channel.trim())                     return "Please enter your YouTube channel link.";
    if (/youtu\.be\/|\/watch\?|\/playlist\?/i.test(channel))
                                             return "That is a video or playlist link. Please paste your CHANNEL link.";
    if (!looksLikeYouTubeChannel(channel))   return "Please paste a YouTube channel link, e.g. https://youtube.com/@yourchannel";
    return "";
  }, [fullName, mobile, company, email, langs, channel]);

  async function submit(e) {
    e.preventDefault();
    if (problem) { setError(problem); return; }
    setError("");
    setBusy(true);
    try {
      await api.saveOnboarding({
        full_name: fullName.trim(),
        mobile: mobile.trim(),
        company_name: company.trim(),
        email: email.trim(),
        website: website.trim(),
        languages: langs,
        channel_link: channel.trim(),
      });
      /* Re-read /me so the gate sees onboarding_completed before we move.
       * Navigating first would bounce straight back here. */
      await refresh();
      nav(HOME_PATH, { replace: true });
    } catch (err) {
      setError(err.message || "Could not save your details. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="kxauth min-h-screen flex items-start justify-center px-4 py-10 md:py-16">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col gap-2 mb-6">
          <span className="eyebrow">First things first</span>
          <h1 className="kxauth-h1 mt-3">
            Tell us about
            <br />
            <span className="serif-i flame">your channel.</span>
          </h1>
          <p className="kxauth-sub mt-3 max-w-lg">
            We ask once. It sets your language for transcription and captions,
            and points per-channel SEO at the right catalogue.
          </p>
        </div>

        <form onSubmit={submit} className="glass-panel p-6 md:p-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full name"
              icon={<UserIcon size={12} />}
              required
              autoFocus
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
            <Input
              label="Mobile number"
              icon={<Phone size={12} />}
              required
              type="tel"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
              hint="With country code"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company or channel name"
              icon={<Building2 size={12} />}
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Kaizer News Telugu"
            />
            <Input
              label="Email"
              icon={<Mail size={12} />}
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <Input
            label="YouTube channel link"
            icon={<Link2 size={12} />}
            required
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="https://youtube.com/@yourchannel"
            hint="Your channel, not a video — @handle works too"
          />

          <Input
            label="Website"
            icon={<Globe size={12} />}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yoursite.com"
            hint="Optional"
          />

          {/* Languages. Multi-select, because a channel often runs more than
              one, and this is the field the whole pipeline reads. */}
          <div>
            <div className="ui-field-label mb-2">
              Language of your channels
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => {
                const on = langs.includes(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => toggleLang(l.code)}
                    aria-pressed={on}
                    className={`kxauth-lang ${on ? "is-on" : ""}`}
                  >
                    {on && <Check size={12} className="flex-shrink-0" />}
                    <span className="kxauth-lang-native">{l.native}</span>
                    {l.native !== l.name && (
                      <span className="kxauth-lang-en">{l.name}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="kxauth-note mt-2">
              Pick every language you publish in. You can change this later in
              Settings.
            </p>
          </div>

          {error && (
            <div role="alert" className="kxauth-alert">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="ui-btn-primary w-full flex items-center justify-center gap-2 py-3 text-[15px]"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? "Saving…" : "Continue"}
          </button>

          {/* No skip -- but never a trap. Someone who signed in with the
              wrong account has to be able to get out. */}
          <div className="flex items-center justify-center pt-1">
            <button
              type="button"
              onClick={() => { logout(); nav("/login", { replace: true }); }}
              className="kxauth-subtle inline-flex items-center gap-1.5"
            >
              <LogOut size={12} />
              Signed in as {user?.email} &mdash; sign out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
