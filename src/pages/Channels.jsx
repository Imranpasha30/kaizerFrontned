import React, { useEffect, useRef, useState } from "react";
import {
  Plus, Edit2, Trash2, Youtube, Star, Loader2,
  AlertCircle, CheckCircle2, RefreshCw, Link as LinkIcon, Unlink,
  Brain, X, CheckSquare, Square, Palette, Info, Image as ImageIcon,
} from "lucide-react";
import LogoPicker from "../components/LogoPicker";
import { api } from "../api/client";
import Modal from "../components/Modal";
import ChannelForm from "../components/ChannelForm";
import YouTubeAccountsPanel from "../components/YouTubeAccountsPanel";
import PostizDeliveryPanel from "../components/PostizDeliveryPanel";
import ChannelGroupsManager from "../components/ChannelGroupsManager";

export default function Channels() {
  // Two-tab layout: "accounts" = real YouTube accounts we publish to,
  // "styles" = style references (Gemini SEO templates that never
  // upload anywhere). Defaults to "accounts" because that's what
  // most users come here for; URL hash #styles deep-links to the
  // style-references tab so docs / onboarding emails can drop a
  // direct link.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash === "#styles") return "styles";
    return "accounts";
  });
  const [channels, setChannels]   = useState([]);   // SEO style references (connected:false)
  const [accountsChannels, setAccountsChannels] = useState([]); // connected accounts (for tab count)
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState("");
  const [notice,   setNotice]     = useState("");
  const [modal,    setModal]      = useState(null);
  // modal = null | { mode: "create" } | { mode: "edit", channel }
  const [oauthState, setOauthState] = useState({ configured: false, checked: false });
  const [connectingId, setConnectingId] = useState(null);
  const [learningId,   setLearningId]   = useState(null);
  const [corpora,      setCorpora]      = useState({}); // {channelId: {refreshed_at, sample_size}}
  const [selected,     setSelected]     = useState(() => new Set());
  const [bulkBusy,     setBulkBusy]     = useState(false);
  const [ytAccounts,   setYtAccounts]   = useState([]);   // [{google_channel_id, youtube_channel_title, …}]
  const popupRef = useRef(null);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(channels.map((c) => c.id)));
  }
  function clearSelection() { setSelected(new Set()); }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const anyConnected = channels.some((c) => selected.has(c.id) && c.connected);
    const msg = anyConnected
      ? `Delete ${selected.size} channel(s)?\n\nConnected channels will also have their YouTube tokens revoked.`
      : `Delete ${selected.size} channel(s)?`;
    if (!confirm(msg)) return;
    setBulkBusy(true);
    setError(""); setNotice("");
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => api.deleteChannel(id)));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      setError(`Deleted ${ids.length - failed.length}/${ids.length}. ${failed.length} failed: ${failed[0].reason?.message || "unknown"}`);
    } else {
      setNotice(`Deleted ${ids.length} channel(s).`);
    }
    clearSelection();
    setBulkBusy(false);
    load();
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      // Two kind-scoped fetches so connected accounts can NEVER leak into
      // the SEO Settings (style references) tab. `styles` feeds the
      // ChannelForm + style-reference grid; `accounts` is only used for
      // the YouTube Accounts tab count (the panel itself owns its data).
      const [styleList, acctList, accts] = await Promise.all([
        api.listChannels({ kind: "styles" }),
        api.listChannels({ kind: "accounts" }),
        api.listYtAccounts().catch(() => []),
      ]);
      setChannels(styleList || []);
      setAccountsChannels(acctList || []);
      setYtAccounts(accts || []);
    } catch (e) {
      setError(e.message || "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Probe OAuth configuration once
  useEffect(() => {
    api.oauthStatus()
      .then((s) => setOauthState({ configured: !!s.configured, checked: true }))
      .catch(() => setOauthState({ configured: false, checked: true }));
  }, []);

  // Listen for the postMessage from the OAuth callback page
  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (!data || data.type !== "yt_oauth") return;
      setConnectingId(null);
      if (data.status === "connected") {
        setNotice(data.message || "Channel connected.");
        setError("");
        load();
      } else {
        setError(data.message || "Connection failed.");
        setNotice("");
      }
      try { popupRef.current?.close(); } catch {}
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function handleConnect(ch) {
    setError("");
    setNotice("");
    if (!oauthState.configured) {
      setError("YouTube OAuth is not configured on the server. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env, then restart the backend.");
      return;
    }
    try {
      setConnectingId(ch.id);
      const { auth_url } = await api.oauthAuthorize(ch.id);
      const w = window.open(auth_url, "kaizer_yt_oauth",
        "width=560,height=720,menubar=no,toolbar=no,location=yes");
      if (!w) {
        setConnectingId(null);
        setError("Popup was blocked — allow popups for this site and retry.");
        return;
      }
      popupRef.current = w;
    } catch (e) {
      setConnectingId(null);
      setError(e.message);
    }
  }

  async function loadCorpus(channelId) {
    try {
      const c = await api.getChannelCorpus(channelId);
      setCorpora((prev) => ({ ...prev, [channelId]: c }));
    } catch { /* non-fatal */ }
  }

  // Load corpus metadata for connected channels when the list refreshes
  useEffect(() => {
    channels.filter((c) => c.connected).forEach((c) => loadCorpus(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map((c) => `${c.id}:${c.connected}`).join(",")]);

  async function handleLearn(ch) {
    setError("");
    setNotice("");
    try {
      setLearningId(ch.id);
      await api.learnChannel(ch.id);
      setNotice(`Learning patterns for "${ch.name}"… this runs in the background (usually under 15s).`);
      // Poll for completion up to 60s
      const startedAt = corpora[ch.id]?.refreshed_at || null;
      const until = Date.now() + 60_000;
      const iv = setInterval(async () => {
        try {
          const c = await api.getChannelCorpus(ch.id);
          if (c?.refreshed_at && c.refreshed_at !== startedAt) {
            setCorpora((prev) => ({ ...prev, [ch.id]: c }));
            clearInterval(iv);
            setLearningId(null);
            const n = (c.payload && c.payload.sample_size) || 0;
            setNotice(`"${ch.name}" learned patterns from top ${n} videos.`);
          } else if (Date.now() > until) {
            clearInterval(iv);
            setLearningId(null);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) {
      setLearningId(null);
      setError(e.message);
    }
  }

  async function handleDisconnect(ch) {
    if (!confirm(`Unlink YouTube from "${ch.name}" profile?\n\nYour YouTube account (${ch.youtube_channel_title || "connected account"}) will be disconnected. The style profile stays; you can re-link later.`)) return;
    try {
      await api.oauthDisconnect(ch.id);
      setNotice(`${ch.name} disconnected.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCreate(payload) {
    await api.createChannel(payload);
    setModal(null);
    load();
  }

  async function handleUpdate(payload) {
    if (!modal?.channel?.id) return;
    await api.updateChannel(modal.channel.id, payload);
    setModal(null);
    load();
  }

  async function handleDelete(ch) {
    const confirmMsg = ch.connected
      ? `Delete the "${ch.name}" style profile?\n\nThis also unlinks your YouTube account (${ch.youtube_channel_title || ""}) from this profile. Your actual YouTube channel is NOT affected — only this app's permission is revoked.`
      : `Delete the "${ch.name}" style profile?`;
    if (!confirm(confirmMsg)) return;
    try {
      await api.deleteChannel(ch.id);
      setChannels((prev) => prev.filter((c) => c.id !== ch.id));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            {activeTab === "accounts"
              ? <><Youtube className="text-red-500" size={24} /> YouTube Accounts</>
              : <><Palette className="text-accent2" size={24} /> SEO Settings</>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === "accounts"
              ? <>The channels you publish to. Each carries its own logo, watermark and social links.</>
              : <>Competitor channels we study to write your titles &amp; descriptions in their style — never published to.</>}
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
          {activeTab === "styles" && (
            <button
              onClick={() => setModal({ mode: "create" })}
              className="bg-accent hover:bg-accent2 text-white text-sm font-medium px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
            >
              <Plus size={14} /> Add Competitor
            </button>
          )}
        </div>
      </header>

      {/* Tab bar — splits the two concerns that used to be mixed:
          (1) connecting our own YouTube accounts where we PUBLISH,
          (2) style references for SEO that teach Gemini to write in
              other channels' voices but never upload anywhere. Mixing
              them on one page made users connect TV9 Telugu thinking
              they'd publish to TV9 — they can't, no one outside Google
              can. Tabs make the boundary obvious. */}
      <div className="flex border-b border-border mb-5">
        <button
          onClick={() => setActiveTab("accounts")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 -mb-px border-b-2 ${
            activeTab === "accounts"
              ? "text-red-300 border-red-500"
              : "text-gray-500 border-transparent hover:text-gray-300"
          }`}
        >
          <Youtube size={14} />
          YouTube Accounts
          <span className="ml-1 text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-gray-400">
            {ytAccounts?.length || 0}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("styles")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 -mb-px border-b-2 ${
            activeTab === "styles"
              ? "text-accent2 border-accent2"
              : "text-gray-500 border-transparent hover:text-gray-300"
          }`}
        >
          <Palette size={14} />
          SEO Settings
          <span className="ml-1 text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-gray-400">
            {channels?.length || 0}
          </span>
        </button>
      </div>

      {activeTab === "accounts" && (
        <>
          {/* Unique YouTube accounts — the real destinations */}
          <YouTubeAccountsPanel oauthConfigured={oauthState.configured} onRefresh={load} />

          {/* Channel groups — user-defined presets for publish fan-out */}
          <ChannelGroupsManager ytAccounts={ytAccounts} />

          {/* Postiz 3rd-party delivery (admin) — paste key + bind channels */}
          <PostizDeliveryPanel />
        </>
      )}

      {activeTab === "styles" && (
        <div className="mb-5 p-3 bg-blue-950/20 border border-blue-900/40 rounded text-xs text-gray-300 leading-relaxed">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-300">How SEO Settings work:</strong>{" "}
              Add a <strong className="text-gray-100">competitor channel</strong> ("TV9 Telugu", "RTV", etc.), set its
              title formula &amp; description style, then click <strong className="text-gray-100">Learn</strong> to mine
              its style. We use it to write your titles, descriptions, and hashtags in that channel's voice — the video
              still uploads to <strong className="text-gray-100">your own YouTube Account</strong>, picked in the publish
              modal. Competitor channels are never published to.
            </div>
          </div>
        </div>
      )}

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
      {activeTab === "styles" && selected.size > 0 && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-3 bg-[#1a0f0f]/95 backdrop-blur border-y border-red-900/50 flex items-center gap-3">
          <button
            onClick={clearSelection}
            className="p-1 text-gray-400 hover:text-white"
            title="Clear selection"
          >
            <X size={16} />
          </button>
          <span className="text-sm text-gray-200">
            <strong className="text-red-300">{selected.size}</strong> selected
          </span>
          <button
            onClick={selected.size === channels.length ? clearSelection : selectAll}
            className="text-xs text-gray-400 hover:text-white"
          >
            {selected.size === channels.length ? "Unselect all" : "Select all"}
          </button>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded flex items-center gap-1.5"
            >
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete Selected
            </button>
          </div>
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

      {activeTab === "styles" && (
        loading && channels.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading SEO settings…
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-12 text-center">
            <Palette size={40} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 mb-4">No competitors yet. Add one to write your SEO in its style (e.g. "TV9 Telugu", "RTV").</p>
            <button
              onClick={() => setModal({ mode: "create" })}
              className="bg-accent hover:bg-accent2 text-white text-sm px-4 py-2 rounded inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> Add Competitor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {channels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                selected={selected.has(ch.id)}
                onToggleSelect={() => toggleSelect(ch.id)}
                oauthConfigured={oauthState.configured}
                connecting={connectingId === ch.id}
                learning={learningId === ch.id}
                corpus={corpora[ch.id] || null}
                ytAccounts={ytAccounts}
                onSavedDestinations={() => load()}
                onConnect={() => handleConnect(ch)}
                onDisconnect={() => handleDisconnect(ch)}
                onLearn={() => handleLearn(ch)}
                onEdit={() => setModal({ mode: "edit", channel: ch })}
                onDelete={() => handleDelete(ch)}
              />
            ))}
          </div>
        )
      )}

      <Modal
        open={modal?.mode === "create"}
        onClose={() => setModal(null)}
        title="Add Competitor (SEO Settings)"
        size="lg"
      >
        <ChannelForm onSubmit={handleCreate} onCancel={() => setModal(null)} />
      </Modal>

      <Modal
        open={modal?.mode === "edit"}
        onClose={() => setModal(null)}
        title={`Edit Profile: ${modal?.channel?.name ?? ""}`}
        size="lg"
      >
        <ChannelForm
          initial={modal?.channel}
          onSubmit={handleUpdate}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  );
}


function ChannelCard({
  channel, onEdit, onDelete, onConnect, onDisconnect, onLearn,
  oauthConfigured, connecting, learning, corpus,
  selected, onToggleSelect, ytAccounts = [], onSavedDestinations,
}) {
  const tagCount = (channel.fixed_tags || []).length;
  const hashCount = (channel.hashtags || []).length;

  // Quick logo edit — inline modal instead of opening the full ChannelForm.
  const [logoOpen, setLogoOpen]       = React.useState(false);
  const [logoValue, setLogoValue]     = React.useState(channel.logo_asset_id ?? null);
  const [logoSaving, setLogoSaving]   = React.useState(false);
  React.useEffect(() => { setLogoValue(channel.logo_asset_id ?? null); }, [channel.logo_asset_id]);

  async function saveLogo() {
    if (logoValue === (channel.logo_asset_id ?? null)) { setLogoOpen(false); return; }
    setLogoSaving(true);
    try {
      await api.updateChannel(channel.id, { logo_asset_id: logoValue });
      onSavedDestinations?.();   // parent re-fetches channels
      setLogoOpen(false);
    } catch (e) {
      alert(e.message || "Failed to save logo");
    } finally {
      setLogoSaving(false);
    }
  }

  // Multi-select state for "Publishes to": starts from server-known allowed_destinations.
  const [allowed, setAllowed] = React.useState(
    new Set((channel.allowed_destinations || []).map(String))
  );
  const [savingDests, setSavingDests] = React.useState(false);
  React.useEffect(() => {
    setAllowed(new Set((channel.allowed_destinations || []).map(String)));
  }, [channel.allowed_destinations]);

  const primaryGci = channel.youtube_channel_id || "";
  const dirty = (() => {
    const a = Array.from(allowed).sort().join(",");
    const b = (channel.allowed_destinations || []).slice().sort().join(",");
    return a !== b;
  })();

  async function saveDests() {
    setSavingDests(true);
    try {
      await api.setProfileDestinations(channel.id, Array.from(allowed));
      onSavedDestinations?.();
    } catch (e) {
      alert(e.message || "Failed to save");
    } finally { setSavingDests(false); }
  }

  function toggleDest(gci) {
    // The primary destination (where the oauth_token lives) can't be removed —
    // server auto-adds it back, but we also reflect that in the UI.
    if (gci === primaryGci) return;
    setAllowed((prev) => {
      const n = new Set(prev);
      if (n.has(gci)) n.delete(gci); else n.add(gci);
      return n;
    });
  }

  return (
    <div className={`bg-surface border rounded-lg p-4 hover:border-accent/40 transition-colors flex flex-col ${
      selected ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border"
    }`}>
      <div className="flex items-start justify-between mb-2">
        <button
          onClick={onToggleSelect}
          className={`mr-2 mt-0.5 flex-shrink-0 ${selected ? "text-red-400" : "text-gray-500 hover:text-gray-200"}`}
          title={selected ? "Deselect" : "Select"}
        >
          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-semibold text-gray-100 truncate" title={channel.name}>
              {channel.name}
            </h3>
            {channel.is_priority && (
              <Star size={12} className="text-accent2 flex-shrink-0" title="Priority channel" />
            )}
          </div>
          {channel.handle && (
            <p className="text-xs text-gray-500 truncate">{channel.handle}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded"
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span className="uppercase tracking-wide">{channel.language}</span>
        <span>•</span>
        <span>{tagCount} tag{tagCount !== 1 ? "s" : ""}</span>
        <span>•</span>
        <span>{hashCount} hashtag{hashCount !== 1 ? "s" : ""}</span>
      </div>

      {channel.title_formula && (
        <p className="text-xs text-gray-400 bg-black/30 rounded px-2 py-1.5 mb-3 line-clamp-2 font-mono" title={channel.title_formula}>
          {channel.title_formula}
        </p>
      )}

      {/* Publishes to — many-to-many destination picker */}
      {ytAccounts.length > 0 && channel.connected && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 flex items-center justify-between">
            <span>Publishes to ({allowed.size})</span>
            {dirty && (
              <button
                onClick={saveDests}
                disabled={savingDests}
                className="text-[10px] text-accent2 hover:text-white disabled:opacity-50"
              >
                {savingDests ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {ytAccounts.map((a) => {
              const gci = a.google_channel_id;
              const isPrimary = gci === primaryGci;
              const isSel = allowed.has(String(gci));
              return (
                <button
                  key={gci}
                  onClick={() => toggleDest(String(gci))}
                  disabled={isPrimary}
                  title={isPrimary
                    ? "Primary destination — can't be removed"
                    : (isSel ? "Linked — click to unlink" : "Not linked — click to allow")}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    isSel
                      ? "bg-green-500/15 border-green-500/40 text-green-300"
                      : "bg-black/30 border-border text-gray-500 hover:text-gray-200"
                  } ${isPrimary ? "ring-1 ring-green-500/50" : ""}`}
                >
                  {a.youtube_channel_title}
                  {isPrimary && <span className="ml-1">★</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-1 leading-tight">
            ★ primary (cannot remove) · tick any account this style is good for.
          </p>
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-border flex items-center justify-between text-xs gap-2">
        {channel.connected ? (
          <span
            className="inline-flex items-center gap-1 text-green-400 truncate min-w-0"
            title={`Videos generated with this style will upload to your YouTube channel: ${channel.youtube_channel_title || "(unknown)"}`}
          >
            <Youtube size={12} className="flex-shrink-0" />
            <span className="text-gray-500">Uploads to:</span>
            <span className="truncate text-green-300">{channel.youtube_channel_title || "Your YT channel"}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-gray-500 flex-shrink-0">
            <LinkIcon size={12} /> No upload destination
          </span>
        )}
        {channel.connected ? (
          <button
            onClick={onDisconnect}
            disabled={connecting}
            title="Revoke access to your YouTube account"
            className="inline-flex items-center gap-1 text-gray-500 hover:text-red-400 flex-shrink-0 disabled:opacity-50"
          >
            <Unlink size={12} /> Unlink
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={!oauthConfigured || connecting}
            title={oauthConfigured
              ? "Sign in with Google to set YOUR YouTube channel as the upload destination for this style"
              : "Set YOUTUBE_CLIENT_ID + SECRET in .env first"}
            className={`inline-flex items-center gap-1 flex-shrink-0 ${
              oauthConfigured
                ? "text-accent2 hover:text-white"
                : "text-gray-600 cursor-not-allowed"
            } ${connecting ? "opacity-60" : ""}`}
          >
            {connecting
              ? <><Loader2 size={12} className="animate-spin" /> Opening…</>
              : <><Youtube size={12} /> Link my YT</>}
          </button>
        )}
      </div>

      {channel.connected && (
        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[11px] gap-2">
          <CorpusStatus corpus={corpus} learning={learning} />
          <button
            onClick={onLearn}
            disabled={learning}
            title="Mine top videos from this channel and extract patterns"
            className="inline-flex items-center gap-1 text-gray-500 hover:text-accent2 flex-shrink-0 disabled:opacity-50"
          >
            {learning
              ? <><Loader2 size={11} className="animate-spin" /> Learning…</>
              : <><Brain size={11} /> {corpus?.refreshed_at ? "Re-learn" : "Learn"}</>}
          </button>
        </div>
      )}

      {/* Brand stamp + per-channel socials modal — UI moved into
          YouTubeAccountsPanel (the "My accounts" tab) since style
          profiles are voice-only templates, not real publish targets. */}
      {false && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 overflow-y-auto py-6"
          onClick={() => setBrandOpen(false)}
        >
          <div
            className="bg-[#0c0c0c] border border-border rounded-lg p-5 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-100">
                Brand stamp & socials — <span className="text-accent2">{channel.name}</span>
              </h3>
              <button onClick={() => setBrandOpen(false)} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-4 leading-snug">
              Watermark is stamped on the video at upload time (using this channel's logo + the
              text below). Socials get appended to the YouTube description footer — each channel
              gets its own @handles so the reach goes to the right audience.
            </p>

            {/* Watermark live preview */}
            <WatermarkPreview
              text={wmText}
              opacity={wmOp}
              position={wmPos}
              logoUrl={channel.logo?.url || null}
            />

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
                  <input
                    type="range" min={0.05} max={1} step={0.05}
                    value={wmOp}
                    onChange={(e) => setWmOp(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </label>
                <label className="block">
                  <div className="text-[10px] text-gray-500 mb-1">Position</div>
                  <select
                    value={wmPos}
                    onChange={(e) => setWmPos(e.target.value)}
                    className="w-full bg-black/60 border border-border rounded px-2 py-1.5 text-xs text-gray-200"
                  >
                    <option value="top-left">Top-left</option>
                    <option value="top-right">Top-right</option>
                    <option value="bottom-left">Bottom-left</option>
                    <option value="bottom-right">Bottom-right</option>
                  </select>
                </label>
              </div>
              <p className="text-[10px] text-gray-600">
                Logo comes from this channel's overlay-logo upload (top of card).
              </p>
            </div>

            {/* Per-channel social links */}
            <div className="p-3 rounded border border-border bg-black/30">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Social links (injected into description)</div>
              <div className="space-y-1.5">
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
                onClick={() => setBrandOpen(false)}
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

      {/* Quick logo-edit modal — only the LogoPicker, no full channel form. */}
      {logoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3"
          onClick={() => setLogoOpen(false)}
        >
          <div
            className="bg-[#0c0c0c] border border-border rounded-lg p-4 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-100">
                Set logo — <span className="text-accent2">{channel.name}</span>
              </h3>
              <button onClick={() => setLogoOpen(false)} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <LogoPicker
              value={logoValue}
              onChange={setLogoValue}
              initialPreview={
                channel.logo?.url ? { url: channel.logo.url, filename: channel.logo.filename } : null
              }
              currentChannelId={channel.id}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setLogoOpen(false)}
                className="btn btn-secondary text-xs py-1 px-3"
              >
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
    </div>
  );
}

function CorpusStatus({ corpus, learning }) {
  if (learning) {
    return <span className="text-gray-500">Analyzing top videos…</span>;
  }
  if (!corpus || !corpus.refreshed_at) {
    return <span className="text-gray-600">No patterns learned yet</span>;
  }
  const sample = corpus.payload?.sample_size || 0;
  const age = timeAgo(corpus.refreshed_at);
  return (
    <span className="text-gray-500 truncate" title={`Learned from top ${sample} videos · ${corpus.refreshed_at}`}>
      <Brain size={10} className="inline -mt-0.5 mr-1 text-accent2" />
      {sample} videos · {age}
    </span>
  );
}

function timeAgo(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  } catch { return ""; }
}


// Live watermark preview — mock 16:9 frame with the translucent plate
// in the chosen corner. Updates as the user types text / drags opacity
// / switches position. Matches the backend's _render_plate_png sizing
// (~18% of width, 6% of height) so what the user sees here is what
// lands on the uploaded MP4.
function WatermarkPreview({ text, opacity, position, logoUrl }) {
  const W = 320, H = 180;
  const plateW = Math.max(64, Math.round(W * 0.18));
  const plateH = Math.max(20, Math.round(H * 0.10));
  const MARGIN = 8;
  let px = W - plateW - MARGIN, py = MARGIN;
  if (position === "top-left")     { px = MARGIN;            py = MARGIN; }
  if (position === "bottom-left")  { px = MARGIN;            py = H - plateH - MARGIN; }
  if (position === "bottom-right") { px = W - plateW - MARGIN; py = H - plateH - MARGIN; }
  const plateOpacity = Math.max(0.05, Math.min(1, opacity || 0.35));
  const logoSlot = Math.round(plateH - 6);
  const textStart = logoUrl ? (logoSlot + 8) : 6;
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Live preview</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-video rounded border border-border bg-black">
        {/* Mock 16:9 frame — gradient to suggest video content */}
        <defs>
          <linearGradient id="vidbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#2a2a2a" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#vidbg)" />
        <text x={W / 2} y={H / 2 + 4} fill="rgba(255,255,255,.15)" fontSize="12" textAnchor="middle">
          video frame
        </text>
        {/* Translucent plate */}
        <g opacity={plateOpacity}>
          <rect
            x={px} y={py} width={plateW} height={plateH}
            fill="rgba(0,0,0,0.75)" rx="3"
          />
          {logoUrl && (
            <image
              href={logoUrl}
              x={px + 3} y={py + 3}
              width={logoSlot} height={logoSlot}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
          {text && (
            <text
              x={px + textStart} y={py + plateH / 2 + 3}
              fill="#fff" fontSize="9" fontWeight="700"
              dominantBaseline="middle"
            >
              {text.slice(0, 14)}
            </text>
          )}
          {!text && !logoUrl && (
            <text
              x={px + plateW / 2} y={py + plateH / 2 + 3}
              fill="rgba(255,255,255,0.4)" fontSize="8" textAnchor="middle"
              dominantBaseline="middle"
            >
              (empty)
            </text>
          )}
        </g>
      </svg>
      <div className="text-[10px] text-gray-600 mt-1">
        {position} · {Math.round(plateOpacity * 100)}% opacity
        {!logoUrl && <span className="text-amber-500/70"> · no logo set (set one above the card to add it here)</span>}
      </div>
    </div>
  );
}
