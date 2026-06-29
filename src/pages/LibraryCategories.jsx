import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Save, X, SlidersHorizontal,
  Shield, GripVertical,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";

// Predefined accent colors matching the seed defaults so admins
// don't have to memorize hex codes.
const COLOR_SWATCHES = [
  "#E0312B", "#FF4B45", "#F5C518", "#f1c40f", "#27ae60",
  "#16a085", "#2980b9", "#9b59b6", "#34495e", "#e84393",
  "#e67e22", "#7f8c8d",
];

function CategoryRow({ cat, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(cat.name);
  const [color, setColor]     = useState(cat.color || "#7f8c8d");
  const [busy, setBusy]       = useState(false);

  useEffect(() => { setName(cat.name); setColor(cat.color || "#7f8c8d"); }, [cat.name, cat.color]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(cat.id, { name: name.trim(), color });
      setEditing(false);
    } finally { setBusy(false); }
  }

  async function destroy() {
    if (!confirm(
      `Delete "${cat.name}"?\n\n` +
      `Videos using this category will not be deleted — they'll just be uncategorized.`
    )) return;
    setBusy(true);
    try { await onDelete(cat.id); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-panel
                    hover:bg-panel-hover hover:border-border-hover transition-all">
      <GripVertical size={14} className="text-gray-700 flex-shrink-0"/>
      <span className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: color }}/>
      {editing ? (
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <input
            type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80} disabled={busy}
            className="flex-1 min-w-[140px] px-3 py-1.5 rounded-md bg-surface border border-border
                       text-sm text-gray-200 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex items-center gap-1">
            {COLOR_SWATCHES.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-all
                                  ${color === c ? "border-white scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ background: c }}
                      aria-label={`Pick ${c}`}/>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{cat.name}</span>
          {cat.item_count > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">({cat.item_count} videos)</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={busy || !name.trim()}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md
                               bg-accent text-white border border-accent
                               hover:bg-accent2 disabled:opacity-40 transition-all">
              {busy ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
            </button>
            <button type="button" disabled={busy}
                    onClick={() => { setEditing(false); setName(cat.name); setColor(cat.color || "#7f8c8d"); }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md
                               border border-border text-gray-400 bg-surface
                               hover:bg-panel-hover hover:text-white transition-all">
              <X size={12}/>
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md
                               border border-border text-gray-400 bg-surface
                               hover:bg-panel-hover hover:text-white transition-all"
                    title="Rename">
              <Pencil size={12}/>
            </button>
            <button type="button" onClick={destroy} disabled={busy}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md
                               border border-border text-gray-400 bg-surface
                               hover:bg-red-900/40 hover:border-red-700/60 hover:text-red-300
                               disabled:opacity-40 transition-all"
                    title="Delete">
              {busy ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LibraryCategories() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cats, setCats] = useState([]);
  const [loading, setLoad] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#E0312B");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoad(true);
    try {
      const rows = await api.listLibraryCategories();
      setCats(rows || []);
    } catch {
      setCats([]);
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = useCallback(async (id, body) => {
    await api.updateLibraryCategory(id, body);
    await refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id) => {
    await api.deleteLibraryCategory(id);
    await refresh();
  }, [refresh]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.createLibraryCategory({ name: newName.trim(), color: newColor });
      setNewName(""); setNewColor("#E0312B"); setCreating(false);
      await refresh();
    } catch (e) {
      alert("Create failed: " + (e.message || "unknown error"));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-600">
        <Loader2 size={28} className="animate-spin"/>
      </div>
    );
  }

  if (!user?.is_admin) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-border bg-panel/60 p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-yellow-900/30 border border-yellow-700/40 mb-4">
            <Shield size={22} className="text-yellow-300"/>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Admin access only</h1>
          <p className="text-sm text-gray-400 mb-5">
            Category management is restricted to admins.
          </p>
          <Link to="/library"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm
                           bg-accent text-white border border-accent hover:bg-accent2">
            <ArrowLeft size={14}/> Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/library"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md
                         border border-border bg-panel text-gray-400
                         hover:bg-panel-hover hover:text-white hover:border-border-hover transition-all">
          <ArrowLeft size={14}/>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                          bg-accent/15 border border-accent/30 text-[10px] uppercase
                          tracking-[0.18em] font-bold text-accent2 mb-1">
            <SlidersHorizontal size={10}/> Admin Tools
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Library Categories
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Rename anything — videos are bound by category ID, not name. Deleting
            just un-categorizes the videos that used it; nothing gets lost.
          </p>
        </div>
      </div>

      {/* Create-new */}
      {creating ? (
        <div className="rounded-2xl border border-accent/40 bg-panel p-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text" autoFocus value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              maxLength={80} disabled={busy}
              className="flex-1 min-w-[160px] px-3 py-2 rounded-md bg-surface border border-border
                         text-sm text-gray-200 placeholder:text-gray-600
                         focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex items-center gap-1">
              {COLOR_SWATCHES.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition-all
                                    ${newColor === c ? "border-white scale-110" : "border-transparent hover:scale-105"}`}
                        style={{ background: c }}
                        aria-label={`Pick ${c}`}/>
              ))}
            </div>
            <button type="button" onClick={handleCreate} disabled={busy || !newName.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold
                               bg-accent text-white border border-accent
                               hover:bg-accent2 disabled:opacity-40 transition-all">
              {busy ? <><Loader2 size={12} className="animate-spin"/> Saving</> : "Create"}
            </button>
            <button type="button" disabled={busy}
                    onClick={() => { setCreating(false); setNewName(""); setNewColor("#E0312B"); }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md
                               border border-border text-gray-400 bg-surface
                               hover:bg-panel-hover hover:text-white transition-all">
              <X size={12}/>
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                           bg-accent text-white border border-accent hover:bg-accent2 hover:border-accent2
                           shadow-glow active:scale-[0.97] transition-all mb-4">
          <Plus size={14}/> New category
        </button>
      )}

      {/* Existing categories */}
      {loading ? (
        <div className="space-y-2">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-[60px] rounded-xl border border-border bg-panel/60 animate-pulse"/>
          ))}
        </div>
      ) : cats.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed bg-panel/40 p-8 text-center">
          <p className="text-sm text-gray-400">No categories yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cats.map(c => (
            <CategoryRow key={c.id} cat={c} onSave={handleSave} onDelete={handleDelete}/>
          ))}
        </div>
      )}
    </div>
  );
}
