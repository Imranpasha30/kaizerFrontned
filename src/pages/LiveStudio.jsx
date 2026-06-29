import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, Upload, Plus, Trash2, X, Loader2, AlertCircle,
  CheckCircle2, Sparkles, Clock, Tv, RefreshCw, Image as ImageIcon,
  Play, ExternalLink, ChevronDown, ChevronRight,
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

// 16 MB chunks — big enough to amortize HTTP/auth/round-trip overhead
// on each request without losing fine-grained retry semantics. The
// per-stream write lock on the server serialises writes within ONE
// stream, so parallel chunks for the SAME stream would not speed it
// up; the win comes from parallel uploads ACROSS streams (see
// MAX_PARALLEL_STREAMS below).
const CHUNK_SIZE = 16 * 1024 * 1024;

// Maximum (video × channel) uploads in flight at once. The browser's
// HTTP/2 connection budget per origin is ~100 — we cap conservatively
// because each in-flight upload also burns memory holding its current
// chunk slice. 4 is the sweet spot for typical residential uplinks;
// bump to 6-8 on dedicated office lines.
const MAX_PARALLEL_STREAMS = 4;

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

  // Auto-refresh history every 4s as long as ANY history row has a
  // non-terminal stream — the operator needs live progress (and the
  // Stop button) without having to manually refresh. We DON'T poll
  // while there's an active batch board open, because that has its
  // own dedicated 4s poller for the in-flight batch.
  useEffect(() => {
    if (batch) return;          // active board does its own polling
    const hasInFlight = history.some((b) =>
      (b.streams || []).some((s) =>
        !["done", "failed", "canceled"].includes(s.status)
      )
    );
    if (!hasInFlight) return;
    const tid = setInterval(refreshHistory, 4000);
    return () => clearInterval(tid);
  }, [batch, history]);

  // ── Drop handler — multi-file accepted ─────────────────────
  function onFilesPicked(fileList) {
    const next = [];
    for (const f of fileList) {
      if (!f.type.startsWith("video/")) continue;
      next.push({
        tmpId:       Math.random().toString(36).slice(2),
        file:        f,
        sourceUrl:   "",            // empty = uploaded file source
        thumbFile:   null,          // optional File — uploaded after batch creation
        thumbPreview: "",           // object-URL for the picker preview
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

  // ── URL handler — yt-dlp ingestion (no chunk upload needed) ──
  // The server fetches the video; we still create a per-video card
  // so the operator picks channels + SEO + thumbnail like any other.
  function onUrlAdded(rawUrl) {
    const url = (rawUrl || "").trim();
    if (!url) return;
    // Match the same set the backend validates against — better to
    // catch the typo here than after a batch-creation 400.
    if (!/^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w\-]{6,}/i.test(url)) {
      alert("That doesn't look like a YouTube watch URL.\nExpected forms: https://www.youtube.com/watch?v=… or https://youtu.be/…");
      return;
    }
    // Deduplicate — same URL already queued?
    if (videos.some((v) => v.sourceUrl === url)) {
      alert("That URL is already in the batch.");
      return;
    }
    // Pull a sensible default title from the URL (the video id) and
    // let the user replace it with a proper headline or click
    // "Generate with AI".
    const idMatch = url.match(/[?&]v=([\w\-]+)/) || url.match(/youtu\.be\/([\w\-]+)/) || url.match(/shorts\/([\w\-]+)/);
    const ytId = idMatch ? idMatch[1] : "youtube";
    setVideos((prev) => [...prev, {
      tmpId:       Math.random().toString(36).slice(2),
      file:        null,               // no local file — server downloads
      sourceUrl:   url,
      thumbFile:   null,
      thumbPreview: "",
      channelIds:  new Set(),
      hours:       1,
      seoSource:   "user",
      seo: {
        title:         `YouTube live · ${ytId}`.slice(0, 100),
        description:   `Source: ${url}`,
        tags:          "",
        privacy:       "unlisted",
        made_for_kids: false,
      },
    }]);
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
          filename:       v.file ? v.file.name : (v.sourceUrl || "youtube_url.mp4"),
          size_bytes:     v.file ? v.file.size : 0,
          duration_hours: Number(v.hours) || 1,
          channel_ids:    [...v.channelIds],
          seo_source:     v.seoSource,
          source_url:     v.sourceUrl || null,
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

      // 1.5) Upload thumbnails (if any) BEFORE starting broadcasts —
      // the orchestrator reads thumbnail_path right after minting the
      // YT broadcast, so it must be on the row before /start fires.
      // Soft-fails: a busted thumbnail doesn't block the broadcast,
      // we just log + carry on (YouTube will auto-pick a frame).
      for (let vi = 0; vi < videos.length; vi++) {
        const v = videos[vi];
        if (!v.thumbFile) continue;
        try {
          await api.liveUploadThumbnail(created.id, vi, v.thumbFile);
        } catch (e) {
          console.warn(`thumbnail upload for video ${vi} failed:`, e.message);
        }
      }

      // 2) Upload + start every (video × channel) stream IN PARALLEL,
      //    capped at MAX_PARALLEL_STREAMS in-flight. Each pair runs
      //    its own chunk loop, then fires /start the moment its own
      //    upload finishes — no global barrier waits for the slowest
      //    stream before any broadcast kicks off.
      //
      //    The backend serialises chunk writes per-stream_id, so two
      //    chunks for the SAME stream wouldn't go faster in parallel.
      //    The win is ACROSS streams — N independent stream_ids =
      //    N independent locks = real concurrency.
      //
      //    Note: each LiveStream still has its own upload_path, so a
      //    video targeting N channels uploads N copies. The hardlink
      //    de-dup optimisation is a follow-up; for now parallelism
      //    is the practical gain that makes large batches usable.
      const pairs = [];
      for (let vi = 0; vi < videos.length; vi++) {
        const v = videos[vi];
        const streams = byVideo[vi] || [];
        for (const s of streams) {
          pairs.push({
            file:       v.file,
            sourceUrl:  v.sourceUrl || null,
            streamId:   s.id,
          });
        }
      }

      const inFlight = new Set();
      for (const p of pairs) {
        const task = (async () => {
          try {
            if (p.sourceUrl) {
              // Server is fetching this one via yt-dlp — poll the
              // stream until upload_done flips true (or it fails),
              // then /start.
              await waitForUrlIngest(p.streamId);
            } else {
              await uploadFileToStream(p.file, p.streamId);
            }
            await api.liveStartStream(p.streamId);
          } catch (e) {
            console.warn(`stream ${p.streamId} failed:`, e.message);
          }
        })();
        inFlight.add(task);
        task.finally(() => inFlight.delete(task));
        if (inFlight.size >= MAX_PARALLEL_STREAMS) {
          await Promise.race(inFlight);
        }
      }
      await Promise.all(inFlight);

      setSubmitting(false);
      // Clear the builder so the user sees the batch board only.
      setVideos([]);
    } catch (e) {
      setSubmitErr(e.message || "submit failed");
      setSubmitting(false);
    }
  }

  // ── Wait for the server-side yt-dlp ingest to finish ───────
  // The backend spawns one yt-dlp download per video_slot when
  // a batch is created with `source_url`. We poll the per-stream
  // status endpoint until `upload_done` flips true (success), or
  // the row goes to `failed`. Polls every 2s with a 30-min ceiling
  // — enough headroom for slow networks / 4K downloads.
  async function waitForUrlIngest(streamId) {
    const startedAt = Date.now();
    const HARD_CEIL_MS = 30 * 60 * 1000;
    while (Date.now() - startedAt < HARD_CEIL_MS) {
      let s;
      try {
        s = await api.liveStream(streamId);
      } catch (e) {
        // Transient — try again.
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      // Surface byte progress in the same UI map the file path uses.
      if (s.upload_bytes) {
        setUploadProgress((m) => ({ ...m, [streamId]: s.upload_bytes }));
      }
      if (s.upload_done) return;
      if (s.status === "failed" || s.status === "canceled") {
        throw new Error(`URL ingest ${s.status}: ${s.error || "(no detail)"}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("URL ingest exceeded 30-minute ceiling — aborted");
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
              const isStreaming = s.status === "streaming" && !!s.yt_video_id;
              return (
                <div key={s.id} className={`rounded border text-xs ${
                  s.status === "done"     ? "border-emerald-500/30 bg-emerald-500/5" :
                  s.status === "failed"   ? "border-red-500/30 bg-red-500/5" :
                  s.status === "canceled" ? "border-gray-500/30 bg-gray-500/5" :
                                            "border-accent2/30 bg-accent2/5"
                }`}>
                  <div className="p-2 flex items-center gap-3">
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
                        {upBytes > 0 && s.status === "downloading" && (
                          <span className="ml-2 text-accent2">
                            server fetching · {(upBytes / 1024 / 1024).toFixed(1)}MB
                          </span>
                        )}
                      </div>
                      {/* Surface the per-row message when it's not the
                          default "queued"/null state — operator wants
                          to know "is the server downloading?" without
                          having to expand a history row. */}
                      {s.message && !["streaming","done"].includes(s.status) && (
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate italic">
                          {s.message}
                        </div>
                      )}
                    </div>
                    {s.yt_watch_url && (
                      <a
                        href={s.yt_watch_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-accent2 hover:text-white flex items-center gap-0.5"
                        title="Open on YouTube"
                      >
                        <ExternalLink size={10} /> YT
                      </a>
                    )}
                    {isActive && (
                      <button
                        onClick={() => cancelStream(s.id)}
                        className="text-[10px] text-gray-500 hover:text-red-400"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                  {/* Live link banner — shown the moment the YT
                      broadcast is minted (i.e. the row has a
                      yt_video_id). Always-visible, copy-friendly,
                      regardless of whether the source was an upload
                      or a URL. */}
                  {s.yt_video_id && (
                    <div className="px-2 pb-1.5">
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] flex items-center gap-2 flex-wrap">
                        <span className="text-emerald-300 font-medium whitespace-nowrap">Live on YouTube →</span>
                        <a
                          href={s.yt_watch_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-200 hover:text-white underline break-all flex-1 min-w-0"
                        >
                          {s.yt_watch_url}
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(s.yt_watch_url || "");
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                          title="Copy link"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Source URL strip — only on URL-ingested rows so the
                      operator can see "what's being broadcast" alongside
                      the live link. */}
                  {s.source_url && (
                    <div className="px-2 pb-1.5">
                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-600">source:</span>
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent2 hover:text-white underline break-all"
                        >
                          {s.source_url}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Live preview — only embed while actively streaming
                      (so we don't keep a 0-fps iframe alive for hours
                      after the broadcast ends). YouTube serves the
                      "broadcast ended" state automatically when the
                      stream stops. */}
                  {isStreaming && (
                    <div className="px-2 pb-2">
                      <div className="aspect-video w-full max-w-md mx-auto rounded border border-border bg-black overflow-hidden">
                        <iframe
                          title={`live preview ${s.id}`}
                          src={`https://www.youtube.com/embed/${s.yt_video_id}?autoplay=1&mute=1`}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
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

          {/* OR — YouTube URL ingest. Server fetches with yt-dlp,
              then the same broadcast pipeline runs. Only use this
              with content you have rights to rebroadcast. */}
          <UrlAdder onAdd={onUrlAdded} />

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
                <HistoryRow
                  key={b.id}
                  batch={b}
                  channels={channels}
                  onCancelStream={cancelStream}
                />
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
  // URL-sourced entries have no local File — show the URL instead of a size.
  const isUrlSource = !video.file && !!video.sourceUrl;
  const sizeMB = video.file ? (video.file.size / 1024 / 1024).toFixed(1) : null;
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
        <div className="text-sm text-white truncate flex-1">
          {isUrlSource
            ? <span title={video.sourceUrl}>{video.sourceUrl}</span>
            : video.file.name}
        </div>
        {isUrlSource
          ? <span className="text-[10px] px-1.5 py-0.5 rounded border border-accent2/40 bg-accent2/10 text-accent2 whitespace-nowrap flex items-center gap-1">
              <Play size={9} /> YouTube URL
            </span>
          : <div className="text-[10px] text-gray-500 whitespace-nowrap">{sizeMB} MB</div>}
        <button onClick={onRemove} className="text-gray-500 hover:text-red-400 ml-1">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Thumbnail picker — optional, one per video. Replicated by the
          backend across all channel destinations for this video_slot. */}
      <div className="mb-2">
        <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
          <ImageIcon size={10} /> Custom thumbnail (optional)
        </div>
        <div className="flex items-center gap-2">
          <label className="flex-1 cursor-pointer text-[11px] px-2 py-1.5 rounded border border-border bg-black/40 text-gray-400 hover:text-white hover:border-gray-500 flex items-center gap-1.5">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 4 * 1024 * 1024) {
                  alert(`Thumbnail is ${(f.size/1024/1024).toFixed(1)} MB — limit is 4 MB.`);
                  return;
                }
                // Revoke the prior preview URL before replacing.
                if (video.thumbPreview) URL.revokeObjectURL(video.thumbPreview);
                onPatch({ thumbFile: f, thumbPreview: URL.createObjectURL(f) });
              }}
            />
            <Upload size={11} />
            {video.thumbFile
              ? <span className="truncate">{video.thumbFile.name}</span>
              : <span>Choose thumbnail (JPG/PNG/WebP, ≤4 MB)</span>}
          </label>
          {video.thumbPreview && (
            <>
              <img
                src={video.thumbPreview}
                alt="thumbnail preview"
                className="w-12 h-7 object-cover rounded border border-border"
              />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(video.thumbPreview);
                  onPatch({ thumbFile: null, thumbPreview: "" });
                }}
                className="text-gray-500 hover:text-red-400"
                title="Remove thumbnail"
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
        <div className="text-[9px] text-gray-600 mt-0.5">
          YouTube recommends 1280×720 JPEG. Larger images get auto-resized server-side.
        </div>
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
          <span className="text-gray-400 flex items-center gap-1">
            <Clock size={10} /> {isUrlSource ? "Duration" : "Hours live"}
          </span>
          {isUrlSource ? (
            <div
              className="w-full mt-0.5 bg-black/40 border border-border rounded px-2 py-1 text-[10px] text-gray-500 italic"
              title="URL passthrough mode — broadcast ends when the source video ends; no loop"
            >
              Live until source ends · no loop
            </div>
          ) : (
            <input
              type="number" min="0.5" max="24" step="0.5"
              value={video.hours}
              onChange={(e) => onPatch({ hours: parseFloat(e.target.value) || 1 })}
              className="w-full mt-0.5 bg-black border border-border rounded px-2 py-1 text-white"
            />
          )}
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


// ─── YouTube URL adder ──────────────────────────────────────
//
// One-shot input that pipes a YouTube URL through the same Live
// Studio pipeline as an uploaded file. The server downloads via
// yt-dlp; the resulting VideoCard behaves identically except the
// "source" badge marks it as URL-ingested.

function UrlAdder({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div className="mt-3 rounded-lg border border-border bg-black/20 p-3">
      <div className="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1.5">
        <Play size={11} className="text-accent2" />
        <span className="font-medium">Or paste a YouTube URL</span>
        <span className="text-gray-600">— server fetches via yt-dlp, then broadcasts. Use only with content you have rights to.</span>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="https://youtu.be/… or https://www.youtube.com/watch?v=…"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (val.trim()) { onAdd(val.trim()); setVal(""); }
            }
          }}
          className="flex-1 bg-black border border-border rounded px-2 py-1.5 text-white text-[12px]"
        />
        <button
          type="button"
          onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}
          disabled={!val.trim()}
          className="text-[11px] px-3 py-1.5 rounded bg-accent2 text-white hover:bg-accent2/80 disabled:opacity-40 flex items-center gap-1"
        >
          <Plus size={11} /> Add URL
        </button>
      </div>
    </div>
  );
}


// ─── Per-history-row (expandable) ───────────────────────────
//
// The /api/live-studio/batches list returns streams pre-hydrated, so
// expansion is a pure UI toggle — no extra round-trip. Each stream
// row inside the expansion exposes its YouTube watch link, status,
// finished_at, and the thumbnail that was applied.

function HistoryRow({ batch, channels, onCancelStream }) {
  // Auto-expand any batch that still has in-flight streams so the
  // operator immediately sees the preview / Stop button without
  // having to click. Collapsed once everything is terminal.
  const streams = batch.streams || [];
  const hasInFlight = streams.some((s) => !["done", "failed", "canceled"].includes(s.status));
  const canceledCount = streams.filter((s) => s.status === "canceled").length;
  const [open, setOpen] = useState(hasInFlight);
  const hasStreams = streams.length > 0;

  return (
    <li className="rounded border border-border bg-black/30 text-xs">
      <button
        type="button"
        onClick={() => hasStreams && setOpen(!open)}
        className="w-full p-2 flex items-center gap-2 text-left hover:bg-white/[0.02]"
      >
        {hasStreams
          ? (open ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />)
          : <span className="w-3" />}
        <span className="font-mono text-gray-500">{batch.public_id}</span>
        <span className={
          batch.status === "done"     ? "text-emerald-300" :
          batch.status === "failed"   ? "text-red-300" :
          batch.status === "canceled" ? "text-gray-500" :
          batch.status === "queued"   ? "text-gray-400" : "text-accent2"
        }>{batch.status}</span>
        <span className="text-gray-500">{batch.total} stream{batch.total === 1 ? "" : "s"}</span>
        {batch.done > 0     && <span className="text-emerald-400">{batch.done} done</span>}
        {batch.failed > 0   && <span className="text-red-400">{batch.failed} failed</span>}
        {canceledCount > 0  && <span className="text-gray-500">{canceledCount} canceled</span>}
        <span className="ml-auto text-[10px] text-gray-600">
          {batch.created_at ? new Date(batch.created_at).toLocaleString() : ""}
        </span>
      </button>

      {open && hasStreams && (
        <div className="border-t border-border/60 px-2 py-2 space-y-2">
          {streams.map((s) => {
            const ch = channels.find((c) => c.id === s.channel_id);
            const started = s.started_at ? new Date(s.started_at).toLocaleString() : null;
            const finished = s.finished_at ? new Date(s.finished_at).toLocaleString() : null;
            const upMB = ((s.upload_bytes || 0) / 1024 / 1024).toFixed(1);
            const totalMB = ((s.upload_total || 0) / 1024 / 1024).toFixed(1);
            const friendly = friendlyError(s.error || "");
            return (
              <div key={s.id} className="rounded border border-border/60 bg-black/20 p-2 space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  {s.thumbnail_url
                    ? <img src={s.thumbnail_url} alt="" className="w-10 h-6 object-cover rounded border border-border flex-shrink-0" />
                    : <div className="w-10 h-6 rounded border border-border bg-black/50 flex-shrink-0" />}
                  <Tv size={10} className="text-gray-500 flex-shrink-0" />
                  <span className="truncate text-gray-300 flex-1">
                    {ch?.name || `Channel #${s.channel_id}`}
                    <span className="text-gray-600"> · {s.title}</span>
                  </span>
                  <span className={`text-[10px] font-medium ${
                    s.status === "done"     ? "text-emerald-400" :
                    s.status === "failed"   ? "text-red-400" :
                    s.status === "canceled" ? "text-gray-500" : "text-accent2"
                  }`}>{s.status}</span>
                  {s.yt_watch_url && (
                    <a
                      href={s.yt_watch_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent2 hover:text-white flex items-center gap-0.5 text-[10px]"
                      title={`youtu.be/${s.yt_video_id}`}
                    >
                      <Play size={9} /> Watch
                    </a>
                  )}
                  {/* Stop button — only on non-terminal streams.
                      Wired to the same /streams/{id}/cancel endpoint
                      the active batch board uses. */}
                  {!["done","failed","canceled"].includes(s.status) && onCancelStream && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelStream(s.id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      title="Stop this broadcast"
                    >
                      Stop
                    </button>
                  )}
                </div>

                {/* Inline live preview — embed the YT player while
                    the broadcast is actively streaming. Once it goes
                    terminal the iframe is removed (YT auto-shows
                    "broadcast ended" but there's no point keeping a
                    zero-fps frame alive after that). */}
                {s.status === "streaming" && s.yt_video_id && (
                  <div className="pl-12 pt-1">
                    <div className="aspect-video w-full max-w-md rounded border border-border bg-black overflow-hidden">
                      <iframe
                        title={`history preview ${s.id}`}
                        src={`https://www.youtube.com/embed/${s.yt_video_id}?autoplay=1&mute=1`}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                )}

                {/* Meta strip */}
                <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 pl-12">
                  {started  && <span>started: {started}</span>}
                  {finished && <span>finished: {finished}</span>}
                  <span>upload: {upMB}/{totalMB} MB{s.upload_done ? " (complete)" : ""}</span>
                  {s.yt_video_id && <span className="font-mono">vid: {s.yt_video_id}</span>}
                </div>

                {/* Last status message (queued / waiting / minting etc.) */}
                {s.message && s.status !== "done" && (
                  <div className="text-[10px] text-gray-400 pl-12 italic">{s.message}</div>
                )}

                {/* Failure detail — explicit, with friendly-text fix-it
                    hint and a collapsed view of the raw traceback. */}
                {s.status === "failed" && (s.error || s.message) && (
                  <div className="ml-12 mt-1 rounded border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-200 space-y-1">
                    <div className="flex items-start gap-1">
                      <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{friendly.headline}</div>
                        {friendly.fix && (
                          <div className="text-red-200/80 mt-0.5">→ {friendly.fix}</div>
                        )}
                      </div>
                    </div>
                    {s.error && (
                      <details className="text-[10px] text-red-300/70">
                        <summary className="cursor-pointer hover:text-red-200">Raw error</summary>
                        <pre className="whitespace-pre-wrap break-words mt-1 font-mono text-[10px]">{s.error}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}


// Map raw orchestrator/YT errors to short human headlines + the
// concrete fix. Keeps the "why did this fail" answer in the same
// row instead of forcing the operator to read a 400-char traceback.
function friendlyError(raw) {
  const e = (raw || "").toLowerCase();
  if (e.includes("livestreamingnotenabled")) {
    return {
      headline: "YouTube live streaming is not enabled on this channel.",
      fix: "Sign in to that channel at youtube.com/livestreaming and click \"Get Started\". YouTube requires phone verification + a 24h wait after first enabling before broadcasts go live.",
    };
  }
  if (e.includes("invalid_grant")) {
    return {
      headline: "OAuth token expired or revoked.",
      fix: "Reconnect this channel from Channels → My accounts → Reconnect.",
    };
  }
  if (e.includes("ffmpeg")) {
    return {
      headline: "Encoder (ffmpeg) crashed during the broadcast.",
      fix: "Usually means the input video is malformed or RTMP ingest dropped. Try re-encoding the source (H.264 + AAC, MP4 container) and retry.",
    };
  }
  if (e.includes("timed out waiting for a broadcast slot")) {
    return {
      headline: "Waited too long in the broadcast queue.",
      fix: "Cap is 10 concurrent broadcasts. Reduce the batch size or wait for active broadcasts to finish.",
    };
  }
  if (e.includes("quota") || e.includes("403")) {
    return {
      headline: "YouTube API quota or permission rejected the broadcast mint.",
      fix: "Either the daily quota is exhausted (wait for midnight PT reset) or the OAuth scope is missing youtube.force-ssl. Reconnect the channel if scopes are wrong.",
    };
  }
  return {
    headline: "Stream failed.",
    fix: "See raw error below for details.",
  };
}
