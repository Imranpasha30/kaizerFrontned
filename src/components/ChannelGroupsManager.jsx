import React, { useEffect, useState } from "react";
import {
  Users2, Plus, Trash2, Save, X, Edit2, Loader2, AlertCircle,
} from "lucide-react";
import { api } from "../api/client";

/**
 * CRUD UI for channel groups (publish presets).
 *
 * A group = a named list of google_channel_ids.  Used by PublishModal to
 * one-click select a subset of destinations (e.g. "English" = 2 channels).
 *
 * Props:
 *   ytAccounts - [{ google_channel_id, youtube_channel_title, ... }]
 *                used as the picklist of destinations the user can add.
 *   onChange   - () => void when groups change (parent refreshes elsewhere)
 */
export default function ChannelGroupsManager({ ytAccounts = [], onChange }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit state: null = no editor open; {id, ...} = editing an existing group;
  // {id: null, name: "", ...} = creating a new one.
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setGroups((await api.listChannelGroups()) || []);
    } catch (e) {
      setError(e.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditor({ id: null, name: "", description: "", google_channel_ids: [] });
  }
  function startEdit(g) {
    setEditor({
      id: g.id,
      name: g.name,
      description: g.description || "",
      google_channel_ids: [...(g.google_channel_ids || [])],
    });
  }
  function cancelEdit() {
    setEditor(null);
  }

  function toggleDest(gid) {
    setEditor((e) => {
      if (!e) return e;
      const set = new Set(e.google_channel_ids || []);
      if (set.has(gid)) set.delete(gid); else set.add(gid);
      return { ...e, google_channel_ids: Array.from(set) };
    });
  }

  async function saveEditor() {
    if (!editor) return;
    const name = (editor.name || "").trim();
    if (!name) {
      setError("Group name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        description: editor.description || "",
        google_channel_ids: editor.google_channel_ids || [],
      };
      if (editor.id == null) {
        await api.createChannelGroup(payload);
      } else {
        await api.updateChannelGroup(editor.id, payload);
      }
      setEditor(null);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(g) {
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await api.deleteChannelGroup(g.id);
      await load();
      onChange?.();
    } catch (e) {
      setError(e.message || "Delete failed");
    }
  }

  const nameByGid = Object.fromEntries(
    (ytAccounts || []).map((a) => [a.google_channel_id, a.youtube_channel_title || a.google_channel_id]),
  );

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Users2 size={14} className="text-accent2" /> Channel Groups
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Save presets of your YouTube accounts so you can one-click publish
            to just those channels. Useful for language-specific drops (English /
            Telugu) or audience slices (Auto Wala vs Cyber Sphere).
          </p>
        </div>
        <button
          onClick={startCreate}
          className="bg-accent2 hover:bg-accent text-white text-xs font-medium px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
          disabled={ytAccounts.length === 0}
          title={ytAccounts.length === 0 ? "Link a YouTube account first" : "Create a new group"}
        >
          <Plus size={12} /> New Group
        </button>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-900 text-red-300 px-3 py-2 rounded text-xs mb-3 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Editor panel — visible while creating or editing */}
      {editor && (
        <div className="bg-[#0c0c0c] border border-accent2/40 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-accent2">
              {editor.id == null ? "New group" : `Edit: ${editor.name || "(unnamed)"}`}
            </span>
            <button onClick={cancelEdit} className="text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                Name
              </label>
              <input
                value={editor.name}
                onChange={(e) => setEditor((x) => ({ ...x, name: e.target.value }))}
                placeholder="e.g. English, Telugu, Auto Wala"
                className="w-full bg-black border border-border rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-accent2"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
                Description (optional)
              </label>
              <input
                value={editor.description}
                onChange={(e) => setEditor((x) => ({ ...x, description: e.target.value }))}
                placeholder="What this group is for"
                className="w-full bg-black border border-border rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-accent2"
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
              Channels in this group ({editor.google_channel_ids.length} of {ytAccounts.length})
            </label>
            {ytAccounts.length === 0 ? (
              <div className="text-xs text-yellow-400">Connect a YouTube account first.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ytAccounts.map((a) => {
                  const gid = a.google_channel_id;
                  const sel = (editor.google_channel_ids || []).includes(gid);
                  return (
                    <button
                      key={gid || a.youtube_channel_title}
                      type="button"
                      onClick={() => gid && toggleDest(gid)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        sel
                          ? "bg-accent/30 border-accent text-white"
                          : "bg-black/30 border-border text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {sel ? "✓ " : ""}{a.youtube_channel_title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={cancelEdit} className="btn btn-secondary text-xs py-1 px-2">Cancel</button>
            <button
              onClick={saveEditor}
              disabled={saving || !editor.name.trim()}
              className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {editor.id == null ? "Create" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Existing groups list */}
      {loading && groups.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader2 size={14} className="animate-spin" /> Loading groups…
        </div>
      ) : groups.length === 0 && !editor ? (
        <div className="bg-[#0c0c0c] border border-border rounded p-3 text-xs text-gray-500 text-center">
          No groups yet. <strong className="text-accent2">Global</strong> (all
          channels) and <strong className="text-accent2">Individual</strong> (pick
          each time) work out of the box — create a group here only when you want
          a named preset.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {groups.map((g) => (
            <div key={g.id} className="bg-[#0c0c0c] border border-border rounded p-2.5">
              <div className="flex items-start gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-200 truncate">{g.name}</div>
                  {g.description && (
                    <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={g.description}>
                      {g.description}
                    </div>
                  )}
                </div>
                <button onClick={() => startEdit(g)} className="text-gray-500 hover:text-accent2" title="Edit">
                  <Edit2 size={12} />
                </button>
                <button onClick={() => removeGroup(g)} className="text-gray-500 hover:text-red-400" title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {(g.google_channel_ids || []).map((gid) => (
                  <span
                    key={gid}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-300 truncate max-w-[140px]"
                    title={nameByGid[gid] || gid}
                  >
                    {nameByGid[gid] || gid}
                  </span>
                ))}
                {(g.google_channel_ids || []).length === 0 && (
                  <span className="text-[10px] text-gray-600">(empty — add channels)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
