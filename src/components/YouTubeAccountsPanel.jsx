import React, { useEffect, useRef, useState } from "react";
import {
  Youtube, Plus, CheckCircle2, Loader2, RefreshCw, AlertCircle, Users,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Shows each unique YouTube account the user has linked, with the style
 * profiles that feed into it, and a one-click "Connect another account"
 * flow that creates a fresh profile + opens Google OAuth in a popup.
 *
 * Props:
 *   oauthConfigured  - bool from /api/youtube/oauth/status
 *   onRefresh        - () => void  (parent re-fetches channels after change)
 */
export default function YouTubeAccountsPanel({ oauthConfigured, onRefresh }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const popupRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setAccounts((await api.listYtAccounts()) || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load YouTube accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Listen for the OAuth-complete postMessage from the popup
  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (!data || data.type !== "yt_oauth") return;
      setConnecting(false);
      try { popupRef.current?.close(); } catch {}
      if (data.status === "connected") {
        setNotice(data.message || "YouTube account connected.");
        setError("");
        load();
        onRefresh?.();
      } else {
        setError(data.message || "Connection failed.");
        setNotice("");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onRefresh]);

  async function handleConnect() {
    setError(""); setNotice("");
    if (!oauthConfigured) {
      setError("YouTube OAuth is not configured on the server.");
      return;
    }
    try {
      setConnecting(true);
      const { auth_url } = await api.newYtAccount();
      const w = window.open(
        auth_url,
        "kaizer_yt_new_account",
        "width=560,height=720,menubar=no,toolbar=no,location=yes",
      );
      if (!w) {
        setConnecting(false);
        setError("Popup was blocked — allow popups for this site and retry.");
        return;
      }
      popupRef.current = w;
    } catch (e) {
      setConnecting(false);
      setError(e.message || "Failed to start connect flow");
    }
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Users size={14} className="text-accent2" /> Your YouTube Accounts
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Each row is a real YouTube channel you can publish to. Sign in with a different Google account to add another.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="p-2 text-gray-400 hover:text-white"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleConnect}
            disabled={!oauthConfigured || connecting}
            className="bg-accent2 hover:bg-accent text-white text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            title="Opens Google's account picker — choose 'Use another account' to link a second YouTube channel"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Connect Another YouTube Account
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-xs mb-3 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="bg-green-950/40 border border-green-900 text-green-300 px-3 py-2 rounded text-xs mb-3 flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading && accounts.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
          <Loader2 size={14} className="animate-spin" /> Loading YouTube accounts…
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-[#0c0c0c] border border-border rounded p-4 text-xs text-gray-500 text-center">
          No YouTube accounts linked yet. Click <strong className="text-accent2">Connect Another YouTube Account</strong> to start.
          <div className="text-[10px] text-gray-600 mt-1">
            Tip: on the Google consent screen, click <em>Use another account</em> to link a channel that isn't your default Google sign-in.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acc) => (
            <div
              key={acc.google_channel_id || acc.youtube_channel_title}
              className="bg-[#0c0c0c] border border-green-900/40 rounded-lg p-3"
            >
              <div className="flex items-start gap-2 mb-2">
                <Youtube size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-green-300 truncate" title={acc.youtube_channel_title}>
                    {acc.youtube_channel_title}
                  </div>
                  <div className="text-[10px] text-gray-600 truncate">
                    {acc.google_channel_id || "(no id)"}
                  </div>
                </div>
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
              </div>
              <div className="border-t border-border/60 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Style profiles on this account
                </div>
                <div className="flex flex-wrap gap-1">
                  {acc.profiles.map((p) => (
                    <span
                      key={p.id}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300"
                      title={`Language: ${p.language}`}
                    >
                      {p.is_priority ? "★ " : ""}{p.name}
                    </span>
                  ))}
                </div>
                {acc.connected_at && (
                  <div className="text-[10px] text-gray-600 mt-2">
                    Linked {new Date(acc.connected_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
