import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, Plus, Trash2, AlertCircle, CheckCircle2, RefreshCw, ExternalLink,
  Instagram, Facebook, Youtube, Twitter, Music2, Linkedin, AtSign, Share2,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Per-user Postiz channel connect (secondary / fallback publishing).
 *
 * Each user connects THEIR OWN socials into our single business Postiz org;
 * Kaizer records the per-user ownership (backend `postiz_integrations`) so a
 * user only ever sees / binds / disconnects the channels they connected —
 * they never log into or register with Postiz.
 *
 * Default delivery is ALWAYS native (our own quota). Binding a channel to a
 * Postiz integration here is OPT-IN — and, when the admin flips the system to
 * "production" mode, that binding is also the auto-fallback target used when
 * our YouTube quota runs out.
 */

const PROVIDERS = [
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "facebook",  label: "Facebook",  Icon: Facebook  },
  { key: "youtube",   label: "YouTube",   Icon: Youtube   },
  { key: "x",         label: "X",         Icon: Twitter   },
  { key: "tiktok",    label: "TikTok",    Icon: Music2    },
  { key: "linkedin",  label: "LinkedIn",  Icon: Linkedin  },
  { key: "threads",   label: "Threads",   Icon: AtSign    },
];

function providerIcon(provider) {
  const p = (provider || "").toLowerCase();
  const hit = PROVIDERS.find((x) => p.includes(x.key));
  return hit ? hit.Icon : Share2;
}

export default function PostizConnectPanel() {
  const [status, setStatus] = useState(null);     // {enabled, reason, integration_count}
  const [integrations, setIntegrations] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);   // provider key
  const [manualUrl, setManualUrl] = useState("");
  const [err, setErr] = useState("");
  const [busyChannel, setBusyChannel] = useState(null);
  const pollRef = useRef(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [st, ints, chs] = await Promise.all([
        api.postizMeStatus().catch(() => ({ enabled: false, reason: "unreachable" })),
        api.postizMeIntegrations().catch(() => []),
        api.listChannels({ kind: "accounts" }).catch(() => []),
      ]);
      setStatus(st);
      setIntegrations(Array.isArray(ints) ? ints : []);
      setChannels(Array.isArray(chs) ? chs : []);
    } catch (e) {
      setErr(e?.message || "Failed to load Postiz state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  async function connect(provider) {
    setErr(""); setManualUrl(""); setConnecting(provider);
    try {
      const { url } = await api.postizMeConnect(provider);
      if (!url) throw new Error("No connect URL returned");
      const popup = window.open(url, "kx_postiz_connect", "width=680,height=820");
      if (!popup) setManualUrl(url);   // popup blocked → show a manual link

      // Poll finalize while the user authorizes on the platform. The backend
      // only claims the channel that appears during THIS session, so repeated
      // calls are safe. Stop on success, popup close, or ~2 min.
      let tries = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (!mounted.current) { clearInterval(pollRef.current); pollRef.current = null; return; }
        tries += 1;
        let claimed = 0;
        try {
          const res = await api.postizMeFinalize();
          claimed = res?.count || 0;
        } catch { /* keep polling */ }
        if (!mounted.current) { clearInterval(pollRef.current); pollRef.current = null; return; }
        const popupClosed = popup && popup.closed;
        if (claimed > 0 || tries >= 40 || popupClosed) {
          clearInterval(pollRef.current); pollRef.current = null;
          if (popupClosed && claimed === 0) {
            // One last attempt after the window closed.
            try { await api.postizMeFinalize(); } catch { /* noop */ }
          }
          if (!mounted.current) return;
          setConnecting(null); setManualUrl("");
          refresh();
        }
      }, 3000);
    } catch (e) {
      setErr(e?.message || "Connect failed");
      setConnecting(null);
    }
  }

  async function disconnect(iid, name) {
    if (!window.confirm(`Disconnect "${name || iid}" from Postiz? Any channel delivering through it reverts to native upload.`)) return;
    setErr("");
    try {
      await api.postizMeDisconnect(iid);
      await refresh();
    } catch (e) {
      setErr(e?.message || "Disconnect failed");
    }
  }

  async function setDelivery(ch, value) {
    // value: "" (native) | integration_id (postiz)
    setErr(""); setBusyChannel(ch.id);
    try {
      const payload = value
        ? { upload_provider: "postiz", postiz_integration_id: value }
        : { upload_provider: "kaizer", postiz_integration_id: null };
      await api.updateChannel(ch.id, payload);
      await refresh();
    } catch (e) {
      setErr(e?.message || "Could not change delivery");
    } finally {
      setBusyChannel(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-xs text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Loading Postiz…
      </div>
    );
  }

  const enabled = !!status?.enabled;

  return (
    <div className="mt-6 bg-surface border border-border rounded p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Share2 size={15} className="text-accent2" /> Fallback publishing (Postiz)
        </h2>
        <button
          onClick={refresh}
          className="text-[11px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
          title="Refresh"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug mb-3">
        Everything publishes on <strong className="text-gray-300">our own quota by default</strong>.
        Connect your social accounts here and pick Postiz for a channel only when you want to use it
        as a secondary stream — you never need to log into Postiz.
      </p>

      {err && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5" /> {err}
        </div>
      )}

      {!enabled ? (
        <div className="p-3 bg-black/30 border border-border rounded text-xs text-gray-400 flex items-start gap-2">
          <AlertCircle size={13} className="text-amber-400 mt-0.5" />
          <span>
            Postiz isn’t available yet{status?.reason ? ` — ${status.reason}` : ""}.
            An admin connects the workspace key on the server; once it’s live you can connect channels here.
          </span>
        </div>
      ) : (
        <>
          {/* Connect a new channel */}
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Connect a channel</div>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => connect(key)}
                  disabled={!!connecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-black/30 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-50"
                >
                  {connecting === key
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Icon size={13} />}
                  {label}
                </button>
              ))}
            </div>
            {connecting && (
              <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Approve on the platform’s window, then this updates automatically…
              </div>
            )}
            {manualUrl && (
              <a
                href={manualUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-accent2 hover:underline"
              >
                <ExternalLink size={12} /> A window didn’t open — click here to authorize
              </a>
            )}
          </div>

          {/* Connected channels */}
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">
              Your team's channels ({integrations.length})
            </div>
            {integrations.length === 0 ? (
              <div className="text-[11px] text-gray-600 italic">None yet — connect one above.</div>
            ) : (
              <div className="space-y-1.5">
                {integrations.map((it) => {
                  const Icon = providerIcon(it.provider);
                  return (
                    <div key={it.integration_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-black/20">
                      {it.picture
                        ? <img src={it.picture} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" loading="lazy" />
                        : <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><Icon size={13} className="text-gray-300" /></span>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate">{it.name || it.identifier || it.integration_id}</div>
                        <div className="text-[10px] text-gray-500 truncate">{it.provider}{it.identifier ? ` · ${it.identifier}` : ""}</div>
                      </div>
                      <button
                        onClick={() => disconnect(it.integration_id, it.name)}
                        className="text-gray-500 hover:text-red-400 flex-shrink-0"
                        title="Disconnect"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-channel delivery selector */}
          {channels.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Channel delivery</div>
              <div className="space-y-1.5">
                {channels.map((ch) => {
                  const usingPostiz = (ch.upload_provider || "").toLowerCase() === "postiz"
                    && !!ch.postiz_integration_id;
                  const val = usingPostiz ? ch.postiz_integration_id : "";
                  return (
                    <div key={ch.id} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-xs text-gray-300 truncate">{ch.name}</span>
                      {busyChannel === ch.id && <Loader2 size={12} className="animate-spin text-gray-500" />}
                      <select
                        value={val}
                        disabled={busyChannel === ch.id}
                        onChange={(e) => setDelivery(ch, e.target.value)}
                        className="bg-black border border-border rounded px-2 py-1 text-xs text-gray-200 focus:border-accent2 outline-none max-w-[60%]"
                      >
                        <option value="">Native (our quota)</option>
                        {integrations.map((it) => (
                          <option key={it.integration_id} value={it.integration_id}>
                            Postiz · {it.name || it.provider || it.integration_id}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
                <CheckCircle2 size={10} className="inline mb-0.5 text-green-500" /> Native is the default for every channel.
                Choosing a Postiz channel sends that channel’s uploads through Postiz instead — used for testing now,
                and as the automatic fallback target once an admin switches the system to production mode.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
