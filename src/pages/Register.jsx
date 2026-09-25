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
import "./auth-theme.css";
import { HOME_PATH } from "../lib/previewGate";
import { Button, Input, PasswordInput } from "../components/ui";

/**
 * Register — mirror of Login with the same two-column shell for cross-page
 * consistency. Right column gathers name (optional), email, password and
 * confirm. Password match validated on submit; mismatch surfaces as inline
 * error on the confirm field via PasswordInput's `error` prop.
 */
export default function Register() {
  const { registerEmail, loginWithCode, requestCode, loginGoogle, config,
          isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // HOME_PATH, not "/app": while the preview gate is on, /app is blocked,
  // so a brand-new account landed on the refusal page the instant it was
  // created. Sign-in was moved off "/app" already; this was missed.
  const to  = loc.state?.from || HOME_PATH;

  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [pw2Error, setPw2Error] = useState("");
  /* Signing up with no password at all. The first correct code creates the
   * account, so this screen and the sign-in screen run the same two steps --
   * address, then digits -- on purpose: one habit, not two. */
  const [codeMode, setCodeMode] = useState(false);   // false = password form
  const [codeStep, setCodeStep] = useState("ask");   // "ask" | "enter"
  const [code,     setCode]     = useState("");
  const [sentTo,   setSentTo]   = useState("");
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
      // Creates the account if the address is new, signs in if it is not --
      // the caller does not have to know which, and neither does the person.
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
            Start autonomous.
            <br />
            <span className="serif-i flame">In 2 minutes.</span>
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
              <h1 className="kxauth-title">Create your Kaizer account</h1>
              <p className="kxauth-sub">
                Publish to every platform &mdash; no manual editing required.
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
                  No password to choose. We email you a six-digit code, and the
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
                    <button
                      type="button"
                      onClick={() => { setCodeStep("ask"); setCode(""); setError(""); }}
                      className="kxauth-link"
                    >
                      Use a different address
                    </button>
                  </p>
                </>
              )}

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
                  busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />
                }
              >
                {busy
                  ? (codeStep === "ask" ? "Sending..." : "Checking...")
                  : (codeStep === "ask" ? "Email me a code" : "Create my account")}
              </Button>

              <button
                type="button"
                onClick={() => { setCodeMode(false); setCodeStep("ask"); setError(""); }}
                className="kxauth-subtle w-full"
              >
                Use a password instead
              </button>

              <div className="kxauth-note text-center pt-1">
                Already have an account?{" "}
                <Link to="/login" className="kxauth-link">
                  Sign in
                </Link>
              </div>
            </form>
            ) : (
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
                  busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />
                }
              >
                Create account
              </Button>

              {/* The way INTO the code path -- shown only where the backend
                  says it can serve it (see /auth/config). */}
              {config.code_login && (
                <button
                  type="button"
                  onClick={() => { setCodeMode(true); setCodeStep("ask"); setError(""); }}
                  className="kxauth-link w-full text-[11px]"
                >
                  Sign up without a password &mdash; email me a code
                </button>
              )}

              <div className="kxauth-note text-center pt-1">
                Already have an account?{" "}
                <Link to="/login" className="kxauth-link">
                  Sign in
                </Link>
              </div>
            </form>
            )}
          </div>

          <p className="kxauth-note text-center mt-4">
            By creating an account you agree that this app will store your session locally.
          </p>
        </div>
      </main>
    </div>
  );
}
