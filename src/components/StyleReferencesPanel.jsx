import React, { useEffect, useRef, useState } from "react";
import {
  Plus, Edit2, Trash2, Brain, Loader2, Palette, Info, RefreshCw,
} from "lucide-react";
import { api } from "../api/client";
import Modal from "./Modal";
import ChannelForm from "./ChannelForm";

/** Writing-voice study channels — Channel(kind="style") rows the SEO
 * writer borrows title rhythm + description style from. This is the FULL
 * management home (moved off the Channels page into Insights → SEO
 * Settings → Competitors, per the 2026-08 reorg). The data layer and the
 * SEO writing/learning engine are untouched — only the UI home moved.
 *
 * Which of these a video is written "in the style of" is picked per-publish
 * from the Writing-voice dropdown in the publish flow (style_source_id).
 */
export default function StyleReferencesPanel() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [modal, setModal]       = useState(null); // null | {mode:"create"} | {mode:"edit",channel}
  const [learningId, setLearningId] = useState(null);
  const [corpora, setCorpora]   = useState({});   // {channelId: corpus}
  const learnTimer = useRef(null);                 // learn-poll interval id

  // Stop any in-flight learn poll when we unmount (this tab is navigated
  // in/out freely), so it can't fire setState on an unmounted component.
  useEffect(() => () => { if (learnTimer.current) clearInterval(learnTimer.current); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const list = await api.listChannels({ kind: "styles" });
      setChannels(list || []);
    } catch (e) {
      setError(e?.message || "Failed to load study channels");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Pull corpus (learned-pattern) metadata so each card shows what it knows.
  useEffect(() => {
    channels.forEach((c) => {
      api.getChannelCorpus(c.id)
        .then((corpus) => setCorpora((p) => ({ ...p, [c.id]: corpus })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map((c) => c.id).join(",")]);

  async function handleCreate(payload) {
    await api.createChannel(payload);
    setModal(null);
    setNotice("Study channel added.");
    load();
  }
  async function handleUpdate(payload) {
    if (!modal?.channel?.id) return;
    await api.updateChannel(modal.channel.id, payload);
    setModal(null);
    setNotice("Study channel updated.");
    load();
  }
  async function handleDelete(ch) {
    if (!confirm(`Delete the "${ch.name}" study channel?\n\nThe SEO writer will stop borrowing its voice. Your own channels and published videos are not affected.`)) return;
    try {
      await api.deleteChannel(ch.id);
      setChannels((prev) => prev.filter((c) => c.id !== ch.id));
      setNotice(`Deleted "${ch.name}".`);
    } catch (e) {
      setError(e?.message || "Delete failed");
    }
  }
  async function handleLearn(ch) {
    setError(""); setNotice("");
    try {
      setLearningId(ch.id);
      await api.learnChannel(ch.id);
      if (learnTimer.current) clearInterval(learnTimer.current); // don't stack on double-click
      const startedAt = corpora[ch.id]?.refreshed_at || null;
      const until = Date.now() + 60_000;
      learnTimer.current = setInterval(async () => {
        try {
          const c = await api.getChannelCorpus(ch.id);
          if (c?.refreshed_at && c.refreshed_at !== startedAt) {
            setCorpora((prev) => ({ ...prev, [ch.id]: c }));
            clearInterval(learnTimer.current);
            setLearningId(null);
            const n = (c.payload && c.payload.sample_size) || 0;
            setNotice(`"${ch.name}" learned patterns from top ${n} videos.`);
          } else if (Date.now() > until) {
            clearInterval(learnTimer.current);
            setLearningId(null);
            // Don't leave the user staring at a stopped spinner with no word.
            setNotice(`"${ch.name}" is still learning in the background — press Re-learn shortly to refresh.`);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) {
      setLearningId(null);
      setError(e?.message || "Learn failed");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <Palette size={14} className="text-accent2" /> Study channels — writing voice
        </div>
        <button
          onClick={() => setModal({ mode: "create" })}
          className="bg-accent hover:bg-accent2 text-white text-[11px] font-medium px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors"
        >
          <Plus size={13} /> Add study channel
        </button>
      </div>

      <div className="mb-3 p-2.5 bg-blue-950/20 border border-blue-900/40 rounded text-[11px] text-gray-300 leading-relaxed flex items-start gap-2">
        <Info size={13} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          Add a channel whose style you like ("TV9 Telugu", "RTV", …), set its title
          formula &amp; description style, then <strong className="text-gray-100">Learn</strong> to mine it.
          {" "}<strong className="text-gray-100">No connecting needed</strong> — we study its
          public videos from its @handle.
          The SEO writer borrows its <strong className="text-gray-100">title rhythm + description voice</strong> —
          the reference channel's name/handle/brand tags are stripped before publish, so there is no strike risk.
          Pick which voice a video uses in the <strong className="text-gray-100">Writing voice</strong> dropdown when you publish.
        </div>
      </div>

      {error && <div className="text-[12px] text-red-300 mb-2">{error}</div>}
      {notice && <div className="text-[12px] text-emerald-300 mb-2">{notice}</div>}

      {loading && channels.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Loading study channels…
        </div>
      ) : channels.length === 0 ? (
        <div className="text-[12px] text-gray-500 py-6 text-center">
          No study channels yet — add one above to write your SEO in its voice.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {channels.map((ch) => {
            const corpus = corpora[ch.id];
            const learned = corpus?.refreshed_at;
            const sample = corpus?.payload?.sample_size || 0;
            const tagCount = (ch.fixed_tags || []).length;
            const hashCount = (ch.hashtags || []).length;
            return (
              <div key={ch.id} className="rounded-lg border border-border bg-[#0e1218] p-3 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-white truncate" title={ch.name}>{ch.name}</div>
                    {ch.handle && <div className="text-[10px] text-gray-500 truncate">{ch.handle}</div>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setModal({ mode: "edit", channel: ch })}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded" title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(ch)}
                      className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-950/30 rounded" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-1.5">
                  <span className="uppercase tracking-wide">{ch.language}</span>
                  <span>·</span>
                  <span>{tagCount} tag{tagCount === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{hashCount} hashtag{hashCount === 1 ? "" : "s"}</span>
                </div>

                {ch.title_formula && (
                  <p className="text-[10px] text-gray-400 bg-black/30 rounded px-2 py-1 mb-2 line-clamp-2 font-mono" title={ch.title_formula}>
                    {ch.title_formula}
                  </p>
                )}

                <div className="mt-auto pt-2 border-t border-border/60 flex items-center justify-between text-[11px] gap-2">
                  <span className="text-gray-500 truncate">
                    {learningId === ch.id
                      ? <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> analyzing…</span>
                      : learned
                        ? <span className="inline-flex items-center gap-1" title={`Learned from top ${sample} videos`}><Brain size={10} className="text-accent2" /> {sample} videos learned</span>
                        : <span className="text-gray-600">no patterns learned yet</span>}
                  </span>
                  <button onClick={() => handleLearn(ch)} disabled={learningId === ch.id}
                    className="inline-flex items-center gap-1 text-gray-500 hover:text-accent2 flex-shrink-0 disabled:opacity-50" title="Mine top videos + extract patterns">
                    <RefreshCw size={10} className={learningId === ch.id ? "animate-spin" : ""} />
                    {learned ? "Re-learn" : "Learn"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal?.mode === "create"} onClose={() => setModal(null)}
        title="Add study channel (writing voice)" size="lg">
        <ChannelForm onSubmit={handleCreate} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.mode === "edit"} onClose={() => setModal(null)}
        title={`Edit study channel: ${modal?.channel?.name ?? ""}`} size="lg">
        <ChannelForm initial={modal?.channel} onSubmit={handleUpdate} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}
