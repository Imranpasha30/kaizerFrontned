import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle, Upload,
} from "lucide-react";
import { api } from "../api/client";

/**
 * BulletinImagesPanel — grid of every per-story carousel image in a
 * bulletin job. Lets the user click any thumbnail to replace it with
 * an uploaded JPG, then fires a compose-only re-render to bake the
 * change into bulletin.mp4.
 *
 * Mounted in Editor.jsx only when the currently-selected clip's
 * frame_type is "bulletin".  Hidden entirely for Shorts/Reels (which
 * use the existing single-image upload UI).
 *
 * Props:
 *   jobId — the bulletin's job id. Required.
 *   onRecomposeStarted — optional callback so Editor can show a "render
 *       in progress" badge in its own UI without polling itself.
 */
export default function BulletinImagesPanel({ jobId, onRecomposeStarted }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [replacingKey, setReplacingKey] = useState("");   // "story_idx:slot_idx" of the in-flight upload
  const [pendingChange, setPendingChange] = useState(false);  // user replaced ≥1 image → need recompose
  const [recomposing, setRecomposing]     = useState(false);
  const [scope, setScope]                 = useState("auto");  // auto | text-only | images | full
  const [verify, setVerify]               = useState(false);
  const pollRef = useRef(null);

  // ── Data load ─────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!jobId) return;
    try {
      const d = await api.listBulletinImages(jobId);
      setData(d);
      // Server-side recompose state — if it's running, show the
      // spinner even on a fresh tab open.
      const state = d?.recompose_state || "idle";
      if (state === "running" || state === "queued") {
        setRecomposing(true);
      } else {
        setRecomposing(false);
        // Done means the bulletin.mp4 was just refreshed → pending
        // change is now applied. Clear the "needs render" hint.
        if (state === "done") setPendingChange(false);
      }
      setError("");
    } catch (e) {
      setError(e?.message || "Failed to load full video images");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // ── While a recompose is running, poll every 5 s until it's done.
  // This is how the panel knows when the bulletin.mp4 has actually
  // been re-rendered (otherwise the user sees the spinner forever).
  useEffect(() => {
    if (!recomposing) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(reload, 5000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [recomposing, reload]);

  // ── Replace one image ─────────────────────────────────────────
  async function replaceImage(storyIdx, slotIdx, file) {
    if (!file) return;
    const key = `${storyIdx}:${slotIdx}`;
    setReplacingKey(key);
    setError("");
    try {
      await api.replaceBulletinImage(jobId, storyIdx, slotIdx, file);
      setPendingChange(true);
      await reload();
    } catch (e) {
      setError(e?.message || "Replace failed");
    } finally {
      setReplacingKey("");
    }
  }

  // ── Kick off compose-only re-render ──────────────────────────
  async function startRecompose() {
    if (recomposing) return;
    setError("");
    try {
      await api.recomposeBulletin(jobId, { scope, verify });
      setRecomposing(true);
      onRecomposeStarted?.();
      await reload();
    } catch (e) {
      setError(e?.message || "Re-compose failed to start");
    }
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 text-xs text-gray-500 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Loading full video images…
      </div>
    );
  }
  if (!data || (!data.pool?.length && !data.stories?.length)) {
    return (
      <div className="p-4 text-xs text-gray-500 italic">
        No full video images on disk yet. Did the pipeline finish?
      </div>
    );
  }

  // ── Pool mode (new): pipeline cycles a shared pool of ~5-6 images
  // across all stories — show ONE grid of unique images, with a
  // "used in story N, M" chip on each.  Legacy per-story mode falls
  // through to the old stories array.
  const showPool = data.pool && data.pool.length > 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-accent">
            Full Video images
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
            {showPool ? (
              <>
                <strong className="text-gray-300">{data.unique_images}</strong>
                {" "}image{data.unique_images !== 1 ? "s" : ""} in the job-level
                pool, cycled across {data.stories.length} stor
                {data.stories.length === 1 ? "y" : "ies"}.
                Replacing one image updates every story that uses it.
              </>
            ) : (
              <>
                {data.total_images} image{data.total_images !== 1 ? "s" : ""}
                {" "}across {data.stories.length} stor
                {data.stories.length === 1 ? "y" : "ies"}.
                Click any thumbnail to replace it.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1"
          title="Reload from disk"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pool grid (new) OR per-story grid (legacy fallback) */}
      <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
        {showPool ? (
          <PoolGrid
            pool={data.pool}
            replacingKey={replacingKey}
            onReplace={replaceImage}
          />
        ) : (
          data.stories.map((story) => (
            <StoryRow
              key={story.story_index}
              story={story}
              replacingKey={replacingKey}
              onReplace={replaceImage}
            />
          ))
        )}
      </div>

      {/* Re-compose CTA */}
      <div className="pt-2 border-t border-border flex flex-col gap-2">
        {pendingChange && !recomposing && (
          <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded p-2 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Images updated.</strong> Click <strong>Re-compose full video</strong>
              {" "}below to bake the changes into the final video file.
              Gemini analysis + OpenAI generation are skipped (cached) — only
              the FFmpeg compose runs, ~7–10 min for a typical full video.
            </span>
          </div>
        )}
        {recomposing && (
          <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/40 rounded p-2 flex items-start gap-1.5">
            <Loader2 size={12} className="mt-0.5 flex-shrink-0 animate-spin" />
            <span>
              Re-composing full video — polling every 5s. The preview will
              pick up the new render automatically when it lands. You can
              close this tab; the job keeps running in the background.
            </span>
          </div>
        )}
        {data.recompose_state === "done" && !pendingChange && !recomposing && (
          <div className="text-[11px] text-emerald-300 flex items-center gap-1.5 flex-wrap">
            <CheckCircle size={12} /> Last re-compose: success.
            {data.recompose_scope && (
              <span className="text-gray-500">scope={data.recompose_scope}</span>
            )}
            {typeof data.recompose_psnr_db === "number" && (
              <span
                className={
                  data.recompose_psnr_db >= 50
                    ? "px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30"
                    : "px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300"
                }
                title="PSNR comparison vs full rebuild (≥50 dB = visually identical)"
              >
                PSNR {data.recompose_psnr_db.toFixed(1)} dB
              </span>
            )}
          </div>
        )}
        {data.recompose_state === "failed" && (
          <div className="text-[11px] text-red-300">
            Last re-compose failed: {data.recompose_msg}
          </div>
        )}

        {/* Advanced: scope + verify. Defaults (auto, no verify) cover
            the common case — the content-hash deps tracker decides
            what to rebuild. The other options are for the user to
            force a specific class of rebuild or run a PSNR check. */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <label className="flex items-center gap-1">
            <span className="text-gray-500">Scope</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              disabled={recomposing}
              className="bg-black/40 border border-border rounded px-1 py-0.5 text-[11px]"
              title="auto = content-hash decides; full = rebuild everything"
            >
              <option value="auto">auto</option>
              <option value="text-only">text only</option>
              <option value="images">images</option>
              <option value="full">full</option>
            </select>
          </label>
          <label className="flex items-center gap-1 ml-auto" title="Run a parallel full rebuild and PSNR-compare to validate the fast path (doubles wall-clock).">
            <input
              type="checkbox"
              checked={verify}
              onChange={(e) => setVerify(e.target.checked)}
              disabled={recomposing}
            />
            <span className="text-gray-500">verify PSNR</span>
          </label>
        </div>

        <button
          type="button"
          onClick={startRecompose}
          disabled={recomposing || (!pendingChange && data.recompose_state !== "failed" && scope === "auto")}
          className={`btn w-full flex items-center justify-center gap-2 text-xs py-2 ${
            pendingChange ? "btn-primary ring-2 ring-amber-500/40" : "btn-secondary"
          } disabled:opacity-40`}
        >
          {recomposing ? (
            <><Loader2 size={14} className="animate-spin" /> Re-composing…</>
          ) : (
            <><RefreshCw size={14} /> Re-compose full video{scope !== "auto" ? ` (${scope})` : ""}</>
          )}
        </button>
      </div>
    </div>
  );
}


// ─── Pool grid (PRIMARY view) ──────────────────────────────────
// Renders the deduped job-level pool of unique carousel images.
// Each card shows which stories cycle through that image.

function PoolGrid({ pool, replacingKey, onReplace }) {
  return (
    <div className="bg-black/30 border border-border rounded p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 flex items-center justify-between">
        <span>Job pool ({pool.length} unique image{pool.length !== 1 ? "s" : ""})</span>
        <span className="text-gray-600 normal-case tracking-normal text-[10px]">
          replace once → applies everywhere
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {pool.map((img) => {
          const key  = `${img.story_index}:${img.slot_index}`;
          const busy = replacingKey === key;
          return (
            <PoolCard
              key={img.abs_path}
              img={img}
              busy={busy}
              onPick={(file) => onReplace(img.story_index, img.slot_index, file)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PoolCard({ img, busy, onPick }) {
  const [bust, setBust] = useState(Date.now());
  const usedIn = (img.story_indexes || [img.story_index]).map((i) => i + 1);
  return (
    <label className="relative block cursor-pointer rounded overflow-hidden border border-border hover:border-accent group">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onPick(f);
            setBust(Date.now());
          }
          e.target.value = "";
        }}
      />
      <img
        src={`${img.url}&t=${bust}`}
        alt={img.filename}
        className="w-full aspect-[16/9] object-cover bg-surface"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white">
        <Upload size={14} /> <span className="ml-1">Replace</span>
      </div>
      <div className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-black/70 rounded text-[9px] text-gray-300 tabular-nums">
        #{img.pool_slot ?? img.slot_index}
      </div>
      <div
        className="absolute bottom-0.5 left-0.5 px-1 py-0.5 bg-black/70 rounded text-[9px] text-emerald-300 tabular-nums"
        title={`Used in stor${usedIn.length === 1 ? "y" : "ies"} ${usedIn.join(", ")}`}
      >
        story {usedIn.join(",")}
      </div>
      {busy && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-accent2" />
        </div>
      )}
    </label>
  );
}


// ─── Per-story sub-component (legacy fallback) ─────────────────

function StoryRow({ story, replacingKey, onReplace }) {
  return (
    <div className="bg-black/30 border border-border rounded p-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
        Story {story.story_index + 1} ({story.images.length} image{story.images.length !== 1 ? "s" : ""})
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {story.images.map((img) => {
          const key  = `${story.story_index}:${img.slot_index}`;
          const busy = replacingKey === key;
          return (
            <ImageCard
              key={img.abs_path}
              img={img}
              busy={busy}
              onPick={(file) => onReplace(story.story_index, img.slot_index, file)}
            />
          );
        })}
      </div>
    </div>
  );
}


// ─── Individual image card ─────────────────────────────────────

function ImageCard({ img, busy, onPick }) {
  // Cache-bust the URL so the freshly-replaced JPG actually re-fetches
  // instead of showing the stale browser-cached version.
  const [bust, setBust] = useState(Date.now());
  return (
    <label className="relative block cursor-pointer rounded overflow-hidden border border-border hover:border-accent group">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onPick(f);
            setBust(Date.now());
          }
          // Clear so the same file can be re-picked
          e.target.value = "";
        }}
      />
      <img
        src={`${img.url}&t=${bust}`}
        alt={img.filename}
        className="w-full aspect-[16/9] object-cover bg-surface"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white">
        <Upload size={14} /> <span className="ml-1">Replace</span>
      </div>
      <div className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-black/70 rounded text-[9px] text-gray-300 tabular-nums">
        #{img.slot_index}
      </div>
      {busy && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-accent2" />
        </div>
      )}
    </label>
  );
}
