import React, { useEffect, useState } from "react";
import { Youtube, Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import YouTubeAccountsPanel from "../components/YouTubeAccountsPanel";
import PostizDeliveryPanel from "../components/PostizDeliveryPanel";
import ChannelGroupsManager from "../components/ChannelGroupsManager";

/**
 * Accounts page — the real YouTube accounts we publish to (each with its
 * own logo, watermark and social links) plus channel groups and Postiz
 * delivery. Writing-voice "study channels" (Channel kind="style") used to
 * live here under an "SEO Settings" tab; in the 2026-08 reorg that whole
 * concern moved to Insights → SEO Settings → Competitors, so this page is
 * now a single, focused "Account" view.
 */
export default function Channels() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [notice, setNotice]         = useState("");
  const [oauthState, setOauthState] = useState({ configured: false, checked: false });
  const [ytAccounts, setYtAccounts] = useState([]); // [{google_channel_id, youtube_channel_title, …}]

  async function load() {
    setLoading(true);
    setError("");
    try {
      // ChannelGroupsManager needs the account list; the accounts panel
      // owns its own data fetch.
      const accts = await api.listYtAccounts().catch(() => []);
      setYtAccounts(accts || []);
    } catch (e) {
      setError(e.message || "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Probe OAuth configuration once (drives the "not configured" warning).
  useEffect(() => {
    api.oauthStatus()
      .then((s) => setOauthState({ configured: !!s.configured, checked: true }))
      .catch(() => setOauthState({ configured: false, checked: true }));
  }, []);

  // Refresh the account list when the OAuth callback popup reports a new
  // connection (so a freshly-linked account shows up in the groups picker).
  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (!data || data.type !== "yt_oauth") return;
      if (data.status === "connected") {
        setNotice(data.message || "Channel connected.");
        setError("");
        load();
      } else {
        setError(data.message || "Connection failed.");
        setNotice("");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Youtube className="text-red-500" size={24} /> Account
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            The channels you publish to. Each carries its own logo, watermark and social links.
            {" "}Looking for writing-voice study channels? They now live in{" "}
            <strong className="text-gray-300">Insights → SEO Settings → Competitors</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="p-2 text-gray-400 hover:text-white"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Unique YouTube accounts — the real destinations */}
      <YouTubeAccountsPanel oauthConfigured={oauthState.configured} onRefresh={load} />

      {/* Channel groups — user-defined presets for publish fan-out */}
      <ChannelGroupsManager ytAccounts={ytAccounts} />

      {/* Postiz 3rd-party delivery (admin) — paste key + bind channels */}
      <PostizDeliveryPanel />

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="bg-green-950/40 border border-green-900 text-green-300 px-3 py-2 rounded text-sm mb-4 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {oauthState.checked && !oauthState.configured && (
        <div className="bg-yellow-950/30 border border-yellow-900 text-yellow-300 px-3 py-2 rounded text-xs mb-4 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            YouTube OAuth is <strong>not configured</strong>. Set <code className="bg-black/40 px-1 rounded">YOUTUBE_CLIENT_ID</code> and
            <code className="bg-black/40 px-1 rounded ml-1">YOUTUBE_CLIENT_SECRET</code> in the backend <code className="bg-black/40 px-1 rounded">.env</code> file,
            then restart to enable the Connect buttons.
          </span>
        </div>
      )}
    </div>
  );
}
