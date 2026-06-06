/**
 * Meta (Facebook + Instagram) settings page.
 *
 * One screen the operator uses to:
 *   1. See whether the backend has Meta App credentials configured
 *      (META_APP_ID / META_APP_SECRET / META_REDIRECT_URI). If not,
 *      a clear setup checklist is shown — no "click here, get an
 *      error" loop.
 *   2. Kick off the OAuth dance ("Connect a Facebook Page"). The
 *      backend mints a state token, returns the Meta auth dialog URL,
 *      we open it. Meta bounces back to /api/meta/oauth/callback which
 *      redirects back here with ?connected=N.
 *   3. List every connected MetaAccount row, showing the Page name +
 *      avatar + whether an IG Business/Creator is linked. Each row
 *      has a "Disconnect" button.
 *
 * Once a Page is connected and the App's permissions are approved,
 * that Page becomes a publish destination in the V4 editor's modal
 * alongside the operator's YouTube channels.
 */
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Loader2, AlertCircle, CheckCircle2, ExternalLink, Trash2,
  Facebook, Instagram, RefreshCw,
} from "lucide-react";
import { api } from "../api/client";

export default function MetaSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig]       = useState(null);
  const [accounts, setAccounts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState("");
  const [connecting, setConnecting] = useState(false);
  // Set when the OAuth callback bounced back here. Drives the success
  // banner; we strip the query param on first read so a page refresh
  // doesn't re-show the toast.
  const [connectedCount, setConnectedCount] = useState(() => {
    const n = parseInt(searchParams.get("connected") || "", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });

  useEffect(() => {
    // Strip the ?connected query so the banner doesn't survive
    // navigations.
    if (searchParams.get("connected")) {
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setLoading(true); setErr("");
    try {
      const [c, a] = await Promise.all([
        api.metaConfig().catch((e) => { throw new Error("config: " + e.message); }),
        api.metaListAccounts().catch((e) => { throw new Error("accounts: " + e.message); }),
      ]);
      setConfig(c);
      setAccounts(Array.isArray(a) ? a : []);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const startConnect = async () => {
    setConnecting(true); setErr("");
    try {
      const r = await api.metaStartOAuth();
      if (!r?.redirect_url) throw new Error("backend did not return a redirect_url");
      // Same tab — the callback returns a 303 redirect to /settings/meta
      // so we land back here naturally. Opening in a new tab would
      // strand the callback bounce in a popup.
      window.location.href = r.redirect_url;
    } catch (e) {
      setErr(e?.message || "Could not start OAuth");
      setConnecting(false);
    }
  };

  const disconnect = async (account) => {
    if (!window.confirm(
      `Disconnect ${account.fb_page_name || `Page ${account.fb_page_id}`}?\n\n` +
      `This stops publishes from going to this Page. You can reconnect ` +
      `any time via "Connect a Facebook Page".`
    )) return;
    try {
      await api.metaDisconnect(account.id);
      await refresh();
    } catch (e) {
      setErr(e?.message || "Disconnect failed");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Facebook className="text-blue-400" size={24} />
        <Instagram className="text-pink-400" size={24} />
        <h1 className="text-2xl font-semibold text-white">Meta — Facebook & Instagram</h1>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Connect Facebook Pages + linked Instagram Business / Creator accounts to publish
        your finished bulletins (long-form) and shorts (Reels) without going through Postiz.
        Each Page you connect becomes a destination in the V4 editor's publish modal.
      </p>

      {connectedCount > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-700/40 bg-emerald-900/20 text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} />
          Connected {connectedCount} Page{connectedCount === 1 ? "" : "s"} successfully.
        </div>
      )}

      {err && (
        <div className="mb-4 p-3 rounded-lg border border-red-700/40 bg-red-900/20 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : !config?.configured ? (
        <NotConfiguredCard config={config} />
      ) : (
        <>
          {/* Connect button */}
          <div className="mb-6 p-4 rounded-lg border border-border bg-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white mb-1">
                  Connect a Facebook Page
                </h2>
                <p className="text-xs text-gray-500">
                  Click "Connect" → approve the requested permissions → you'll bounce back here
                  with every Page you've granted access to listed below.
                </p>
              </div>
              <button
                onClick={startConnect}
                disabled={connecting}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {connecting ? (
                  <><Loader2 size={14} className="animate-spin" /> Redirecting…</>
                ) : (
                  <><Facebook size={14} /> Connect</>
                )}
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 text-[10px] text-gray-500 leading-relaxed">
              <span className="text-gray-400 font-semibold">Permissions requested:</span>{" "}
              {config?.scopes?.join(", ")}.{" "}
              In dev mode only Pages you own as the App admin can post; production posting
              requires Meta App Review (1–2 weeks for <code>pages_manage_posts</code> +{" "}
              <code>instagram_content_publish</code>).
            </div>
          </div>

          {/* Connected accounts */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">
                Connected Pages ({accounts.length})
              </h2>
              <button
                onClick={refresh}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
            {accounts.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-border text-center text-sm text-gray-500 italic">
                No Pages connected yet. Click "Connect" above to grant access.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {accounts.map((a) => (
                  <AccountCard key={a.id} account={a} onDisconnect={() => disconnect(a)} />
                ))}
              </div>
            )}
          </div>

          {/* Status / dev info */}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer text-gray-400 hover:text-white">
              Meta config diagnostics
            </summary>
            <pre className="mt-2 p-2 rounded bg-black/40 border border-border text-[10px] overflow-x-auto">
              {JSON.stringify(config, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

/** Shown when the backend has no Meta App credentials yet. Gives the
 *  operator a self-contained walk-through to get from zero to wired. */
function NotConfiguredCard({ config }) {
  return (
    <div className="p-5 rounded-lg border border-amber-700/40 bg-amber-900/10">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="text-amber-400" size={18} />
        <h2 className="text-base font-semibold text-amber-200">
          Meta App credentials are not configured yet
        </h2>
      </div>
      <p className="text-sm text-gray-300 mb-4">
        Set three environment variables on the backend and restart to enable Meta publishing.
        Until you do, all `/api/meta/...` endpoints return a clear "not configured" error.
      </p>

      <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2 mb-4">
        <li>
          Go to{" "}
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank" rel="noopener noreferrer"
            className="text-accent2 hover:text-white underline inline-flex items-center gap-1"
          >
            developers.facebook.com/apps <ExternalLink size={11} />
          </a>{" "}
          → "Create App" → "Other" → "Business" use case.
        </li>
        <li>
          In your new App, add the <strong>Facebook Login</strong>, <strong>Pages API</strong>,{" "}
          and <strong>Instagram Graph API</strong> products.
        </li>
        <li>
          In your backend's <code>.env</code>, set:
          <pre className="mt-1 p-2 rounded bg-black/60 border border-border text-[11px] text-gray-200 overflow-x-auto">
{`META_APP_ID=<from the App dashboard>
META_APP_SECRET=<App Secret>
META_REDIRECT_URI=https://test.kaizerx.com/api/meta/oauth/callback`}
          </pre>
        </li>
        <li>
          Restart the backend (<code>start_kaizer.bat</code> or the supervisor).
        </li>
        <li>
          Submit your App for review for <code>pages_manage_posts</code>,{" "}
          <code>pages_manage_metadata</code>, <code>business_management</code>, and{" "}
          <code>instagram_content_publish</code> (1–2 weeks). Dev mode works
          for posting to your own Pages immediately.
        </li>
        <li>
          For Instagram Reels specifically: set{" "}
          <code>KAIZER_PUBLIC_BASE_URL=https://test.kaizerx.com</code> so Meta's
          crawler can fetch your video files from <code>/media/...</code>.
        </li>
      </ol>

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-gray-400 hover:text-white">
          Detected backend state
        </summary>
        <pre className="mt-2 p-2 rounded bg-black/40 border border-border text-[10px] overflow-x-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** One connected MetaAccount row. Surfaces all the useful metadata
 *  the operator needs to know what they're posting to. */
function AccountCard({ account, onDisconnect }) {
  const hasIg = !!account.ig_user_id;
  return (
    <div className="p-3 rounded-lg border border-border bg-panel relative">
      <button
        onClick={onDisconnect}
        title="Disconnect this Page"
        className="absolute top-2 right-2 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10"
      >
        <Trash2 size={13} />
      </button>
      <div className="flex items-start gap-3 mb-2">
        {account.fb_page_picture_url ? (
          <img
            src={account.fb_page_picture_url}
            alt=""
            className="w-12 h-12 rounded-full border border-border"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-blue-600/40 flex items-center justify-center">
            <Facebook size={22} className="text-blue-200" />
          </div>
        )}
        <div className="flex-1 min-w-0 pr-6">
          <div className="font-semibold text-white text-sm truncate">
            {account.fb_page_name || account.fb_page_id}
          </div>
          <div className="text-[11px] text-gray-500 truncate">
            {account.fb_page_category || "Page"}
          </div>
          {account.fb_page_url && (
            <a
              href={account.fb_page_url}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-accent2 hover:text-white inline-flex items-center gap-0.5"
            >
              View on Facebook <ExternalLink size={9} />
            </a>
          )}
        </div>
      </div>

      <div className="space-y-1 text-[11px]">
        {hasIg ? (
          <div className="flex items-center gap-1.5 text-pink-300">
            <Instagram size={12} />
            <span className="font-medium">@{account.ig_username}</span>
            <span className="text-gray-500">· {account.ig_account_type || "linked"}</span>
          </div>
        ) : (
          <div className="text-gray-500 italic">
            No Instagram linked — Reels publishing won't work for this Page.
          </div>
        )}
        <div className="text-gray-500">
          {(account.publishes_today || 0)} published today
          {account.last_publish_at && (
            <> · last on {new Date(account.last_publish_at).toLocaleDateString()}</>
          )}
        </div>
        {account.token_expiry && (
          <div className="text-[10px] text-gray-600">
            Token expires {new Date(account.token_expiry).toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-border/60 flex items-center gap-1 text-[9px] text-gray-600 uppercase tracking-wide">
        Scopes: {(account.granted_scopes || []).join(" · ")}
      </div>
    </div>
  );
}
