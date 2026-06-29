import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send, RefreshCw } from "lucide-react";
import { api } from "../api/client";

/**
 * Admin panel to configure Postiz as a 3rd-party delivery path.
 *
 *   1. The Postiz public-API key is env-ONLY (POSTIZ_API_KEY in the backend
 *      .env) — set on the server and applied on restart; never entered in
 *      this UI. A reachability probe confirms "go live".
 *   2. Per connected YouTube account, choose delivery = Native or Postiz,
 *      and (for Postiz) bind which Postiz integration it posts to.
 *
 * When an account is set to Postiz + bound, its publishes are delivered
 * via Postiz — same branded video (logo/watermark) and same per-channel
 * SEO/socials, just handed to Postiz instead of YouTube directly.
 *
 * Self-contained: pulls accounts via listChannels({kind:'accounts'}) so
 * the new upload_provider / postiz_integration_id fields are present.
 * Hidden gracefully for non-admins (config endpoints are admin-gated).
 */
export default function PostizDeliveryPanel() {
  const [cfg, setCfg] = useState(null);
  const [ints, setInts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [savingRow, setSavingRow] = useState({}); // { [channelId]: true }
  // Local pending edits per account: { [id]: {provider, integration} }
  const [draft, setDraft] = useState({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const config = await api.postizGetConfig();
      setCfg(config);
      // Integrations only resolve when the key is reachable.
      let integrations = [];
      if (config?.reachable) {
        try { integrations = await api.postizListIntegrations(); } catch { /* ignore */ }
      }
      setInts(Array.isArray(integrations) ? integrations : []);
      const accs = await api.listChannels({ kind: "accounts" });
      setAccounts(Array.isArray(accs) ? accs : []);
    } catch (e) {
      if (e?.status === 403 || /forbidden|admin/i.test(e?.message || "")) {
        setForbidden(true);
      } else {
        setError(e?.message || "Failed to load Postiz config");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function draftFor(a) {
    const d = draft[a.id] || {};
    return {
      provider: d.provider ?? (a.upload_provider === "postiz" ? "postiz" : "native"),
      integration: d.integration ?? (a.postiz_integration_id || ""),
    };
  }
  function setDraftFor(id, patch) {
    setDraft((p) => ({ ...p, [id]: { ...draftFor({ id, ...accounts.find((x) => x.id === id) }), ...p[id], ...patch } }));
  }

  async function saveRow(a) {
    const d = draftFor(a);
    if (d.provider === "postiz" && !d.integration) {
      setError(`Pick a Postiz integration for ${a.youtube_channel_title || a.name} first.`);
      return;
    }
    setSavingRow((p) => ({ ...p, [a.id]: true }));
    setError(""); setNotice("");
    try {
      await api.updateChannel(a.id, {
        upload_provider: d.provider === "postiz" ? "postiz" : "kaizer",
        postiz_integration_id: d.provider === "postiz" ? d.integration : null,
      });
      setNotice(`Saved delivery for ${a.youtube_channel_title || a.name}.`);
      setDraft((p) => { const n = { ...p }; delete n[a.id]; return n; });
      await load();
    } catch (e) {
      setError(e?.message || "Failed to save delivery");
    } finally {
      setSavingRow((p) => ({ ...p, [a.id]: false }));
    }
  }

  if (forbidden) return null; // non-admins don't see this panel

  return (
    <div className="card p-4 sm:p-5 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <Send size={15} className="text-accent2" />
        <h3 className="text-sm font-semibold text-gray-100">Postiz delivery (3rd-party posting)</h3>
        <button
          type="button"
          onClick={load}
          className="ml-auto text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
          title="Reload config + integrations"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Deliver the same branded video + per-channel SEO/socials through Postiz instead of
        publishing to YouTube directly. Set a channel to <strong>Postiz</strong> and bind its
        integration; everything else (logo, watermark, description, links) stays identical.
      </p>

      {loading ? (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* ── Connectivity status (key is env-managed; never shown
              or settable here) ─────────────────────────────────── */}
          <div className="rounded border border-border bg-surface p-3 mb-3">
            <div className="flex items-center gap-2 text-xs">
              {cfg?.reachable ? (
                <span className="flex items-center gap-1.5 text-green-400">
                  <CheckCircle2 size={13} /> Postiz connected
                  <span className="text-gray-500">· {cfg.integration_count} integration(s)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <AlertCircle size={13} />
                  {cfg?.key_set
                    ? `Not live: ${cfg?.reason || "unreachable"}`
                    : "Postiz key not configured"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              The Postiz API key is managed in the backend <code>.env</code>
              {" "}(<code>POSTIZ_API_KEY</code>) and is never exposed here. Edit it on the
              server and restart to apply.
            </p>
          </div>

          {/* ── Per-account delivery binding ───────────────────── */}
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Per-channel delivery
          </div>
          <div className="space-y-1.5">
            {accounts.length === 0 && (
              <div className="text-xs text-gray-600">No connected accounts.</div>
            )}
            {accounts.map((a) => {
              const d = draftFor(a);
              const dirty = !!draft[a.id];
              const ytInts = ints.filter(
                (i) => !i.provider || i.provider === "youtube" || i.identifier === "youtube"
              );
              const list = ytInts.length ? ytInts : ints;
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-black/30 px-3 py-2">
                  <span className="text-xs text-gray-200 font-medium min-w-[120px] truncate" title={a.youtube_channel_title || a.name}>
                    {a.youtube_channel_title || a.name}
                  </span>
                  <select
                    value={d.provider}
                    onChange={(e) => setDraftFor(a.id, { provider: e.target.value })}
                    className="bg-black border border-border rounded px-2 py-1 text-xs text-gray-200"
                  >
                    <option value="native">Native (YouTube)</option>
                    <option value="postiz">Postiz</option>
                  </select>
                  {d.provider === "postiz" && (
                    <select
                      value={d.integration}
                      onChange={(e) => setDraftFor(a.id, { integration: e.target.value })}
                      className="bg-black border border-border rounded px-2 py-1 text-xs text-gray-200 flex-1 min-w-[160px]"
                    >
                      <option value="">— pick a Postiz integration —</option>
                      {list.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name || i.identifier || i.id} {i.provider ? `(${i.provider})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => saveRow(a)}
                      disabled={!!savingRow[a.id]}
                      className="text-xs px-3 py-1 rounded bg-accent2/15 text-accent2 hover:bg-accent2/25 hover:text-white disabled:opacity-50 flex items-center gap-1"
                    >
                      {savingRow[a.id] ? <Loader2 size={11} className="animate-spin" /> : "Save"}
                    </button>
                  )}
                  {!dirty && a.upload_provider === "postiz" && a.postiz_integration_id && (
                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                      <CheckCircle2 size={11} /> via Postiz
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          {notice && (
            <div className="mt-2 text-xs text-green-400 flex items-center gap-1.5">
              <CheckCircle2 size={12} /> {notice}
            </div>
          )}
        </>
      )}
    </div>
  );
}
