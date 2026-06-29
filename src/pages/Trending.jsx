import React, { useEffect, useMemo, useState } from "react";
import {
  Radar, Plus, Trash2, Loader2, AlertCircle, RefreshCw, ExternalLink,
  Flame, Clock, CheckCircle2, X, Zap, CheckSquare, Square, Film,
  UserCircle2, Star,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import ComplianceNote, { NoteLink } from "../components/ComplianceNote";

const URGENCY_COLORS = {
  hot:    "bg-red-500/20 text-red-300 border-red-500/30",
  normal: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const TIMELINE_OPTIONS = [
  { hours: 1,    label: "1h" },
  { hours: 6,    label: "6h" },
  { hours: 24,   label: "24h" },
  { hours: 24*7, label: "7d" },
  { hours: 24*30,label: "30d" },
  { hours: 0,    label: "All" },
];

export default function Trending() {
  const [topics, setTopics] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [unusedOnly, setUnusedOnly] = useState(true);
  const [sinceHours, setSinceHours] = useState(24);   // 0 = all time
  const [dateField, setDateField]   = useState("published_at");  // or fetched_at
  const [customRange, setCustomRange] = useState({ since: "", until: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompForm, setShowCompForm] = useState(false);
  const [selTopics, setSelTopics] = useState(() => new Set());
  const [selComps,  setSelComps]  = useState(() => new Set());
  const [bulkBusy,  setBulkBusy]  = useState(false);

  // ── HeyGen state (lifted from per-row so the modal lives at root) ──
  // heygenTarget: the topic currently being configured in the modal
  // heygenAssets: { avatars, voices, defaults } — fetched once on demand
  // heygenStatusByTopic: { topicId: { state, progress, message, error,
  //                                   job_id, clip_id } }
  // pollersRef: keep timer handles so we can clean up.
  const [heygenTarget,        setHeygenTarget]    = useState(null);
  const [heygenAssets,        setHeygenAssets]    = useState(null);
  const [heygenAssetsLoading, setHeygenAssetsLoad]= useState(false);
  const [heygenAssetsError,   setHeygenAssetsErr] = useState("");
  const [heygenStatusByTopic, setHeygenStatusByTopic] = useState({});
  const heygenPollersRef = React.useRef({});       // topic_id -> intervalId
  const nav = useNavigate();

  async function loadHeygenAssets(force = false) {
    if (heygenAssets && !force) return heygenAssets;
    setHeygenAssetsLoad(true); setHeygenAssetsErr("");
    try {
      const [avResp, vcResp, defResp] = await Promise.all([
        api.heygenAvatars(),
        api.heygenVoices(),
        api.heygenGetDefaults(),
      ]);
      const pack = {
        avatars:        avResp?.avatars || [],
        talking_photos: avResp?.talking_photos || [],
        voices:         vcResp?.voices || [],
        defaults:       defResp || {},
      };
      setHeygenAssets(pack);
      return pack;
    } catch (e) {
      setHeygenAssetsErr(e.message || "Failed to load HeyGen avatars/voices");
      return null;
    } finally {
      setHeygenAssetsLoad(false);
    }
  }

  // One-click entry point: if the server has env defaults OR the user
  // saved their own avatar/voice, fire generation immediately. Only
  // fall through to the picker modal when neither default exists.
  async function startOrPickHeygen(topic) {
    try {
      const def = await api.heygenGetDefaults();
      // Precedence: env wins when set (operator-configured canonical
      // defaults), user DB defaults are the fallback for users who
      // explicitly picked something else via the modal.
      const avatarId = (def?.env_default_avatar_id || def?.avatar_id || "").trim();
      const voiceId  = (def?.env_default_voice_id  || def?.voice_id  || "").trim();
      if (avatarId && voiceId) {
        startHeygenGeneration({ topic, avatarId, voiceId, saveDefault: false });
        return;
      }
    } catch (e) {
      // Couldn't reach defaults endpoint — fall through to modal so
      // the user can pick manually instead of being stuck.
      console.warn("heygen defaults fetch failed:", e.message);
    }
    setHeygenTarget(topic);
    loadHeygenAssets();
  }

  function closeHeygenModal() { setHeygenTarget(null); }

  function setHeygenStatus(topicId, patch) {
    setHeygenStatusByTopic((cur) => ({
      ...cur,
      [topicId]: { ...(cur[topicId] || {}), ...patch },
    }));
  }

  async function startHeygenGeneration({ topic, avatarId, voiceId, saveDefault }) {
    closeHeygenModal();
    setHeygenStatus(topic.id, {
      state: "queued", progress: 0, message: "Queued", error: "",
      job_id: null, clip_id: null,
    });
    try {
      if (saveDefault) {
        try {
          await api.heygenSaveDefaults({ avatar_id: avatarId, voice_id: voiceId });
          // Refresh defaults so subsequent modal opens pre-select them.
          if (heygenAssets) {
            setHeygenAssets({
              ...heygenAssets,
              defaults: { ...heygenAssets.defaults, avatar_id: avatarId, voice_id: voiceId },
            });
          }
        } catch (e) {
          console.warn("heygen save-defaults failed:", e.message);
        }
      }
      await api.heygenGenerateFromTopic(topic.id, {
        platform:  "youtube_short",
        language:  "te",
        avatar_id: avatarId,
        voice_id:  voiceId,
      });
    } catch (e) {
      setHeygenStatus(topic.id, { state: "error", error: e.message });
      return;
    }
    // Poll status every 4 s; auto-navigate on done.
    const started = Date.now();
    const tick = async () => {
      try {
        const s = await api.heygenStatus(topic.id);
        setHeygenStatus(topic.id, s);
        if (s.state === "done" && s.job_id && s.clip_id) {
          clearInterval(heygenPollersRef.current[topic.id]);
          delete heygenPollersRef.current[topic.id];
          nav(`/jobs/${s.job_id}/v4-edit`);
        } else if (s.state === "error") {
          clearInterval(heygenPollersRef.current[topic.id]);
          delete heygenPollersRef.current[topic.id];
        } else if (Date.now() - started > 20 * 60 * 1000) {
          clearInterval(heygenPollersRef.current[topic.id]);
          delete heygenPollersRef.current[topic.id];
          setHeygenStatus(topic.id, { state: "error", error: "Polling timed out after 20 min" });
        }
      } catch (e) {
        clearInterval(heygenPollersRef.current[topic.id]);
        delete heygenPollersRef.current[topic.id];
        setHeygenStatus(topic.id, { state: "error", error: e.message });
      }
    };
    heygenPollersRef.current[topic.id] = setInterval(tick, 4000);
    tick();
  }

  // Clean up timers on unmount so we don't leak between page navigations.
  useEffect(() => () => {
    Object.values(heygenPollersRef.current).forEach((id) => clearInterval(id));
    heygenPollersRef.current = {};
  }, []);

  function toggleTopic(id) {
    setSelTopics((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleComp(id) {
    setSelComps((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function handleBulkDeleteTopics() {
    if (selTopics.size === 0) return;
    if (!confirm(`Delete ${selTopics.size} topic(s)?`)) return;
    setBulkBusy(true);
    const ids = Array.from(selTopics);
    const results = await Promise.allSettled(ids.map((id) => api.deleteTopic(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) setError(`Deleted ${ids.length - failed}/${ids.length}. ${failed} failed.`);
    else setNotice(`Deleted ${ids.length} topic(s).`);
    setSelTopics(new Set());
    setBulkBusy(false);
    load();
  }
  async function handleBulkDeleteComps() {
    if (selComps.size === 0) return;
    if (!confirm(`Remove ${selComps.size} competitor(s)?`)) return;
    setBulkBusy(true);
    const ids = Array.from(selComps);
    const results = await Promise.allSettled(ids.map((id) => api.deleteCompetitor(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) setError(`Removed ${ids.length - failed}/${ids.length}. ${failed} failed.`);
    else setNotice(`Removed ${ids.length} competitor(s).`);
    setSelComps(new Set());
    setBulkBusy(false);
    load();
  }

  async function load() {
    try {
      const [t, c] = await Promise.all([
        api.listTopics({
          urgency:     filter,
          unused_only: unusedOnly,
          limit:       100,
          since_hours: sinceHours || undefined,
          since:       customRange.since ? new Date(customRange.since).toISOString() : undefined,
          until:       customRange.until ? new Date(customRange.until).toISOString() : undefined,
          date_field:  dateField,
        }),
        api.listCompetitors(),
      ]);
      setTopics(t || []);
      setCompetitors(c || []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load trending topics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter, unusedOnly, sinceHours, dateField, customRange.since, customRange.until]);

  async function handleRefresh() {
    try {
      setRefreshing(true);
      // Send the current timeline window so the sweep only fetches + summarizes
      // videos inside it — no more pull-then-filter.  0 = "All time" → no cap.
      await api.refreshTrending(sinceHours > 0 ? sinceHours : undefined);
      const label = sinceHours > 0
        ? (TIMELINE_OPTIONS.find((o) => o.hours === sinceHours)?.label || `${sinceHours}h`)
        : "all time";
      setNotice(`Radar sweeping for topics from the last ${label} — new topics will appear shortly.`);
      setTimeout(load, 8000);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeleteComp(c) {
    if (!confirm(`Remove competitor "${c.name}"?`)) return;
    try {
      await api.deleteCompetitor(c.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radar className="text-accent2" size={22} />
          <h1 className="text-xl font-semibold text-white">Trend Finder</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompForm(true)}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-1.5 rounded text-sm"
          >
            <Plus size={14} /> Competitor
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Sweep Now
          </button>
        </div>
      </header>

      <ComplianceNote className="mb-4">
        <p>
          Trend Finder uses only public data from YouTube API Services, such as public video and channel stats
          and search results. It does not access private analytics and cannot see channels you have not
          connected. Figures are estimates and may differ from YouTube Studio.
        </p>
        <p>
          Kaizer X is not affiliated with or endorsed by YouTube or Google. Subject to the{" "}
          <NoteLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</NoteLink>.
        </p>
      </ComplianceNote>

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

      {/* Competitor bar */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wider text-gray-500">Competitors ({competitors.length})</h2>
          {selComps.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-300">{selComps.size} selected</span>
              <button
                onClick={handleBulkDeleteComps}
                disabled={bulkBusy}
                className="text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-2 py-1 rounded flex items-center gap-1"
              >
                {bulkBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
              <button onClick={() => setSelComps(new Set())} className="text-xs text-gray-500 hover:text-white">clear</button>
            </div>
          )}
        </div>
        {competitors.length === 0 ? (
          <p className="text-sm text-gray-500">
            No competitor channels tracked yet. Add one to populate the topic feed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {competitors.map((c) => {
              const sel = selComps.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
                    sel ? "bg-red-500/20 text-red-200 ring-1 ring-red-500/40" : "bg-white/5 text-gray-200"
                  }`}
                >
                  <button
                    onClick={() => toggleComp(c.id)}
                    className={sel ? "text-red-300" : "text-gray-500 hover:text-gray-200"}
                    title={sel ? "Deselect" : "Select"}
                  >
                    {sel ? <CheckSquare size={12} /> : <Square size={12} />}
                  </button>
                  <span>{c.name}</span>
                  <span className="text-xs text-gray-500">{c.language}</span>
                  <button
                    onClick={() => handleDeleteComp(c)}
                    className="text-gray-500 hover:text-red-400"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Timeline filter */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 mr-1">Window</span>
        {TIMELINE_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.label}
            label={opt.label}
            active={sinceHours === opt.hours && !customRange.since && !customRange.until}
            onClick={() => {
              setSinceHours(opt.hours);
              setCustomRange({ since: "", until: "" });
              setShowCustom(false);
            }}
            icon={Clock}
          />
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
            showCustom || customRange.since || customRange.until
              ? "bg-accent2 text-white"
              : "bg-white/5 text-gray-300 hover:bg-white/10"
          }`}
        >
          Custom
        </button>
        <select
          value={dateField}
          onChange={(e) => setDateField(e.target.value)}
          className="ml-auto bg-black border border-border rounded px-1.5 py-1 text-xs text-gray-300"
          title="Which timestamp the window applies to"
        >
          <option value="published_at">by published time</option>
          <option value="fetched_at">by sweep time</option>
        </select>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-gray-500">From</span>
          <input
            type="datetime-local"
            value={customRange.since}
            onChange={(e) => { setCustomRange((r) => ({ ...r, since: e.target.value })); setSinceHours(0); }}
            className="bg-black border border-border rounded px-2 py-1 text-gray-200"
          />
          <span className="text-gray-500">to</span>
          <input
            type="datetime-local"
            value={customRange.until}
            onChange={(e) => { setCustomRange((r) => ({ ...r, until: e.target.value })); setSinceHours(0); }}
            className="bg-black border border-border rounded px-2 py-1 text-gray-200"
          />
          {(customRange.since || customRange.until) && (
            <button
              onClick={() => { setCustomRange({ since: "", until: "" }); setSinceHours(24); }}
              className="text-gray-500 hover:text-red-400 ml-1"
              title="Clear custom range"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <FilterChip label="All" active={filter === ""} onClick={() => setFilter("")} />
        <FilterChip label="Hot" active={filter === "hot"} onClick={() => setFilter("hot")} icon={Flame} />
        <FilterChip label="Normal" active={filter === "normal"} onClick={() => setFilter("normal")} />
        <FilterChip label="Low" active={filter === "low"} onClick={() => setFilter("low")} />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} />
          Unused only
        </label>
      </div>

      {selTopics.size > 0 && (
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 mb-3 bg-[#1a0f0f]/95 backdrop-blur border-y border-red-900/50 flex items-center gap-3">
          <button onClick={() => setSelTopics(new Set())} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
          <span className="text-sm text-gray-200"><strong className="text-red-300">{selTopics.size}</strong> topic(s) selected</span>
          <button
            onClick={() => setSelTopics(selTopics.size === topics.length ? new Set() : new Set(topics.map((t) => t.id)))}
            className="text-xs text-gray-400 hover:text-white"
          >
            {selTopics.size === topics.length ? "Unselect all" : "Select all"}
          </button>
          <div className="ml-auto">
            <button
              onClick={handleBulkDeleteTopics}
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
      ) : topics.length === 0 ? (
        <div className="text-center text-gray-500 py-10">
          No topics found. Add competitors and click "Sweep Now".
        </div>
      ) : (
        <div className="grid gap-2">
          {topics.map((t) => (
            <TopicRow
              key={t.id}
              topic={t}
              selected={selTopics.has(t.id)}
              onToggleSelect={() => toggleTopic(t.id)}
              onHeygen={() => startOrPickHeygen(t)}
              heygenStatus={heygenStatusByTopic[t.id]}
            />
          ))}
        </div>
      )}

      {showCompForm && (
        <CompetitorForm
          onSave={() => { setShowCompForm(false); load(); }}
          onCancel={() => setShowCompForm(false)}
        />
      )}

      {heygenTarget && (
        <HeyGenModal
          topic={heygenTarget}
          assets={heygenAssets}
          loading={heygenAssetsLoading}
          error={heygenAssetsError}
          onRetryLoad={() => loadHeygenAssets(true)}
          onCancel={closeHeygenModal}
          onGenerate={(opts) => startHeygenGeneration({ topic: heygenTarget, ...opts })}
        />
      )}
    </div>
  );
}

// ─── HeyGen avatar/voice picker modal ────────────────────────────
// Opens when the user clicks the generate button on a topic row.
// Shows the user's saved defaults pre-selected (server-wide env fallback
// when the user hasn't picked yet). User can save the current pick as
// their personal default via the checkbox at the bottom.

function HeyGenModal({ topic, assets, loading, error, onRetryLoad, onCancel, onGenerate }) {
  // Server-wide env defaults are the fallback when user_defaults are blank.
  const userDefAv  = assets?.defaults?.avatar_id || "";
  const userDefVc  = assets?.defaults?.voice_id || "";
  const envDefAv   = assets?.defaults?.env_default_avatar_id || "";
  const envDefVc   = assets?.defaults?.env_default_voice_id || "";

  const [avatarId,   setAvatarId]   = useState(userDefAv || envDefAv || "");
  const [voiceId,    setVoiceId]    = useState(userDefVc || envDefVc || "");
  const [saveDef,    setSaveDef]    = useState(false);
  const [voiceFilter,setVoiceFilter]= useState("Telugu");

  // When the user-defaults arrive after the modal opened, pre-fill.
  useEffect(() => {
    if (!avatarId && userDefAv)  setAvatarId(userDefAv);
    if (!voiceId  && userDefVc)  setVoiceId(userDefVc);
    if (!avatarId && envDefAv)   setAvatarId(envDefAv);
    if (!voiceId  && envDefVc)   setVoiceId(envDefVc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDefAv, userDefVc, envDefAv, envDefVc]);

  // When a new avatar is picked, auto-jump to its default voice if the user
  // hasn't manually chosen one this session.
  const avatars = assets?.avatars || [];
  const voices  = assets?.voices  || [];
  const selectedAvatar = useMemo(
    () => avatars.find((a) => a.avatar_id === avatarId),
    [avatars, avatarId],
  );

  // Voice list, filtered by language search (HeyGen returns 1500+ voices).
  const filteredVoices = useMemo(() => {
    const q = voiceFilter.trim().toLowerCase();
    if (!q) return voices.slice(0, 60);
    return voices.filter((v) =>
      (v.language || "").toLowerCase().includes(q) ||
      (v.name     || "").toLowerCase().includes(q),
    ).slice(0, 60);
  }, [voices, voiceFilter]);

  const canGenerate = !!avatarId && !!voiceId && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0d0d0d] border border-border rounded-lg max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <header className="p-4 border-b border-border flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white flex items-center gap-1.5">
              <UserCircle2 size={18} className="text-accent2" /> Generate avatar video
            </h3>
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
              For: <span className="text-gray-200">{topic.video_title}</span>
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </header>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading avatars + voices from HeyGen…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">
            <AlertCircle size={14} className="inline mr-1.5" />
            {error}
            <button onClick={onRetryLoad} className="block mt-2 text-xs text-accent hover:underline">Retry</button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* Avatar grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-wider text-gray-400">
                  Pick an avatar ({avatars.length} available)
                </h4>
                {userDefAv && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <Star size={10} /> default = your last pick
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
                {avatars.map((a) => {
                  const isSel = a.avatar_id === avatarId;
                  return (
                    <button
                      key={a.avatar_id}
                      type="button"
                      onClick={() => {
                        setAvatarId(a.avatar_id);
                        // Auto-jump to avatar's default voice if voice not set yet.
                        if (!voiceId && a.default_voice_id) setVoiceId(a.default_voice_id);
                      }}
                      className={`relative rounded overflow-hidden border text-left transition-all ${
                        isSel
                          ? "border-accent2 ring-2 ring-accent2/40"
                          : "border-border hover:border-gray-500"
                      }`}
                    >
                      {a.preview_image_url ? (
                        <img
                          src={a.preview_image_url}
                          alt={a.avatar_name}
                          className="w-full aspect-square object-cover bg-surface"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-surface flex items-center justify-center">
                          <UserCircle2 size={32} className="text-gray-600" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-black/70 text-[10px]">
                        <div className="text-white truncate">{a.avatar_name || a.avatar_id}</div>
                        <div className="text-gray-500 truncate flex items-center gap-1">
                          {a.gender || ""}
                          {a.premium && <span className="text-amber-400">★ premium</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-wider text-gray-400">
                  Voice
                </h4>
                <input
                  type="text"
                  value={voiceFilter}
                  onChange={(e) => setVoiceFilter(e.target.value)}
                  placeholder="filter by language / name (e.g. Telugu)"
                  className="bg-black border border-border rounded px-2 py-1 text-[11px] text-gray-200 w-56"
                />
              </div>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full bg-black border border-border rounded px-2 py-1.5 text-sm text-white"
              >
                <option value="">— pick a voice —</option>
                {filteredVoices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.language || "?"} · {v.name || v.voice_id} · {v.gender || ""}
                    {selectedAvatar?.default_voice_id === v.voice_id ? "  (avatar default)" : ""}
                  </option>
                ))}
              </select>
              {selectedAvatar?.default_voice_id && voiceId !== selectedAvatar.default_voice_id && (
                <button
                  type="button"
                  onClick={() => setVoiceId(selectedAvatar.default_voice_id)}
                  className="mt-1 text-[10px] text-accent hover:underline"
                >
                  use avatar's default voice
                </button>
              )}
            </div>
          </div>
        )}

        <footer className="p-4 border-t border-border flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={saveDef}
              onChange={(e) => setSaveDef(e.target.checked)}
            />
            Set as my default for future generations
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onGenerate({ avatarId, voiceId, saveDefault: saveDef })}
              disabled={!canGenerate}
              className="px-4 py-1.5 bg-accent2 hover:bg-accent2/80 text-white text-sm rounded disabled:opacity-40 flex items-center gap-1.5"
            >
              <UserCircle2 size={14} /> Generate
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TopicRow({ topic, selected, onToggleSelect, onHeygen, heygenStatus }) {
  const ago = topic.published_at ? timeAgo(topic.published_at) : "—";
  const color = URGENCY_COLORS[topic.urgency] || URGENCY_COLORS.normal;

  // Active generation = anything between queued and downloading.
  const ACTIVE_STATES = new Set([
    "queued", "transcribing", "scripting",
    "heygen_pending", "heygen_processing", "downloading",
  ]);
  const hgState = heygenStatus?.state || "";
  const hgBusy  = ACTIVE_STATES.has(hgState);
  const hgErr   = hgState === "error" ? (heygenStatus?.error || "error") : "";
  const hgProgressLabel = (() => {
    if (!hgBusy) return "";
    const pct = typeof heygenStatus?.progress === "number" ? `${heygenStatus.progress}% · ` : "";
    const human = {
      queued:             "queued",
      transcribing:       "pulling YouTube transcript",
      scripting:          "building anchor script",
      heygen_pending:     "submitted to HeyGen",
      heygen_processing:  "HeyGen rendering avatar",
      downloading:        "downloading rendered video",
    }[hgState] || hgState;
    return `${pct}${human}`;
  })();

  return (
    <div className={`bg-[#111] border rounded p-3 hover:bg-[#161616] ${
      selected ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border"
    }`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleSelect}
          className={`mt-0.5 flex-shrink-0 ${selected ? "text-red-400" : "text-gray-500 hover:text-gray-200"}`}
          title={selected ? "Deselect" : "Select"}
        >
          {selected ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`}>
              {topic.urgency === "hot" && <Flame size={10} className="inline mr-0.5" />}
              {topic.urgency}
            </span>
            <span className="text-xs text-gray-500">{topic.source}</span>
            <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} /> {ago}</span>
            <span className="text-xs text-gray-500">{topic.view_count?.toLocaleString() || 0} views</span>
            {topic.used_for_job_id && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-300">
                ✓ Used · Job #{topic.used_for_job_id}
              </span>
            )}
          </div>
          <div className="text-white text-sm font-medium mb-1 line-clamp-2">
            {topic.video_title}
          </div>
          {topic.topic_summary && topic.topic_summary !== topic.video_title && (
            <div className="text-xs text-gray-400 mb-1">{topic.topic_summary}</div>
          )}
          {topic.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {topic.keywords.slice(0, 6).map((k, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-gray-400">#{k}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {topic.video_url && (
            <a
              href={topic.video_url}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded"
              title="Open on YouTube"
            >
              <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={onHeygen}
            disabled={hgBusy}
            title="Generate a HeyGen avatar video from this topic"
            className="p-1.5 text-accent2 hover:text-white hover:bg-accent2/10 rounded disabled:opacity-50"
          >
            {hgBusy ? <Loader2 size={14} className="animate-spin" /> : <UserCircle2 size={14} />}
          </button>
        </div>
      </div>
      {hgBusy && (
        <div className="mt-2 ml-6 text-[10px] text-accent2 flex items-center gap-1.5">
          <Loader2 size={10} className="animate-spin" /> HeyGen: {hgProgressLabel}
        </div>
      )}
      {hgErr && (
        <div className="mt-2 ml-6 text-[10px] text-red-400 break-words">
          HeyGen error: {hgErr}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
        active ? "bg-accent text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"
      }`}
    >
      {Icon && <Icon size={11} />} {label}
    </button>
  );
}

const REGIONS = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AE", name: "UAE" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "DE", name: "Germany" },
];

function CompetitorForm({ onSave, onCancel }) {
  const [tab, setTab] = useState("browse"); // browse | profiles | paste
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Paste tab ──
  const [form, setForm] = useState({
    name: "", handle: "", youtube_channel_id: "", language: "te", active: true,
  });

  // ── Browse tab ──
  const [region, setRegion]         = useState("IN");
  const [category, setCategory]     = useState("");
  const [categories, setCategories] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pickedIds, setPickedIds]   = useState(() => new Set());

  // ── Profiles tab ──
  const [profileSuggest, setProfileSuggest] = useState([]);
  const [pickedProfiles, setPickedProfiles] = useState(() => new Set());

  // Load categories + profile suggestions once
  useEffect(() => {
    api.listYtCategories(region)
      .then((r) => setCategories(r.categories || []))
      .catch(() => setCategories([]));
  }, [region]);
  useEffect(() => {
    api.suggestFromProfiles()
      .then((r) => setProfileSuggest(r.results || []))
      .catch(() => setProfileSuggest([]));
  }, []);

  async function runSuggest() {
    setLoadingSuggest(true);
    setErr("");
    try {
      const r = await api.suggestChannels({ region, category, limit: 20 });
      setSuggestions(r.results || []);
      setPickedIds(new Set());
    } catch (e) {
      setErr(e.message || "Failed to load suggestions");
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function addMany(rows) {
    setSaving(true);
    setErr("");
    const failures = [];
    for (const row of rows) {
      try {
        await api.createCompetitor({
          name:     row.name,
          handle:   row.handle || "",
          youtube_channel_id: row.youtube_channel_id || row.handle || "",
          language: row.language || "te",
          active:   true,
        });
      } catch (e) {
        failures.push(`${row.name}: ${e.message}`);
      }
    }
    setSaving(false);
    if (failures.length && failures.length === rows.length) {
      setErr(`Add failed: ${failures[0]}`);
    } else {
      onSave();
    }
  }

  async function submitPaste() {
    try {
      setSaving(true); setErr("");
      await api.createCompetitor(form);
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[#0c0c0c] border border-border rounded max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h2 className="text-white font-medium">Add Competitor Channels</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0 bg-[#0a0a0a]">
          {[
            { key: "browse",   label: "Browse by category" },
            { key: "profiles", label: `From my profiles${profileSuggest.length ? ` (${profileSuggest.length})` : ""}` },
            { key: "paste",    label: "Paste handle/URL" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "text-accent2 border-b-2 border-accent2"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 flex-1 overflow-y-auto text-sm">
          {err && (
            <div className="p-2 mb-3 bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded">{err}</div>
          )}

          {/* ── Browse by category ────────────────────────────────────── */}
          {tab === "browse" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Region</label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                  >
                    {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-gray-500 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={runSuggest}
                disabled={loadingSuggest}
                className="w-full bg-accent2 hover:bg-accent text-white text-sm py-2 rounded flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loadingSuggest ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
                Find trending channels
              </button>

              {suggestions.length > 0 && (
                <>
                  <div className="text-[11px] text-gray-500 mt-3 flex items-center justify-between">
                    <span>{suggestions.length} channels found · {pickedIds.size} selected</span>
                    <button
                      onClick={() => setPickedIds(new Set(suggestions.map((s) => s.youtube_channel_id)))}
                      className="text-accent2 hover:text-white"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {suggestions.map((c) => {
                      const isSel = pickedIds.has(c.youtube_channel_id);
                      return (
                        <label
                          key={c.youtube_channel_id}
                          className={`flex items-start gap-2.5 p-2 rounded border cursor-pointer transition-colors ${
                            isSel ? "bg-accent/10 border-accent/50" : "border-border hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() =>
                              setPickedIds((prev) => {
                                const n = new Set(prev);
                                if (n.has(c.youtube_channel_id)) n.delete(c.youtube_channel_id);
                                else n.add(c.youtube_channel_id);
                                return n;
                              })
                            }
                            className="mt-1 accent-accent2"
                          />
                          {c.thumbnail_url && (
                            <img src={c.thumbnail_url} alt="" className="w-10 h-10 rounded flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-100 font-medium truncate">{c.name}</div>
                            <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-2">
                              {c.handle && <span>@{c.handle.replace(/^@/, "")}</span>}
                              {c.subscribers > 0 && <span>{c.subscribers.toLocaleString()} subs</span>}
                              {c.total_videos > 0 && <span>{c.total_videos} videos</span>}
                              {c.country && <span>{c.country}</span>}
                            </div>
                            {c.sample_video_title && (
                              <div className="text-[10px] text-gray-600 truncate mt-0.5" title={c.sample_video_title}>
                                Trending: {c.sample_video_title}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {suggestions.length === 0 && !loadingSuggest && (
                <div className="text-[11px] text-gray-500 text-center py-6 border border-dashed border-border rounded">
                  Pick a category then click <strong className="text-gray-300">Find trending channels</strong>.
                </div>
              )}
            </div>
          )}

          {/* ── From my profiles ──────────────────────────────────────── */}
          {tab === "profiles" && (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                Style profiles you've created that carry a <code className="bg-black/40 px-1 rounded">@handle</code>.
                Tracking them as competitors lets the radar sweep their uploads for topic ideas.
              </p>
              {profileSuggest.length === 0 ? (
                <div className="text-[11px] text-gray-500 text-center py-6 border border-dashed border-border rounded">
                  No style profiles with a YouTube handle. Add handles on the Style Profiles page to see them here.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-gray-500 flex items-center justify-between">
                    <span>{profileSuggest.length} profile{profileSuggest.length === 1 ? "" : "s"} available</span>
                    <button
                      onClick={() => setPickedProfiles(new Set(profileSuggest.map((p) => p.handle)))}
                      className="text-accent2 hover:text-white"
                    >
                      Select all
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto">
                    {profileSuggest.map((p) => {
                      const isSel = pickedProfiles.has(p.handle);
                      return (
                        <label
                          key={p.handle}
                          className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                            isSel ? "bg-accent/10 border-accent/50" : "border-border hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() =>
                              setPickedProfiles((prev) => {
                                const n = new Set(prev);
                                if (n.has(p.handle)) n.delete(p.handle);
                                else n.add(p.handle);
                                return n;
                              })
                            }
                            className="accent-accent2"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-100 truncate">{p.name}</div>
                            <div className="text-[10px] text-gray-500">{p.handle} · {p.language}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Paste handle/URL ──────────────────────────────────────── */}
          {tab === "paste" && (
            <div className="space-y-3">
              <div>
                <label className="block text-gray-400 mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white"
                  placeholder="Prime9 News"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Channel handle, URL, or ID *</label>
                <input
                  value={form.youtube_channel_id}
                  onChange={(e) => setForm({ ...form, youtube_channel_id: e.target.value })}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                  placeholder="@TV9TeluguLive   (or youtube.com/@TV9TeluguLive   or UCxxx…)"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Language</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-xs"
                >
                  <option value="te">Telugu</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2 flex-shrink-0">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded">
            Cancel
          </button>
          {tab === "browse" && (
            <button
              onClick={() => {
                const rows = suggestions
                  .filter((s) => pickedIds.has(s.youtube_channel_id))
                  .map((s) => ({
                    name:     s.name,
                    handle:   s.handle ? (s.handle.startsWith("@") ? s.handle : `@${s.handle}`) : "",
                    youtube_channel_id: s.youtube_channel_id,
                    language: "te",
                  }));
                if (rows.length) addMany(rows);
              }}
              disabled={saving || pickedIds.size === 0}
              className="ml-auto px-3 py-1.5 text-sm bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Add {pickedIds.size || ""} channel{pickedIds.size === 1 ? "" : "s"}
            </button>
          )}
          {tab === "profiles" && (
            <button
              onClick={() => {
                const rows = profileSuggest
                  .filter((p) => pickedProfiles.has(p.handle))
                  .map((p) => ({
                    name:     p.name,
                    handle:   p.handle,
                    youtube_channel_id: p.handle,   // backend resolver handles @handle
                    language: p.language || "te",
                  }));
                if (rows.length) addMany(rows);
              }}
              disabled={saving || pickedProfiles.size === 0}
              className="ml-auto px-3 py-1.5 text-sm bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Add {pickedProfiles.size || ""} profile{pickedProfiles.size === 1 ? "" : "s"}
            </button>
          )}
          {tab === "paste" && (
            <button
              onClick={submitPaste}
              disabled={saving || !form.name.trim() || !form.youtube_channel_id.trim()}
              className="ml-auto px-3 py-1.5 text-sm bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s`;
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h`;
    return `${Math.round(diff / 86400)}d`;
  } catch { return "—"; }
}
