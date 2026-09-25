import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, CheckCircle2, XCircle, RefreshCw, UserPlus, KeyRound,
  AlertCircle, Save, BarChart3, DollarSign, Trash2,
} from "lucide-react";
import { adminApi } from "../api/client";

/** Super Admin → Accounts: desktop account requests + managed key bundles.
 *
 *  Requests: prospective desktop users ask for an account from the app's
 *  login screen; approving mints the User row on the spot (Free tier).
 *
 *  Keys: the server-side bundle injected into desktop installs at sign-in
 *  (routers/account_requests.py). "Everyone" edits the DEFAULT bundle; a
 *  user id scopes overrides to that user — per-user provider keys are how
 *  spend becomes trackable per user in each provider's console. */
export default function AdminAccounts() {
  return (
    <div className="space-y-6">
      <RequestsPanel />
      <UsageBillingPanel />
      <ManagedKeysPanel />
    </div>
  );
}

// ── Usage & billing ───────────────────────────────────────────────────

const KEY_ENVS = ["YOUTUBE_DATA_API_KEY", "GEMINI_API_KEY"];
const KEY_SHORT = { YOUTUBE_DATA_API_KEY: "YT", GEMINI_API_KEY: "GEM" };

function KeyChip({ env, st }) {
  const status = st?.status ?? "shared";
  const cls =
    status === "active" ? "text-emerald-300 border-emerald-500/40"
    : status === "failed" ? "text-red-300 border-red-500/40"
    : status === "pending" ? "text-violet-300 border-violet-500/40"
    : status === "revoked" ? "text-gray-500 border-white/10 line-through"
    : "text-gray-500 border-white/10";
  return (
    <span title={st?.error || status}
      className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 font-mono text-[9px] ${cls}`}>
      {status === "pending" && <Loader2 size={8} className="animate-spin" />}
      {KEY_SHORT[env]}
    </span>
  );
}

function UsageBillingPanel() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [acting, setActing] = useState(0);
  const [showRates, setShowRates] = useState(false);
  const [rateDraft, setRateDraft] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async (refresh = false) => {
    setBusy(true); setErr("");
    try {
      const d = await adminApi.usage(days, refresh);
      setData(d);
      setRateDraft((prev) => prev ?? d.rates);
    } catch (e) { setErr(e.message || "Failed to load usage"); }
    finally { setBusy(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function mint(userId) {
    setActing(userId); setErr("");
    try { await adminApi.mintUserKeys(userId); }
    catch (e) { setErr(e.message || "Mint failed"); setActing(0); return; }
    const started = Date.now();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const m = await adminApi.mintedKeys(userId);
        const stillPending = m.minting || (m.keys || []).some((k) => k.status === "pending");
        if (!stillPending || Date.now() - started > 60000) {
          clearInterval(pollRef.current); setActing(0); await load();
        }
      } catch { clearInterval(pollRef.current); setActing(0); await load(); }
    }, 2000);
  }

  async function revoke(userId) {
    setActing(userId); setErr("");
    try { await adminApi.revokeUserKeys(userId); }
    catch (e) { setErr(e.message || "Revoke failed"); }
    await load(); setActing(0);
  }

  async function saveRates() {
    if (!rateDraft) return;
    setSavingRates(true); setErr("");
    try { await adminApi.setBillingRates(rateDraft); await load(); }
    catch (e) { setErr(e.message || "Saving rates failed"); }
    finally { setSavingRates(false); }
  }

  function setRate(metric, field, v) {
    setRateDraft((d) => ({
      ...(d || {}),
      [metric]: { cost_per_1000: 0, charge_per_1000: 0, currency: "USD", ...((d || {})[metric] || {}), [field]: v },
    }));
  }

  const cur = data?.rates?.youtube_requests?.currency || "USD";

  return (
    <section className="adm-card p-4">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 size={15} /> Usage &amp; billing
        </h2>
        <div className="ml-auto flex items-center gap-1">
          {[7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                days === d ? "bg-violet-600 text-white" : "bg-white/5 text-gray-400 hover:text-gray-200"}`}>
              {d}d
            </button>
          ))}
          <button onClick={() => load(true)} disabled={busy} title="Refresh"
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        Request counts per user from Google Cloud Monitoring (cached ~10&nbsp;min). Each user&apos;s
        own keys are minted in your project on approval — Mint/Revoke below.
      </p>

      {err && (
        <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={13} /> {err}
        </div>
      )}
      {data?.configured === false && (
        <div className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
          Key minting isn&apos;t configured on the server yet (service account / project + the apikeys &amp;
          monitoring APIs). Users run on the shared bundle until then.
        </div>
      )}
      {data?.monitoring_error && (
        <div className="mb-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
          Monitoring: {data.monitoring_error}
        </div>
      )}

      {/* Rates editor */}
      <div className="mb-3">
        <button onClick={() => setShowRates((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200">
          <DollarSign size={12} /> Rates {showRates ? "▲" : "▼"}
        </button>
        {showRates && rateDraft && (
          <div className="mt-2 flex flex-wrap items-end gap-3 rounded border border-white/10 bg-black/20 p-3">
            {["youtube_requests", "gemini_requests"].map((metric) => (
              <div key={metric} className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">
                  {metric === "youtube_requests" ? "YouTube" : "Gemini"} / 1000 req
                </p>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-gray-400">cost
                    <input type="number" min={0} step="0.01" value={rateDraft[metric]?.cost_per_1000 ?? 0}
                      onChange={(e) => setRate(metric, "cost_per_1000", Number(e.target.value))}
                      className="ml-1 w-16 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-xs text-gray-200" />
                  </label>
                  <label className="text-[10px] text-gray-400">charge
                    <input type="number" min={0} step="0.01" value={rateDraft[metric]?.charge_per_1000 ?? 0}
                      onChange={(e) => setRate(metric, "charge_per_1000", Number(e.target.value))}
                      className="ml-1 w-16 bg-black/40 border border-white/10 rounded px-1.5 py-1 text-xs text-gray-200" />
                  </label>
                </div>
              </div>
            ))}
            <button onClick={saveRates} disabled={savingRates}
              className="px-2.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">
              {savingRates ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save rates
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded border border-white/10">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-white/5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-2 py-2">Keys</th>
              <th className="px-2 py-2 text-right">YT req</th>
              <th className="px-2 py-2 text-right">Gemini req</th>
              <th className="px-2 py-2 text-right">Est cost</th>
              <th className="px-2 py-2 text-right">Suggested</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(data?.users ?? []).map((u) => {
              const minted = KEY_ENVS.some((e) => ["active", "pending", "failed"].includes(u.keys[e]?.status ?? "shared"));
              const pending = KEY_ENVS.some((e) => u.keys[e]?.status === "pending");
              return (
                <tr key={u.user_id} className="border-t border-white/10">
                  <td className="px-3 py-1.5"><span className="text-gray-200">{u.email}</span><span className="ml-1 text-gray-600">#{u.user_id}</span></td>
                  <td className="px-2 py-1.5"><span className="flex gap-1">{KEY_ENVS.map((e) => <KeyChip key={e} env={e} st={u.keys[e]} />)}</span></td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">{u.youtube_requests.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">{u.gemini_requests.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">{cur} {u.est_cost.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-100">{cur} {u.suggested_charge.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => mint(u.user_id)} disabled={acting === u.user_id || pending}
                        title="Mint / re-mint this user's own YouTube + Gemini keys"
                        className="rounded border border-violet-500/40 px-2 py-0.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/10 disabled:opacity-40">
                        {acting === u.user_id || pending ? <Loader2 size={10} className="animate-spin" /> : "Mint"}
                      </button>
                      {minted && (
                        <button onClick={() => { if (window.confirm(`Revoke ${u.email}'s keys? They fall back to the shared bundle.`)) revoke(u.user_id); }}
                          disabled={acting === u.user_id} title="Revoke this user's keys"
                          className="rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {data && data.users.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No users yet.</td></tr>
            )}
          </tbody>
          {data && (
            <tfoot className="border-t border-white/10 font-mono text-[10px] text-gray-400">
              <tr><td className="px-3 py-1.5">Shared bundle</td><td /><td className="px-2 py-1.5 text-right tabular-nums">{data.shared.youtube_requests.toLocaleString()}</td><td className="px-2 py-1.5 text-right tabular-nums">{data.shared.gemini_requests.toLocaleString()}</td><td colSpan={3} /></tr>
              <tr><td className="px-3 py-1.5">Unattributed</td><td /><td className="px-2 py-1.5 text-right tabular-nums">{data.unattributed.youtube_requests.toLocaleString()}</td><td className="px-2 py-1.5 text-right tabular-nums">{data.unattributed.gemini_requests.toLocaleString()}</td><td colSpan={3} /></tr>
              <tr className="text-gray-100"><td className="px-3 py-1.5 font-bold">Totals</td><td /><td className="px-2 py-1.5 text-right tabular-nums font-bold">{data.totals.youtube_requests.toLocaleString()}</td><td className="px-2 py-1.5 text-right tabular-nums font-bold">{data.totals.gemini_requests.toLocaleString()}</td><td className="px-2 py-1.5 text-right tabular-nums">{cur} {data.totals.est_cost.toFixed(2)}</td><td className="px-2 py-1.5 text-right tabular-nums font-bold">{cur} {data.totals.suggested_charge.toFixed(2)}</td><td /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {data?.caveats && (
        <ul className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-gray-600">
          {data.caveats.map((c, i) => <li key={i}>• {c}</li>)}
        </ul>
      )}
    </section>
  );
}

// ── Account requests ──────────────────────────────────────────────────

function RequestsPanel() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try { setRows(await adminApi.accountRequests(status)); }
    catch (e) { setErr(e.message || "Failed to load requests"); }
    finally { setBusy(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function decide(id, action) {
    setActing(id); setErr("");
    try { await adminApi.decideAccountRequest(id, action); await load(); }
    catch (e) { setErr(e.message || `${action} failed`); }
    finally { setActing(0); }
  }

  return (
    <section className="adm-card p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus size={15} /> Desktop account requests
        </h2>
        <div className="ml-auto flex items-center gap-1">
          {["pending", "approved", "rejected", "all"].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                status === s ? "bg-violet-600 text-white" : "bg-white/5 text-gray-400 hover:text-gray-200"}`}>
              {s}
            </button>
          ))}
          <button onClick={load} disabled={busy} title="Refresh"
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={13} /> {err}
        </div>
      )}

      {rows.length === 0 && !busy ? (
        <p className="text-xs text-gray-500">No {status === "all" ? "" : status + " "}requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="p-3 rounded border border-white/10 bg-black/20 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm text-gray-100 font-medium">
                  {r.name || "—"} <span className="text-gray-500 font-normal">· {r.email}</span>
                </div>
                {r.note && <div className="text-xs text-gray-400 mt-0.5">“{r.note}”</div>}
                <div className="text-[10px] text-gray-600 mt-1">
                  requested {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  {r.decided_at ? ` · decided ${new Date(r.decided_at).toLocaleString()}` : ""}
                </div>
              </div>
              {r.status === "pending" ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => decide(r.id, "approve")} disabled={acting === r.id}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                    {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Approve
                  </button>
                  <button onClick={() => decide(r.id, "reject")} disabled={acting === r.id}
                    className="px-3 py-1.5 rounded bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-300 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              ) : (
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-semibold ${
                  r.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                  {r.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Managed key bundles ───────────────────────────────────────────────

function ManagedKeysPanel() {
  const [userId, setUserId] = useState("");     // "" = the default bundle
  const [names, setNames] = useState([]);       // injectable key names
  const [current, setCurrent] = useState({});   // name -> masked
  const [drafts, setDrafts] = useState({});     // name -> new value being typed
  const [busy, setBusy] = useState(false);
  const [savingName, setSavingName] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const d = await adminApi.managedKeys(userId ? Number(userId) : undefined);
      setNames(d.injectable || []);
      const m = {};
      for (const k of d.keys || []) m[k.name] = k.masked;
      setCurrent(m);
    } catch (e) { setErr(e.message || "Failed to load keys"); }
    finally { setBusy(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function save(name) {
    const value = (drafts[name] ?? "").trim();
    setSavingName(name); setErr(""); setOk("");
    try {
      await adminApi.setManagedKey({ user_id: userId ? Number(userId) : null, name, value });
      setDrafts((d) => ({ ...d, [name]: "" }));
      setOk(`${name} ${value ? "saved" : "cleared"} for ${userId ? `user ${userId}` : "everyone"}.`);
      await load();
    } catch (e) { setErr(e.message || "Save failed"); }
    finally { setSavingName(""); }
  }

  return (
    <section className="adm-card p-4">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound size={15} /> Desktop key bundle
        </h2>
        <label className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
          Scope
          <input value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))}
            placeholder="everyone" title="Blank = the default bundle every user receives; a user id = overrides for that user only"
            className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200" />
          <button onClick={load} disabled={busy} className="p-1 text-gray-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </button>
        </label>
      </div>
      <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
        These keys are injected into each desktop install at sign-in and wiped at
        sign-out. Blank scope = the default bundle everyone gets; enter a user id
        to override keys for one user — give each user their OWN provider keys and
        every provider console shows that user's exact spend.
      </p>

      {err && (
        <div className="mb-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={13} /> {err}
        </div>
      )}
      {ok && <div className="mb-2 text-[11px] text-emerald-300">{ok}</div>}

      <div className="space-y-1.5">
        {names.map((name) => (
          <div key={name} className="flex items-center gap-2 flex-wrap">
            <span className="w-64 shrink-0 font-mono text-[11px] text-gray-300 truncate">{name}</span>
            <span className="w-24 shrink-0 font-mono text-[11px] text-gray-500">{current[name] || "—"}</span>
            <input type="password" value={drafts[name] ?? ""} autoComplete="off"
              onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
              placeholder={current[name] ? "replace… (save empty to clear)" : "set value…"}
              className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200" />
            <button onClick={() => save(name)} disabled={savingName === name}
              className="px-2.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50">
              {savingName === name ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              Save
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
