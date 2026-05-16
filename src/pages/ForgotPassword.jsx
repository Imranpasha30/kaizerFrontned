import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { api } from "../api/client";
import { Button, Input } from "../components/ui";

/**
 * ForgotPassword — unauthenticated entry into the reset flow.
 *
 * Always shows the same generic "if an account exists, we sent a link"
 * message regardless of whether the email actually matched. This prevents
 * email-enumeration. During pre-launch without SMTP, the reset link is
 * captured by the admin Logs tab — that's the dev fallback.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [sent,  setSent]  = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e) {
      setError(e.message || "Couldn't request a reset link. Try again.");
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
            <h1 className="text-2xl font-bold text-white">Reset your password</h1>
            <p className="text-sm text-gray-500">
              {sent
                ? "Check your inbox — we sent you a link if the account exists."
                : "Enter the email you signed up with and we'll send you a link to choose a new password."}
            </p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-emerald-950/40 border border-emerald-900/50 text-emerald-300 text-xs rounded-lg px-3 py-3">
                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                <div>
                  If an account exists for <strong>{email}</strong>, a reset link
                  is on its way. It expires in 30 minutes.
                  <div className="mt-2 text-gray-500">
                    No email after a minute or two? Check spam, or ask your admin
                    to grab the link from <code>/admin/logs</code> (dev fallback).
                  </div>
                </div>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-accent2 hover:text-white"
              >
                <ChevronLeft size={14} /> Back to sign in
              </Link>
            </div>
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
                leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              >
                Send reset link
              </Button>

              <div className="text-center text-xs text-gray-500 pt-1">
                Remembered it?{" "}
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
