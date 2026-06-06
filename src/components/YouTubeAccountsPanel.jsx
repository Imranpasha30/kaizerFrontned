import React, { useEffect, useRef, useState } from "react";
import {
  Youtube, Plus, CheckCircle2, Loader2, RefreshCw, AlertCircle, Users,
  Image as ImageIcon, X, Unlink, Trash2,
} from "lucide-react";
import { api } from "../api/client";
import LogoPicker from "./LogoPicker";

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
  // Per-account refresh spinner: { [google_channel_id]: true } while pulling
  const [refreshingIds, setRefreshingIds] = useState({});
  // Per-account disconnect spinner: { [primary_profile_id]: true } while
  // calling DELETE /api/youtube/oauth/{id}
  const [disconnectingIds, setDisconnectingIds] = useState({});
  // Per-destination toggle spinner: { "<profile_id>:<gci>": true } while
  // calling PATCH /channels/{id}/destinations/{gci}
  const [togglingIds, setTogglingIds] = useState({});
  // Logo editor modal state — which YT account is being edited
  const [logoAcc, setLogoAcc]     = useState(null);        // the acc object or null
  const [logoValue, setLogoValue] = useState(null);        // pending asset id (or null)
  const [logoSaving, setLogoSaving] = useState(false);

  // Brand / watermark / socials modal state.
  const [brandAcc, setBrandAcc]   = useState(null);
  const [wmText, setWmText]       = useState("");
  const [wmOp, setWmOp]           = useState(0.35);
  const [wmPos, setWmPos]         = useState("top-right");
  const [socials, setSocials]     = useState({});
  const [brandSaving, setBrandSaving] = useState(false);

  function openBrandEditor(acc) {
    setBrandAcc(acc);
    setWmText(acc.watermark_text || "");
    setWmOp(acc.watermark_opacity ?? 0.35);
    setWmPos(acc.watermark_position || "top-right");
    setSocials(acc.socials || {});
  }
  function closeBrandEditor() { setBrandAcc(null); }
  async function saveBrand() {
    if (!brandAcc?.primary_profile_id) { closeBrandEditor(); return; }
    setBrandSaving(true);
    try {
      await api.updateChannel(brandAcc.primary_profile_id, {
        watermark_text: wmText,
        watermark_opacity: wmOp,
        watermark_position: wmPos,
        socials,
      });
      closeBrandEditor();
      await load();
    } catch (e) {
      setError(e.message || "Failed to save brand settings");
    } finally {
      setBrandSaving(false);
    }
  }
  const popupRef = useRef(null);

  function openLogoEditor(acc) {
    setLogoAcc(acc);
    setLogoValue(acc.logo_asset_id ?? null);
  }
  function closeLogoEditor() { setLogoAcc(null); setLogoValue(null); }

  async function saveLogo() {
    if (!logoAcc?.primary_profile_id) { closeLogoEditor(); return; }
    setLogoSaving(true);
    try {
      await api.setYtAccountLogo(logoAcc.primary_profile_id, logoValue);
      closeLogoEditor();
      await load();
    } catch (e) {
      setError(e.message || "Failed to save logo");
    } finally {
      setLogoSaving(false);
    }
  }

  async function handleAccountRefresh(acc) {
    if (!acc?.primary_profile_id) return;
    const key = acc.google_channel_id || String(acc.primary_profile_id);
    setRefreshingIds((m) => ({ ...m, [key]: true }));
    setError("");
    try {
      const fresh = await api.refreshYtAccount(acc.primary_profile_id);
      // Merge fresh metadata into the account row in-place
      setAccounts((list) => list.map((a) => (
        (a.google_channel_id && a.google_channel_id === fresh.google_channel_id)
          ? { ...a, ...fresh, youtube_channel_title: fresh.youtube_channel_title }
          : a
      )));
      setNotice(`Updated ${fresh.youtube_channel_title}.`);
    } catch (e) {
      setError(e.message || "Refresh failed");
    } finally {
      setRefreshingIds((m) => { const n = { ...m }; delete n[key]; return n; });
    }
  }

  // Toggle one Brand Account (sibling destination) on/off as a publish
  // target for the primary profile that owns this Google OAuth token.
  async function handleToggleDestination(acc, dest, nextEnabled) {
    if (!acc?.primary_profile_id || !dest?.google_channel_id) return;
    const key = `${acc.primary_profile_id}:${dest.google_channel_id}`;
    setTogglingIds((m) => ({ ...m, [key]: true }));
    setError(""); setNotice("");
    // Optimistic UI update — flip the local row immediately so the
    // user sees feedback before the round-trip resolves.
    setAccounts((list) => list.map((a) => (
      a.primary_profile_id === acc.primary_profile_id
        ? {
            ...a,
            available_destinations: (a.available_destinations || []).map((d) =>
              d.google_channel_id === dest.google_channel_id
                ? { ...d, enabled: nextEnabled }
                : d
            ),
          }
        : a
    )));
    try {
      await api.toggleProfileDestination(
        acc.primary_profile_id,
        dest.google_channel_id,
        nextEnabled,
      );
      setNotice(`${nextEnabled ? "Enabled" : "Disabled"} ${dest.title || dest.google_channel_id} as a publish destination.`);
    } catch (e) {
      // Roll back optimistic update on failure
      setAccounts((list) => list.map((a) => (
        a.primary_profile_id === acc.primary_profile_id
          ? {
              ...a,
              available_destinations: (a.available_destinations || []).map((d) =>
                d.google_channel_id === dest.google_channel_id
                  ? { ...d, enabled: !nextEnabled }
                  : d
              ),
            }
          : a
      )));
      setError(e.message || "Failed to update destination");
    } finally {
      setTogglingIds((m) => { const n = { ...m }; delete n[key]; return n; });
    }
  }

  async function handleDisconnect(acc) {
    if (!acc?.primary_profile_id) return;
    const channelTitle = acc.youtube_channel_title || "this YouTube account";
    const confirmed = window.confirm(
      `Disconnect ${channelTitle}?\n\n` +
      `Kaizer News will stop being able to upload to this channel. ` +
      `Pending or scheduled uploads to it will fail until you re-authorise. ` +
      `For complete revocation, also remove access at ` +
      `https://myaccount.google.com/permissions.\n\n` +
      `Continue?`
    );
    if (!confirmed) return;

    const id = acc.primary_profile_id;
    setDisconnectingIds((m) => ({ ...m, [id]: true }));
    setError("");
    setNotice("");
    try {
      await api.disconnectYtAccount(id);
      setNotice(`Disconnected ${channelTitle}. Refresh token revoked.`);
      await load();
      onRefresh?.();
    } catch (e) {
      setError(e.message || "Disconnect failed");
    } finally {
      setDisconnectingIds((m) => { const n = { ...m }; delete n[id]; return n; });
    }
  }

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
          {/*
            Most users instinctively pick a Brand Account row in
            Google's picker, which limits OAuth to that single
            channel. Picking the parent Gmail instead returns ALL
            Brand Accounts in one grant — that's what populates the
            multi-channel picker per card. This hint nudges them to
            do the right thing.
          */}
          <p className="text-[11px] text-yellow-400/80 mt-1.5 leading-relaxed">
            <strong>Tip:</strong> in Google's picker, pick your Gmail
            (the parent account) to connect all your Brand Accounts in
            <strong> one click</strong>. Picking a Brand row only
            connects that single channel.
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
          {accounts.map((acc) => {
            const key = acc.google_channel_id || acc.youtube_channel_title;
            const refreshing = !!refreshingIds[key];
            const fmtN = (n) => {
              if (!n || n < 1000) return String(n || 0);
              if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + "K";
              if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + "M";
              return (n / 1e9).toFixed(1) + "B";
            };
            return (
              <div
                key={key}
                className="bg-[#0c0c0c] border border-green-900/40 rounded-lg p-3"
              >
                <div className="flex items-start gap-2 mb-2">
                  {acc.thumbnail_url ? (
                    <img
                      src={acc.thumbnail_url}
                      alt={acc.youtube_channel_title}
                      className="w-9 h-9 rounded-full flex-shrink-0 object-cover bg-black/40"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <Youtube size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-green-300 truncate" title={acc.youtube_channel_title}>
                      {acc.youtube_channel_title}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {acc.custom_url || acc.google_channel_id || "(no id)"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAccountRefresh(acc)}
                    disabled={refreshing || !acc.primary_profile_id}
                    title="Pull latest channel info from YouTube (run this after you renamed your channel or changed your avatar)"
                    className="p-1 text-gray-500 hover:text-accent2 disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                  </button>
                  <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                </div>

                {/* Cached stats row — served from DB, no YT API call */}
                {(acc.subscriber_count > 0 || acc.video_count > 0 || acc.view_count > 0) && (
                  <div className="flex gap-3 text-[10px] text-gray-400 mb-2">
                    <span title="Subscribers">
                      <strong className="text-gray-200">{fmtN(acc.subscriber_count)}</strong> subs
                    </span>
                    <span title="Videos on this channel">
                      <strong className="text-gray-200">{fmtN(acc.video_count)}</strong> videos
                    </span>
                    <span title="Lifetime views">
                      <strong className="text-gray-200">{fmtN(acc.view_count)}</strong> views
                    </span>
                  </div>
                )}

                {/* Video-overlay logo — logo belongs to the real YT account,
                    not to style-template profiles.  Click to open picker. */}
                <div className="flex items-center gap-2 mb-2 p-1.5 rounded border border-border bg-black/30">
                  {acc.logo?.url ? (
                    <img
                      src={acc.logo.thumb_url || acc.logo.url}
                      alt="logo"
                      className="w-8 h-8 rounded object-contain bg-black/40"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-8 h-8 rounded border border-border bg-black/50 flex items-center justify-center text-gray-600">
                      <ImageIcon size={14} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">Video overlay logo</div>
                    <div className="text-[11px] text-gray-300 truncate">
                      {acc.logo?.filename || <span className="text-gray-500 italic">No logo — videos render with no overlay</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => openLogoEditor(acc)}
                    className="text-[10px] text-accent2 hover:text-accent underline underline-offset-2"
                    title="Set or change this account's overlay logo"
                  >
                    {acc.logo?.url ? "change" : "set"}
                  </button>
                </div>

                {/* Per-YT-account upload route. Optimistic update —
                    we flip the local row immediately, then send the
                    PATCH; on failure we revert + surface the error. */}
                <div className="flex items-center gap-2 mb-2 p-1.5 rounded border border-border bg-black/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">Upload via</div>
                    <div className="text-[11px] text-gray-500">
                      {!acc.upload_provider && "Inherits system default (Admin → Settings)"}
                      {acc.upload_provider === "postiz" && "Always Postiz (cross-platform)"}
                      {acc.upload_provider === "kaizer" && "Always Native YouTube (OAuth direct)"}
                      {acc.upload_provider === "native_rtmp" && "Always Native RTMP live (quota-friendly past-stream)"}
                    </div>
                  </div>
                  <select
                    value={acc.upload_provider || ""}
                    onChange={async (e) => {
                      if (!acc.primary_profile_id) return;
                      const next = e.target.value || null;
                      const prev = acc.upload_provider || null;
                      // Optimistic flip
                      setAccounts((list) => list.map((a) => (
                        a.primary_profile_id === acc.primary_profile_id
                          ? { ...a, upload_provider: next }
                          : a
                      )));
                      setError(""); setNotice("");
                      try {
                        await api.setYtAccountUploadProvider(acc.primary_profile_id, next);
                        setNotice(`Upload route for ${acc.youtube_channel_title || "this account"} → ${next || "system default"}.`);
                      } catch (err) {
                        // Revert on failure
                        setAccounts((list) => list.map((a) => (
                          a.primary_profile_id === acc.primary_profile_id
                            ? { ...a, upload_provider: prev }
                            : a
                        )));
                        setError(err.message || "Failed to set upload route");
                      }
                    }}
                    className="bg-black/40 border border-border rounded px-1.5 py-1 text-[11px] text-gray-200 focus:border-accent2 focus:outline-none"
                    title="Where uploads for this YouTube account should go"
                  >
                    <option value="">System default</option>
                    <option value="postiz">Postiz</option>
                    <option value="kaizer">Native YouTube</option>
                    <option value="native_rtmp">Native RTMP-live (~6× quota savings)</option>
                  </select>
                </div>

                {/* Brand Accounts on this Google login — multi-channel
                    picker. Populated by exchange_code at OAuth time so
                    every Brand Account the email owns appears here as
                    a toggleable publish destination. The primary
                    channel itself is intentionally excluded (it's the
                    card heading; can't be turned off without
                    disconnecting the whole OAuth). */}
                {acc.available_destinations
                  && acc.available_destinations.filter(d => !d.is_primary).length > 0 && (
                  <div className="border-t border-border/60 pt-2 mb-2">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Users size={10} />
                      Brand accounts on this Google login
                    </div>
                    <div className="space-y-1">
                      {acc.available_destinations
                        .filter(d => !d.is_primary)
                        .map(d => {
                          const tKey = `${acc.primary_profile_id}:${d.google_channel_id}`;
                          const busy = !!togglingIds[tKey];
                          return (
                            <div key={d.google_channel_id}
                                 className="flex items-center gap-2 p-1.5 rounded bg-black/30 border border-border/40">
                              {d.thumbnail_url ? (
                                <img src={d.thumbnail_url}
                                     className="w-6 h-6 rounded-full bg-black/40 object-cover flex-shrink-0"
                                     alt={d.title}
                                     onError={(e) => { e.target.style.display = "none"; }} />
                              ) : (
                                <Youtube size={12} className="text-red-500/70 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] text-gray-200 truncate" title={d.title}>
                                  {d.title || d.google_channel_id}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate">
                                  {fmtN(d.subscriber_count)} subs · {fmtN(d.video_count)} videos
                                </div>
                              </div>
                              <label
                                className={`inline-flex items-center cursor-pointer flex-shrink-0 ${busy ? 'opacity-50 cursor-wait' : ''}`}
                                title={d.enabled ? "Disable as publish destination" : "Enable as publish destination"}
                              >
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={!!d.enabled}
                                  disabled={busy}
                                  onChange={(e) => handleToggleDestination(acc, d, e.target.checked)}
                                />
                                <div className={`w-9 h-5 ${d.enabled ? 'bg-green-600' : 'bg-gray-700'} rounded-full relative transition-colors`}>
                                  <div className={`absolute top-0.5 ${d.enabled ? 'left-[1.125rem]' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`}></div>
                                </div>
                              </label>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

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
                  <div className="text-[10px] text-gray-600 mt-2 flex items-center gap-2 flex-wrap">
                    {acc.connected_at && (
                      <span>Linked {new Date(acc.connected_at).toLocaleDateString()}</span>
                    )}
                    {acc.metadata_cached_at && (
                      <span className="text-gray-700" title="Last time this card's info was refreshed from YouTube">
                        · cached {new Date(acc.metadata_cached_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {/* Brand stamp + socials — per-account watermark text
                      and social-link footer applied at upload time. */}
                  <button
                    type="button"
                    onClick={() => openBrandEditor(acc)}
                    disabled={!acc.primary_profile_id}
                    title="Per-channel watermark + social links injected at publish time"
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-accent2 hover:text-white hover:bg-accent2/10 border border-accent2/40 hover:border-accent2/70 rounded-md py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✦ Brand &amp; socials
                    {(acc.watermark_text || Object.values(acc.socials || {}).some(Boolean)) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Configured" />
                    )}
                  </button>

                  {/* Disconnect — required by Google's policy that users
                      can withdraw OAuth access in-app. Calls
                      DELETE /api/youtube/oauth/{channel_id} which clears
                      our refresh_token_enc so we can no longer mint
                      access tokens. Confirm dialog warns that pending
                      uploads will fail. */}
                  <button
                    type="button"
                    onClick={() => handleDisconnect(acc)}
                    disabled={!!disconnectingIds[acc.primary_profile_id] || !acc.primary_profile_id}
                    title="Revoke Kaizer's access to this YouTube account"
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/5 border border-red-900/40 hover:border-red-800/60 rounded-md py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {disconnectingIds[acc.primary_profile_id]
                      ? <><Loader2 size={11} className="animate-spin" /> Disconnecting…</>
                      : <><Unlink size={11} /> Disconnect</>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Brand stamp + per-account socials modal */}
      {brandAcc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 overflow-y-auto py-6"
          onClick={closeBrandEditor}
        >
          <div
            className="bg-[#0c0c0c] border border-border rounded-lg p-5 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-100">
                Brand &amp; socials — <span className="text-green-300">{brandAcc.youtube_channel_title || brandAcc.name}</span>
              </h3>
              <button onClick={closeBrandEditor} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-4 leading-snug">
              Watermark is stamped on the video at upload time (using this account's logo + the
              text below). Socials get appended to the YouTube description footer — each account
              gets its own @handles so the reach goes to the right audience.
            </p>

            {/* Live watermark preview */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Live preview</div>
              {(() => {
                // Logo: fixed top-right at full opacity (it's the channel
                // bug, separate from the text watermark). The watermark
                // text floats in one of four mid bands: upper-center,
                // lower-center, center-left, center-right. Corners stay
                // reserved for the logo so the two never collide.
                const W = 320, H = 180;
                const logoUrl = brandAcc.logo?.url || null;
                const bugSize = 28;
                const bugM = 6;
                const textW = Math.max(40, Math.min(180, (wmText || "  ").length * 7 + 18));
                const textH = 22;
                let tx, ty;
                if (wmPos === "upper-center")      { tx = (W - textW) / 2; ty = H / 4 - textH / 2; }
                else if (wmPos === "lower-center") { tx = (W - textW) / 2; ty = H * 3 / 4 - textH / 2; }
                else if (wmPos === "center-left")  { tx = bugM + 6;          ty = (H - textH) / 2; }
                else if (wmPos === "center-right") { tx = W - textW - bugM - 6; ty = (H - textH) / 2; }
                else                                { tx = (W - textW) / 2; ty = H * 3 / 4 - textH / 2; }
                const op = Math.max(0.05, Math.min(1, wmOp || 0.35));
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-video rounded border border-border bg-black">
                    <defs>
                      <linearGradient id="ytapvid" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#1a1a1a" />
                        <stop offset="100%" stopColor="#2a2a2a" />
                      </linearGradient>
                    </defs>
                    <rect x="0" y="0" width={W} height={H} fill="url(#ytapvid)" />
                    <text x={W / 2} y={H / 2 + 4} fill="rgba(255,255,255,.15)" fontSize="12" textAnchor="middle">video frame</text>

                    {/* Channel logo bug — always top-right, full opacity */}
                    {logoUrl ? (
                      <image
                        href={logoUrl}
                        x={W - bugSize - bugM} y={bugM}
                        width={bugSize} height={bugSize}
                        preserveAspectRatio="xMidYMid meet"
                      />
                    ) : (
                      <rect
                        x={W - bugSize - bugM} y={bugM}
                        width={bugSize} height={bugSize}
                        fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.15)" strokeDasharray="2 2"
                      />
                    )}

                    {/* Text watermark — mid-band placement, alpha = opacity slider */}
                    {wmText && (
                      <g opacity={op}>
                        <rect x={tx} y={ty} width={textW} height={textH} fill="rgba(0,0,0,0.45)" rx="2" />
                        <text x={tx + textW / 2} y={ty + textH / 2 + 4} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle">
                          {wmText.slice(0, 22)}
                        </text>
                      </g>
                    )}
                  </svg>
                );
              })()}
              <div className="text-[10px] text-gray-600 mt-1 space-y-0.5">
                <div>Logo: <span className="text-gray-400">top-right · always full opacity</span></div>
                <div>Watermark text: <span className="text-gray-400">{wmPos} · {Math.round(wmOp * 100)}% opacity</span></div>
                {!brandAcc.logo?.url && (
                  <div className="text-amber-500/70">No logo set yet — use the "change" link on the card to add one.</div>
                )}
              </div>
            </div>

            {/* Watermark fields */}
            <div className="mb-4 p-3 rounded border border-border bg-black/30 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Watermark</div>
              <label className="block">
                <div className="text-[10px] text-gray-500 mb-1">Text (leave blank for logo-only)</div>
                <input
                  type="text"
                  value={wmText}
                  maxLength={30}
                  onChange={(e) => setWmText(e.target.value)}
                  placeholder="e.g. Cyber Sphere"
                  className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-xs text-gray-200"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[10px] text-gray-500 mb-1">Opacity ({Math.round(wmOp * 100)}%)</div>
                  <input type="range" min={0.05} max={1} step={0.05}
                    value={wmOp}
                    onChange={(e) => setWmOp(parseFloat(e.target.value))}
                    className="w-full" />
                </label>
                <label className="block">
                  <div className="text-[10px] text-gray-500 mb-1">Position</div>
                  <select
                    value={wmPos}
                    onChange={(e) => setWmPos(e.target.value)}
                    className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-xs text-gray-200"
                  >
                    <option value="upper-center">Upper center</option>
                    <option value="lower-center">Lower center</option>
                    <option value="center-left">Center left</option>
                    <option value="center-right">Center right</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Per-account socials */}
            <div className="p-3 rounded border border-border bg-black/30">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Social links (injected into description)</div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {[
                  ["youtube",   "YouTube",     "@yourchannel"],
                  ["instagram", "Instagram",   "@handle"],
                  ["twitter",   "X / Twitter", "@handle"],
                  ["facebook",  "Facebook",    "facebook.com/page"],
                  ["tiktok",    "TikTok",      "@handle"],
                  ["threads",   "Threads",     "@handle"],
                  ["whatsapp",  "WhatsApp",    "whatsapp.com/channel/…"],
                  ["telegram",  "Telegram",    "t.me/yourchannel"],
                  ["linkedin",  "LinkedIn",    "linkedin.com/in/…"],
                  ["website",   "Website",     "https://example.com"],
                  ["email",     "Email",       "you@example.com"],
                ].map(([key, label, ph]) => (
                  <label key={key} className="grid grid-cols-[110px,1fr] items-center gap-2">
                    <span className="text-[11px] text-gray-400">{label}</span>
                    <input
                      type="text"
                      value={socials[key] || ""}
                      onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder={ph}
                      className="w-full bg-black/60 border border-border rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={closeBrandEditor}
                className="btn btn-secondary text-xs py-1 px-3"
                disabled={brandSaving}
              >Cancel</button>
              <button
                onClick={saveBrand}
                disabled={brandSaving}
                className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-50"
              >
                {brandSaving ? (<><Loader2 size={11} className="animate-spin" /> saving…</>) : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo editor modal — overlay for the YT account being edited */}
      {logoAcc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3"
          onClick={closeLogoEditor}
        >
          <div
            className="bg-[#0c0c0c] border border-border rounded-lg p-4 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-100">
                Overlay logo — <span className="text-green-300">{logoAcc.youtube_channel_title}</span>
              </h3>
              <button onClick={closeLogoEditor} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Videos rendered for this YouTube account will get this logo overlaid.
              Leave empty for no overlay.
            </p>
            <LogoPicker
              value={logoValue}
              onChange={setLogoValue}
              initialPreview={
                logoAcc.logo?.url
                  ? { url: logoAcc.logo.url, filename: logoAcc.logo.filename }
                  : null
              }
              currentChannelId={null}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={closeLogoEditor} className="btn btn-secondary text-xs py-1 px-3">
                Cancel
              </button>
              <button
                onClick={saveLogo}
                disabled={logoSaving}
                className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-50"
              >
                {logoSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
