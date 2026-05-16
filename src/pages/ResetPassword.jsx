import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, AlertCircle, CheckCircle2, ChevronLeft, KeyRound, Shield,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Button, PasswordInput } from "../components/ui";

/**
 * ResetPassword — landing page from the emailed reset link.
 *
 * 1. On mount, validates the token via /auth/reset-password/validate so
 *    we can show "this link is expired/used" without making the user
 *    type a password first.
 * 2. On submit, posts to /auth/reset-password and uses the returned
 *    fresh JWT to sign the user in immediately.
 */
export default function ResetPassword() {
  const [sp]  = useSearchParams();
  const nav   = useNavigate();
  const { setSession } = useAuth();

  const token = sp.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [valid,    setValid]    = useState(false);
  const [forEmail, setForEmail] = useState("");
  const [validationErr, setValidationErr] = useState("");

  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [done,  setDone]  = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        setValidationErr("This reset link is missing the token. Request a new one.");
        setChecking(false);
        return;
      }
      try {
        const r = await api.validateReset(token);
        if (!alive) return;
        if (!r.valid) {
          setValidationErr("This reset link has expired or has already been used. Request a new one.");
        } else {
          setValid(true);
          setForEmail(r.email || "");
        }
      } catch (e) {
        if (alive) setValidationErr(e.message || "Couldn't verify this link.");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!(/\d/.test(pw) || /[^a-zA-Z0-9]/.test(pw))) {
      setError("Add at least one digit or symbol.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.resetPassword({ token, new_password: pw });
      // Sign the user in with the returned token, then go to the app.
      if (r?.token && r?.user && setSession) {
        setSession(r.token, r.user);
      }
      setDone(true);
      // Brief success state, then home.
      setTimeout(() => nav("/app", { replace: true }), 1200);
    } catch (e) {
      setError(e.message || "Reset failed. The link may have just expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="glass-panel p-8 space-y-5">
          <div className="flex flex-col gap-2">
            <span className="inline-block bg-accent rounded px-2.5 py-1 text-white font-black text-sm tracking-widest self-start">
              KAIZER
            </span>
            <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
            {forEmail && (
              <p className="text-sm text-gray-500">
                For <span className="text-gray-300">{forEmail}</span>
              </p>
            )}
          </div>

          {checking && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Verifying this link…
            </div>
          )}

          {!checking && !valid && (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 text-red-300 text-xs rounded-lg px-3 py-3"
              >
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{validationErr}</span>
              </div>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1 text-sm text-accent2 hover:text-white"
              >
                <ChevronLeft size={14} /> Request a new link
              </Link>
            </div>
          )}

          {!checking && valid && done && (
            <div className="flex items-start gap-2 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 text-xs rounded-lg px-3 py-3">
              <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
              <span>Password updated. Taking you to your dashboard…</span>
            </div>
          )}

          {!checking && valid && !done && (
            <form onSubmit={submit} className="space-y-4">
              <PasswordInput
                label="New password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 chars, with a digit or symbol"
                minLength={8}
                required
                autoFocus
              />
              <PasswordInput
                label="Confirm new password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat the new password"
                minLength={8}
                required
              />

              <div className="text-[11px] text-gray-500 flex items-start gap-1.5">
                <Shield size={11} className="mt-0.5 flex-shrink-0" />
                <span>
                  Any sessions you already have stay signed in. After saving you'll
                  be signed in here too.
                </span>
              </div>

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
                leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              >
                Update password &amp; sign in
              </Button>

              <div className="text-center text-xs text-gray-500 pt-1">
                <Link to="/login" className="text-accent2 hover:text-white">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
