import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, UserPlus, AlertCircle, Mail, User as UserIcon } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export default function Register() {
  const { registerEmail, loginGoogle, config, isAuthenticated, loading } = useAuth();
  const nav = useNavigate();

  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [pw,     setPw]     = useState("");
  const [pw2,    setPw2]    = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const gbtnRef = useRef(null);

  useEffect(() => {
    if (!loading && isAuthenticated) nav("/", { replace: true });
  }, [isAuthenticated, loading, nav]);

  // Google Sign-Up uses the exact same Identity flow — Google gives us the
  // ID token, our backend either finds an existing account or creates one.
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
              nav("/", { replace: true });
            } catch (e) {
              setError(e.message || "Google sign-up failed");
            } finally {
              setBusy(false);
            }
          },
        });
        if (gbtnRef.current) {
          window.google.accounts.id.renderButton(gbtnRef.current, {
            type: "standard", size: "large", theme: "filled_black", text: "signup_with",
            shape: "rectangular", logo_alignment: "left", width: 340,
          });
        }
      } catch {}
    }
    if (window.google?.accounts?.id) { init(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true; s.onload = init;
    document.head.appendChild(s);
  }, [config.google_enabled, config.google_client_id, loginGoogle, nav]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pw !== pw2) { setError("Passwords don't match."); return; }
    if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      await registerEmail(email.trim(), pw, name.trim());
      nav("/", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
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
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">Publish to YouTube faster — no manual editing.</p>
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
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5"><UserIcon size={12} /> Name <span className="text-gray-600">(optional)</span></span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-black border border-border rounded px-3 py-2 text-white text-sm focus:border-accent2 outline-none"
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1.5"><Mail size={12} /> Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-black border border-border rounded px-3 py-2 text-white text-sm focus:border-accent2 outline-none"
                placeholder="you@example.com"
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
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-400">Confirm password</span>
              <input
                type="password"
                required
                minLength={6}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className="bg-black border border-border rounded px-3 py-2 text-white text-sm focus:border-accent2 outline-none"
                placeholder="Re-enter password"
                autoComplete="new-password"
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
              {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Create account
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="text-accent2 hover:text-white">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
