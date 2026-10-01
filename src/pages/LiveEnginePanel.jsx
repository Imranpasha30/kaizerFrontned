/* Per-channel control of a live video, for the engine (kaizer_live).
 *
 * The classic Live Studio starts a batch and lets it run: the only control is
 * cancel, and it cancels everything. This is the other half — one video on air,
 * each channel added, stopped, restarted or switched between modes while it
 * keeps streaming, and each one's health visible.
 *
 * WHY "STARTS LEFT TODAY" IS ON SCREEN AND NOT BURIED IN ADMIN. Going live
 * through the YouTube API spends quota from a pool the whole platform shares,
 * and when it runs out a channel silently falls back to its pasted key or
 * queues until midnight Pacific. A customer who cannot see the number has no
 * way to understand why their third channel behaved differently from their
 * first.
 *
 * The whole panel renders nothing when the engine is switched off, so the page
 * is unchanged on the classic path rather than showing empty controls.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  Radio, Square, RotateCw, AlertTriangle, Plus, Gauge,
} from "lucide-react";
import { api } from "../api/client";

/* Health as the worker reports it. Only states an operator should act on are
   coloured; "live" is the quiet one, because most of the time it is all of
   them and a wall of green says nothing. */
const HEALTH = {
  // The relay reports connecting | live | reconnecting | stopped; the worker
  // adds stalled, restarting and finished. Every one of them is here, because a
  // state with no entry falls through to a raw uncoloured string -- and
  // `connecting` is where a channel sits for the first seconds of every
  // broadcast, which is exactly when somebody is looking at this.
  connecting:   { label: "connecting",   tone: "amber" },
  starting:     { label: "starting",     tone: "amber" },
  live:         { label: "live",         tone: "" },
  reconnecting: { label: "reconnecting", tone: "amber" },
  restarting:   { label: "restarting",   tone: "amber" },
  stalled:      { label: "stalled",      tone: "danger" },
  // The upload cannot carry the stream: YouTube reports videoIngestionStarved
  // and viewers buffer. It looks healthy from every other angle -- bytes are
  // still moving, nothing reconnects -- which is exactly why it needs saying
  // in words, and why the remedy is different from a stall.
  starved:      { label: "upload too slow", tone: "danger" },
  stopped:      { label: "stopped",      tone: "" },
  finished:     { label: "finished",     tone: "" },
};

/* What YouTube itself says, which is not the same question as whether bytes are
   flowing. The engine asks once, a few seconds after ffmpeg starts, and that
   answer is the only way to tell a healthy-looking channel apart from one
   pushing perfectly into a broadcast YouTube does not consider live -- the one
   failure here that looks like success from every other angle.

   Quiet for the good case: it is the good case almost always, and a badge on
   every row is a badge nobody reads. */
const YOUTUBE = {
  live:      { label: "on YouTube",  tone: "",       title: "YouTube confirmed this broadcast is live" },
  pending:   { label: "confirming",  tone: "amber",  title: "waiting to confirm with YouTube, a few seconds after the video starts flowing" },
  not_live:  { label: "NOT on YouTube", tone: "danger", title: "video is being sent, but YouTube does not report this broadcast as live" },
  unchecked: { label: "unconfirmed", tone: "amber",  title: "YouTube could not be asked; the stream itself may be fine" },
};

function toneStyle(tone) {
  if (tone === "danger") return { color: "var(--adm-danger, #f87171)" };
  if (tone === "amber") return { color: "var(--adm-amber, #fbbf24)" };
  return undefined;
}

function Health({ health }) {
  const h = HEALTH[health?.state] || { label: health?.state || "—", tone: "" };
  const kbps = health?.bitrate_kbps;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]"
          style={toneStyle(h.tone)}>
      {h.label}
      {kbps ? <span className="opacity-60 tabular-nums">{Math.round(kbps)} kbps</span> : null}
      {health?.state === "starved" && health?.source_mbps ? (
        <span className="opacity-90" title="Your connection cannot send the video as fast as it is being read, so YouTube is not receiving a complete stream. Re-encode the file smaller, or use a faster connection.">
          — the video needs {Number(health.source_mbps).toFixed(1)} Mbps up
        </span>
      ) : null}
      {health?.restarts > 0
        ? <span className="opacity-60">· {health.restarts} restart{health.restarts === 1 ? "" : "s"}</span>
        : null}
    </span>
  );
}

export default function LiveEnginePanel({ videoId, channels = [], onChanged }) {
  const [video, setVideo]   = useState(null);
  const [credit, setCredit] = useState(null);
  const [busy, setBusy]     = useState("");
  const [error, setError]   = useState("");
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!videoId) return;
    try {
      const [v, c] = await Promise.all([
        api.liveEngineVideo(videoId),
        api.liveEngineCredit().catch(() => null),
      ]);
      setVideo(v);
      if (c) setCredit(c);
      setAvailable(true);
      // Clear any earlier failure. Without this a single transient miss --
      // polling a video in the instant between go_live writing Redis and the
      // status being readable -- left "video 50-0 not found" on screen for
      // ever, under a panel that was by then showing correct live data.
      setError("");
    } catch (e) {
      // 404 = the engine is not mounted. That is a normal deployment state,
      // not an error worth showing the customer.
      if (String(e?.message || "").includes("404")) setAvailable(false);
      else setError(e?.message || "Could not read the live video");
    }
  }, [videoId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!available) return undefined;
    let stop = false, t = null;
    const tick = async () => {
      if (stop) return;
      if (!document.hidden) await refresh();
      if (!stop) t = setTimeout(tick, 5000);
    };
    t = setTimeout(tick, 5000);
    return () => { stop = true; if (t) clearTimeout(t); };
  }, [available, refresh]);

  const act = async (label, fn) => {
    setBusy(label); setError("");
    try {
      await fn();
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e?.message || `${label} failed`);
    } finally {
      setBusy("");
    }
  };

  if (!available || !video) return null;

  const rows = video.channels || [];
  const onAir = rows.filter((c) => c.state === "on");
  const attached = new Set(rows.map((c) => String(c.channel_id)));
  const addable = channels.filter((c) => !attached.has(String(c.id)));

  return (
    <div className="rounded border border-border/60 bg-black/20 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Radio size={13} className="text-emerald-400" />
        <span className="text-[12px] font-medium">
          {onAir.length} channel{onAir.length === 1 ? "" : "s"} on air
        </span>
        {credit && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] opacity-80"
                title={`${credit.used} of ${credit.limit} units used; ${credit.reserve} held back so open broadcasts can be ended`}>
            <Gauge size={11} />
            <span className="tabular-nums">{credit.connected_starts_left}</span>
            starts left today
          </span>
        )}
      </div>

      {error && (
        <div className="text-[11px] flex items-start gap-1.5"
             style={{ color: "var(--adm-danger, #f87171)" }}>
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((c) => {
          const label = channels.find((x) => String(x.id) === String(c.channel_id))?.name
                        || `Channel ${c.channel_id}`;
          const running = c.state === "on";
          return (
            <div key={c.channel_id}
                 className="flex items-center gap-2 flex-wrap text-[11px] rounded
                            border border-border/40 px-2 py-1.5">
              <span className="truncate max-w-[18ch]">{label}</span>

              <span className="opacity-70">{c.state}</span>
              {running && <Health health={c.health} />}
              {running && c.youtube && YOUTUBE[c.youtube] && (
                <span className="text-[11px]" style={toneStyle(YOUTUBE[c.youtube].tone)}
                      title={YOUTUBE[c.youtube].title}>
                  {YOUTUBE[c.youtube].label}
                </span>
              )}

              {/* WHY a channel is queued, in full and never truncated.
                  Two quite different things land here -- "no credit until
                  midnight" and "this channel is already live on another
                  video" -- and only the second one has an action. Showing a
                  clipped grey sentence left the operator starting broadcast
                  after broadcast with no idea the first was still running. */}
              {c.state === "queued" && c.reason && (() => {
                const blocker = /live on video ([\w-]+)/.exec(c.reason || "");
                return (
                  <span className="inline-flex items-center gap-1.5 flex-wrap
                                   text-[11px] opacity-90">
                    <span style={{ color: "var(--adm-amber, #fbbf24)" }}>
                      {c.reason}
                    </span>
                    {blocker && blocker[1] !== videoId && (
                      <button
                        type="button"
                        disabled={!!busy}
                        title={`Stop broadcast ${blocker[1]} so this channel is free`}
                        onClick={() => act("free the channel",
                          () => api.liveEngineStopVideo(blocker[1]))}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                                   border border-amber-500/50 hover:border-amber-400
                                   disabled:opacity-40"
                      >
                        <Square size={9} /> stop {blocker[1]} and start this
                      </button>
                    )}
                  </span>
                );
              })()}

              {c.watch_url && (
                <a href={c.watch_url} target="_blank" rel="noreferrer"
                   className="underline opacity-80 hover:opacity-100">watch</a>
              )}

              <span className="ml-auto flex items-center gap-1">
                {running && (
                  <>
                    <button type="button" disabled={!!busy}
                            onClick={() => act("restart",
                              () => api.liveEngineRestart(videoId, c.channel_id))}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                                       border border-border/60 hover:border-border disabled:opacity-40"
                            title="Restart just this channel's line. The others keep streaming.">
                      <RotateCw size={10} /> restart
                    </button>
                  </>
                )}
                <button type="button" disabled={!!busy}
                        onClick={() => act("stop",
                          () => api.liveEngineStopChannel(videoId, c.channel_id))}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                                   border border-border/60 hover:border-border disabled:opacity-40"
                        title="Stop only this channel. Every other channel keeps streaming.">
                  <Square size={10} /> stop
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {addable.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-[11px] opacity-70">Add a channel while it runs:</span>
          {addable.slice(0, 6).map((c) => (
            <button key={c.id} type="button" disabled={!!busy}
                    onClick={() => act("add",
                      () => api.liveEngineAddChannel(videoId, { channel_id: String(c.id) }))}
                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded
                               border border-border/60 hover:border-border disabled:opacity-40"
                    title="It joins at the current moment, within a few seconds.">
              <Plus size={10} /> {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
