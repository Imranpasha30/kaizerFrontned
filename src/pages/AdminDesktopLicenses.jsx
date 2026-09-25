// Admin › Desktop licenses — every user's activated Kaizer X Desktop
// machines (operator: "for admin keep a tab where show licenses granted
// for the user"). Data: GET /api/desktop/admin/licenses; admin revoke via
// POST /api/desktop/admin/licenses/{id}/revoke (support flow for burned
// device slots — e.g. a VPN adapter changed the machine fingerprint).
import { useCallback, useEffect, useState } from "react";
import { Laptop, RefreshCcw, ShieldOff } from "lucide-react";
import { api } from "../api/client";

function ago(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function AdminDesktopLicenses() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setErr("");
    api.adminDesktopLicenses()
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load licenses"));
  }, []);
  useEffect(load, [load]);

  const revoke = async (lic) => {
    if (!window.confirm(
      `Revoke ${lic.user_email}'s device "${lic.machine_label || lic.fingerprint_short}"?\n` +
      "The app on that computer locks at its next license check; the slot frees up immediately."
    )) return;
    setBusyId(lic.id);
    try {
      await api.adminRevokeDesktopLicense(lic.id);
      load();
    } catch (e) {
      setErr(e?.message || "Revoke failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white font-semibold">
          <Laptop size={16} className="text-accent2" /> Desktop licenses
          {data && (
            <span className="text-xs text-gray-400 font-normal">
              {data.active} active / {data.total} total · limit {data.limit_per_user} per user
            </span>
          )}
        </div>
        <button type="button" onClick={load}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-600 hover:border-gray-400 text-gray-300">
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {err && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{err}</div>
      )}

      <div className="rounded-xl border border-gray-700 bg-[#12151d] overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-700">
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2">Fingerprint</th>
              <th className="px-3 py-2">Activated</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.licenses || []).map((l) => (
              <tr key={l.id} className="border-b border-gray-800/60 text-gray-300">
                <td className="px-3 py-2">
                  <div className="text-white">{l.user_email}</div>
                  {l.user_name && <div className="text-[10px] text-gray-500">{l.user_name}</div>}
                </td>
                <td className="px-3 py-2">{l.machine_label || <span className="text-gray-600">unnamed</span>}</td>
                <td className="px-3 py-2 font-mono text-gray-500">{l.fingerprint_short}…</td>
                <td className="px-3 py-2">{l.activated_at ? new Date(l.activated_at).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">{ago(l.last_seen_at)}</td>
                <td className="px-3 py-2">
                  {l.revoked
                    ? <span className="text-red-400">revoked</span>
                    : <span className="text-emerald-400">active</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {!l.revoked && (
                    <button type="button" disabled={busyId === l.id} onClick={() => revoke(l)}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-red-600/50 text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <ShieldOff size={11} /> Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data && data.licenses.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                No desktop activations yet — they appear here the moment a user signs in on the Windows app.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
