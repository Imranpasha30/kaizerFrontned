import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn, AlertCircle, Mail } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export default function Login() {
  const { loginEmail, loginGoogle, config, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const to  = loc.state?.from || "/";

  const [email,  setEmail]  = useState("");
  const [pw,     setPw]     = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const gbtnRef = useRef(null);

  useEffect(() => {
    if (!loading && isAuthenticated) nav(to, { replace: true });
  }, [isAuthenticated, loading, nav, to]);

  // Google Identity Services button
  useEffect(() => {
    if (!config.google_enabled || !config.google_client_id) return;
    if (!window.google?.accounts?.id) {
      // Dynamically load GIS script
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true;
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
            type: "standard", size: "large", theme: "filled_black", text: "signin_with",
            shape: "rectangular", logo_alignment: "left", width: 340,
          });
        }
      } catch (e) { /* non-fatal */ }
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-black via-[#0a0a0a] to-[#140b1a]">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-block bg-accent rounded px-3 py-1 text-white font-black text-base tracking-widest mb-2">
            KAIZER
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to manage your YouTube publishing.</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 shadow-xl">
          {config.google_enabled && (
            <>
              <div ref={gbtnRef} className="flex justify-center" />
              <div className="relative my-4 flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-gray-600">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5"><Mail size={12} /> Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-black border border-border rounded px-3 py-2 text-white text-sm focus:border-accent2 outline-none"
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-400">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="bg-black border border-border rounded px-3 py-2 text-white text-sm focus:border-accent2 outline-none"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </label>
            {error && (
              <div className="bg-red-950/50 border border-red-900 text-red-300 text-xs rounded px-3 py-2 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="bg-accent hover:bg-accent2 text-white font-medium text-sm py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              Sign in
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-gray-500">
            Don't have an account?{" "}
            <Link to="/register" className="text-accent2 hover:text-white">Create one</Link>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-4">
          By signing in you agree that this app will store your session locally.
        </p>
      </div>
    </div>
  );
}
