import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Loader2,
  UserPlus,
  AlertCircle,
  Mail,
  User as UserIcon,
  Radio,
  Zap,
  Shield,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Button, Input, PasswordInput } from "../components/ui";

/**
 * Register — mirror of Login with the same two-column shell for cross-page
 * consistency. Right column gathers name (optional), email, password and
 * confirm. Password match validated on submit; mismatch surfaces as inline
 * error on the confirm field via PasswordInput's `error` prop.
 */
export default function Register() {
  const { registerEmail, loginGoogle, config, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const to  = loc.state?.from || "/app";

  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [pw2Error, setPw2Error] = useState("");
  const gbtnRef = useRef(null);

  useEffect(() => {
    if (!loading && isAuthenticated) nav(to, { replace: true });
  }, [isAuthenticated, loading, nav, to]);

  // Google sign-up (same ID flow — backend finds-or-creates the account).
  useEffect(() => {
    if (!config.google_enabled || !config.google_client_id) return;
    function init() {
      try {
        window.google.accounts.id.initialize({
          client_id: config.google_client_id,
          callback: async ({ credential }) => {
            setError("");
            setBusy(true);
            try {
              await loginGoogle(credential);
              nav(to, { replace: true });
            } catch (e) {
              setError(e.message || "Google sign-up failed");
            } finally {
              setBusy(false);
            }
          },
        });
        if (gbtnRef.current) {
          window.google.accounts.id.renderButton(gbtnRef.current, {
            type: "standard",
            size: "large",
            theme: "filled_black",
            text: "signup_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: 340,
          });
        }
      } catch { /* non-fatal */ }
    }
    if (window.google?.accounts?.id) { init(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [config.google_enabled, config.google_client_id, loginGoogle, nav, to]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setPw2Error("");
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setPw2Error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await registerEmail(email.trim(), pw, name.trim());
      nav(to, { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[#060606]">
      {/* ── Left: product showcase (md+) ───────────────────────── */}
      <aside className="relative hidden md:flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-[#140b1a] border-r border-white/5">
        <div className="hero-grid-bg" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-lg px-10 py-16 flex flex-col gap-8">
          <span className="eyebrow">Autonomous Media Engine</span>
          <h2 className="heading-hero text-[44px] leading-[1.05]">
            Start autonomous. In 2 minutes.
          </h2>

          {/* Optional looping demo thumbnail */}
          <div className="w-3/4 aspect-video rounded-xl overflow-hidden border border-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] bg-black">
            <video
              src="/demo/kaizer-demo.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>

          <ul className="flex flex-col gap-4 mt-2">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex w-8 h-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-white">
                <Radio size={15} />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-white leading-tight">
                  Zero-operator live direction
                </div>
                <div className="text-[12px] text-gray-500 leading-snug">
                  Kaizer cuts, captions and calls the show for you.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex w-8 h-8 items-center justify-center rounded-lg bg-accent/15 border border-accent/30 text-accent">
                <Zap size={15} />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-white leading-tight">
                  One recording &rarr; 8 clips
                </div>
                <div className="text-[12px] text-gray-500 leading-snug">
                  Auto-chopped for Shorts, Reels, TikTok and long-form.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex w-8 h-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/10 text-white">
                <Shield size={15} />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-white leading-tight">
                  Your footage, your storage
                </div>
                <div className="text-[12px] text-gray-500 leading-snug">
                  Nothing leaves your account without explicit publish.
                </div>
              </div>
            </li>
          </ul>

          <div className="mt-auto pt-10 text-[10px] tracking-[0.28em] uppercase font-bold text-gray-600">
            &mdash; Kaizer News
          </div>
        </div>
      </aside>

      {/* ── Right: form card ─────────────────────────────────── */}
      <main className="flex items-center justify-center px-4 py-12 md:py-16">
        <div className="w-full max-w-md">
          <div className="glass-panel p-8 mx-auto space-y-5">
            <div className="flex flex-col gap-2">
              <span className="inline-block bg-accent rounded px-2.5 py-1 text-white font-black text-sm tracking-widest self-start">
                KAIZER
              </span>
              <h1 className="text-2xl font-bold text-white">Create your Kaizer account</h1>
              <p className="text-sm text-gray-500">
                Publish to every platform &mdash; no manual editing required.
              </p>
            </div>

            {config.google_enabled && (
              <>
                <div ref={gbtnRef} className="flex justify-center" />
                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-[0.22em] text-gray-600">
                    or
                  </span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Your name"
                icon={<UserIcon size={12} />}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                hint="Optional"
              />

              <Input
                label="Email"
                icon={<Mail size={12} />}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />

              <PasswordInput
                label="Password"
                hint="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={8}
                required
              />

              <PasswordInput
                label="Confirm password"
                error={pw2Error}
                value={pw2}
                onChange={(e) => { setPw2(e.target.value); if (pw2Error) setPw2Error(""); }}
                autoComplete="new-password"
                placeholder="Re-enter password"
                minLength={8}
                required
              />

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 bg-red-950/50 border border-red-900/70 text-red-300 text-xs rounded-lg px-3 py-2"
                >
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                type="submit"
                disabled={busy}
                className="w-full justify-center"
                leftIcon={
                  busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />
                }
              >
                Create account
              </Button>

              <div className="text-center text-xs text-gray-500 pt-1">
                Already have an account?{" "}
                <Link to="/login" className="text-accent2 hover:text-white">
                  Sign in
                </Link>
              </div>
            </form>
          </div>

          <p className="text-center text-[10px] text-gray-700 mt-4">
            By creating an account you agree that this app will store your session locally.
          </p>
        </div>
      </main>
    </div>
  );
}
