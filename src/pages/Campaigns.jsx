import React, { useEffect, useState } from "react";
import {
  Megaphone, Plus, Trash2, Loader2, AlertCircle, CheckCircle2,
  Save, X, Youtube, Clock, Globe, CheckSquare, Square,
} from "lucide-react";
import { api } from "../api/client";

const LANG_OPTIONS = [
  { v: "hi", l: "Hindi" }, { v: "ta", l: "Tamil" }, { v: "kn", l: "Kannada" },
  { v: "ml", l: "Malayalam" }, { v: "bn", l: "Bengali" }, { v: "mr", l: "Marathi" },
  { v: "gu", l: "Gujarati" }, { v: "en", l: "English" },
];

const BLANK = {
  name: "",
  channel_ids: [],
  spacing_minutes: 120,
  privacy_status: "private",
  auto_seo: true,
  auto_translate_to: [],
  daily_cap: 0,
  quiet_hours_start: 0,
  quiet_hours_end: 0,
  thumbnail_ab: false,
  active: true,
};

export default function Campaigns() {
  const [rows, setRows] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null | campaign obj | "new"
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  function selectAll() { setSelected(new Set(rows.map((r) => r.id))); }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} campaign(s)?`)) return;
    setBulkBusy(true);
    setError(""); setNotice("");
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => api.deleteCampaign(id)));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      setError(`Deleted ${ids.length - failed.length}/${ids.length}. ${failed.length} failed: ${failed[0].reason?.message || "unknown"}`);
    } else {
      setNotice(`Deleted ${ids.length} campaign(s).`);
    }
    clearSelection();
    setBulkBusy(false);
    load();
  }

  async function handleBulkPause(active) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(""); setNotice("");
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) => {
        const c = rows.find((r) => r.id === id);
        return c ? api.updateCampaign(id, { ...c, active }) : Promise.resolve();
      })
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      setError(`${active ? "Resumed" : "Paused"} ${ids.length - failed.length}/${ids.length}.`);
    } else {
      setNotice(`${active ? "Resumed" : "Paused"} ${ids.length} campaign(s).`);
    }
    clearSelection();
    setBulkBusy(false);
    load();
  }

  async function load() {
    try {
      const [cs, chs] = await Promise.all([api.listCampaigns(), api.listChannels()]);
      setRows(cs || []);
      setChannels(chs || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(c) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    try {
      setBusyId(c.id);
      await api.deleteCampaign(c.id);
      setNotice(`Deleted "${c.name}"`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(form) {
    try {
      if (form.id) {
        await api.updateCampaign(form.id, form);
        setNotice(`Updated "${form.name}"`);
      } else {
        await api.createCampaign(form);
        setNotice(`Created "${form.name}"`);
      }
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const channelLabel = (id) => {
    const c = channels.find((x) => x.id === id);
    return c ? c.name : `#${id}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="text-accent2" size={22} />
          <h1 className="text-xl font-semibold text-white">Campaigns</h1>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-3 py-1.5 rounded text-sm font-medium"
        >
          <Plus size={14} /> New Campaign
        </button>
      </header>

      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded flex items-center gap-2">
          <CheckCircle2 size={14} /> {notice}
          <button onClick={() => setNotice("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 mb-3 bg-[#1a0f0f]/95 backdrop-blur border-y border-red-900/50 flex items-center gap-3 flex-wrap">
          <button onClick={clearSelection} className="p-1 text-gray-400 hover:text-white" title="Clear"><X size={16} /></button>
          <span className="text-sm text-gray-200"><strong className="text-red-300">{selected.size}</strong> selected</span>
          <button
            onClick={selected.size === rows.length ? clearSelection : selectAll}
            className="text-xs text-gray-400 hover:text-white"
          >
            {selected.size === rows.length ? "Unselect all" : "Select all"}
          </button>
          <div className="ml-auto flex gap-2 flex-wrap">
            <button
              onClick={() => handleBulkPause(false)}
              disabled={bulkBusy}
              className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-200 text-sm px-3 py-1.5 rounded"
            >
              Pause
            </button>
            <button
              onClick={() => handleBulkPause(true)}
              disabled={bulkBusy}
              className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-200 text-sm px-3 py-1.5 rounded"
            >
              Resume
            </button>
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

      {loading ? (
        <div className="text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          No campaigns yet. Create one to auto-publish clips to your YouTube channel(s) via style profiles.
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => (
            <div key={c.id} className={`bg-[#111] border rounded p-3 ${
              selected.has(c.id) ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => toggleSelect(c.id)}
                  className={`mt-0.5 flex-shrink-0 ${selected.has(c.id) ? "text-red-400" : "text-gray-500 hover:text-gray-200"}`}
                  title={selected.has(c.id) ? "Deselect" : "Select"}
                >
                  {selected.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-medium truncate">{c.name}</h3>
                    {c.active ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">active</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-400">paused</span>
                    )}
                    {c.thumbnail_ab && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">A/B thumbs</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1" title="Style profiles (SEO voice). Upload destination is decided by which one is linked to YouTube."><Youtube size={12} /> {c.channel_ids.length} profile{c.channel_ids.length === 1 ? "" : "s"}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> every {c.spacing_minutes}m</span>
                    <span>{c.privacy_status}</span>
                    {c.daily_cap > 0 && <span>cap {c.daily_cap}/day</span>}
                    {(c.quiet_hours_start !== c.quiet_hours_end) && (
                      <span>quiet {c.quiet_hours_start}–{c.quiet_hours_end}h</span>
                    )}
                    {c.auto_translate_to.length > 0 && (
                      <span className="flex items-center gap-1"><Globe size={12} /> {c.auto_translate_to.join(", ")}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.channel_ids.map((id) => (
                      <span key={id} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-300">
                        {channelLabel(id)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(c)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded"
                  >
                    <Save size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={busyId === c.id}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded disabled:opacity-50"
                  >
                    {busyId === c.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CampaignForm
          initial={editing === "new" ? BLANK : editing}
          channels={channels}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CampaignForm({ initial, channels, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleChannel = (id) => {
    set("channel_ids", form.channel_ids.includes(id)
      ? form.channel_ids.filter((x) => x !== id)
      : [...form.channel_ids, id]);
  };
  const toggleLang = (v) => {
    set("auto_translate_to", form.auto_translate_to.includes(v)
      ? form.auto_translate_to.filter((x) => x !== v)
      : [...form.auto_translate_to, v]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0c0c0c] border border-border rounded max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-[#0c0c0c]">
          <h2 className="text-white font-medium">
            {form.id ? "Edit Campaign" : "New Campaign"}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          <div>
            <label className="block text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
              placeholder="Morning Fanout"
            />
          </div>

          <div>
            <label className="block text-gray-400 mb-1">Target Style Profiles</label>
            <p className="text-[11px] text-gray-600 mb-2 leading-relaxed">
              Each profile is a writing-style template. The campaign auto-publishes clips using the profile's SEO style — the actual YouTube channel is whichever account that profile is linked to.
            </p>
            <div className="flex flex-wrap gap-2">
              {channels.length === 0 && <span className="text-gray-500 text-xs">No style profiles yet.</span>}
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleChannel(c.id)}
                  className={`px-2 py-1 rounded text-xs ${
                    form.channel_ids.includes(c.id)
                      ? "bg-accent text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 mb-1">Spacing (minutes)</label>
              <input
                type="number" min={10} max={1440} value={form.spacing_minutes}
                onChange={(e) => set("spacing_minutes", Number(e.target.value))}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
              />
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Minimum gap between uploads. <span className="text-gray-400">Min 10, max 1440 (24h).</span> Anything under 5 min looks like spam to YouTube — keep ≥ 60 for new channels. Default <span className="text-gray-400">120</span>.
              </p>
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Daily cap (0 = unlimited)</label>
              <input
                type="number" min={0} max={100} value={form.daily_cap}
                onChange={(e) => set("daily_cap", Number(e.target.value))}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
              />
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Max uploads <strong>per calendar day</strong> before overflow parks for tomorrow.
                Remember fan-out math: {form.channel_ids.length} profile{form.channel_ids.length === 1 ? "" : "s"} × 4 clips = <strong className="text-gray-300">{form.channel_ids.length * 4} uploads</strong> per pipeline run.
                Safe start: <span className="text-gray-400">6–12</span>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 mb-1">Quiet hours start (0–23)</label>
              <input
                type="number" min={0} max={23} value={form.quiet_hours_start}
                onChange={(e) => set("quiet_hours_start", Number(e.target.value))}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1">Quiet hours end</label>
              <input
                type="number" min={0} max={23} value={form.quiet_hours_end}
                onChange={(e) => set("quiet_hours_end", Number(e.target.value))}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-500 -mt-1 leading-snug">
            Hours (0–23, <strong>IST</strong>) when uploads are paused — e.g. <span className="text-gray-400">22 → 6</span> skips overnight slots.
            {form.quiet_hours_start === form.quiet_hours_end && (
              <span className="text-yellow-400 block mt-0.5">
                ⚠ start == end → quiet hours disabled (uploads allowed 24/7).
              </span>
            )}
          </p>

          <div>
            <label className="block text-gray-400 mb-1">Privacy</label>
            <select
              value={form.privacy_status}
              onChange={(e) => set("privacy_status", e.target.value)}
              className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">
              <strong className="text-gray-400">Private</strong> = only you can see (safest while testing) ·
              <strong className="text-gray-400"> Unlisted</strong> = anyone with the link ·
              <strong className="text-gray-400"> Public</strong> = live on the channel feed.
            </p>
          </div>

          <div>
            <label className="block text-gray-400 mb-1">Auto-translate to</label>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((l) => (
                <button
                  key={l.v}
                  onClick={() => toggleLang(l.v)}
                  className={`px-2 py-1 rounded text-xs ${
                    form.auto_translate_to.includes(l.v)
                      ? "bg-accent2 text-white"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {l.l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-gray-300">
              <input type="checkbox" checked={form.auto_seo} onChange={(e) => set("auto_seo", e.target.checked)} />
              Auto-generate SEO
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input type="checkbox" checked={form.thumbnail_ab} onChange={(e) => set("thumbnail_ab", e.target.checked)} />
              Thumbnail A/B
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Active
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-[#0c0c0c]">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || form.channel_ids.length === 0}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded flex items-center gap-1.5"
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
