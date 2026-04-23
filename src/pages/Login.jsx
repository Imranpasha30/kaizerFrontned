import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Loader2,
  LogIn,
  AlertCircle,
  Mail,
  Radio,
  Zap,
  Shield,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Button, Input, PasswordInput } from "../components/ui";

/**
 * Login — Canva-grade two-column sign-in page.
 * Left column is a product-showcase panel (md+ only). Right column hosts the
 * actual form in a glass-panel card. GIS button mounts inside the card when
 * the backend reports google_enabled.
 */
export default function Login() {
  const { loginEmail, loginGoogle, config, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const to  = loc.state?.from || "/app";

  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const gbtnRef = useRef(null);

  useEffect(() => {
    if (!loading && isAuthenticated) nav(to, { replace: true });
  }, [isAuthenticated, loading, nav, to]);

  // Google Identity Services button (preserved from original impl).
  useEffect(() => {
    if (!config.google_enabled || !config.google_client_id) return;
    if (!window.google?.accounts?.id) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = initGoogle;
      document.head.appendChild(s);
    } else {
      initGoogle();
    }

    function initGoogle() {
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
              setError(e.message || "Google sign-in failed");
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
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: 340,
          });
        }
      } catch { /* non-fatal */ }
    }
  }, [config.google_enabled, config.google_client_id, loginGoogle, nav, to]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await loginEmail(email.trim(), pw);
      nav(to, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
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
            Ship a live show while you&rsquo;re making coffee.
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
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-sm text-gray-500">
                Sign in to manage your shows and publish to every platform.
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
                label="Email"
                icon={<Mail size={12} />}
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />

              <PasswordInput
                label="Password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                minLength={6}
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
                  busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />
                }
              >
                Sign in
              </Button>

              <div className="text-center text-xs text-gray-500 pt-1">
                Don&rsquo;t have an account?{" "}
                <Link to="/register" className="text-accent2 hover:text-white">
                  Create one
                </Link>
              </div>
            </form>
          </div>

          <p className="text-center text-[10px] text-gray-700 mt-4">
            By signing in you agree that this app will store your session locally.
          </p>
        </div>
      </main>
    </div>
  );
}
