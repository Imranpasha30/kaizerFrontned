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
import "./auth-theme.css";
import { Button, Input, PasswordInput } from "../components/ui";
import { HOME_PATH } from "../lib/previewGate";

/**
 * Login — Canva-grade two-column sign-in page.
 * Left column is a product-showcase panel (md+ only). Right column hosts the
 * actual form in a glass-panel card. GIS button mounts inside the card when
 * the backend reports google_enabled.
 */
export default function Login() {
  const { loginEmail, loginWithCode, requestCode, loginGoogle, config, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Post-login landing → Library (shared company source-video pool).
  // Existing /app deep links still work because loc.state.from wins when
  // an unauth visitor was redirected here from a protected route.
  const to  = loc.state?.from || HOME_PATH;

  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  // The emailed-code path. Two states only: "ask" for the address, then
  // "enter" for the digits. A login screen with more steps than that is a
  // login screen people get stuck in.
  const [codeMode, setCodeMode] = useState(false);   // false = password form
  const [codeStep, setCodeStep] = useState("ask");   // "ask" | "enter"
  const [code,     setCode]     = useState("");
  const [sentTo,   setSentTo]   = useState("");
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

  async function askForCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestCode(email.trim());
      setSentTo(email.trim());
      setCodeStep("enter");
    } catch (err) {
      setError(err.message || "Could not send a code");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await loginWithCode(sentTo || email.trim(), code.trim());
      nav(to, { replace: true });
    } catch (err) {
      setError(err.message || "That code did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kxauth min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* ── Left: product showcase (md+) ───────────────────────── */}
      <aside className="kxauth-showcase relative hidden md:flex items-center justify-center">
        <div className="kxauth-grid" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-lg px-10 py-16 flex flex-col gap-8">
          <span className="eyebrow">Autonomous media engine</span>
          <h2 className="kxauth-h1">
            Ship a live show
            <br />
            <span className="serif-i flame">while you&rsquo;re making coffee.</span>
          </h2>

          {/* Optional looping demo thumbnail */}
          <div className="kxauth-clip">
            <video
              src="/landing-assets/howto-demo.mp4"
              poster="/landing-assets/howto-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          </div>

          <ul className="flex flex-col gap-4 mt-2">
            <li className="flex items-start gap-3">
              <span className="kxauth-feat-icon mt-0.5">
                <Radio size={15} />
              </span>
              <div>
                <div className="kxauth-feat-t">
                  Zero-operator live direction
                </div>
                <div className="kxauth-feat-d">
                  Kaizer cuts, captions and calls the show for you.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="kxauth-feat-icon mt-0.5">
                <Zap size={15} />
              </span>
              <div>
                <div className="kxauth-feat-t">
                  One recording &rarr; 8 clips
                </div>
                <div className="kxauth-feat-d">
                  Auto-chopped for Shorts, Reels, TikTok and long-form.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="kxauth-feat-icon mt-0.5">
                <Shield size={15} />
              </span>
              <div>
                <div className="kxauth-feat-t">
                  Your footage, your storage
                </div>
                <div className="kxauth-feat-d">
                  Nothing leaves your account without explicit publish.
                </div>
              </div>
            </li>
          </ul>

          <div className="kxauth-wordmark mt-auto pt-10">
            &mdash; Kaizer X
          </div>
        </div>
      </aside>

      {/* ── Right: form card ─────────────────────────────────── */}
      <main className="flex items-center justify-center px-4 py-12 md:py-16">
        <div className="w-full max-w-md">
          <div className="glass-panel p-8 mx-auto space-y-5">
            <div className="flex flex-col gap-2">
              <span className="kxauth-badge">
                KAIZER
              </span>
              <h1 className="kxauth-title">Welcome back</h1>
              <p className="kxauth-sub">
                Sign in to manage your shows and publish to every platform.
              </p>
            </div>

            {config.google_enabled && (
              <>
                <div ref={gbtnRef} className="kxauth-gbtn" />
                <div className="relative flex items-center gap-3">
                  <div className="kxauth-rule" />
                  <span className="kxauth-or">or</span>
                  <div className="kxauth-rule" />
                </div>
              </>
            )}

            {codeMode ? (
              <form onSubmit={codeStep === "ask" ? askForCode : submitCode}
                    className="space-y-4">
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
                  disabled={codeStep === "enter"}
                />

                {codeStep === "ask" && (
                  <p className="kxauth-note -mt-1">
                    No password needed. If you have not signed up yet, the
                    first correct code creates your account.
                  </p>
                )}

                {codeStep === "enter" && (
                  <>
                    <Input
                      label="Six-digit code"
                      icon={<Mail size={12} />}
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      required
                      maxLength={7}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                    />
                    <p className="kxauth-note -mt-1">
                      Sent to {sentTo}. It works once and expires in 10 minutes.
                      {" "}
                      <button type="button"
                        onClick={() => { setCodeStep("ask"); setCode(""); setError(""); }}
                        className="kxauth-link">
                        Use a different address
                      </button>
                    </p>
                  </>
                )}

                {error && (
                  <div role="alert"
                    className="kxauth-alert">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button type="submit" disabled={busy}
                  className="ui-btn-primary w-full flex items-center justify-center py-2.5 text-sm">
                  {busy
                    ? (codeStep === "ask" ? "Sending..." : "Checking...")
                    : (codeStep === "ask" ? "Email me a code" : "Sign in")}
                </button>

                <button type="button"
                  onClick={() => { setCodeMode(false); setCodeStep("ask"); setError(""); }}
                  className="kxauth-subtle w-full">
                  Use a password instead
                </button>
              </form>
            ) : (
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

              <div className="flex items-center justify-between -mt-1">
                {/* The way INTO the emailed-code path -- shown only where the
                    backend says it can serve it (see /auth/config). */}
                {config.code_login ? (
                  <button
                    type="button"
                    onClick={() => { setCodeMode(true); setCodeStep("ask"); setError(""); }}
                    className="kxauth-link text-[11px]"
                  >
                    Email me a code instead
                  </button>
                ) : <span />}
                <Link
                  to="/forgot-password"
                  className="kxauth-note text-[11px]"
                >
                  Forgot password?
                </Link>
              </div>

              {error && (
                <div
                  role="alert"
                  className="kxauth-alert"
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

              {/* No "create an account" link. Signing in with a new address
                  creates one: the emailed-code route makes the account on the
                  first correct code. */}
              <div className="kxauth-note text-center pt-1">
                New here? Use <span className="kxauth-link">Email me a code</span>
                {" "}above &mdash; your account is created automatically.
              </div>
            </form>
            )}
          </div>

          <p className="kxauth-note text-center mt-4">
            By signing in you agree that this app will store your session locally.
          </p>
        </div>
      </main>
    </div>
  );
}
