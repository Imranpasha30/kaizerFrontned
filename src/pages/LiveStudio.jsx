import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, Upload, Plus, Trash2, X, Loader2, AlertCircle,
  CheckCircle2, Sparkles, Clock, Tv, RefreshCw,
} from "lucide-react";
import { api } from "../api/client";

/**
 * Live Studio — bulk RTMP-live publishing.
 *
 * Flow:
 *   1) User drops N videos.
 *   2) Per video card: pick M channels, set live-duration hours,
 *      fill SEO (or click "Use AI" — runs server validator).
 *   3) Submit → creates LiveBatch + N*M LiveStream rows.
 *   4) Frontend uploads chunks for each video sequentially.
 *   5) After each video's last chunk lands, fire /start for every
 *      stream that uses that video → backend spawns the ffmpeg
 *      RTMP push (one per channel).
 *   6) Status board polls every 4s; auto-stops once everything is
 *      terminal (done | failed | canceled).
 *
 * Note: the chunk loop blocks on each chunk — we don't parallelise
 * within one video, so the user's uplink is fully utilised on one
 * stream at a time. Across videos in the batch, sequential.
 */

const CHUNK_SIZE = 5 * 1024 * 1024;   // 5 MB — matches backend threshold

// Per-channel concurrent broadcasts already kicked off; backend caps
// total at KAIZER_LIVE_STUDIO_CONCURRENCY (default 8) — anything past
// that queues server-side.

export default function LiveStudio() {
  // ── Catalog ─────────────────────────────────────────────────
  const [channels, setChannels]     = useState([]);
  const [chError, setChError]       = useState("");

  // ── Builder state (the form pre-submit) ────────────────────
  const [videos, setVideos]         = useState([]);  // [{tmpId, file, channelIds: Set, hours, seo, seoSource}]
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitErr] = useState("");

  // ── Batch in-flight state (after submit) ───────────────────
  const [batch, setBatch]           = useState(null);     // {id, public_id, streams: [...]}
  const [streamsByVideo, setStreamsByVideo] = useState({}); // {video_slot: [LiveStream...]}
  const [uploadProgress, setUploadProgress] = useState({}); // {streamId: bytes}
  const pollRef = useRef(null);

  // ── Recent history ─────────────────────────────────────────
  const [history, setHistory]       = useState([]);
  const [histErr, setHistErr]       = useState("");

  // ── Fetch channels + history on mount ──────────────────────
  // Channels = ONLY YouTube-OAuth-connected ones (Live Studio can't
  // broadcast to a Style Profile that doesn't have a real channel
  // wired). The /live-studio/channels endpoint filters server-side.
  useEffect(() => {
    api.liveChannels()
       .then((r) => setChannels(r?.channels || []))
       .catch((e) => setChError(e.message || "failed to load OAuth-connected channels"));
    refreshHistory();
  }, []);

  async function refreshHistory() {
    try {
      const r = await api.liveBatches();
      setHistory(r?.batches || []);
      setHistErr("");
    } catch (e) {
      setHistErr(e.message || "failed to load history");
    }
  }

  // ── Drop handler — multi-file accepted ─────────────────────
  function onFilesPicked(fileList) {
    const next = [];
    for (const f of fileList) {
      if (!f.type.startsWith("video/")) continue;
      next.push({
        tmpId:       Math.random().toString(36).slice(2),
        file:        f,
        channelIds:  new Set(),
        hours:       1,
        seoSource:   "user",
        seo: {
          title:         f.name.replace(/\.[^.]+$/, "").slice(0, 100),
          description:   "",
          tags:          "",
          privacy:       "unlisted",
          made_for_kids: false,
        },
      });
    }
    setVideos((prev) => [...prev, ...next]);
  }

  function removeVideo(tmpId) {
    setVideos((prev) => prev.filter((v) => v.tmpId !== tmpId));
  }

  function patchVideo(tmpId, patch) {
    setVideos((prev) => prev.map((v) =>
      v.tmpId === tmpId ? { ...v, ...patch } : v
    ));
  }

  function patchSeo(tmpId, patch) {
    setVideos((prev) => prev.map((v) =>
      v.tmpId === tmpId ? { ...v, seo: { ...v.seo, ...patch } } : v
    ));
  }

  function toggleChannel(tmpId, channelId) {
    setVideos((prev) => prev.map((v) => {
      if (v.tmpId !== tmpId) return v;
      const s = new Set(v.channelIds);
      s.has(channelId) ? s.delete(channelId) : s.add(channelId);
      return { ...v, channelIds: s };
    }));
  }

  // ── Submit + run the upload pipeline ───────────────────────
  async function submit() {
    setSubmitErr("");
    if (videos.length === 0) {
      setSubmitErr("Add at least one video.");
      return;
    }
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (v.channelIds.size === 0) {
        setSubmitErr(`Video #${i + 1}: pick at least one channel.`);
        return;
      }
      if (!v.seo.title?.trim()) {
        setSubmitErr(`Video #${i + 1}: title is required.`);
        return;
      }
    }
    setSubmitting(true);

    try {
      // 1) Create the batch — backend allocates stream rows.
      const payload = {
        videos: videos.map((v) => ({
          filename:       v.file.name,
          size_bytes:     v.file.size,
          duration_hours: Number(v.hours) || 1,
          channel_ids:    [...v.channelIds],
          seo_source:     v.seoSource,
          seo: {
            title:         v.seo.title.trim(),
            description:   v.seo.description || "",
            tags:          (v.seo.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
            privacy:       v.seo.privacy || "unlisted",
            made_for_kids: !!v.seo.made_for_kids,
          },
        })),
      };
      const created = await api.liveCreateBatch(payload);
      setBatch(created);

      // Group streams by video_slot for the per-video upload loop.
      const byVideo = {};
      for (const s of created.streams) {
        if (!byVideo[s.video_slot]) byVideo[s.video_slot] = [];
        byVideo[s.video_slot].push(s);
      }
      setStreamsByVideo(byVideo);

      // 2) For each video, upload it ONCE to the FIRST stream that
      //    uses it, then call /start on every stream sharing that
      //    video. (Backend only stores one copy per video_slot — but
      //    since each stream has its own row + upload_path, we need
      //    to upload N times if a video targets N channels. To keep
      //    bandwidth low we ONLY upload to the first stream of each
      //    video and reuse its file path by hard-linking after.)
      //    For v1 simplicity: upload to ALL streams. Phase 5.5 will
      //    add the de-dup hardlink optimisation.
      for (let vi = 0; vi < videos.length; vi++) {
        const v = videos[vi];
        const streams = byVideo[vi] || [];
        for (const s of streams) {
          await uploadFileToStream(v.file, s.id);
          // Start broadcast for this stream immediately.
          try {
            await api.liveStartStream(s.id);
          } catch (e) {
            console.warn(`stream ${s.id} start failed:`, e.message);
          }
        }
      }

      setSubmitting(false);
      // Clear the builder so the user sees the batch board only.
      setVideos([]);
    } catch (e) {
      setSubmitErr(e.message || "submit failed");
      setSubmitting(false);
    }
  }

  // ── Chunked uploader for one stream ────────────────────────
  async function uploadFileToStream(file, streamId) {
    const total = file.size;
    let pos = 0;
    while (pos < total) {
      const end = Math.min(pos + CHUNK_SIZE, total) - 1;
      const slice = file.slice(pos, end + 1);
      try {
        const resp = await api.liveUploadChunk(streamId, slice, {
          start: pos, end, total,
        });
        setUploadProgress((m) => ({ ...m, [streamId]: resp.bytes_written }));
      } catch (e) {
        // One retry then surface
        try {
          const resp = await api.liveUploadChunk(streamId, slice, {
            start: pos, end, total,
          });
          setUploadProgress((m) => ({ ...m, [streamId]: resp.bytes_written }));
        } catch (e2) {
          throw new Error(`stream ${streamId} chunk @${pos}: ${e2.message}`);
        }
      }
      pos = end + 1;
    }
  }

  // ── Status polling once a batch is in flight ───────────────
  useEffect(() => {
    if (!batch) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.liveBatch(batch.id);
        if (cancelled) return;
        setBatch(r);
        const allTerm = (r.streams || []).every((s) =>
          ["done", "failed", "canceled"].includes(s.status)
        );
        if (allTerm) {
          // Stop polling once everything is terminal.
          if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
          refreshHistory();
          return;
        }
      } catch (e) {
        console.warn("batch poll failed:", e.message);
      }
      pollRef.current = setTimeout(tick, 4000);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [batch?.id]);

  async function cancelStream(streamId) {
    if (!confirm("Stop this live stream?")) return;
    try { await api.liveCancelStream(streamId); }
    catch (e) { alert(e.message); }
  }

  function resetBatch() {
    setBatch(null);
    setStreamsByVideo({});
    setUploadProgress({});
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Radio className="text-accent2" size={24} /> Live Studio
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload finished videos → broadcast as RTMP-live to one or many YouTube channels, in parallel.
            Short videos auto-loop to fill the requested hours. Recordings preview for 48h after broadcast.
          </p>
        </div>
        <button onClick={refreshHistory} className="text-xs text-gray-500 hover:text-white flex items-center gap-1">
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      {chError && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded flex items-center gap-2">
          <AlertCircle size={14} /> {chError}
        </div>
      )}

      {/* ── In-flight batch board ───────────────────────────── */}
      {batch && (
        <section className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-100">
              Batch <span className="text-gray-500 font-normal">{batch.public_id}</span>
              <span className="ml-2 text-xs text-gray-500">
                {batch.streams_done}/{batch.total_streams} done
                {batch.streams_failed > 0 && <span className="text-red-400 ml-1">· {batch.streams_failed} failed</span>}
              </span>
            </h2>
            <button onClick={resetBatch} className="text-xs text-gray-500 hover:text-white">
              <X size={14} className="inline" /> Close
            </button>
          </div>

          <div className="space-y-2">
            {(batch.streams || []).map((s) => {
              const ch = channels.find((c) => c.id === s.channel_id);
              const isActive = !["done", "failed", "canceled"].includes(s.status);
              const upBytes  = uploadProgress[s.id] || 0;
              return (
                <div key={s.id} className={`p-2 rounded border text-xs flex items-center gap-3 ${
                  s.status === "done"     ? "border-emerald-500/30 bg-emerald-500/5" :
                  s.status === "failed"   ? "border-red-500/30 bg-red-500/5" :
                  s.status === "canceled" ? "border-gray-500/30 bg-gray-500/5" :
                                            "border-accent2/30 bg-accent2/5"
                }`}>
                  {isActive
                    ? <Loader2 size={14} className="animate-spin text-accent2" />
                    : s.status === "done"
                      ? <CheckCircle2 size={14} className="text-emerald-400" />
                      : <AlertCircle size={14} className="text-red-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">
                      <Tv size={11} className="inline mr-1 text-gray-400" />
                      {ch?.name || `Channel #${s.channel_id}`}
                      <span className="ml-2 text-gray-500">· {s.title}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {s.status}{s.progress_pct > 0 ? ` · ${s.progress_pct}%` : ""}
                      {" · "}{s.duration_hours}h
                      {upBytes > 0 && s.status === "uploading" && (
                        <span className="ml-2 text-accent2">
                          upload {(upBytes / 1024 / 1024).toFixed(1)}MB
                        </span>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <button
                      onClick={() => cancelStream(s.id)}
                      className="text-[10px] text-gray-500 hover:text-red-400"
                    >
                      Stop
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Builder ─────────────────────────────────────────── */}
      {!batch && (
        <section className="card p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-1.5">
            <Plus size={14} className="text-accent2" /> 1. Add videos to broadcast
          </h2>
          <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-gray-500">
            <input
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => onFilesPicked(e.target.files || [])}
            />
            <Upload size={24} className="mx-auto text-gray-600 mb-2" />
            <div className="text-sm text-gray-400">Drop / click to add finished videos (MP4 H.264 recommended)</div>
            <div className="text-[10px] text-gray-600 mt-1">
              Each video can target multiple channels. Short videos loop to fill your "live hours" setting.
            </div>
          </label>

          {videos.length > 0 && (
            <div className="mt-4 space-y-3">
              {videos.map((v, i) => (
                <VideoCard
                  key={v.tmpId}
                  index={i}
                  video={v}
                  channels={channels}
                  onToggleChannel={(cid) => toggleChannel(v.tmpId, cid)}
                  onPatch={(p) => patchVideo(v.tmpId, p)}
                  onPatchSeo={(p) => patchSeo(v.tmpId, p)}
                  onRemove={() => removeVideo(v.tmpId)}
                />
              ))}

              {submitError && (
                <div className="text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2 flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5" /> {submitError}
                </div>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={submitting || videos.length === 0}
                className="btn btn-primary w-full flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-40"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                  : <><Radio size={16} /> Start broadcasting {videos.length} video{videos.length === 1 ? "" : "s"}</>}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── History ─────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-3 flex items-center justify-between">
          <span>Recent batches</span>
          {histErr && <span className="text-[10px] text-red-400">{histErr}</span>}
        </h2>
        {history.length === 0
          ? <div className="text-[11px] text-gray-500 italic">No batches yet.</div>
          : <ul className="space-y-1.5">
              {history.map((b) => (
                <li key={b.id} className="p-2 rounded border border-border bg-black/30 text-xs flex items-center gap-2">
                  <span className="font-mono text-gray-500">{b.public_id}</span>
                  <span className={
                    b.status === "done"     ? "text-emerald-300" :
                    b.status === "failed"   ? "text-red-300" :
                    b.status === "queued"   ? "text-gray-400" : "text-accent2"
                  }>{b.status}</span>
                  <span className="text-gray-500">{b.total} stream{b.total === 1 ? "" : "s"}</span>
                  {b.done > 0  && <span className="text-emerald-400">{b.done} done</span>}
                  {b.failed > 0 && <span className="text-red-400">{b.failed} failed</span>}
                  <span className="ml-auto text-[10px] text-gray-600">
                    {b.created_at ? new Date(b.created_at).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>}
        <p className="text-[10px] text-gray-600 mt-2">
          Live recordings preview here for 48h after broadcast — then removed automatically. YouTube keeps the durable copy.
        </p>
      </section>
    </div>
  );
}


// ─── Per-video card ─────────────────────────────────────────

function VideoCard({ index, video, channels, onToggleChannel, onPatch, onPatchSeo, onRemove }) {
  const sizeMB = (video.file.size / 1024 / 1024).toFixed(1);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr,  setGenErr]  = useState("");
  const [briefDraft, setBriefDraft] = useState("");
  const [showBrief, setShowBrief]   = useState(false);

  const [genStats, setGenStats] = useState(null);  // {attempts, best_score, target_score}

  async function generateSeo() {
    if (!briefDraft.trim()) {
      setGenErr("Enter a 1-3 sentence brief first.");
      return;
    }
    setGenBusy(true); setGenErr(""); setGenStats(null);
    try {
      const firstCh = [...video.channelIds][0] || null;
      const r = await api.liveGenerateSeo({
        brief:      briefDraft.trim(),
        channel_id: firstCh,
        language:   "te",
        privacy:    video.seo.privacy,
      });
      const s = r.seo;
      onPatchSeo({
        title:       s.title || "",
        description: s.description || "",
        tags:        (s.tags || []).join(", "),
      });
      onPatch({ seoSource: "ai" });
      setGenStats({
        attempts:      r.attempts || 1,
        best_score:    r.best_score || 0,
        target_score:  r.target_score || 95,
      });
      setShowBrief(false);
      setBriefDraft("");
    } catch (e) {
      setGenErr(e.message || "generation failed");
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="rounded border border-border bg-black/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">#{index + 1}</div>
        <div className="text-sm text-white truncate flex-1">{video.file.name}</div>
        <div className="text-[10px] text-gray-500 whitespace-nowrap">{sizeMB} MB</div>
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 ml-1">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Channels */}
      <div className="mb-2">
        <div className="text-[10px] text-gray-400 mb-1">Channels ({video.channelIds.size} selected)</div>
        <div className="flex flex-wrap gap-1">
          {channels.map((c) => {
            const on = video.channelIds.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggleChannel(c.id)}
                className={`text-[11px] px-1.5 py-1 rounded border flex items-center gap-1.5 ${
                  on ? "border-accent2 bg-accent2/10 text-white" :
                       "border-border bg-black/40 text-gray-400 hover:text-white"
                }`}
                title={c.handle ? `${c.handle} · ${(c.subscriber_count || 0).toLocaleString()} subs` : ""}
              >
                {c.avatar_url
                  ? <img src={c.avatar_url} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />
                  : <Tv size={10} className="flex-shrink-0" />}
                <span className="truncate max-w-[140px]">{c.name}</span>
              </button>
            );
          })}
          {channels.length === 0 && (
            <span className="text-[10px] text-gray-600 italic">
              No YouTube accounts connected — go to <strong>Channels → My accounts</strong> and click "Connect Another YouTube Account".
            </span>
          )}
        </div>
      </div>

      {/* Hours + SEO source + privacy */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-[11px]">
        <label>
          <span className="text-gray-400 flex items-center gap-1"><Clock size={10} /> Hours live</span>
          <input
            type="number" min="0.5" max="24" step="0.5"
            value={video.hours}
            onChange={(e) => onPatch({ hours: parseFloat(e.target.value) || 1 })}
            className="w-full mt-0.5 bg-black border border-border rounded px-2 py-1 text-white"
          />
        </label>
        <label>
          <span className="text-gray-400">SEO source</span>
          <select
            value={video.seoSource}
            onChange={(e) => onPatch({ seoSource: e.target.value })}
            className="w-full mt-0.5 bg-black border border-border rounded px-2 py-1 text-white"
          >
            <option value="user">I typed this (trusted as-is)</option>
            <option value="ai">AI generated (strict validation)</option>
          </select>
        </label>
        <label>
          <span className="text-gray-400">Privacy</span>
          <select
            value={video.seo.privacy}
            onChange={(e) => onPatchSeo({ privacy: e.target.value })}
            className="w-full mt-0.5 bg-black border border-border rounded px-2 py-1 text-white"
          >
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>

      {/* SEO header row — Generate AI button, then form */}
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
        <div className="text-gray-400 flex items-center gap-2">
          SEO (title / description / tags)
          {genStats && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                genStats.best_score >= genStats.target_score
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                  : "bg-amber-500/15 border-amber-500/40 text-amber-300"
              }`}
              title={`Verifier score after ${genStats.attempts} attempt${genStats.attempts === 1 ? "" : "s"}`}
            >
              {genStats.best_score}/{genStats.target_score} · {genStats.attempts} attempt{genStats.attempts === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {!showBrief
          ? <button
              type="button"
              onClick={() => setShowBrief(true)}
              className="flex items-center gap-1 text-accent2 hover:text-white"
            >
              <Sparkles size={12} /> Generate with AI
            </button>
          : <button
              type="button"
              onClick={() => { setShowBrief(false); setGenErr(""); }}
              className="text-gray-500 hover:text-white"
            >
              <X size={12} className="inline" /> Type manually
            </button>}
      </div>

      {showBrief && (
        <div className="mb-2 p-2 rounded bg-accent2/5 border border-accent2/30">
          <div className="text-[10px] text-accent2 mb-1">
            1-3 sentences describing this video — Gemini will write title + description + tags + validate against YouTube's hard limits.
          </div>
          <textarea
            rows={2}
            value={briefDraft}
            onChange={(e) => setBriefDraft(e.target.value)}
            placeholder="e.g. Live coverage of Andhra Pradesh cabinet meeting on water-sharing policy, ministers Pawan Kalyan and KCR debating the new bill"
            className="w-full bg-black border border-border rounded px-2 py-1 text-white text-[11px] resize-y"
          />
          {genErr && (
            <div className="mt-1 text-[10px] text-red-300 flex items-start gap-1">
              <AlertCircle size={10} className="mt-0.5" /> {genErr}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="text-[9px] text-gray-500 flex-1">
              {genBusy
                ? "Gemini → verifier loop, retrying up to 5 times until score ≥ 95…"
                : "Same engine as the editor — Gemini writes SEO, verifier scores it, retries with feedback until target."}
            </div>
            <button
              type="button"
              onClick={generateSeo}
              disabled={genBusy || !briefDraft.trim()}
              className="text-[11px] px-2 py-1 rounded bg-accent2 text-white hover:bg-accent2/80 disabled:opacity-40 flex items-center gap-1 flex-shrink-0"
            >
              {genBusy
                ? <><Loader2 size={11} className="animate-spin" /> generating…</>
                : <><Sparkles size={11} /> Generate</>}
            </button>
          </div>
        </div>
      )}

      {/* Title / description / tags */}
      <div className="space-y-1.5 text-[11px]">
        <input
          type="text"
          value={video.seo.title}
          onChange={(e) => onPatchSeo({ title: e.target.value.slice(0, 100) })}
          placeholder="YouTube title (≤100 chars)"
          className="w-full bg-black border border-border rounded px-2 py-1 text-white"
        />
        <textarea
          rows={3}
          value={video.seo.description}
          onChange={(e) => onPatchSeo({ description: e.target.value.slice(0, 5000) })}
          placeholder="Description"
          className="w-full bg-black border border-border rounded px-2 py-1 text-white resize-y"
        />
        <input
          type="text"
          value={video.seo.tags}
          onChange={(e) => onPatchSeo({ tags: e.target.value })}
          placeholder="Comma-separated tags"
          className="w-full bg-black border border-border rounded px-2 py-1 text-white"
        />
        <label className="flex items-center gap-1.5 text-gray-400">
          <input
            type="checkbox"
            checked={!!video.seo.made_for_kids}
            onChange={(e) => onPatchSeo({ made_for_kids: e.target.checked })}
          />
          Made for kids (COPPA)
        </label>
      </div>
    </div>
  );
}
