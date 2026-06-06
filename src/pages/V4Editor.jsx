import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  RefreshCw, Loader2, Upload, Trash2, ArrowUp, ArrowDown,
  ImagePlus, AlertCircle, CheckCircle2, Plus, Play, ArrowLeft,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { api, getToken } from "../api/client";
import {
  exportBulletinClient,
  isClientExportSupported,
  downloadBlob,
} from "../lib/clientExporter";

// Browser <img> tags cannot attach Authorization: Bearer headers — so the
// pool-serving route accepts the JWT via ?token= query too. This helper
// stamps the current JWT onto any pool URL so KAIZER_AUTH_REQUIRED=true
// installs don't show broken-image thumbnails for every pool tile.
function withAuth(url) {
  if (!url) return url;
  const t = getToken();
  if (!t) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

// V1 short-template font list — same options the legacy Editor exposes.
const V4_SHORT_FONTS = [
  "NotoSansTelugu-Bold.ttf", "Ponnala-Regular.ttf", "NotoSerifTelugu-Bold.ttf",
  "HindGuntur-Bold.ttf", "Gurajada-Regular.ttf", "Ramabhadra-Regular.ttf",
  "TenaliRamakrishna-Regular.ttf", "Timmana-Regular.ttf",
  "NotoSansDevanagari-Bold.ttf", "NotoSansTamil-Bold.ttf",
  "NotoSansKannada-Bold.ttf", "NotoSansBengali-Bold.ttf",
];
const V4_SHORT_LAYOUTS = [
  { value: "torn_card",   label: "Torn Card"   },
  { value: "clean_card",  label: "Clean Card"  },
  { value: "split_frame", label: "Split Frame" },
  { value: "follow_bar",  label: "Follow Bar"  },
];

/**
 * V4 Canvas Editor
 * ───────────────────────────────────────────────────────────────
 * Reads canvas.json for a V4 job and lets the operator:
 *   - Edit story titles
 *   - Edit lower-third / ticker text
 *   - Swap / add / delete / reorder images per story
 *   - Adjust image display durations (slider)
 *   - Reorder images and stories
 *   - Trigger a Step-2 re-render (≈5-15 s, audio passthrough)
 *
 * The canvas.json is the source of truth — anything you edit here
 * goes straight into the file the canvas_engine consumes.
 */
export default function V4Editor() {
  const { jobId } = useParams();
  const [canvas, setCanvas]     = useState(null);
  const [pool, setPool]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [dirty, setDirty]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [renderState, setRenderState] = useState({ state: "idle", msg: "", target: "" });
  const [bulletinUrl, setBulletinUrl] = useState("");
  const [trimmedUrl,  setTrimmedUrl]  = useState("");
  const [shortsUrls,  setShortsUrls]  = useState([]);
  const [bulletinClipId, setBulletinClipId] = useState(null);
  const [shortsClipIds,  setShortsClipIds]  = useState([]);
  const [channels,    setChannels]    = useState([]);
  // Real YouTube accounts (the "My accounts" cards) — these are the
  // ones that actually have logos/watermarks/socials attached. Style
  // profiles are voice templates for SEO and don't belong in the
  // download/publish channel picker.
  const [ytAccounts,  setYtAccounts]  = useState([]);
  const [publishTarget, setPublishTarget] = useState(null);  // { clipId, kind, title }
  const [defaults,    setDefaults]    = useState(null);     // V4 user defaults (auto-pub flags)
  const [consentDone, setConsentDone] = useState(false);    // dismissed banner
  // 3-pane editor selection. Declared up here (NOT after the loading
  // early-return) so the hook order stays stable across renders —
  // declaring it lower violates the Rules of Hooks and React crashes
  // with "Rendered more hooks than during the previous render".
  const [selected, setSelected] = useState({ kind: "bulletin", index: 0 });
  // Which image is currently being edited — used by BulletinLivePreview
  // so the central canvas shows the slot the user is touching, not just
  // "first image of pool". Updated when the user clicks an image row /
  // opens replace / opens frame. {storyIdx, imgIdx} or null.
  const [activeImage, setActiveImage] = useState(null);

  // Poll loop for render state when something is in flight
  const pollRef = useRef(null);

  const fetchCanvas = useCallback(async () => {
    try {
      const r = await api.v4GetCanvas(jobId);
      setCanvas(r.canvas);
      setPool(r.pool_listing || []);
      setRenderState({
        state: r.render_state || "idle",
        msg:   r.render_msg   || "",
        target: r.render_target || "",
      });
      setBulletinUrl(r.bulletin_url || "");
      setTrimmedUrl(r.trimmed_url || "");
      setBulletinClipId(r.bulletin_clip_id ?? null);
      setShortsClipIds(r.shorts_clip_ids || []);
      setShortsUrls(r.shorts_urls || []);
      setErr("");
    } catch (e) {
      setErr(e?.message || "failed to load canvas");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchCanvas(); }, [fetchCanvas]);

  // One-shot fetch:
  //   * listChannels() returns BOTH style profiles AND connected YT
  //     accounts — used by the Publish modal for back-compat.
  //   * listYtAccounts() returns ONLY the real connected accounts
  //     (the "My YouTube Accounts" cards). Those drive the Download
  //     dropdown so the user doesn't see "Personal 12" SEO templates
  //     when picking a brand to stamp the download with.
  useEffect(() => {
    api.listChannels().then((list) => {
      if (Array.isArray(list)) setChannels(list);
    }).catch(() => {});
    api.listYtAccounts().then((list) => {
      if (Array.isArray(list)) setYtAccounts(list);
    }).catch(() => {});
    // Defaults — drive the consent banner + multi-channel one-click publish.
    api.v4GetDefaults().then((d) => setDefaults(d || null)).catch(() => {});
  }, []);

  async function consentPublishAll() {
    if (!defaults?.channel_ids?.length) {
      setErr("Set channel defaults at V4 Auto-Pipeline Defaults first.");
      return;
    }
    const allClipIds = [
      bulletinClipId,
      ...(shortsClipIds || []).filter(Boolean),
    ].filter(Boolean);
    if (!allClipIds.length) {
      setErr("Nothing to publish yet — wait for the renders to finish.");
      return;
    }
    try {
      for (const cid of allClipIds) {
        await api.publishClip(cid, {
          channel_ids: defaults.channel_ids,
          privacy_status: defaults.privacy || "public",
          publish_kind: cid === bulletinClipId ? "video" : "short",
          use_seo: true,
        });
      }
      setConsentDone(true);
      setErr("Queued — track progress in the Uploads tab or watch the pills below.");
    } catch (e) {
      setErr(e?.message || "publish failed");
    }
  }

  // Auto-poll render state while running
  useEffect(() => {
    if (!["queued", "running"].includes(renderState.state)) return;
    const tick = async () => {
      try {
        const r = await api.v4RenderState(jobId);
        setRenderState({ state: r.state || "idle", msg: r.msg || "", target: r.target || "" });
        if (!["queued", "running"].includes(r.state)) {
          // Re-fetch canvas + pool after render completion in case
          // anything materialised on disk
          fetchCanvas();
          return;
        }
      } catch (e) { /* keep polling */ }
      pollRef.current = setTimeout(tick, 3000);
    };
    pollRef.current = setTimeout(tick, 3000);
    return () => clearTimeout(pollRef.current);
  }, [renderState.state, jobId, fetchCanvas]);

  // ── Save handler ──────────────────────────────────────────────
  async function saveCanvas() {
    if (!canvas) return;
    setSaving(true);
    try {
      await api.v4PutCanvas(jobId, canvas);
      setDirty(false);
    } catch (e) {
      setErr(e?.message || "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAndRender(target = "bulletin", index = 0) {
    if (dirty) {
      await saveCanvas();
    }
    try {
      await api.v4TriggerRender(jobId, { target, index });
      setRenderState({ state: "queued", msg: "queued", target });
    } catch (e) {
      setErr(e?.message || "render trigger failed");
    }
  }

  // ── Canvas mutation helpers (immutable updates) ──────────────
  function setStory(storyIdx, mutator) {
    setCanvas((c) => {
      if (!c) return c;
      const nc = structuredClone(c);
      const s = nc.bulletin.stories[storyIdx];
      mutator(s);
      return nc;
    });
    setDirty(true);
  }

  function moveStory(storyIdx, direction) {
    setCanvas((c) => {
      if (!c) return c;
      const nc = structuredClone(c);
      const arr = nc.bulletin.stories;
      const target = storyIdx + direction;
      if (target < 0 || target >= arr.length) return c;
      [arr[storyIdx], arr[target]] = [arr[target], arr[storyIdx]];
      return nc;
    });
    setDirty(true);
  }

  function addImageToStory(storyIdx, poolFilename) {
    setStory(storyIdx, (s) => {
      const lastEnd = s.images.length ? s.images[s.images.length - 1].t_end : 0;
      const storyDur = (s.video_t_end || 0) - (s.video_t_start || 0);
      const t_start = Math.min(lastEnd, Math.max(0, storyDur - 1));
      const t_end   = Math.min(storyDur, t_start + 4.0);
      s.images.push({
        src: poolFilename,
        t_start, t_end,
        source: "user",
        label: null,
      });
    });
  }

  function removeImage(storyIdx, imgIdx) {
    setStory(storyIdx, (s) => { s.images.splice(imgIdx, 1); });
  }

  function moveImage(storyIdx, imgIdx, direction) {
    setStory(storyIdx, (s) => {
      const t = imgIdx + direction;
      if (t < 0 || t >= s.images.length) return;
      [s.images[imgIdx], s.images[t]] = [s.images[t], s.images[imgIdx]];
    });
  }

  function setImageDuration(storyIdx, imgIdx, durationSec) {
    setStory(storyIdx, (s) => {
      const img = s.images[imgIdx];
      img.t_end = (img.t_start || 0) + Math.max(0.5, durationSec);
    });
  }

  function setImageStart(storyIdx, imgIdx, t_start) {
    setStory(storyIdx, (s) => {
      const img = s.images[imgIdx];
      const dur = (img.t_end || 0) - (img.t_start || 0);
      img.t_start = Math.max(0, t_start);
      img.t_end = img.t_start + dur;
    });
  }

  function setImageEffect(storyIdx, imgIdx, effect) {
    setStory(storyIdx, (s) => {
      const img = s.images[imgIdx];
      img.effect = effect;
      // First time we stamp an effect, give it a sane default duration so
      // the user doesn't see fade=0 (= cut) in the output.
      if (effect !== "cut" && (img.effect_duration == null || img.effect_duration === 0)) {
        img.effect_duration = 0.4;
      }
    });
  }

  function setImageEffectDuration(storyIdx, imgIdx, durationSec) {
    setStory(storyIdx, (s) => {
      const img = s.images[imgIdx];
      img.effect_duration = Math.max(0, Math.min(2, durationSec));
    });
  }

  function setImageFit(storyIdx, imgIdx, fit) {
    setStory(storyIdx, (s) => { s.images[imgIdx].fit = fit; });
  }

  function setImageOffset(storyIdx, imgIdx, x_pct, y_pct) {
    setStory(storyIdx, (s) => {
      const img = s.images[imgIdx];
      img.offset_x_pct = Math.max(0, Math.min(100, x_pct));
      img.offset_y_pct = Math.max(0, Math.min(100, y_pct));
    });
  }

  function setTextBlock(storyIdx, blockIdx, mutator) {
    setStory(storyIdx, (s) => { mutator(s.text_blocks[blockIdx]); });
  }

  function setLayout(mutator) {
    setCanvas((c) => {
      if (!c) return c;
      const nc = structuredClone(c);
      mutator(nc.bulletin.layout);
      return nc;
    });
    setDirty(true);
  }

  // SEO edits (per bulletin) — mutates canvas.bulletin.seo.
  function setBulletinSeo(mutator) {
    setCanvas((c) => {
      if (!c || !c.bulletin) return c;
      const nc = structuredClone(c);
      if (!nc.bulletin.seo) {
        nc.bulletin.seo = {
          title: "", description: "", keywords: [], hashtags: [],
          hook: "", thumbnail_text: "", metadata: {}, language: nc.language || "te",
          model: "", edited_by_user: false,
        };
      }
      mutator(nc.bulletin.seo);
      nc.bulletin.seo.edited_by_user = true;
      return nc;
    });
    setDirty(true);
  }

  // SEO edits (per short) — mutates canvas.shorts[i].seo.
  function setShortSeo(shortIdx, mutator) {
    setCanvas((c) => {
      if (!c || !c.shorts || !c.shorts[shortIdx]) return c;
      const nc = structuredClone(c);
      if (!nc.shorts[shortIdx].seo) {
        nc.shorts[shortIdx].seo = {
          title: "", description: "", keywords: [], hashtags: [],
          hook: "", thumbnail_text: "", metadata: {}, language: nc.language || "te",
          model: "", edited_by_user: false,
        };
      }
      mutator(nc.shorts[shortIdx].seo);
      nc.shorts[shortIdx].seo.edited_by_user = true;
      return nc;
    });
    setDirty(true);
  }

  // V1-parity short editing — mutates canvas.shorts[i].short_config.
  // Mirrors V1's Editor.jsx so every torn_card / clean_card / split_frame
  // / follow_bar knob the legacy editor exposed lives here too.
  function setShortConfig(shortIdx, mutator) {
    setCanvas((c) => {
      if (!c || !c.shorts || !c.shorts[shortIdx]) return c;
      const nc = structuredClone(c);
      // Initialise short_config to V1 defaults if the canvas was
      // persisted before this schema field existed.
      if (!nc.shorts[shortIdx].short_config) {
        nc.shorts[shortIdx].short_config = {
          layout: "torn_card",
          text: null,
          font_file: "NotoSansTelugu-Bold.ttf",
          font_size: null,
          text_color: "#FFFFFF",
          image_filename: null,
          section_pct: { video: 0.4619, text: 0.1691, image: 0.3690 },
          card_style: {
            seed: 7, edge: 9, jag: 60, overlap: 20,
            vsid: 35, vcor: 72, vwid: 74, bgr0: 193, bgr1: 128,
          },
          follow_params: {
            follow_text: "FOLLOW KAIZER NEWS TELUGU",
            follow_text_color: "#FFFFFF",
            bg_color: "#1A0A2E",
            text_color: "#FFFF00",
          },
        };
      }
      mutator(nc.shorts[shortIdx].short_config);
      return nc;
    });
    setDirty(true);
  }

  async function uploadPoolImage(file, label) {
    try {
      const r = await api.v4UploadPoolImage(jobId, file, label);
      setPool((p) => [...p, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }]);
      return r;
    } catch (e) {
      setErr(e?.message || "upload failed");
      return null;
    }
  }

  async function deletePoolImage(filename) {
    if (!confirm(`Delete ${filename} from the pool? Any story using it will keep referencing it (broken) until you swap.`)) return;
    try {
      await api.v4DeletePoolImage(jobId, filename);
      setPool((p) => p.filter((x) => x.filename !== filename));
    } catch (e) {
      setErr(e?.message || "delete failed");
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Loader2 className="animate-spin inline mr-2" /> Loading canvas …
      </div>
    );
  }
  if (err && !canvas) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded text-red-200">
          <AlertCircle className="inline mr-2" /> {err}
        </div>
        <Link to={`/jobs/${jobId}`} className="text-accent2 text-sm mt-3 inline-block">
          ← Back to job
        </Link>
      </div>
    );
  }

  // Derived: the canvas object backing the current selection (used by
  // the inspector to know which seo / short_config / stories to edit).
  // (The `selected` state itself is declared up top with the other
  // hooks — must be before the loading early-return.)
  const selectedCanvas = selected.kind === "bulletin"
    ? canvas?.bulletin
    : selected.kind === "short"
      ? canvas?.shorts?.[selected.index]
      : null;
  const selectedClipId = selected.kind === "bulletin"
    ? bulletinClipId
    : selected.kind === "short"
      ? shortsClipIds[selected.index]
      : null;
  const selectedUrl = selected.kind === "bulletin"
    ? (bulletinUrl || trimmedUrl)
    : selected.kind === "short"
      ? shortsUrls[selected.index]
      : null;

  return (
    <div className="max-w-[1800px] mx-auto p-3">
      <V4EditorHeader
        jobId={jobId}
        renderState={renderState}
        dirty={dirty}
        saving={saving}
        onSave={saveCanvas}
        onRender={() => saveAndRender(selected.kind === "short" ? "short" : "bulletin", selected.index || 0)}
        onRefresh={fetchCanvas}
      />

      {publishTarget && (
        <PublishModal
          target={publishTarget}
          channels={channels}
          onClose={() => setPublishTarget(null)}
          onPublished={() => {
            setPublishTarget(null);
            setErr("Published to YouTube — track progress in the Uploads tab.");
          }}
          setErr={setErr}
        />
      )}

      {err && (
        <div className="my-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-200 text-xs flex items-center gap-2">
          <AlertCircle size={14} /> {err}
          <button onClick={() => setErr("")} className="ml-auto text-xs text-red-300/70 hover:text-white">dismiss</button>
        </div>
      )}

      {/* Auto-publish consent banner — only shown when the user has
          auto_publish + require_consent enabled in their V4 defaults,
          the canvas is rendered, and nothing's been queued yet. One
          click fans out every clip to every default channel. */}
      {defaults?.auto_publish && defaults?.require_consent && !consentDone && bulletinUrl && (
        <div className="my-2 p-3 rounded border border-amber-500/40 bg-amber-500/5 flex items-center gap-3">
          <div className="text-amber-300 text-lg flex-shrink-0">⚡</div>
          <div className="flex-1 text-xs">
            <div className="font-semibold text-amber-200">Ready to publish</div>
            <div className="text-amber-300/70">
              The pipeline finished. Confirm to publish bulletin + {(shortsClipIds || []).filter(Boolean).length} short(s)
              to {defaults.channel_ids?.length || 0} channel(s) at {defaults.privacy || "public"} privacy.
            </div>
          </div>
          <button
            onClick={() => setConsentDone(true)}
            className="text-xs text-amber-300/60 hover:text-amber-200"
          >Skip</button>
          <button
            onClick={consentPublishAll}
            className="btn btn-primary text-xs px-3 py-1.5"
          >
            Publish all
          </button>
        </div>
      )}

      {/* ─── 3-pane editor — uses the app's existing dark-theme tokens
          (bg-panel #0e0e0e, border-border #1a1a1a, text-ink-* ramp)
          which were tuned for ≥7:1 contrast on this background, then
          adds the accent + focus polish on top. */}
      <div className="grid grid-cols-[240px,1fr,380px] gap-3 mt-3 min-h-[78vh]">
        {/* LEFT NAVIGATION — Bulletin + Shorts + Library */}
        <aside className="rounded-lg border border-border bg-panel p-2 overflow-y-auto shadow-card"
               style={{ maxHeight: "78vh" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-200 px-2 py-1 mb-1">Output</div>
          <NavItem
            active={selected.kind === "bulletin"}
            onClick={() => setSelected({ kind: "bulletin", index: 0 })}
            label="Bulletin"
            sublabel="16:9 long-form · YouTube video"
            url={bulletinUrl}
          />
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-200 px-2 py-1 mt-3 mb-1">
            Shorts ({canvas?.shorts?.length || 0})
          </div>
          {(canvas?.shorts || []).map((sc, i) => (
            <NavItem
              key={i}
              active={selected.kind === "short" && selected.index === i}
              onClick={() => setSelected({ kind: "short", index: i })}
              label={`Short ${String(i + 1).padStart(2, "0")}`}
              sublabel={sc.short_config?.layout || "torn_card"}
              url={shortsUrls[i]}
              vertical
            />
          ))}
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-200 px-2 py-1 mt-3 mb-1">Library</div>
          <NavItem
            active={selected.kind === "pool"}
            onClick={() => setSelected({ kind: "pool" })}
            label="Image pool"
            sublabel={`${pool.length} images`}
          />
        </aside>

        {/* CENTER VIEWPORT — selected canvas preview + rendered video */}
        <main className="rounded-lg border border-border bg-panel p-4 overflow-y-auto shadow-card"
              style={{ maxHeight: "78vh" }}>
          {selected.kind === "bulletin" && (
            <BulletinViewport
              jobId={jobId}
              canvas={canvas}
              bulletinUrl={bulletinUrl}
              trimmedUrl={trimmedUrl}
              bulletinClipId={bulletinClipId}
              pool={pool}
              accounts={ytAccounts}
              activeImage={activeImage}
              onPanActiveImage={(x, y) => {
                if (!activeImage) return;
                setImageOffset(activeImage.storyIdx, activeImage.imgIdx, x, y);
              }}
              onPublish={() => setPublishTarget({
                clipId: bulletinClipId,
                kind: "video",
                title: canvas?.bulletin?.seo?.title || "Bulletin",
              })}
              onLayoutChange={setLayout}
            />
          )}
          {selected.kind === "short" && selectedCanvas && (
            <ShortViewport
              jobId={jobId}
              index={selected.index}
              short={selectedCanvas}
              url={selectedUrl}
              pool={pool}
              clipId={selectedClipId}
              accounts={ytAccounts}
              onPublish={() => setPublishTarget({
                clipId: selectedClipId,
                kind: "short",
                title: selectedCanvas?.seo?.title || selectedCanvas?.short_config?.text || `Short ${selected.index + 1}`,
              })}
            />
          )}
          {/* Stories editing relocated into the Bulletin Inspector (right
              pane) so edits stay co-located with the live preview + SEO. */}
          {selected.kind === "pool" && (
            <PoolPanel
              pool={pool}
              onUpload={uploadPoolImage}
              onDelete={deletePoolImage}
              jobId={jobId}
            />
          )}
        </main>

        {/* RIGHT INSPECTOR — properties of the selected canvas */}
        <aside className="rounded-lg border border-border bg-panel p-3 overflow-y-auto space-y-3 text-xs shadow-card"
               style={{ maxHeight: "78vh" }}>
          <div className="flex items-center justify-between gap-2 pb-2 mb-1 border-b border-border">
            <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-100">Inspector</span>
            <button
              onClick={() => saveAndRender(
                selected.kind === "short" ? "short" : "bulletin",
                selected.index || 0,
              )}
              disabled={renderState.state === "running" || renderState.state === "queued"}
              className="text-accent2 hover:text-white normal-case text-[10px] disabled:opacity-40"
              title="Save + re-render this canvas"
            >
              Re-render
            </button>
          </div>

          {selected.kind === "bulletin" && canvas?.bulletin && (
            <>
              <SeoPanel
                seo={canvas.bulletin.seo || {}}
                onSeo={setBulletinSeo}
                target="bulletin"
                index={0}
                jobId={jobId}
                clipId={bulletinClipId}
                channels={channels}
                onRegenerated={(freshSeo) => {
                  setBulletinSeo((s) => {
                    Object.keys(s).forEach((k) => delete s[k]);
                    Object.assign(s, freshSeo);
                  });
                }}
              />
              <ThumbnailPanel jobId={jobId} target="bulletin" index={0} />

              {/* Stories editor — title / summary / carousel images /
                  text overlays per story. Edits flow into the live
                  preview (BulletinLivePreview reads story titles for
                  the headline + ticker) so the user sees changes the
                  moment they type. */}
              <details className="border border-border rounded bg-black/30" open>
                <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-gray-400 px-3 py-2 flex items-center justify-between">
                  <span>Stories ({canvas?.bulletin?.stories?.length || 0})</span>
                  <span className="text-[10px] text-gray-500">edits live-update the preview</span>
                </summary>
                <div className="p-2 space-y-2">
                  {(canvas?.bulletin?.stories || []).map((story, i) => (
                    <StoryCard
                      key={i}
                      storyIdx={i}
                      story={story}
                      isFirst={i === 0}
                      isLast={i === canvas.bulletin.stories.length - 1}
                      pool={pool}
                      onChangeTitle={(t) => setStory(i, (s) => { s.title_native = t; })}
                      onChangeSummary={(t) => setStory(i, (s) => { s.summary = t; })}
                      onMove={(dir) => moveStory(i, dir)}
                      onAddImage={(fn) => addImageToStory(i, fn)}
                      onRemoveImage={(idx) => removeImage(i, idx)}
                      onMoveImage={(idx, dir) => moveImage(i, idx, dir)}
                      onSetImageDuration={(idx, dur) => setImageDuration(i, idx, dur)}
                      onSetImageStart={(idx, t) => setImageStart(i, idx, t)}
                      onSetImageEffect={(idx, fx) => setImageEffect(i, idx, fx)}
                      onSetImageEffectDuration={(idx, d) => setImageEffectDuration(i, idx, d)}
                      onReplaceImageSrc={(idx, fn) => setStory(i, (s) => { s.images[idx].src = fn; })}
                      onSetImageFit={(idx, fit) => setImageFit(i, idx, fit)}
                      onSetImageOffset={(idx, x, y) => setImageOffset(i, idx, x, y)}
                      onMarkActive={(idx) => setActiveImage({ storyIdx: i, imgIdx: idx })}
                      isActiveImageRow={(idx) => activeImage?.storyIdx === i && activeImage?.imgIdx === idx}
                      onUploadReplaceImage={async (idx, file) => {
                        try {
                          const r = await api.v4UploadPoolImage(jobId, file, file.name);
                          setPool((p) => {
                            const filtered = p.filter((x) => x.filename !== r.filename);
                            return [...filtered, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }];
                          });
                          setStory(i, (s) => { s.images[idx].src = r.filename; });
                          return r;
                        } catch (e) { setErr(e?.message || "upload failed"); return null; }
                      }}
                      onAutoFetchReplaceImage={async (idx) => {
                        try {
                          const r = await api.v4FetchPoolImage(jobId, {
                            title: story.title_native || "",
                            title_english: story.title_english || "",
                            summary: story.summary || "",
                            story_index: i,
                            prefer_real_photo: true,
                          });
                          setPool((p) => {
                            const filtered = p.filter((x) => x.filename !== r.filename);
                            return [...filtered, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }];
                          });
                          // Swap src in place — timing/effect preserved.
                          setStory(i, (s) => { s.images[idx].src = r.filename; });
                          return r;
                        } catch (e) { setErr(e?.message || "auto-fetch failed"); return null; }
                      }}
                      onAiReplaceImage={async (idx) => {
                        try {
                          const r = await api.v4AiGenImage(jobId, {
                            title: story.title_native || "",
                            title_english: story.title_english || "",
                            summary: story.summary || "",
                            story_index: i,
                            label: `story${String(i + 1).padStart(2, "0")}_slot${String(idx + 1).padStart(2, "0")}`,
                          });
                          setPool((p) => {
                            const filtered = p.filter((x) => x.filename !== r.filename);
                            return [...filtered, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }];
                          });
                          setStory(i, (s) => { s.images[idx].src = r.filename; });
                          return r;
                        } catch (e) { setErr(e?.message || "AI generation failed"); return null; }
                      }}
                      onSetTextBlock={(idx, m) => setTextBlock(i, idx, m)}
                      onAutoDistribute={async () => {
                        try {
                          const r = await api.v4AutoDistribute(jobId, {
                            story_index: i,
                            effect: "fade",
                            effect_duration: 0.4,
                          });
                          // Server wrote a new canvas; reflect the new image
                          // array locally so the UI updates instantly.
                          setStory(i, (s) => {
                            s.images = r.images || [];
                          });
                          return r;
                        } catch (e) { setErr(e?.message || "auto-distribute failed"); return null; }
                      }}
                      onAutoFetchImage={async () => {
                        try {
                          const r = await api.v4FetchPoolImage(jobId, {
                            title: story.title_native || "",
                            title_english: story.title_english || "",
                            summary: story.summary || "",
                            story_index: i,
                            prefer_real_photo: true,
                          });
                          setPool((p) => [...p, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }]);
                          addImageToStory(i, r.filename);
                          return r;
                        } catch (e) { setErr(e?.message || "auto-fetch failed"); return null; }
                      }}
                      onAiGenerateImage={async () => {
                        try {
                          const r = await api.v4AiGenImage(jobId, {
                            title: story.title_native || "",
                            title_english: story.title_english || "",
                            summary: story.summary || "",
                            story_index: i,
                            label: `story${String(i + 1).padStart(2, "0")}_ai`,
                          });
                          // Replace any prior entry with the same filename so
                          // a regenerate doesn't show two pool tiles for the
                          // same name. The backend overwrites the file in place.
                          setPool((p) => {
                            const filtered = p.filter((x) => x.filename !== r.filename);
                            return [...filtered, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }];
                          });
                          addImageToStory(i, r.filename);
                          return r;
                        } catch (e) { setErr(e?.message || "AI generation failed"); return null; }
                      }}
                    />
                  ))}
                  {(canvas?.bulletin?.stories || []).length === 0 && (
                    <div className="p-3 border border-dashed border-border rounded text-center text-gray-500 italic text-[11px]">
                      No stories produced yet — pipeline may still be running.
                    </div>
                  )}
                </div>
              </details>

              {canvas.bulletin.layout && (
                <LayoutPanel layout={canvas.bulletin.layout} onSet={setLayout} />
              )}
              {canvas.bulletin.layout && (
                <BgVideoPanel layout={canvas.bulletin.layout} onSet={setLayout} />
              )}
            </>
          )}

          {selected.kind === "short" && selectedCanvas && (
            <ShortInspector
              jobId={jobId}
              index={selected.index}
              canvasShort={selectedCanvas}
              pool={pool}
              clipId={shortsClipIds[selected.index] || null}
              channels={channels}
              onConfig={(m) => setShortConfig(selected.index, m)}
              onSeo={(m) => setShortSeo(selected.index, m)}
              onSeoRegenerated={(freshSeo) => {
                setShortSeo(selected.index, (s) => {
                  Object.keys(s).forEach((k) => delete s[k]);
                  Object.assign(s, freshSeo);
                });
              }}
              onAutoFetchImage={async () => {
                const story0 = selectedCanvas.stories?.[0] || {};
                try {
                  const r = await api.v4FetchPoolImage(jobId, {
                    title: story0.title_native || "",
                    title_english: story0.title_english || "",
                    summary: story0.summary || "",
                    story_index: selected.index,
                    prefer_real_photo: true,
                  });
                  setPool((p) => [...p, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }]);
                  setShortConfig(selected.index, (c) => { c.image_filename = r.filename; });
                  return r;
                } catch (e) { setErr(e?.message || "auto-fetch failed"); return null; }
              }}
              onAiGenerateImage={async (tweak) => {
                const story0 = selectedCanvas.stories?.[0] || {};
                try {
                  const r = await api.v4AiGenImage(jobId, {
                    title: story0.title_native || "",
                    title_english: story0.title_english || "",
                    summary: story0.summary || "",
                    story_index: selected.index,
                    label: `short${String(selected.index + 1).padStart(2, "0")}_ai`,
                    tweak: tweak || "",
                  });
                  setPool((p) => {
                    const filtered = p.filter((x) => x.filename !== r.filename);
                    return [...filtered, { filename: r.filename, size_bytes: r.size_bytes, url: r.url }];
                  });
                  setShortConfig(selected.index, (c) => { c.image_filename = r.filename; });
                  return r;
                } catch (e) { setErr(e?.message || "AI generation failed"); return null; }
              }}
            />
          )}

          {selected.kind === "pool" && (
            <div className="text-[11px] text-gray-500 italic">
              Image pool is job-wide — pick the Bulletin or any Short on the left to see its inspector.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}


/* ─── Header ────────────────────────────────────────────────────── */
function V4EditorHeader({ jobId, renderState, dirty, saving, onSave, onRender, onRefresh }) {
  const running = ["queued", "running"].includes(renderState.state);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Link to={`/jobs/${jobId}`} className="text-gray-400 hover:text-white">
        <ArrowLeft size={18} />
      </Link>
      <h2 className="text-lg font-semibold text-white">V4 Canvas Editor · Job #{jobId}</h2>
      <div className="text-[10px] text-emerald-400/70 px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/5">
        Lipsync locked · audio passthrough
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
          title="Reload canvas from disk"
        >
          <RefreshCw size={12} /> Reload
        </button>
        {dirty && (
          <button
            onClick={onSave}
            disabled={saving}
            className="text-xs px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {saving ? <><Loader2 size={11} className="inline animate-spin mr-1" /> Saving</> : "Save changes"}
          </button>
        )}
        <button
          onClick={onRender}
          disabled={running}
          className="text-xs px-3 py-1.5 rounded bg-accent2 text-white hover:bg-accent2/80 disabled:opacity-40 flex items-center gap-1"
        >
          {running
            ? <><Loader2 size={12} className="animate-spin" /> {renderState.target || "rendering"}…</>
            : <><Play size={12} /> Re-render bulletin</>}
        </button>
      </div>

      {renderState.state === "done" && (
        <div className="w-full text-xs text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 size={12} /> Last render finished cleanly.
        </div>
      )}
      {renderState.state === "failed" && (
        <div className="w-full text-xs text-red-300 flex items-center gap-1.5">
          <AlertCircle size={12} /> Render failed: {renderState.msg}
        </div>
      )}
    </div>
  );
}


/* ─── Single-story card ────────────────────────────────────────── */
function StoryCard({
  storyIdx, story, isFirst, isLast, pool,
  onChangeTitle, onChangeSummary, onMove,
  onAddImage, onRemoveImage, onMoveImage,
  onSetImageDuration, onSetImageStart, onSetImageEffect, onSetImageEffectDuration,
  onSetImageFit, onSetImageOffset,
  onReplaceImageSrc, onAiReplaceImage, onAutoFetchReplaceImage, onUploadReplaceImage,
  onSetTextBlock,
  onAutoFetchImage, onAiGenerateImage, onAutoDistribute,
  onMarkActive, isActiveImageRow,
}) {
  const [showPoolPicker, setShowPoolPicker] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [overlaysOpen, setOverlaysOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [aiGenning, setAiGenning] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [replaceIdx, setReplaceIdx] = useState(null);     // which row's mini picker is open
  const [replaceBusy, setReplaceBusy] = useState(null);   // "ai" | "auto" | "upload" | null
  const [framingIdx, setFramingIdx] = useState(null);     // which row's fit/focal popover is open
  const [selected, setSelected] = useState(new Set());    // bulk-edit selection
  const [bulkDur, setBulkDur] = useState("");             // bulk duration input
  const [bulkFx, setBulkFx]  = useState("");              // bulk effect input
  const replaceFileRef = useRef(null);                    // hidden file picker for upload-replace
  const duration = Math.max(0, (story.video_t_end || 0) - (story.video_t_start || 0));
  const imageCount = (story.images || []).length;
  const overlayCount = (story.text_blocks || []).length;

  return (
    <div className="border border-border rounded bg-black/20 p-2.5 space-y-2">
      {/* Header — story label, duration, reorder. Move buttons are tiny
          so the label has room. */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0 text-[10px] text-gray-500 uppercase tracking-wider truncate">
          Story {storyIdx + 1} · {duration.toFixed(1)}s
        </div>
        <button
          onClick={() => onMove(-1)} disabled={isFirst}
          className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30"
          title="Move story up"
        ><ArrowUp size={11} /></button>
        <button
          onClick={() => onMove(1)} disabled={isLast}
          className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30"
          title="Move story down"
        ><ArrowDown size={11} /></button>
      </div>

      {/* Title (always visible — it drives the live preview) */}
      <input
        type="text"
        value={story.title_native || ""}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="Native-script headline"
        className="w-full bg-black border border-border rounded px-2 py-1.5 text-white text-[12px]"
      />
      <textarea
        rows={2}
        value={story.summary || ""}
        onChange={(e) => onChangeSummary(e.target.value)}
        placeholder="One-sentence English summary"
        className="w-full bg-black border border-border rounded px-2 py-1 text-gray-300 text-[11px] resize-y"
      />

      {/* Text overlays — collapsed by default, opens to the existing
          per-block editor. Compact disclosure so the inspector doesn't
          flood the user with overlay forms before they ask. */}
      {overlayCount > 0 && (
        <details open={overlaysOpen} onToggle={(e) => setOverlaysOpen(e.target.open)}
                 className="border border-border/60 rounded">
          <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400">
            Text overlays ({overlayCount})
          </summary>
          <div className="p-2 space-y-1.5 border-t border-border/60">
            {story.text_blocks.map((blk, j) => (
              <TextBlockEditor
                key={j}
                block={blk}
                onPatch={(m) => onSetTextBlock(j, m)}
              />
            ))}
          </div>
        </details>
      )}

      {/* Carousel images — collapsed by default (73 rows would otherwise
          fill the entire inspector). Header shows count + auto-fetch
          + pool picker. */}
      <details open={imagesOpen} onToggle={(e) => setImagesOpen(e.target.open)}
               className="border border-border/60 rounded">
        <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 flex items-center gap-2">
          <span>Images ({imageCount})</span>
          <div className="ml-auto flex items-center gap-1.5">
            {onAutoFetchImage && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  setFetching(true);
                  try { await onAutoFetchImage(); }
                  finally { setFetching(false); }
                }}
                disabled={fetching || aiGenning}
                className="text-accent2 hover:text-white normal-case text-[10px] flex items-center gap-1 disabled:opacity-40"
                title="Search the web for an authentic news photo (CSE / DDG / Pexels)"
              >
                {fetching ? (
                  <><Loader2 size={9} className="animate-spin" /> fetching…</>
                ) : (<><ImagePlus size={9} /> Auto</>)}
              </button>
            )}
            {onAiGenerateImage && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  setAiGenning(true);
                  try { await onAiGenerateImage(); }
                  finally { setAiGenning(false); }
                }}
                disabled={fetching || aiGenning}
                className="text-pink-400 hover:text-white normal-case text-[10px] flex items-center gap-1 disabled:opacity-40"
                title="Generate a new B-roll image with Gemini Nano Banana (uses GCP credits)"
              >
                {aiGenning ? (
                  <><Loader2 size={9} className="animate-spin" /> AI…</>
                ) : (<>✦ AI</>)}
              </button>
            )}
            <button
              onClick={(e) => { e.preventDefault(); setShowPoolPicker(!showPoolPicker); setImagesOpen(true); }}
              className="text-accent2 hover:text-white normal-case text-[10px] flex items-center gap-1"
            >
              <Plus size={9} /> Pool
            </button>
            {onAutoDistribute && (story.images || []).length >= 1 && (
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  setDistributing(true);
                  try { await onAutoDistribute(); }
                  finally { setDistributing(false); }
                }}
                disabled={distributing}
                className="text-amber-300 hover:text-white normal-case text-[10px] flex items-center gap-1 disabled:opacity-40"
                title="Spread the current images evenly across this story's duration and stamp fades"
              >
                {distributing ? (<><Loader2 size={9} className="animate-spin" /> dist…</>) : "↹ Auto"}
              </button>
            )}
          </div>
        </summary>

        <div className="p-2 border-t border-border/60 space-y-1.5">
          {showPoolPicker && (
            <div className="p-1.5 rounded border border-accent2/30 bg-accent2/5">
              <div className="text-[10px] text-accent2 mb-1">Click a pool image to append:</div>
              <div className="grid grid-cols-3 gap-1">
                {pool.map((p) => (
                  <button
                    key={p.filename}
                    onClick={() => { onAddImage(p.filename); setShowPoolPicker(false); }}
                    className="border border-border rounded overflow-hidden hover:border-accent2 aspect-square"
                    title={p.filename}
                  >
                    <img src={withAuth(p.url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
                {pool.length === 0 && (
                  <div className="col-span-full text-[10px] text-gray-500 italic">Pool is empty.</div>
                )}
              </div>
            </div>
          )}

          {/* Hidden file input wired to the inline replace picker — the
              Upload button in that picker calls replaceFileRef.current.click(),
              and on file pick we route the upload through the parent's
              onUploadReplaceImage(j, file) for the currently-open slot. */}
          {onUploadReplaceImage && (
            <input
              ref={replaceFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || replaceIdx == null) return;
                setReplaceBusy("upload");
                try { await onUploadReplaceImage(replaceIdx, file); setReplaceIdx(null); }
                finally { setReplaceBusy(null); e.target.value = ""; }
              }}
            />
          )}

          {/* Bulk-edit toolbar — visible when 1+ rows are selected via the
              checkbox on each row. Lets the operator set a duration / fx
              / replace photo on every selected slot in one click, instead
              of touching N rows one at a time. */}
          {selected.size > 0 && (
            <div className="rounded border border-amber-300/40 bg-amber-300/5 p-1.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-amber-300">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-gray-400 hover:text-white"
                >Clear</button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-16">Duration</span>
                <input
                  type="number" step="0.1" min="0.5" max="20"
                  value={bulkDur}
                  placeholder="sec"
                  onChange={(e) => setBulkDur(e.target.value)}
                  className="w-16 bg-black border border-border rounded px-1 py-0.5 text-white text-[10px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const d = parseFloat(bulkDur);
                    if (!d || d <= 0) return;
                    for (const idx of selected) onSetImageDuration && onSetImageDuration(idx, d);
                  }}
                  disabled={!bulkDur || !onSetImageDuration}
                  className="text-[10px] text-amber-300 hover:text-white disabled:opacity-40"
                >Apply</button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-16">Effect</span>
                <select
                  value={bulkFx}
                  onChange={(e) => setBulkFx(e.target.value)}
                  className="flex-1 bg-black border border-border rounded px-1 py-0.5 text-gray-200 text-[10px]"
                >
                  <option value="">—</option>
                  <option value="cut">Cut</option>
                  <option value="fade">Fade</option>
                  <option value="slide_left">Slide ←</option>
                  <option value="slide_right">Slide →</option>
                  <option value="zoom_in">Zoom-in</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!bulkFx) return;
                    for (const idx of selected) onSetImageEffect && onSetImageEffect(idx, bulkFx);
                  }}
                  disabled={!bulkFx || !onSetImageEffect}
                  className="text-[10px] text-amber-300 hover:text-white disabled:opacity-40"
                >Apply</button>
              </div>
            </div>
          )}

          {/* Image rows — compact vertical stack. Thumbnail + filename
              tail + start/duration on one row, controls on a second row. */}
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
            {(story.images || []).map((img, j) => {
              const imgDur = Math.max(0, (img.t_end || 0) - (img.t_start || 0));
              const poolEntry = pool.find((p) => p.filename === img.src);
              const tail = (img.src || "").slice(-18);
              const isReplacing = replaceIdx === j;
              const isFraming = framingIdx === j;
              const isSelected = selected.has(j);
              const isActiveRow = isActiveImageRow && isActiveImageRow(j);
              return (
                <div
                  key={j}
                  className={`rounded border p-1.5 text-[10px] cursor-pointer transition-colors ${
                    isActiveRow ? "border-accent2 bg-accent2/5" :
                    isSelected ? "border-amber-300/60 bg-amber-300/5" :
                    "border-border/60 bg-black/30 hover:border-border"
                  }`}
                  onClick={() => onMarkActive && onMarkActive(j)}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Selection checkbox — drives the bulk-edit toolbar. */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(j); else next.delete(j);
                          return next;
                        });
                      }}
                      className="flex-shrink-0 accent-amber-300"
                      title="Select for bulk edit"
                    />
                    {/* Thumbnail = replace affordance. Clicking it opens a
                        mini pool picker that swaps src in place, leaving
                        t_start / t_end / effect untouched so the user
                        doesn't have to redistribute the timeline after a
                        swap. */}
                    <button
                      type="button"
                      onClick={() => onReplaceImageSrc && setReplaceIdx(isReplacing ? null : j)}
                      disabled={!onReplaceImageSrc}
                      className="flex-shrink-0 relative group"
                      title={onReplaceImageSrc ? "Click to replace this image" : ""}
                    >
                      {poolEntry
                        ? <img src={withAuth(poolEntry.url)} alt="" className={`w-10 h-10 object-cover rounded border ${isReplacing ? "border-amber-300" : "border-border"}`} loading="lazy" />
                        : <div className="w-10 h-10 rounded border border-red-500/40 bg-red-500/5 text-[8px] text-red-300 flex items-center justify-center">missing</div>}
                      {onReplaceImageSrc && (
                        <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          <span className="text-[9px] text-white opacity-0 group-hover:opacity-100">replace</span>
                        </div>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-300 truncate" title={img.src}>…{tail}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-500">@</span>
                        <input
                          type="number" step="0.1" min="0" max={duration}
                          value={(img.t_start || 0).toFixed(1)}
                          onChange={(e) => onSetImageStart(j, parseFloat(e.target.value) || 0)}
                          className="w-12 bg-black border border-border rounded px-1 py-0.5 text-white text-[10px]"
                        />
                        <span className="text-[9px] text-accent2">{imgDur.toFixed(1)}s</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => onMoveImage(j, -1)} disabled={j === 0}
                              className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30"
                              title="Up"><ArrowUp size={10} /></button>
                      <button onClick={() => onMoveImage(j, 1)} disabled={j === story.images.length - 1}
                              className="p-0.5 text-gray-500 hover:text-white disabled:opacity-30"
                              title="Down"><ArrowDown size={10} /></button>
                      {(onSetImageFit || onSetImageOffset) && (
                        <button onClick={() => setFramingIdx(isFraming ? null : j)}
                                className={`p-0.5 ${isFraming ? "text-amber-300" : "text-gray-500 hover:text-white"}`}
                                title="Frame the image inside the picture panel">⊞</button>
                      )}
                      <button onClick={() => onRemoveImage(j)}
                              className="p-0.5 text-gray-500 hover:text-red-400"
                              title="Remove"><Trash2 size={11} /></button>
                    </div>
                  </div>
                  <input
                    type="range" min="0.5" max="10" step="0.1"
                    value={imgDur.toFixed(1)}
                    onChange={(e) => onSetImageDuration(j, parseFloat(e.target.value))}
                    className="w-full mt-1"
                    title="Display duration"
                  />
                  {/* Transition row — drives the in/out animation rendered
                      by canvas_engine. Defaults to fade so the user sees
                      a smooth crossfade without configuring anything. */}
                  {(onSetImageEffect || onSetImageEffectDuration) && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] text-gray-500">FX</span>
                      <select
                        value={img.effect || "fade"}
                        onChange={(e) => onSetImageEffect && onSetImageEffect(j, e.target.value)}
                        disabled={!onSetImageEffect}
                        className="flex-1 bg-black border border-border rounded px-1 py-0.5 text-gray-200 text-[10px]"
                        title="Transition effect when this image enters / leaves"
                      >
                        <option value="cut">Cut</option>
                        <option value="fade">Fade</option>
                        <option value="slide_left">Slide ←</option>
                        <option value="slide_right">Slide →</option>
                        <option value="zoom_in">Zoom-in</option>
                      </select>
                      <input
                        type="number" step="0.05" min="0" max="2"
                        value={(img.effect_duration ?? 0.4).toFixed(2)}
                        onChange={(e) => onSetImageEffectDuration && onSetImageEffectDuration(j, parseFloat(e.target.value) || 0)}
                        disabled={!onSetImageEffectDuration || (img.effect || "fade") === "cut"}
                        className="w-12 bg-black border border-border rounded px-1 py-0.5 text-white text-[10px] disabled:opacity-40"
                        title="Transition duration (seconds)"
                      />
                      <span className="text-[9px] text-gray-500">s</span>
                    </div>
                  )}
                  {/* Replace picker — opens when the user clicks the
                      thumbnail. Pool grid + AI/Auto buttons that all
                      swap the current src in place without disturbing
                      t_start / t_end / effect / effect_duration. */}
                  {isReplacing && (
                    <div className="mt-1.5 p-1.5 rounded border border-amber-300/30 bg-amber-300/5">
                      <div className="flex items-center justify-between mb-1 gap-1">
                        <span className="text-[10px] text-amber-300">Replace slot {j + 1} — timing kept</span>
                        <div className="flex items-center gap-1.5">
                          {onAutoFetchReplaceImage && (
                            <button
                              type="button"
                              onClick={async () => {
                                setReplaceBusy("auto");
                                try { await onAutoFetchReplaceImage(j); setReplaceIdx(null); }
                                finally { setReplaceBusy(null); }
                              }}
                              disabled={replaceBusy != null}
                              className="text-accent2 hover:text-white text-[10px] flex items-center gap-1 disabled:opacity-40"
                              title="Fetch a fresh web image and swap into this slot"
                            >
                              {replaceBusy === "auto" ? (<><Loader2 size={9} className="animate-spin" /> fetch</>) : (<><ImagePlus size={9} /> Auto</>)}
                            </button>
                          )}
                          {onAiReplaceImage && (
                            <button
                              type="button"
                              onClick={async () => {
                                setReplaceBusy("ai");
                                try { await onAiReplaceImage(j); setReplaceIdx(null); }
                                finally { setReplaceBusy(null); }
                              }}
                              disabled={replaceBusy != null}
                              className="text-pink-400 hover:text-white text-[10px] flex items-center gap-1 disabled:opacity-40"
                              title="Generate a fresh AI image and swap into this slot"
                            >
                              {replaceBusy === "ai" ? (<><Loader2 size={9} className="animate-spin" /> AI…</>) : "✦ AI"}
                            </button>
                          )}
                          {onUploadReplaceImage && (
                            <button
                              type="button"
                              onClick={() => replaceFileRef.current?.click()}
                              disabled={replaceBusy != null}
                              className="text-emerald-300 hover:text-white text-[10px] flex items-center gap-1 disabled:opacity-40"
                              title="Upload a file from your computer and swap into this slot"
                            >
                              {replaceBusy === "upload" ? (<><Loader2 size={9} className="animate-spin" /> up…</>) : (<><Upload size={9} /> Upload</>)}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setReplaceIdx(null)}
                            className="text-gray-500 hover:text-white text-[10px]"
                            title="Cancel"
                          >×</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {pool.map((p) => (
                          <button
                            key={p.filename}
                            type="button"
                            onClick={() => {
                              onReplaceImageSrc(j, p.filename);
                              setReplaceIdx(null);
                            }}
                            className={`border rounded overflow-hidden aspect-square hover:border-amber-300 ${p.filename === img.src ? "border-amber-300" : "border-border"}`}
                            title={p.filename}
                          >
                            <img src={withAuth(p.url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                        {pool.length === 0 && (
                          <div className="col-span-full text-[10px] text-gray-500 italic">Pool is empty.</div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Framing popover — fit (cover/contain) + 9-point focal
                      grid. The renderer reads `fit`, `offset_x_pct` and
                      `offset_y_pct` to decide how the source image sits
                      inside the picture panel. */}
                  {isFraming && (onSetImageFit || onSetImageOffset) && (() => {
                    const fx = img.offset_x_pct ?? 50;
                    const fy = img.offset_y_pct ?? 50;
                    const cells = [
                      { x: 0,   y: 0,   l: "↖" }, { x: 50,  y: 0,   l: "↑" }, { x: 100, y: 0,   l: "↗" },
                      { x: 0,   y: 50,  l: "←" }, { x: 50,  y: 50,  l: "·" }, { x: 100, y: 50,  l: "→" },
                      { x: 0,   y: 100, l: "↙" }, { x: 50,  y: 100, l: "↓" }, { x: 100, y: 100, l: "↘" },
                    ];
                    return (
                      <div className="mt-1.5 p-1.5 rounded border border-amber-300/30 bg-amber-300/5">
                        <div className="flex items-center justify-between mb-1 gap-1">
                          <span className="text-[10px] text-amber-300">Frame slot {j + 1}</span>
                          <button
                            type="button"
                            onClick={() => setFramingIdx(null)}
                            className="text-gray-500 hover:text-white text-[10px]"
                            title="Close"
                          >×</button>
                        </div>
                        {onSetImageFit && (
                          <div className="flex items-center gap-1 mb-1.5">
                            <span className="text-[9px] text-gray-500 w-8">Fit</span>
                            <select
                              value={img.fit || "cover"}
                              onChange={(e) => onSetImageFit(j, e.target.value)}
                              className="flex-1 bg-black border border-border rounded px-1 py-0.5 text-gray-200 text-[10px]"
                            >
                              <option value="cover">Cover — fill & crop excess</option>
                              <option value="contain">Contain — fit & letterbox</option>
                            </select>
                          </div>
                        )}
                        {onSetImageOffset && (img.fit || "cover") === "cover" && (
                          <div>
                            <div className="text-[9px] text-gray-500 mb-1">Focal point — which part of the source stays visible after the crop:</div>
                            <div className="grid grid-cols-3 gap-1 max-w-[120px]">
                              {cells.map((c) => {
                                const active = Math.abs(fx - c.x) < 1 && Math.abs(fy - c.y) < 1;
                                return (
                                  <button
                                    key={`${c.x}_${c.y}`}
                                    type="button"
                                    onClick={() => onSetImageOffset(j, c.x, c.y)}
                                    className={`aspect-square text-[10px] rounded border ${active ? "bg-amber-300 text-black border-amber-300" : "bg-black border-border text-gray-400 hover:border-amber-300"}`}
                                    title={`${c.x}% / ${c.y}%`}
                                  >{c.l}</button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            {imageCount === 0 && (
              <div className="text-[10px] text-gray-500 italic p-2 border border-dashed border-border rounded text-center">
                No images. Use Auto-fetch or pick from Pool.
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}


/* ─── Right-column pool grid ───────────────────────────────────── */
function PoolPanel({ pool, onUpload, onDelete, jobId }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    await onUpload(f, f.name.replace(/\.[^.]+$/, ""));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <aside className="card p-3 sticky top-4 self-start">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-100">Image pool</h3>
        <span className="text-[10px] text-gray-500">{pool.length}</span>
      </div>
      <label className="block mb-2 cursor-pointer">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
        <div className="text-[11px] flex items-center gap-1.5 justify-center py-1.5 rounded border border-dashed border-border bg-black/40 text-gray-400 hover:text-white hover:border-gray-500">
          {uploading
            ? <><Loader2 size={11} className="animate-spin" /> uploading…</>
            : <><ImagePlus size={11} /> Upload image</>}
        </div>
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        {pool.map((p) => (
          <div key={p.filename} className="relative group">
            <img src={withAuth(p.url)} alt={p.filename} title={p.filename} className="w-full h-16 object-cover rounded border border-border" />
            <button
              onClick={() => onDelete(p.filename)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400"
              title="Delete from pool"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {pool.length === 0 && (
          <div className="col-span-full text-[10px] text-gray-500 italic text-center py-3">
            No pool images yet. Upload above.
          </div>
        )}
      </div>
    </aside>
  );
}


/* ─── Per-text-block editor ────────────────────────────────────── */
/* Exposes text + foreground/background color + position + font size
   for one text overlay. Null/empty values fall back to the kind's
   defaults baked into the backend's canvas_engine. */
function TextBlockEditor({ block, onPatch }) {
  const [expanded, setExpanded] = useState(false);
  const kindLabel = {
    lower_third: "Red strap (headline)",
    ticker:      "Yellow ticker",
    headline:    "Top headline",
    watermark:   "Watermark",
    custom:      "Custom",
  }[block.kind] || block.kind;

  return (
    <div className="border border-border/70 rounded bg-black/20 p-2">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-gray-400 uppercase text-[9px] tracking-wider w-32 flex-shrink-0">
          {kindLabel}
        </span>
        <input
          type="text"
          value={block.text || ""}
          onChange={(e) => onPatch((b) => { b.text = e.target.value; })}
          className="flex-1 bg-black border border-border rounded px-2 py-1 text-white"
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-gray-500 hover:text-white"
          title="Style controls"
        >
          {expanded ? "less" : "style"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          {/* Foreground color */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">Text color</span>
            <input
              type="color"
              value={(block.fg_color || "#FFFFFF").slice(0, 7)}
              onChange={(e) => onPatch((b) => { b.fg_color = e.target.value.toUpperCase(); })}
              className="w-full h-7 bg-black border border-border rounded cursor-pointer"
            />
          </label>
          {/* Background color */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">Background</span>
            <div className="flex gap-1">
              <input
                type="color"
                value={(block.bg_color || "#000000").slice(0, 7)}
                onChange={(e) => onPatch((b) => { b.bg_color = e.target.value.toUpperCase(); })}
                className="flex-1 h-7 bg-black border border-border rounded cursor-pointer"
                disabled={block.bg_color == null}
              />
              <button
                onClick={() => onPatch((b) => { b.bg_color = b.bg_color == null ? "#000000" : null; })}
                className={`text-[9px] px-1.5 rounded border ${block.bg_color == null
                  ? "border-border bg-black/40 text-gray-500"
                  : "border-accent2/40 bg-accent2/10 text-accent2"}`}
                title={block.bg_color == null ? "Currently transparent — click to enable a fill" : "Click to make transparent"}
              >
                {block.bg_color == null ? "off" : "on"}
              </button>
            </div>
          </label>
          {/* Font size */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">Font size %</span>
            <input
              type="number" step="0.1" min="0.5" max="20"
              value={block.font_size_pct == null ? "" : block.font_size_pct}
              onChange={(e) => {
                const v = e.target.value;
                onPatch((b) => { b.font_size_pct = v === "" ? null : parseFloat(v); });
              }}
              placeholder="auto"
              className="w-full h-7 bg-black border border-border rounded px-1.5 text-white"
            />
          </label>
          {/* Visible time */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">t_start / t_end</span>
            <div className="flex gap-1 text-[10px]">
              <input
                type="number" step="0.1" min="0"
                value={(block.t_start || 0).toFixed(1)}
                onChange={(e) => onPatch((b) => { b.t_start = parseFloat(e.target.value) || 0; })}
                className="w-1/2 h-7 bg-black border border-border rounded px-1 text-white"
              />
              <input
                type="text"
                value={block.t_end == null ? "auto" : (block.t_end).toFixed(1)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onPatch((b) => {
                    b.t_end = (v === "" || v === "auto") ? null : (parseFloat(v) || null);
                  });
                }}
                className="w-1/2 h-7 bg-black border border-border rounded px-1 text-white"
              />
            </div>
          </label>
          {/* Position: x */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">x %</span>
            <input
              type="number" step="0.5" min="0" max="100"
              value={block.x_pct == null ? "" : block.x_pct}
              onChange={(e) => {
                const v = e.target.value;
                onPatch((b) => { b.x_pct = v === "" ? null : parseFloat(v); });
              }}
              placeholder="auto"
              className="w-full h-7 bg-black border border-border rounded px-1.5 text-white"
            />
          </label>
          {/* Position: y */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">y %</span>
            <input
              type="number" step="0.5" min="0" max="100"
              value={block.y_pct == null ? "" : block.y_pct}
              onChange={(e) => {
                const v = e.target.value;
                onPatch((b) => { b.y_pct = v === "" ? null : parseFloat(v); });
              }}
              placeholder="auto"
              className="w-full h-7 bg-black border border-border rounded px-1.5 text-white"
            />
          </label>
          {/* Width */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">w %</span>
            <input
              type="number" step="0.5" min="0" max="100"
              value={block.w_pct == null ? "" : block.w_pct}
              onChange={(e) => {
                const v = e.target.value;
                onPatch((b) => { b.w_pct = v === "" ? null : parseFloat(v); });
              }}
              placeholder="auto"
              className="w-full h-7 bg-black border border-border rounded px-1.5 text-white"
            />
          </label>
          {/* Reset to defaults */}
          <label className="flex flex-col">
            <span className="text-gray-500 mb-0.5">&nbsp;</span>
            <button
              onClick={() => onPatch((b) => {
                b.fg_color = null; b.bg_color = null;
                b.font_size_pct = null;
                b.x_pct = null; b.y_pct = null; b.w_pct = null;
              })}
              className="h-7 text-[10px] rounded border border-border bg-black/40 text-gray-400 hover:text-white"
              title="Restore the kind's built-in defaults"
            >
              Reset style
            </button>
          </label>
        </div>
      )}
    </div>
  );
}


/* ─── Canvas-layout panel ─────────────────────────────────────── */
/* Lets the operator change where the video and image regions sit on
   the canvas. Drag the numbers; the next re-render reflects them. */
function LayoutPanel({ layout, onSet }) {
  const [expanded, setExpanded] = useState(false);

  function num(field, label, min = 0, max = 100, step = 0.5) {
    return (
      <label className="flex flex-col">
        <span className="text-gray-500 mb-0.5">{label}</span>
        <input
          type="number" step={step} min={min} max={max}
          value={layout[field] ?? 0}
          onChange={(e) => onSet((l) => { l[field] = parseFloat(e.target.value) || 0; })}
          className="w-full h-7 bg-black border border-border rounded px-1.5 text-white text-[11px]"
        />
      </label>
    );
  }

  return (
    <div className="mt-3 card p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[11px] text-gray-300 hover:text-white"
      >
        <span className="font-semibold">Canvas layout</span>
        <span className="text-gray-500">
          {layout.width}x{layout.height} · video {layout.video_w_pct.toFixed(0)}x{layout.video_h_pct.toFixed(0)}% · {expanded ? "hide" : "show"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Background color */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[10px]">
            <label className="flex flex-col col-span-2">
              <span className="text-gray-500 mb-0.5">Canvas bg color</span>
              <input
                type="color"
                value={(layout.bg_color || "#000000").slice(0, 7)}
                onChange={(e) => onSet((l) => { l.bg_color = e.target.value.toUpperCase(); })}
                className="w-full h-7 bg-black border border-border rounded cursor-pointer"
              />
            </label>
            {num("width",  "Canvas W (px)", 480,  3840, 1)}
            {num("height", "Canvas H (px)", 480,  3840, 1)}
          </div>

          {/* Video region */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Video region (talking head)</div>
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              {num("video_x_pct", "x %")}
              {num("video_y_pct", "y %")}
              {num("video_w_pct", "w %")}
              {num("video_h_pct", "h %")}
            </div>
          </div>

          {/* Picture region */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Picture region (carousel)</div>
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              {num("picture_x_pct", "x %")}
              {num("picture_y_pct", "y %")}
              {num("picture_w_pct", "w %")}
              {num("picture_h_pct", "h %")}
            </div>
          </div>

          {/* Brand logo */}
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Brand logo</div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              {num("brand_logo_x_pct", "x %")}
              {num("brand_logo_y_pct", "y %")}
              {num("brand_logo_w_pct", "w %")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── Background-video panel ───────────────────────────────────── */
/* Picker for the looping bg video that replaces the flat black canvas
   bg in the final render. Lists bundled samples + the user's previous
   uploads, plus an "upload from computer" button that saves to the
   user's assets so it persists across sessions. Volume slider is mixed
   against the trimmed video audio by the renderer (muted = 0). */
function BgVideoPanel({ layout, onSet }) {
  const [expanded, setExpanded] = useState(false);
  const [samples, setSamples]   = useState([]);
  const [userVids, setUserVids] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr]           = useState("");
  const fileRef = useRef(null);

  const refresh = async () => {
    try {
      const [s, u] = await Promise.all([
        api.v4ListBgSamples().catch(() => []),
        api.v4ListUserBgVideos().catch(() => []),
      ]);
      setSamples(Array.isArray(s) ? s : []);
      setUserVids(Array.isArray(u) ? u : []);
    } catch (e) { setErr(e?.message || "failed to load bg videos"); }
  };

  useEffect(() => {
    if (expanded) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const current  = layout?.bg_video_path || "";
  const volume   = typeof layout?.bg_video_volume === "number" ? layout.bg_video_volume : 0.0;
  const introSec = typeof layout?.bg_intro_seconds === "number" ? layout.bg_intro_seconds : 0.0;
  const setRef   = (ref) => onSet((l) => { l.bg_video_path = ref || null; });
  const setVol   = (v)   => onSet((l) => { l.bg_video_volume = Math.max(0, Math.min(1, v)); });
  const setIntro = (s)   => onSet((l) => { l.bg_intro_seconds = Math.max(0, Math.min(30, s)); });
  // Derive the current "mode" from the canonical fields. Three states:
  //   - "none"     : no bg path set
  //   - "intro_bg" : bg path set AND intro seconds > 0
  //   - "bg"       : bg path set, intro = 0 (pure background from t=0)
  const mode = (!current) ? "none" : (introSec > 0 ? "intro_bg" : "bg");
  const applyMode = (next) => {
    if (next === "none") { setRef(""); setIntro(0); }
    if (next === "bg") { setIntro(0); }
    if (next === "intro_bg" && introSec <= 0) setIntro(8);
  };

  // Resolve the currently-selected ref to a playable URL for the
  // <video> preview inside the panel.
  const previewSrc = (() => {
    if (!current) return "";
    if (current.startsWith("sample:")) {
      const name = current.slice("sample:".length);
      const hit = samples.find((s) => s.filename === name);
      return hit ? withAuth(hit.url) : "";
    }
    if (current.startsWith("asset:")) {
      const id = parseInt(current.slice("asset:".length), 10);
      const hit = userVids.find((a) => a.id === id);
      return hit?.url || "";
    }
    return "";
  })();

  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const r = await api.v4UploadBgVideo(file);
      // The new asset becomes the active bg immediately.
      setRef(`asset:${r.id}`);
      await refresh();
    } catch (e) { setErr(e?.message || "upload failed"); }
    finally { setUploading(false); }
  };

  const remove = async (assetId) => {
    if (!window.confirm("Delete this background video from your assets?")) return;
    try {
      await api.v4DeleteUserAsset(assetId);
      if (current === `asset:${assetId}`) setRef("");
      await refresh();
    } catch (e) { setErr(e?.message || "delete failed"); }
  };

  return (
    <div className="mt-3 card p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-[11px] text-gray-300 hover:text-white"
      >
        <span className="font-semibold">Background video</span>
        <span className="text-gray-500 truncate ml-2">
          {current ? (current.startsWith("sample:") ? current.slice(7) : `asset #${current.slice(6)}`) : "none — flat colour"} · {expanded ? "hide" : "show"}
        </span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 text-[11px]">
          {err && <div className="text-red-400 text-[10px]">{err}</div>}

          {/* Mode selector — the three explicit choices the operator
              asked for. Switching to "none" clears the path AND intro
              duration so the canonical state stays consistent. */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { key: "none",     label: "No bg",         hint: "Flat colour" },
              { key: "bg",       label: "Bg from start", hint: "Loop behind from t=0" },
              { key: "intro_bg", label: "Intro then bg", hint: "Cold-open reel" },
            ].map((m) => {
              const sel = mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => applyMode(m.key)}
                  className={`p-1.5 rounded border text-left transition-colors
                    ${sel ? "border-accent2 bg-accent2/10 text-white" : "border-border text-gray-300 hover:border-accent2"}`}
                >
                  <div className="text-[10px] font-semibold">{m.label}</div>
                  <div className="text-[9px] text-gray-500 leading-tight">{m.hint}</div>
                </button>
              );
            })}
          </div>

          {/* When mode === "none" the rest of the panel is irrelevant. */}
          {mode === "none" && (
            <div className="text-[10px] text-gray-500 italic">
              No background video. Canvas renders with the flat bg colour ({layout?.bg_color || "#000"}).
            </div>
          )}

          {/* Bundled samples */}
          {(mode === "bg" || mode === "intro_bg") && samples.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Demo backgrounds ({samples.length})</div>
              <div className="grid grid-cols-2 gap-1.5">
                {samples.map((s) => (
                  <button
                    key={s.filename}
                    type="button"
                    onClick={() => setRef(s.ref)}
                    className={`text-left border rounded overflow-hidden ${current === s.ref ? "border-accent2 ring-1 ring-accent2/40" : "border-border hover:border-accent2"}`}
                    title={s.filename}
                  >
                    <video
                      src={withAuth(s.url)}
                      muted autoPlay loop playsInline preload="metadata"
                      className="w-full aspect-video object-cover bg-black"
                    />
                    <div className="px-1.5 py-1 text-[10px] text-gray-300 truncate">{s.filename}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User uploads — previously used videos. Hidden in "none" mode. */}
          {(mode === "bg" || mode === "intro_bg") && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Your uploads ({userVids.length})</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-accent2 hover:text-white normal-case text-[10px] flex items-center gap-1 disabled:opacity-40"
              >
                {uploading ? (<><Loader2 size={9} className="animate-spin" /> uploading…</>) : (<><Upload size={9} /> Upload</>)}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
              />
            </div>
            {userVids.length === 0 ? (
              <div className="text-[10px] text-gray-500 italic">No saved bg videos yet — upload one to reuse it on future bulletins.</div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {userVids.map((a) => (
                  <div key={a.id} className={`relative group border rounded overflow-hidden ${current === `asset:${a.id}` ? "border-accent2 ring-1 ring-accent2/40" : "border-border"}`}>
                    <button
                      type="button"
                      onClick={() => setRef(`asset:${a.id}`)}
                      className="block w-full"
                      title={a.filename}
                    >
                      <video
                        src={withAuth(a.url)}
                        muted autoPlay loop playsInline preload="metadata"
                        className="w-full aspect-video object-cover bg-black"
                      />
                      <div className="px-1.5 py-1 text-[10px] text-gray-300 truncate">{a.filename}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100"
                      title="Delete this bg video"
                    ><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Audio volume — only when a bg mode is active. */}
          {(mode === "bg" || mode === "intro_bg") && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Background audio volume</span>
              <span className="text-gray-400">{Math.round((volume || 0) * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05"
              value={volume}
              onChange={(e) => setVol(parseFloat(e.target.value))}
              className="w-full"
              disabled={!current}
              title={current ? "Volume of the bg track mixed against the trimmed video's audio" : "Pick a bg video first"}
            />
            <div className="text-[10px] text-gray-500 mt-0.5">
              0 = silent (default — matches a studio-set look) · 1 = full mix with the talking-head audio
            </div>
          </div>
          )}

          {/* Intro reel duration — ONLY in intro_bg mode. */}
          {mode === "intro_bg" && (
          <div className="p-2 rounded border border-amber-300/40 bg-amber-300/5">
            <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center justify-between text-amber-200">
              <span>Intro reel duration</span>
              <span>{introSec.toFixed(1)}s</span>
            </div>
            <input
              type="range" min="2" max="20" step="0.5"
              value={introSec}
              onChange={(e) => setIntro(parseFloat(e.target.value) || 0)}
              className="w-full"
              disabled={!current}
              title={current ? "How long the bg plays full-screen at full volume before the bulletin starts" : "Pick a bg video first"}
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              Seconds the bg plays full-screen with full audio before the bulletin layout fades in.
            </div>
          </div>
          )}

          {/* Inline preview of the selected bg */}
          {previewSrc && (mode === "bg" || mode === "intro_bg") && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Selected preview</div>
              <video
                src={previewSrc}
                muted autoPlay loop playsInline controls
                className="w-full aspect-video rounded border border-border bg-black"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Per-short editor card (V1 template parity) ─────────────────────
// One tile per short = preview video on top, collapsible edit panel
// underneath. The panel mirrors V1's Editor.jsx controls so the
// operator can flip layouts, swap fonts/colours, pick an image, and
// tune torn-card / follow-bar params before triggering a re-render.
function ShortCard({ jobId, index, canvasShort, url, pool, renderBusy, onRender, onConfig, onSeo, onAutoFetchImage, onSeoRegenerated, clipId, onPublish }) {
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const seo = canvasShort?.seo || {};
  const cfg = canvasShort?.short_config || {};
  const layout = (cfg.layout || "torn_card").toLowerCase();

  // Defaults applied at render time so the controls show V1 defaults
  // even when canvas.json was written before the short_config field
  // existed (graceful upgrade).
  const text       = cfg.text ?? "";
  const fontFile   = cfg.font_file ?? "NotoSansTelugu-Bold.ttf";
  const fontSize   = cfg.font_size ?? "";
  const textColor  = cfg.text_color ?? "#FFFFFF";
  const imageFn    = cfg.image_filename ?? "";
  const sec        = cfg.section_pct ?? { video: 0.4619, text: 0.1691, image: 0.3690 };
  const cs         = cfg.card_style  ?? {};
  const fp         = cfg.follow_params ?? {};

  return (
    <div className="border border-border rounded p-2 bg-black/40">
      {/* Title row */}
      <div className="flex items-center justify-between text-[11px] text-gray-300 mb-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 hover:text-white"
          title="Toggle V1 template controls"
        >
          {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
          Short {String(index + 1).padStart(2, "0")} · {layout}
        </button>
        <div className="flex items-center gap-2">
          {url && (
            <a href={url} download className="text-accent2 hover:text-white">Download</a>
          )}
          <button
            onClick={onRender}
            disabled={renderBusy}
            className="text-accent2 hover:text-white disabled:opacity-40"
            title="Re-render this short"
          >
            Re-render
          </button>
          {clipId && url && (
            <button
              onClick={onPublish}
              className="text-accent2 hover:text-white"
              title="Publish to YouTube"
            >
              Publish
            </button>
          )}
        </div>
      </div>
      {/* Per-channel upload status pills */}
      <UploadStatusPill clipId={clipId} />

      {/* Live preview + rendered video side-by-side when both exist.
          Otherwise show whichever we have. The preview reflects current
          edits BEFORE re-render — visual approximation, not the final. */}
      <div className="grid grid-cols-2 gap-2">
        <ShortLivePreview
          layout={layout}
          text={text || ""}
          fontFile={fontFile}
          textColor={textColor}
          imagePool={pool}
          imageFilename={imageFn}
          followParams={fp}
          sectionPct={sec}
        />
        {url ? (
          <video
            key={url}
            src={url}
            controls
            preload="metadata"
            className="w-full aspect-[9/16] rounded bg-black"
          />
        ) : (
          <div className="w-full aspect-[9/16] rounded bg-black/60 border border-dashed border-border
                          flex items-center justify-center text-[11px] text-gray-500 italic">
            not rendered yet
          </div>
        )}
      </div>
      <div className="text-[10px] text-gray-500 mt-1 flex justify-between">
        <span>live preview (mock)</span>
        <span>{url ? "rendered output" : ""}</span>
      </div>

      {/* V1 controls — collapsed by default */}
      {open && (
        <div className="mt-2 pt-2 border-t border-border space-y-2 text-[11px]">
          {/* Layout switcher (always visible) */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 flex-shrink-0">Layout</span>
            <select
              value={layout}
              onChange={(e) => onConfig((c) => { c.layout = e.target.value; })}
              className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
            >
              {V4_SHORT_LAYOUTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Headline text (all layouts) */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 flex-shrink-0">Headline</span>
            <textarea
              value={text}
              placeholder="(uses story title)"
              rows={2}
              onChange={(e) => onConfig((c) => { c.text = e.target.value || null; })}
              className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200 resize-none"
            />
          </div>

          {/* Font / size / colour */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-gray-500 mb-0.5">Font</div>
              <select
                value={fontFile}
                onChange={(e) => onConfig((c) => { c.font_file = e.target.value; })}
                className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
              >
                {V4_SHORT_FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Text colour</div>
              <input
                type="color"
                value={textColor}
                onChange={(e) => onConfig((c) => { c.text_color = e.target.value; })}
                className="w-full h-7 bg-black/60 border border-border rounded"
              />
            </div>
            <div>
              <div className="text-gray-500 mb-0.5">Font size (px)</div>
              <input
                type="number"
                min={20} max={200}
                value={fontSize}
                placeholder="auto"
                onChange={(e) => {
                  const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                  onConfig((c) => { c.font_size = isNaN(v) ? null : v; });
                }}
                className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
              />
            </div>
            <div>
              <div className="text-gray-500 mb-0.5 flex items-center justify-between gap-2">
                <span>Image</span>
                {onAutoFetchImage && (
                  <button
                    type="button"
                    disabled={fetching}
                    onClick={async () => {
                      setFetching(true);
                      try { await onAutoFetchImage(); }
                      finally { setFetching(false); }
                    }}
                    className="text-[10px] text-accent2 hover:text-white disabled:opacity-40 flex items-center gap-1"
                    title="Fetch an authentic news image for this story (Google CSE -> DDG -> Pexels -> OpenAI). User uploads still take precedence."
                  >
                    {fetching ? (
                      <>
                        <Loader2 size={10} className="animate-spin" /> fetching…
                      </>
                    ) : "Auto-fetch"}
                  </button>
                )}
              </div>
              <select
                value={imageFn}
                onChange={(e) => onConfig((c) => { c.image_filename = e.target.value || null; })}
                className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
              >
                <option value="">(round-robin)</option>
                {pool.map((p) => (
                  <option key={p.filename} value={p.filename}>{p.filename}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section %s — torn_card only */}
          {layout === "torn_card" && (
            <div>
              <div className="text-gray-500 mb-1">Section heights (sum ≈ 1.0)</div>
              <div className="grid grid-cols-3 gap-2">
                {["video", "text", "image"].map((k) => (
                  <label key={k} className="text-gray-400">
                    <div className="text-[10px]">{k}: {(sec[k] || 0).toFixed(3)}</div>
                    <input
                      type="range" min={0.10} max={0.70} step={0.01}
                      value={sec[k] || 0}
                      onChange={(e) => onConfig((c) => {
                        c.section_pct = { ...sec, [k]: parseFloat(e.target.value) };
                      })}
                      className="w-full"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Torn-card style sliders */}
          {layout === "torn_card" && (
            <details className="text-gray-300">
              <summary className="cursor-pointer text-gray-500 select-none">
                Card style (9 knobs)
              </summary>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  ["seed", 0, 99],   ["edge", 2, 40],  ["jag", 10, 100],
                  ["overlap", 5, 80],["vsid", 0, 80],  ["vcor", 0, 100],
                  ["vwid", 20, 300], ["bgr0", 120, 255], ["bgr1", 60, 200],
                ].map(([k, min, max]) => (
                  <label key={k} className="text-gray-400">
                    <div className="text-[10px]">{k}: {cs[k] ?? "?"}</div>
                    <input
                      type="range" min={min} max={max} step={1}
                      value={cs[k] ?? min}
                      onChange={(e) => onConfig((c) => {
                        c.card_style = { ...cs, [k]: parseInt(e.target.value, 10) };
                      })}
                      className="w-full"
                    />
                  </label>
                ))}
              </div>
            </details>
          )}

          {/* YouTube SEO (always visible — that's how the user wants it) */}
          <SeoPanel
            seo={seo}
            onSeo={onSeo}
            target="short"
            index={index}
            jobId={jobId}
            onRegenerated={onSeoRegenerated}
          />

          {/* Follow-bar controls */}
          {layout === "follow_bar" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-20 flex-shrink-0">Follow</span>
                <input
                  type="text"
                  value={fp.follow_text ?? ""}
                  onChange={(e) => onConfig((c) => {
                    c.follow_params = { ...fp, follow_text: e.target.value };
                  })}
                  className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["bg_color",          "BG colour"],
                  ["text_color",        "Text colour"],
                  ["follow_text_color", "Follow colour"],
                ].map(([k, label]) => (
                  <div key={k}>
                    <div className="text-[10px] text-gray-500">{label}</div>
                    <input
                      type="color"
                      value={fp[k] ?? "#000000"}
                      onChange={(e) => onConfig((c) => {
                        c.follow_params = { ...fp, [k]: e.target.value };
                      })}
                      className="w-full h-7 bg-black/60 border border-border rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── AI thumbnail panel (Nano Banana via Gemini) ───────────────────
// Calls /api/v4/jobs/{id}/thumbnail/generate which:
//   1. asks Gemini to write a thumbnail prompt from the canvas SEO
//   2. hands that prompt to gemini-2.5-flash-image (Nano Banana)
//   3. saves the JPG and updates Clip.thumb_path
// User clicks Generate -> JPG preview appears here, automatically
// becomes the YouTube thumbnail when the clip is published.
function ThumbnailPanel({ jobId, target, index = 0 }) {
  const [busy, setBusy]     = useState(false);
  const [mode, setMode]     = useState("none");      // "first" | "tweak"
  const [url,  setUrl]      = useState("");
  const [tweak, setTweak]   = useState("");
  const [hasPrompt, setHasPrompt] = useState(false); // tweak path unlocked after first gen
  const [err, setErr]       = useState("");

  async function run(useTweak = false) {
    if (!jobId) return;
    setMode(useTweak ? "tweak" : "first");
    setBusy(true); setErr("");
    try {
      const body = { target, index };
      if (useTweak && tweak.trim()) body.tweak = tweak.trim();
      const r = await api.v4GenThumbnail(jobId, body);
      setUrl(r?.url || "");
      if (r?.prompt) setHasPrompt(true);
      if (useTweak) setTweak("");
    } catch (e) {
      setErr(e?.message || "thumbnail generation failed");
    } finally {
      setBusy(false); setMode("none");
    }
  }

  return (
    <details
      open
      className="rounded-lg border border-border bg-surface hover:border-border-hover
                 transition-colors overflow-hidden"
    >
      <summary className="cursor-pointer select-none flex items-center gap-2 px-3 py-2.5
                          border-b border-border bg-dark/60">
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-ink-100">AI Thumbnail</span>
        <span className="text-[10px] text-ink-300 font-mono">Nano Banana</span>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.preventDefault(); run(false); }}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md
                     border border-pink-500/40 bg-pink-500/10 text-pink-300
                     hover:bg-pink-500/20 hover:text-white text-[10px] font-medium
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/60
                     disabled:opacity-40 transition-colors"
          title="Gemini writes a fresh prompt from SEO, then renders a 16:9 JPG"
        >
          {busy && mode === "first"
            ? (<><Loader2 size={11} className="animate-spin" /> Generating…</>)
            : (<>✦ Generate</>)}
        </button>
      </summary>

      <div className="p-3 space-y-3">
        {/* Preview */}
        {url ? (
          <a href={url} target="_blank" rel="noopener"
             className="group block rounded-md overflow-hidden border border-border
                        hover:border-pink-500/60 transition-colors">
            <img
              src={url}
              alt="AI thumbnail"
              className="w-full aspect-video object-cover bg-black"
            />
          </a>
        ) : (
          <div className="w-full aspect-video rounded-md border border-dashed border-border-hover
                          flex items-center justify-center text-[11px] text-ink-300 italic
                          bg-dark/60">
            {busy
              ? "Asking Gemini for a prompt, then rendering…"
              : "No AI thumbnail yet — click ✦ Generate."}
          </div>
        )}

        {/* Iterative tweak — unlocks after the first successful generation
            so the cheaper "rewrite previous prompt" path runs instead of
            re-deriving from SEO context. Saves one Gemini text call per
            iteration. */}
        {hasPrompt && (
          <div className="rounded-md border border-border bg-dark/60 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <RefreshCw size={11} className="text-pink-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-ink-200 font-medium">
                Tweak it
              </span>
              <span className="text-[10px] text-ink-400 ml-auto">cheaper than ✦ Generate</span>
            </div>
            <textarea
              rows={2}
              value={tweak}
              onChange={(e) => setTweak(e.target.value)}
              placeholder="e.g. darker mood · swap handcuffs for money bags · shout text in yellow"
              className="w-full bg-dark border border-border rounded px-2 py-1.5
                         text-ink-50 text-[12px] placeholder:text-ink-400 resize-y
                         focus:outline-none focus:ring-2 focus:ring-pink-500/40 focus:border-pink-500/40
                         transition-shadow"
            />
            <button
              type="button"
              disabled={busy || !tweak.trim()}
              onClick={() => run(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md
                         border border-border-hover bg-white/5 text-ink-100
                         hover:bg-white/10 hover:text-white text-[11px] font-medium
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/60
                         disabled:opacity-40 transition-colors"
            >
              {busy && mode === "tweak"
                ? (<><Loader2 size={11} className="animate-spin" /> Applying tweak…</>)
                : (<>↻ Apply tweak</>)}
            </button>
          </div>
        )}

        {err && (
          <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded
                          px-2 py-1.5 leading-snug">
            {err}
          </div>
        )}

        <p className="text-[10px] text-ink-300 leading-relaxed">
          {hasPrompt
            ? "Tweak it to nudge the image without burning a full prompt rewrite."
            : "Gemini writes the prompt from this canvas's SEO. The JPG becomes the YouTube thumbnail at publish."}
        </p>
      </div>
    </details>
  );
}


// ─── Reusable SEO panel (shared by bulletin + each short) ──────────
// Four editable fields (title / description / hashtags / keywords)
// plus a Regenerate button that re-runs Gemini server-side. Edits
// flip `edited_by_user=true` so the next bulk regen leaves them alone.
function SeoPanel({ seo, onSeo, target, index, jobId, onRegenerated, clipId, channels }) {
  const [regenerating, setRegenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [styleSourceId, setStyleSourceId] = useState(0);

  // Poll the existing /api/clips/{id}/seo/status during generation —
  // gives the user a live readout of each Gemini stage instead of an
  // opaque spinner. Same flow the V2 editor's SEO panel uses.
  async function pollUntilDone(cid) {
    const deadline = Date.now() + 3 * 60 * 1000; // 3 min cap
    while (Date.now() < deadline) {
      try {
        const r = await api.seoStatus(cid);
        const s = (r?.status || "").trim();
        if (s) setProgress(s);
        if (s === "done" || s === "ready" || s.startsWith("error")) {
          return r;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 1500));
    }
    return null;
  }

  async function regenerate() {
    // Two paths:
    //   * If a Clip row exists (i.e. the canvas has been materialised),
    //     use the V2-grade generator with verifier + style learning
    //     via /api/clips/{id}/seo/generate.
    //   * Otherwise fall back to V4's lightweight one-shot regenerate.
    setProgress("");
    setRegenerating(true);
    try {
      if (clipId) {
        await api.seoGenerate(clipId, {
          include_news: true,
          include_trends: true,
          include_yt_benchmark: true,
          style_source_id: styleSourceId || null,
        });
        const final = await pollUntilDone(clipId);
        if (final?.seo && onRegenerated) onRegenerated(final.seo);
      } else if (jobId) {
        const r = await api.v4RegenSeo(jobId, {
          target,
          index: target === "short" ? (index ?? 0) : 0,
        });
        if (r?.seo && onRegenerated) onRegenerated(r.seo);
      }
    } catch (e) {
      setProgress(`error: ${e?.message || "regenerate failed"}`);
    } finally {
      setRegenerating(false);
      // Leave the last status visible briefly so the user sees the
      // final stage name ("done" / "scored: 96/100") then fade it out.
      setTimeout(() => setProgress(""), 4000);
    }
  }
  const titleLen = (seo.title || "").length;
  const descLen  = (seo.description || "").length;
  const score    = seo?.seo_score ?? seo?.metadata?.viral_score ?? null;
  return (
    <details className="text-gray-300" open>
      <summary className="cursor-pointer text-gray-500 select-none flex items-center gap-2">
        <span>YouTube SEO</span>
        {score != null && (
          <span className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-full border
            ${score >= 90 ? "bg-green-900/40 text-green-300 border-green-700/40"
            : score >= 75 ? "bg-yellow-900/30 text-yellow-300 border-yellow-700/40"
            :               "bg-red-900/30 text-red-300 border-red-700/40"}`}
            title="Independent verifier score"
          >
            {score}/100
          </span>
        )}
        {seo.edited_by_user && (
          <span className="text-[10px] uppercase tracking-wide text-amber-400/90">(edited)</span>
        )}
        {(jobId || clipId) && (
          <button
            type="button"
            disabled={regenerating}
            onClick={(e) => { e.preventDefault(); regenerate(); }}
            className="ml-auto text-[10px] text-accent2 hover:text-white disabled:opacity-40 flex items-center gap-1"
            title="Re-run Gemini for this canvas"
          >
            {regenerating ? (
              <><Loader2 size={10} className="animate-spin" /> regenerating…</>
            ) : (<><RefreshCw size={10} /> Regenerate</>)}
          </button>
        )}
      </summary>

      {/* Style source + live progress feed. Style source teaches Gemini
          a writing voice — title formula + description rhythm — from a
          competitor channel without leaking branding. Progress feed
          surfaces "research → news → trends → yt → drafting → scoring"
          so the user sees the multi-step work and the final score. */}
      {(clipId || regenerating || progress) && (
        <div className="mt-2 mb-2 p-2 rounded border border-border bg-black/40 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 flex-shrink-0">Style source</span>
            <select
              value={styleSourceId}
              onChange={(e) => setStyleSourceId(parseInt(e.target.value, 10) || 0)}
              disabled={regenerating}
              className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-[11px] text-gray-200 disabled:opacity-40"
              title="Optional: write in the voice of this channel (no branding leaks)"
            >
              <option value="0">(default — write in our own voice)</option>
              {(channels || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name || `Channel #${c.id}`}</option>
              ))}
            </select>
          </div>
          {styleSourceId > 0 && (
            <div className="text-[10px] text-gray-500 leading-snug pl-1">
              Voice-only: title rhythm + description style. Channel name, handle, URL and
              brand hashtags are stripped before publish — no strike risk.
            </div>
          )}
          {progress && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400">
              {regenerating && <Loader2 size={9} className="animate-spin text-accent2" />}
              <span className="truncate">{progress}</span>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2 mt-2">
        <label className="block">
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Title</span>
            <span className={titleLen > 95 ? "text-red-400" : titleLen < 50 ? "text-gray-600" : "text-gray-400"}>
              {titleLen}/95
            </span>
          </div>
          <input
            type="text"
            value={seo.title || ""}
            onChange={(e) => onSeo((s) => { s.title = e.target.value; })}
            placeholder="YouTube title (Gemini-generated)"
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          />
        </label>
        <label className="block">
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Description</span>
            <span className={descLen > 1800 ? "text-red-400" : descLen < 700 ? "text-gray-600" : "text-gray-400"}>
              {descLen}/1800
            </span>
          </div>
          <textarea
            rows={4}
            value={seo.description || ""}
            onChange={(e) => onSeo((s) => { s.description = e.target.value; })}
            placeholder="Description (hook first, plain text, 700-1800 chars)"
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200 resize-y"
          />
        </label>
        <label className="block">
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Hashtags (comma-separated)</span>
            <span className="text-gray-400">{(seo.hashtags || []).length}/12</span>
          </div>
          <input
            type="text"
            value={(seo.hashtags || []).join(", ")}
            onChange={(e) => onSeo((s) => {
              s.hashtags = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
            })}
            placeholder="#NewsTopic, #BreakingNews"
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          />
        </label>
        <label className="block">
          <div className="text-[10px] text-gray-500 flex justify-between">
            <span>Keywords / Tags (comma-separated)</span>
            <span className="text-gray-400">{(seo.keywords || []).length}/30</span>
          </div>
          <input
            type="text"
            value={(seo.keywords || []).join(", ")}
            onChange={(e) => onSeo((s) => {
              s.keywords = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
            })}
            placeholder="telugu news, breaking, …"
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          />
        </label>
      </div>
    </details>
  );
}


// ─── Left-nav item with a tiny video preview thumb ─────────────────
function NavItem({ active, onClick, label, sublabel, url, vertical }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 mb-1 rounded flex items-center gap-2
        border ${active ? "bg-accent2/15 border-accent2/50 text-white"
                        : "border-transparent text-gray-300 hover:bg-black/30 hover:border-border"}`}
    >
      {url ? (
        <video
          src={url}
          muted
          preload="metadata"
          className={`flex-shrink-0 rounded bg-black object-cover ${vertical ? "w-7 h-12" : "w-12 h-7"}`}
        />
      ) : (
        <div className={`flex-shrink-0 rounded bg-black/60 border border-dashed border-border ${vertical ? "w-7 h-12" : "w-12 h-7"}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium truncate">{label}</div>
        {sublabel && <div className="text-[9px] text-gray-500 truncate">{sublabel}</div>}
      </div>
    </button>
  );
}


// ─── Branded download menu ─────────────────────────────────────────
// Quick "Download" link with a tiny channel picker beside it. Picking
// a channel hits /api/v4/jobs/{id}/download?channel_id=N so the served
// file carries that channel's logo+watermark, identical to what the
// upload worker would produce. Default (no pick) uses V4 user defaults.
// `accounts` is a list of REAL YouTube accounts (listYtAccounts()), not
// SEO style profiles. Each row has primary_profile_id (= the Channel id
// the download endpoint expects) plus youtube_channel_title for display.
function DownloadMenu({ jobId, target, index = 0, accounts = [] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const [variant, setVariant] = useState(null); // null = defaults; else account.youtube_channel_title
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!jobId) return null;

  async function startDownload(account) {
    setOpen(false);
    setErr("");
    setBusy(true);
    setVariant(account ? (account.youtube_channel_title || `Channel ${account.primary_profile_id}`) : null);
    try {
      const fn = account
        ? `${target}_${(account.youtube_channel_title || "channel").replace(/\s+/g, "_")}.mp4`
        : `${target}_${index + 1}.mp4`;
      await api.v4DownloadBlob(jobId, target, index,
        account?.primary_profile_id || null, fn);
    } catch (e) {
      setErr(e?.message || "Download failed");
      setTimeout(() => setErr(""), 6000);
    } finally {
      setBusy(false);
      setTimeout(() => setVariant(null), 1500);
    }
  }

  const haveAccounts = accounts.length > 0;
  return (
    <div ref={ref} className="relative inline-flex items-center">
      {/* Primary button — fires the "user defaults" download. Bigger
          target, clear label, lucide icon. The caret to its right opens
          the per-channel picker. */}
      <button
        type="button"
        onClick={() => startDownload(null)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-md border border-accent2/40 bg-accent2/10 text-accent2 hover:bg-accent2/20 hover:text-white text-xs font-medium disabled:opacity-50"
        title="Download with watermark applied (uses your V4 defaults)"
      >
        {busy ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            <span>{variant ? `Stamping for ${variant}…` : "Preparing…"}</span>
          </>
        ) : (
          <>
            <Upload size={13} className="rotate-180" />
            <span>Download</span>
          </>
        )}
      </button>
      {haveAccounts && (
        <button
          onClick={(e) => { e.preventDefault(); setOpen(!open); }}
          disabled={busy}
          className="px-2 py-1.5 rounded-r-md border border-l-0 border-accent2/40 bg-accent2/10 text-accent2 hover:bg-accent2/20 hover:text-white text-xs disabled:opacity-50"
          title="Download branded for a specific YouTube account"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 min-w-[240px] bg-[#0c0c0c] border border-border rounded-lg shadow-xl py-1">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 border-b border-border">
            Download branded for…
          </div>
          <button
            type="button"
            onClick={() => startDownload(null)}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-accent2/15 hover:text-white"
          >
            <div className="w-6 h-6 rounded-full bg-gray-700/60 flex items-center justify-center text-[10px]">✦</div>
            <div className="flex-1 min-w-0">
              <div className="truncate">User defaults</div>
              <div className="text-[10px] text-gray-500 truncate">Your V4 fallback brand</div>
            </div>
          </button>
          <div className="border-t border-border my-0.5" />
          {accounts.map((a) => (
            <button
              key={a.primary_profile_id || a.google_channel_id}
              type="button"
              onClick={() => startDownload(a)}
              className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-accent2/15 hover:text-white"
              title={a.youtube_channel_title || a.primary_profile_name}
            >
              {a.thumbnail_url ? (
                <img src={a.thumbnail_url} className="w-6 h-6 rounded-full object-cover bg-gray-800" alt="" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent2/30 to-accent/30 flex items-center justify-center text-[10px] font-bold text-white">
                  {(a.youtube_channel_title || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.youtube_channel_title || `Channel ${a.primary_profile_id}`}</div>
                <div className="text-[10px] text-gray-500 truncate">
                  {a.custom_url || (a.watermark_text ? `watermark: ${a.watermark_text}` : "logo + watermark applied")}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {err && (
        <span className="ml-2 text-[10px] text-red-400 whitespace-nowrap" title={err}>
          {err.length > 40 ? err.slice(0, 40) + "…" : err}
        </span>
      )}
    </div>
  );
}


// ─── Bulletin viewport — rendered + live preview side by side ──────
function BulletinViewport({ jobId, canvas, bulletinUrl, trimmedUrl, bulletinClipId, pool, onPublish, onLayoutChange, accounts = [], activeImage, onPanActiveImage }) {
  // Resolve the active image from canvas + indices so the live preview
  // can render the slot the user is currently editing (with its fit /
  // offset honoured). Falls back to first story / first image when
  // nothing is explicitly selected.
  const activeImg = (() => {
    if (!canvas?.bulletin?.stories?.length) return null;
    const si = activeImage?.storyIdx ?? 0;
    const ii = activeImage?.imgIdx   ?? 0;
    return canvas.bulletin.stories[si]?.images?.[ii] || null;
  })();
  const url = bulletinUrl || trimmedUrl;
  // Edit-overlay toggle. When OFF the user sees the rendered bulletin
  // clean (just the video player). When ON, the SVG live-preview sits
  // ON TOP of the player so the user can drag / resize tiles, pan the
  // active image, and watch text colour changes against the SAME visual
  // they'll see on render. Edits don't touch the rendered file until
  // they hit Re-render — this is purely the editing surface.
  const [editMode, setEditMode] = useState(false);
  const mainPlayerRef = useRef(null);
  // Client-side export state. Spike scope: video-only (bg + lower-third),
  // fixed 5s, just to prove the WebCodecs + mp4-muxer path. Per-story
  // composite + audio mix come in follow-up sessions.
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportErr, setExportErr] = useState("");
  const canExport = isClientExportSupported();
  const runClientExport = async () => {
    setExportErr("");
    setExporting(true);
    setExportPct(0);
    try {
      const bulletin = canvas?.bulletin;
      if (!bulletin) throw new Error("No bulletin canvas loaded");
      const layout = bulletin.layout;
      const bgRef = layout?.bg_video_path || "";

      // Resolve the bg URL — mirrors the editor's preview logic. For
      // `asset:N` we'd need to hit the user-assets API, but most users
      // pick a sample so we cover that first; assets are a follow-up.
      let bgUrl = "";
      if (bgRef.startsWith("sample:")) {
        const name = bgRef.slice("sample:".length);
        bgUrl = withAuth(`/api/v4/bg-samples/${encodeURIComponent(name)}`);
      }

      // Helper passed to the exporter so it can fetch pool images by
      // filename without knowing about jobs or auth.
      const resolvePoolUrl = (filename) =>
        withAuth(`/api/v4/jobs/${jobId}/pool/${encodeURIComponent(filename)}`);

      const blob = await exportBulletinClient({
        canvasState: bulletin,
        trimmedUrl: withAuth(trimmedUrl),
        bgUrl,
        bgVolume: layout?.bg_video_volume || 0,
        resolvePoolUrl,
        fps: 30,
        videoBitrate: 6_000_000,
        onProgress: ({ pct, phase }) => {
          setExportPct(pct);
          // eslint-disable-next-line no-console
          if (phase) console.debug("[export]", phase, pct);
        },
      });
      downloadBlob(blob, `bulletin_client_${jobId}_${Date.now()}.mp4`);
    } catch (e) {
      setExportErr(e?.message || "client export failed");
    } finally {
      setExporting(false);
    }
  };
  // When the edit overlay opens, pause the underlying rendered-bulletin
  // player so its audio doesn't keep playing behind the silent live
  // composite (the overlay's trimmed clip is muted by default). Leaving
  // it paused on close is intentional — operator usually wants to scrub
  // intentionally, not auto-resume mid-edit.
  useEffect(() => {
    if (editMode && mainPlayerRef.current) {
      try { mainPlayerRef.current.pause(); } catch {}
    }
  }, [editMode]);
  if (!url) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 text-xs italic">
        Bulletin hasn't been rendered yet — run the pipeline first.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Play size={12} className="text-accent2" />
        <span className="text-[11px] text-gray-300">
          {bulletinUrl ? "Final bulletin" : "Trimmed source only (Step 2 not run)"}
        </span>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
            editMode
              ? "bg-accent text-white border-accent"
              : "text-gray-300 border-border hover:border-accent2 hover:text-white"
          }`}
          title="Toggle the edit overlay. Live edits are previewed here; they apply on the next Re-render."
        >
          {editMode ? "✕ Close editor" : "✎ Edit layout"}
        </button>
        {canExport && (
          <button
            onClick={runClientExport}
            disabled={exporting}
            className="text-[11px] px-2 py-0.5 rounded border border-purple-500/50 text-purple-300 hover:border-purple-300 hover:text-white disabled:opacity-40 flex items-center gap-1"
            title="Phase C spike — render a 5s mp4 entirely in the browser (bg + lower-third only). No server load."
          >
            {exporting
              ? <><Loader2 size={11} className="animate-spin" /> {Math.round(exportPct * 100)}%</>
              : "⬇ Client export"}
          </button>
        )}
        <div className="ml-auto">
          <DownloadMenu jobId={jobId} target="bulletin" accounts={accounts} />
        </div>
        {bulletinUrl && bulletinClipId && (
          <button onClick={onPublish} className="text-[11px] text-accent2 hover:text-white">Publish</button>
        )}
      </div>
      {bulletinClipId && <UploadStatusPill clipId={bulletinClipId} />}
      {exportErr && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1 flex items-center gap-1.5">
          <AlertCircle size={11} /> Client export: {exportErr}
        </div>
      )}
      {/* Video player + overlay live preview. The overlay is the same
          SVG mock that used to sit below — it just lives on top now so
          one surface is editor + result. Toggle controls visibility. */}
      <div className="relative w-full">
        <video
          ref={mainPlayerRef}
          key={url}
          src={url}
          controls
          preload="metadata"
          className="w-full rounded border border-border bg-black block"
          style={{ maxHeight: "55vh" }}
        />
        {editMode && (
          <div className="absolute inset-0 rounded overflow-hidden">
            <BulletinLivePreview
              stories={canvas?.bulletin?.stories || []}
              imagePool={pool}
              activeImage={activeImg}
              onPanActiveImage={onPanActiveImage}
              headline={canvas?.bulletin?.seo?.title || canvas?.bulletin?.stories?.[0]?.title_native}
              layout={canvas?.bulletin?.layout}
              onLayoutChange={onLayoutChange}
              trimmedUrl={trimmedUrl}
            />
          </div>
        )}
        {editMode && (
          <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-amber-300/90 text-black font-semibold pointer-events-none">
            Editing — Re-render to apply
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Short viewport — rendered video + SVG live preview ────────────
function ShortViewport({ jobId, index, short, url, pool, clipId, onPublish, accounts = [] }) {
  const cfg = short?.short_config || {};
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Play size={12} className="text-accent2" />
        <span className="text-[11px] text-gray-300">
          {cfg.layout || "torn_card"} · 9:16 short
        </span>
        {url && (
          <div className="ml-auto">
            <DownloadMenu jobId={jobId} target="short" index={index ?? 0} accounts={accounts} />
          </div>
        )}
        {clipId && url && (
          <button onClick={onPublish} className="text-[11px] text-accent2 hover:text-white">Publish</button>
        )}
      </div>
      {clipId && <UploadStatusPill clipId={clipId} />}
      <div className="grid grid-cols-2 gap-3 max-w-xl">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Live preview</div>
          <ShortLivePreview
            layout={(cfg.layout || "torn_card").toLowerCase()}
            text={cfg.text ?? ""}
            fontFile={cfg.font_file}
            textColor={cfg.text_color}
            imagePool={pool}
            imageFilename={cfg.image_filename ?? ""}
            followParams={cfg.follow_params ?? {}}
            sectionPct={cfg.section_pct ?? { video: 0.4619, text: 0.1691, image: 0.3690 }}
          />
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rendered output</div>
          {url ? (
            <video
              key={url}
              src={url}
              controls
              preload="metadata"
              className="w-full aspect-[9/16] rounded bg-black"
            />
          ) : (
            <div className="w-full aspect-[9/16] rounded bg-black/60 border border-dashed border-border flex items-center justify-center text-[11px] text-gray-500 italic">
              not rendered yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Short inspector — V1 template controls + SEO panel ────────────
// Pulled out of ShortCard so the 3-pane layout can show it in the
// right-hand inspector while the viewport stays in the centre. All the
// V1 knobs live here: layout / headline / font / colour / size / image
// / section %s / card style / follow params.
function ShortInspector({ jobId, index, canvasShort, pool, onConfig, onSeo, onSeoRegenerated, onAutoFetchImage, onAiGenerateImage, clipId, channels }) {
  const [fetching, setFetching] = useState(false);
  const [aiGenning, setAiGenning] = useState(false);
  const cfg = canvasShort?.short_config || {};
  const seo = canvasShort?.seo || {};
  const layout    = (cfg.layout || "torn_card").toLowerCase();
  const text      = cfg.text ?? "";
  const fontFile  = cfg.font_file ?? "NotoSansTelugu-Bold.ttf";
  const fontSize  = cfg.font_size ?? "";
  const textColor = cfg.text_color ?? "#FFFFFF";
  const imageFn   = cfg.image_filename ?? "";
  const sec       = cfg.section_pct ?? { video: 0.4619, text: 0.1691, image: 0.3690 };
  const cs        = cfg.card_style ?? {};
  const fp        = cfg.follow_params ?? {};

  return (
    <div className="space-y-3">
      {/* Layout switcher */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500 w-20 flex-shrink-0">Layout</span>
        <select
          value={layout}
          onChange={(e) => onConfig((c) => { c.layout = e.target.value; })}
          className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
        >
          {V4_SHORT_LAYOUTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Headline */}
      <div className="flex items-start gap-2">
        <span className="text-gray-500 w-20 flex-shrink-0 mt-1">Headline</span>
        <textarea
          value={text}
          placeholder="(uses story title)"
          rows={2}
          onChange={(e) => onConfig((c) => { c.text = e.target.value || null; })}
          className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200 resize-none"
        />
      </div>

      {/* Font / colour / size / image */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-gray-500 mb-0.5">Font</div>
          <select
            value={fontFile}
            onChange={(e) => onConfig((c) => { c.font_file = e.target.value; })}
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          >
            {V4_SHORT_FONTS.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Text colour</div>
          <input
            type="color"
            value={textColor}
            onChange={(e) => onConfig((c) => { c.text_color = e.target.value; })}
            className="w-full h-7 bg-black/60 border border-border rounded"
          />
        </div>
        <div>
          <div className="text-gray-500 mb-0.5">Font size (px)</div>
          <input
            type="number"
            min={20} max={200}
            value={fontSize}
            placeholder="auto"
            onChange={(e) => {
              const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
              onConfig((c) => { c.font_size = isNaN(v) ? null : v; });
            }}
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          />
        </div>
        <div>
          <div className="text-gray-500 mb-0.5 flex items-center justify-between gap-1.5">
            <span>Image</span>
            <div className="flex items-center gap-1.5">
              {onAutoFetchImage && (
                <button
                  type="button"
                  disabled={fetching || aiGenning}
                  onClick={async () => {
                    setFetching(true);
                    try { await onAutoFetchImage(); }
                    finally { setFetching(false); }
                  }}
                  className="text-[10px] text-accent2 hover:text-white disabled:opacity-40 flex items-center gap-1"
                  title="Search web for an authentic news photo (CSE / DDG / Pexels)"
                >
                  {fetching ? (<><Loader2 size={10} className="animate-spin" /> fetching…</>) : "Auto"}
                </button>
              )}
              {onAiGenerateImage && (
                <button
                  type="button"
                  disabled={fetching || aiGenning}
                  onClick={async () => {
                    setAiGenning(true);
                    try { await onAiGenerateImage(); }
                    finally { setAiGenning(false); }
                  }}
                  className="text-[10px] text-pink-400 hover:text-white disabled:opacity-40 flex items-center gap-1"
                  title="Generate a fresh image with Gemini Nano Banana (uses GCP credits)"
                >
                  {aiGenning ? (<><Loader2 size={10} className="animate-spin" /> AI…</>) : "✦ AI"}
                </button>
              )}
            </div>
          </div>
          <select
            value={imageFn}
            onChange={(e) => onConfig((c) => { c.image_filename = e.target.value || null; })}
            className="w-full bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
          >
            <option value="">(round-robin)</option>
            {pool.map((p) => (<option key={p.filename} value={p.filename}>{p.filename}</option>))}
          </select>
        </div>
      </div>

      {/* Section %s — torn_card only */}
      {layout === "torn_card" && (
        <div>
          <div className="text-gray-500 mb-1">Section heights (sum ≈ 1.0)</div>
          <div className="grid grid-cols-3 gap-2">
            {["video", "text", "image"].map((k) => (
              <label key={k} className="text-gray-400">
                <div className="text-[10px]">{k}: {(sec[k] || 0).toFixed(3)}</div>
                <input
                  type="range" min={0.10} max={0.70} step={0.01}
                  value={sec[k] || 0}
                  onChange={(e) => onConfig((c) => {
                    c.section_pct = { ...sec, [k]: parseFloat(e.target.value) };
                  })}
                  className="w-full"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Torn-card style sliders */}
      {layout === "torn_card" && (
        <details className="text-gray-300">
          <summary className="cursor-pointer text-gray-500 select-none">Card style (9 knobs)</summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              ["seed", 0, 99],   ["edge", 2, 40],  ["jag", 10, 100],
              ["overlap", 5, 80],["vsid", 0, 80],  ["vcor", 0, 100],
              ["vwid", 20, 300], ["bgr0", 120, 255], ["bgr1", 60, 200],
            ].map(([k, min, max]) => (
              <label key={k} className="text-gray-400">
                <div className="text-[10px]">{k}: {cs[k] ?? "?"}</div>
                <input
                  type="range" min={min} max={max} step={1}
                  value={cs[k] ?? min}
                  onChange={(e) => onConfig((c) => {
                    c.card_style = { ...cs, [k]: parseInt(e.target.value, 10) };
                  })}
                  className="w-full"
                />
              </label>
            ))}
          </div>
        </details>
      )}

      {/* Follow-bar controls */}
      {layout === "follow_bar" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 flex-shrink-0">Follow</span>
            <input
              type="text"
              value={fp.follow_text ?? ""}
              onChange={(e) => onConfig((c) => { c.follow_params = { ...fp, follow_text: e.target.value }; })}
              className="flex-1 bg-black/60 border border-border rounded px-1.5 py-1 text-gray-200"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["bg_color", "BG colour"],
              ["text_color", "Text colour"],
              ["follow_text_color", "Follow colour"],
            ].map(([k, label]) => (
              <div key={k}>
                <div className="text-[10px] text-gray-500">{label}</div>
                <input
                  type="color"
                  value={fp[k] ?? "#000000"}
                  onChange={(e) => onConfig((c) => { c.follow_params = { ...fp, [k]: e.target.value }; })}
                  className="w-full h-7 bg-black/60 border border-border rounded"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEO panel — same component the bulletin uses */}
      <SeoPanel
        seo={seo}
        onSeo={onSeo}
        target="short"
        index={index}
        jobId={jobId}
        clipId={clipId}
        channels={channels}
        onRegenerated={onSeoRegenerated}
      />
      <ThumbnailPanel jobId={jobId} target="short" index={index} />
    </div>
  );
}


// ─── Upload status pill — polls /api/uploads?clip_id=… ─────────────
// Auto-polls every 4 s while any upload for this clip is in-flight.
// Shows one pill per channel destination so the user can see which
// channel succeeded/failed without leaving the editor.
function UploadStatusPill({ clipId }) {
  const [rows, setRows] = useState([]);
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!clipId) return;
    try {
      const r = await api.listClipUploads(clipId);
      setRows(Array.isArray(r) ? r : []);
    } catch { /* swallow */ }
  }, [clipId]);

  useEffect(() => {
    fetch();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetch]);

  useEffect(() => {
    const inflight = rows.some((r) =>
      ["queued", "encoding", "uploading", "scheduled"].includes((r.status || "").toLowerCase())
    );
    if (!inflight) return;
    timerRef.current = setTimeout(fetch, 4000);
    return () => clearTimeout(timerRef.current);
  }, [rows, fetch]);

  if (!clipId || rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {rows.map((r) => {
        const status = (r.status || "").toLowerCase();
        const colour = (
          status === "done"           ? "bg-green-900/40 text-green-300 border-green-700/40" :
          status === "failed"         ? "bg-red-900/40 text-red-300 border-red-700/40"       :
          status === "cancelled"      ? "bg-amber-900/40 text-amber-300 border-amber-700/40" :
          status === "provider_failed"? "bg-red-900/40 text-red-300 border-red-700/40"       :
                                         "bg-yellow-900/30 text-yellow-300 border-yellow-700/40"
        );
        const isVideo = !!r.video_id;
        return (
          <a
            key={r.id}
            href={isVideo ? r.video_url : `/uploads`}
            target={isVideo ? "_blank" : "_self"}
            rel="noopener"
            title={r.last_error ? `Error: ${r.last_error}` : `${r.channel_name || "channel"} · ${status}`}
            className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full border ${colour}`}
          >
            {r.channel_name || `ch#${r.channel_id}`} · {status}
            {r.progress_pct > 0 && r.progress_pct < 100 && status === "uploading" && (
              <span> {Math.round(r.progress_pct)}%</span>
            )}
          </a>
        );
      })}
    </div>
  );
}


// ─── Live preview mock for the bulletin (1920x1080) ────────────────
// Visual approximation of v1_bridge's _compose_v4_bulletin_story:
// left video tile + right sidebar tile (white-bordered, ~50px top
// margin), full-width red lower-third with kicker chip + headline,
// yellow ticker scrolling along the bottom.
function BulletinLivePreview({ stories, imagePool, headline, kicker = "BREAKING", layout, onLayoutChange, activeImage, onPanActiveImage, trimmedUrl = "" }) {
  const [frameMode, setFrameMode] = useState(false);   // ON = drag inside picture rect pans the image; OFF = drag moves the rect (existing behaviour).
  const [copied, setCopied] = useState("");            // "ok" | "err" | "" — transient feedback on the Copy/Paste preset buttons.
  // Resolve canvas.layout.bg_video_path → playable URL for the preview
  // video layer. Samples resolve directly; asset refs need a one-shot
  // fetch (kept cached in state so we don't refetch per pointer move).
  const [userBgVideos, setUserBgVideos] = useState([]);
  const bgRef = layout?.bg_video_path || "";
  useEffect(() => {
    if (bgRef.startsWith("asset:")) {
      api.v4ListUserBgVideos().then((u) => setUserBgVideos(u || [])).catch(() => {});
    }
  }, [bgRef]);
  const bgVideoPreviewSrc = (() => {
    if (!bgRef) return "";
    if (bgRef.startsWith("sample:")) {
      return withAuth(`/api/v4/bg-samples/${encodeURIComponent(bgRef.slice("sample:".length))}`);
    }
    if (bgRef.startsWith("asset:")) {
      const id = parseInt(bgRef.slice("asset:".length), 10);
      const hit = userBgVideos.find((a) => a.id === id);
      return hit?.url || "";
    }
    return "";
  })();
  // 16:9 mini canvas (320 x 180) — preview coordinates. We map to and
  // from the real 1920 x 1080 canvas via percentages stored in
  // `layout` so a drag here writes directly into canvas.json and the
  // backend composer reads the same pcts on the next render.
  const W = 320, H = 180;
  const REAL_W = layout?.width || 1920;
  const REAL_H = layout?.height || 1080;

  // Read the per-story text-block colours so the preview tracks live
  // edits in the inspector. Falls back to the V4 broadcast defaults
  // when no story / block / colour has been set yet.
  const story0 = stories?.[0];
  const lowerThird = (story0?.text_blocks || []).find((b) => b?.kind === "lower_third");
  const ticker    = (story0?.text_blocks || []).find((b) => b?.kind === "ticker");
  const strapBg     = lowerThird?.bg_color || "#C01824";
  const strapFg     = lowerThird?.fg_color || "#FFFFFF";
  const tickerBg    = ticker?.bg_color     || "#FFD400";
  const tickerFg    = ticker?.fg_color     || "#000000";
  const kickerColor = strapBg;  // contrast inside the white BREAKING chip

  // Derive tile rects from layout pcts (with sensible fallbacks for
  // canvases written before the geometry fields existed).
  const tile = (xp, yp, wp, hp) => ({
    x: Math.max(0, ((xp ?? 0) / 100) * W),
    y: Math.max(0, ((yp ?? 0) / 100) * H),
    w: Math.max(8, ((wp ?? 0) / 100) * W),
    h: Math.max(8, ((hp ?? 0) / 100) * H),
  });
  const vid  = tile(layout?.video_x_pct,   layout?.video_y_pct,   layout?.video_w_pct,   layout?.video_h_pct);
  const side = tile(layout?.picture_x_pct, layout?.picture_y_pct, layout?.picture_w_pct, layout?.picture_h_pct);
  const LT_H = 22;
  const TICK_H = 8;

  // Picture-panel image source. When the user is editing a specific
  // image (activeImage), prefer that one so the live preview reflects
  // swap/upload/AI-regen instantly. Fall back to the first pool entry so
  // anonymous renders still look populated.
  const activeSrc = activeImage?.src
    ? withAuth((imagePool || []).find((p) => p.filename === activeImage.src)?.url || null)
    : null;
  const sidebarUrl = activeSrc || withAuth((imagePool || [])[0]?.url || null);
  const fit       = activeImage?.fit || "cover";
  const offsetX   = Math.max(0, Math.min(100, activeImage?.offset_x_pct ?? 50));
  const offsetY   = Math.max(0, Math.min(100, activeImage?.offset_y_pct ?? 50));
  const tickerStories = (stories || [])
    .map((s) => (s.title_native || s.title_english || "").trim())
    .filter(Boolean);
  const tickerText = (tickerStories.join("  ★  ") || "KAIZER NEWS") + "    ";

  // ── Drag / resize state ─────────────────────────────────────────
  // dragState = { target: "video"|"picture", mode: "move"|"resize",
  //               origin: {x,y}, start: {x,y,w,h} }
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  // Refs for the compositing player — main = trimmed talking head,
  // bgVideoRef from earlier (declared in renderTile scope is wrong;
  // declare them up here so play / pause controls can reach them).
  const mainVideoRef = useRef(null);
  const bgVideoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // Master play/pause: drives BOTH the trimmed clip and the bg video so
  // the operator sees the same alignment ffmpeg will produce. We never
  // try to seek the bg (it loops independently); we just gate its
  // visibility/playback to match.
  const togglePlay = () => {
    const m = mainVideoRef.current;
    const b = bgVideoRef.current;
    if (!m) return;
    if (m.paused) {
      m.play().catch(() => {});
      if (b) b.play().catch(() => {});
      setPlaying(true);
    } else {
      m.pause();
      if (b) b.pause();
      setPlaying(false);
    }
  };

  function svgPoint(evt) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: ((evt.clientX - r.left) / r.width) * W,
      y: ((evt.clientY - r.top)  / r.height) * H,
    };
  }

  function commit(target, x, y, w, h) {
    if (!onLayoutChange) return;
    // Clamp to canvas bounds.
    const xClamped = Math.max(0, Math.min(W - w, x));
    const yClamped = Math.max(0, Math.min(H - h, y));
    const wClamped = Math.max(8, Math.min(W - xClamped, w));
    const hClamped = Math.max(8, Math.min(H - yClamped, h));
    onLayoutChange((l) => {
      if (target === "video") {
        l.video_x_pct = (xClamped / W) * 100;
        l.video_y_pct = (yClamped / H) * 100;
        l.video_w_pct = (wClamped / W) * 100;
        l.video_h_pct = (hClamped / H) * 100;
      } else {
        l.picture_x_pct = (xClamped / W) * 100;
        l.picture_y_pct = (yClamped / H) * 100;
        l.picture_w_pct = (wClamped / W) * 100;
        l.picture_h_pct = (hClamped / H) * 100;
      }
    });
  }

  function onPointerDown(evt, target, mode, rect) {
    evt.preventDefault();
    evt.stopPropagation();
    evt.target.setPointerCapture?.(evt.pointerId);
    setDrag({ target, mode, origin: svgPoint(evt), start: { ...rect } });
  }
  function onPointerMove(evt) {
    if (!drag) return;
    const cur = svgPoint(evt);
    const dx = cur.x - drag.origin.x;
    const dy = cur.y - drag.origin.y;
    if (drag.mode === "move") {
      commit(drag.target,
        drag.start.x + dx, drag.start.y + dy,
        drag.start.w, drag.start.h);
    } else if (drag.mode === "pan") {
      // Pan the source image inside the picture rect. Convert the cursor
      // delta into a percentage of the rect (inverted — dragging RIGHT
      // means we want to see LESS of the right edge of the source, so the
      // focal point moves LEFT). offset_*_pct is stored in 0-100.
      const rect = drag.start;
      const dxPct = (dx / Math.max(1, rect.w)) * 100;
      const dyPct = (dy / Math.max(1, rect.h)) * 100;
      const nx = Math.max(0, Math.min(100, drag.startOffset.x - dxPct));
      const ny = Math.max(0, Math.min(100, drag.startOffset.y - dyPct));
      onPanActiveImage && onPanActiveImage(nx, ny);
    } else {
      // Bottom-right corner resize.
      commit(drag.target,
        drag.start.x, drag.start.y,
        drag.start.w + dx, drag.start.h + dy);
    }
  }
  function onPointerUp() { setDrag(null); }

  const renderTile = (target, rect, fillImg, label) => {
    const isInteractive = !!onLayoutChange;
    const isPicture = target === "picture";
    const canPan = isPicture && frameMode && !!onPanActiveImage;
    return (
      <g>
        <rect
          x={rect.x} y={rect.y} width={rect.w} height={rect.h}
          fill="#fff" stroke={canPan ? "#ff9900" : "#fff"} strokeWidth={canPan ? 1 : 0.5}
        />
        {fillImg ? (
          // Use foreignObject so we get CSS object-fit / object-position
          // — exactly the model the renderer uses on the backend (cover
          // with focal offset, or contain with letterbox).
          <foreignObject
            x={rect.x + 1} y={rect.y + 1} width={rect.w - 2} height={rect.h - 2}
            style={{ pointerEvents: "none" }}
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{ width: "100%", height: "100%", overflow: "hidden", background: "#000", pointerEvents: "none" }}
            >
              <img
                src={fillImg}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: isPicture ? fit : "cover",
                  objectPosition: isPicture ? `${offsetX}% ${offsetY}%` : "center",
                  display: "block",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
                draggable={false}
              />
            </div>
          </foreignObject>
        ) : target === "video" && trimmedUrl ? (
          // Live talking-head: play the actual trimmed clip inside the
          // video tile so the user sees WHERE the anchor will land plus
          // WHAT they'll see, without waiting for a server re-render.
          // Cover-cropped to match the backend composer's geometry.
          <foreignObject
            x={rect.x + 1} y={rect.y + 1} width={rect.w - 2} height={rect.h - 2}
            style={{ pointerEvents: "none" }}
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{ width: "100%", height: "100%", overflow: "hidden", background: "#000", pointerEvents: "none" }}
            >
              <video
                ref={mainVideoRef}
                src={withAuth(trimmedUrl)}
                muted
                playsInline
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover", objectPosition: "center",
                  display: "block", pointerEvents: "none", userSelect: "none",
                }}
              />
            </div>
          </foreignObject>
        ) : (
          <>
            <rect x={rect.x + 1} y={rect.y + 1} width={rect.w - 2} height={rect.h - 2} fill="#222" />
            <text
              x={rect.x + rect.w / 2} y={rect.y + rect.h / 2 + 3}
              fill="rgba(255,255,255,.35)" fontSize="10" textAnchor="middle"
              style={{ pointerEvents: "none" }}
            >{label}</text>
          </>
        )}
        {isInteractive && (
          <>
            {/* Whole-tile drag handle. For the picture rect in frameMode
                we drag-to-pan the IMAGE inside (updates offset_*_pct); in
                normal mode we drag-to-MOVE the rect itself (current
                behaviour). */}
            <rect
              x={rect.x} y={rect.y} width={rect.w} height={rect.h}
              fill="transparent"
              style={{ cursor: canPan ? "grab" : "move" }}
              onPointerDown={(e) => {
                if (canPan) {
                  e.preventDefault(); e.stopPropagation();
                  e.target.setPointerCapture?.(e.pointerId);
                  setDrag({
                    target, mode: "pan",
                    origin: svgPoint(e),
                    start: { ...rect },
                    startOffset: { x: offsetX, y: offsetY },
                  });
                } else {
                  onPointerDown(e, target, "move", rect);
                }
              }}
            />
            {/* Bottom-right resize handle — visible for both rects. */}
            <rect
              x={rect.x + rect.w - 7} y={rect.y + rect.h - 7}
              width="8" height="8" fill="#00aaff" stroke="#fff" strokeWidth="0.5"
              style={{ cursor: "nwse-resize" }}
              onPointerDown={(e) => onPointerDown(e, target, "resize", rect)}
            />
            {/* Frame-mode toggle — only on the picture rect, and only
                when we have an active image we can actually pan. */}
            {isPicture && onPanActiveImage && activeImage && (
              <g
                onPointerDown={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setFrameMode((v) => !v);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={rect.x + 1} y={rect.y + 1} width="14" height="10"
                  fill={frameMode ? "#ff9900" : "rgba(0,0,0,.55)"}
                  stroke="#fff" strokeWidth="0.4" rx="1.5"
                />
                <text
                  x={rect.x + 8} y={rect.y + 8.5}
                  fill="#fff" fontSize="6.5" textAnchor="middle"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >FRAME</text>
              </g>
            )}
          </>
        )}
      </g>
    );
  };

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full aspect-video rounded border border-border bg-black select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Bg layer: looping video when bg_video_path resolves, else
            a flat black rect. The video mirrors how the renderer will
            actually composite — so what the user sees here is close to
            what ffmpeg writes on the next render. */}
        {bgVideoPreviewSrc ? (
          <foreignObject x="0" y="0" width={W} height={H} style={{ pointerEvents: "none" }}>
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
              <video
                ref={bgVideoRef}
                src={bgVideoPreviewSrc}
                muted autoPlay loop playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
              />
            </div>
          </foreignObject>
        ) : (
          <rect x="0" y="0" width={W} height={H} fill={layout?.bg_color || "#000"} />
        )}
        {renderTile("video", vid, null, "video")}
        {renderTile("picture", side, sidebarUrl, "image")}
        {/* Lower-third strap — colour driven by canvas.stories[0].text_blocks[lower_third].bg_color */}
        <rect x="0" y={H - LT_H - TICK_H} width={W} height={LT_H} fill={strapBg} />
        <rect x="0" y={H - LT_H - TICK_H + LT_H - 2} width={W} height="2" fill={strapBg} fillOpacity="0.55" />
        <rect x="4" y={H - LT_H - TICK_H + 3} width="36" height={LT_H - 6} fill="#fff" />
        <text x="22" y={H - LT_H - TICK_H + LT_H / 2 + 3} fill={kickerColor} fontSize="7" fontWeight="800" textAnchor="middle">{kicker}</text>
        <text x="44" y={H - LT_H - TICK_H + LT_H / 2 + 3} fill={strapFg} fontSize="9" fontWeight="700">
          {(headline || (stories?.[0]?.title_native) || "BREAKING").slice(0, 42)}
        </text>
        {/* Yellow ticker bar — colour driven by canvas.stories[0].text_blocks[ticker].bg_color */}
        <rect x="0" y={H - TICK_H} width={W} height={TICK_H} fill={tickerBg} />
        <text x="4" y={H - 2} fill={tickerFg} fontSize="6" fontWeight="700">
          {tickerText.slice(0, 90)}
        </text>
        {/* Play/Pause overlay — drives the trimmed talking-head clip
            inside the video tile so the operator can scrub through the
            live composite without leaving the editor. */}
        {trimmedUrl && (
          <foreignObject x={W / 2 - 24} y="2" width="48" height="14">
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ width: "100%", height: "100%" }}>
              <button
                type="button"
                onClick={togglePlay}
                style={{
                  width: "100%", height: "100%",
                  border: "1px solid rgba(255,255,255,.6)",
                  borderRadius: 3,
                  background: "rgba(0,0,0,.55)",
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
                title={playing ? "Pause the live composite" : "Play the live composite"}
              >
                {playing ? "⏸ PAUSE" : "▶ PLAY"}
              </button>
            </div>
          </foreignObject>
        )}
      </svg>
      {onLayoutChange && (
        <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
          <span>Drag tiles to move · drag the blue handle to resize. Save + Re-render to apply.</span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={async () => {
                // Snapshot only the 8 pct fields that drive tile geometry
                // — keeps the preset JSON small + portable across canvases.
                const preset = {
                  video_x_pct:   layout?.video_x_pct,
                  video_y_pct:   layout?.video_y_pct,
                  video_w_pct:   layout?.video_w_pct,
                  video_h_pct:   layout?.video_h_pct,
                  picture_x_pct: layout?.picture_x_pct,
                  picture_y_pct: layout?.picture_y_pct,
                  picture_w_pct: layout?.picture_w_pct,
                  picture_h_pct: layout?.picture_h_pct,
                };
                const json = JSON.stringify(preset, null, 2);
                try {
                  await navigator.clipboard.writeText(json);
                  setCopied("ok");
                } catch {
                  // Some browsers refuse clipboard writes when the page
                  // isn't focused or HTTPS — fall back to a prompt so the
                  // user can still grab the JSON manually.
                  window.prompt("Copy this layout JSON:", json);
                  setCopied("ok");
                }
                setTimeout(() => setCopied(""), 1500);
              }}
              className="text-accent2 hover:text-white"
              title="Copy the current tile geometry as JSON so you can paste it back later (or share it to set as default)"
            >{copied ? "✓ Copied" : "⎘ Copy layout"}</button>
            <button
              type="button"
              onClick={async () => {
                let text = "";
                try { text = await navigator.clipboard.readText(); } catch {}
                if (!text) text = window.prompt("Paste layout JSON:") || "";
                if (!text) return;
                let preset;
                try { preset = JSON.parse(text); } catch { setCopied("err"); setTimeout(() => setCopied(""), 1500); return; }
                const required = ["video_x_pct","video_y_pct","video_w_pct","video_h_pct","picture_x_pct","picture_y_pct","picture_w_pct","picture_h_pct"];
                if (!required.every((k) => typeof preset[k] === "number")) {
                  setCopied("err"); setTimeout(() => setCopied(""), 1500); return;
                }
                onLayoutChange((l) => {
                  for (const k of required) l[k] = preset[k];
                });
                setCopied("ok");
                setTimeout(() => setCopied(""), 1500);
              }}
              className="text-amber-300 hover:text-white"
              title="Paste a previously-copied layout JSON to apply it here"
            >⎗ Paste</button>
          </span>
        </div>
      )}
    </div>
  );
}


// ─── Live preview mock for shorts (SVG, no ffmpeg) ─────────────────
// Visual approximation of the V1 short templates that updates instantly
// as the user edits text / colour / layout / image. Cheap to render —
// keeps the editor feeling like Photoshop without the cost of a real
// render per keystroke. The actual output still uses V1's composers.
function ShortLivePreview({ layout, text, fontFile, textColor, imagePool, imageFilename, followParams, sectionPct }) {
  const W = 270, H = 480;   // 9:16 mini canvas
  const imgUrl = (() => {
    if (!imageFilename) return null;
    const hit = (imagePool || []).find((p) => p.filename === imageFilename);
    return withAuth(hit?.url || null);
  })();
  // Font picker -> CSS family hint. None of these will perfectly match
  // the Noto TTF on the server, but at least the picker has a visible
  // distinction in the preview between, say, a serif and the default.
  const fontFamily = (fontFile || "").toLowerCase().includes("serif")
    ? "serif"
    : "system-ui, sans-serif";
  const fg = textColor || "#FFFFFF";

  if (layout === "follow_bar") {
    const bg = followParams?.bg_color || "#1a0a2e";
    const fbBg = followParams?.bg_color || "#1a0a2e";
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded border border-border bg-black">
        <rect x="0" y="0" width={W} height={H} fill={bg} />
        {/* Headline top */}
        <foreignObject x="10" y="10" width={W - 20} height={80}>
          <div style={{
            color: fg, fontFamily, fontWeight: 800, fontSize: 18,
            lineHeight: 1.15, textAlign: "center", textShadow: "0 1px 2px rgba(0,0,0,.6)",
          }}>{text || "Headline goes here"}</div>
        </foreignObject>
        {/* Square video tile */}
        <rect x="10" y="100" width={W - 20} height={W - 20} fill="#222" />
        {imgUrl && <image href={imgUrl} x="10" y="100" width={W - 20} height={W - 20} preserveAspectRatio="xMidYMid slice" />}
        {/* Follow bar */}
        <rect x="0" y={H - 70} width={W} height="70" fill={fbBg} />
        <foreignObject x="10" y={H - 60} width={W - 20} height="50">
          <div style={{
            color: followParams?.follow_text_color || "#fff", fontFamily, fontWeight: 700,
            fontSize: 13, textAlign: "center", letterSpacing: 1,
          }}>{followParams?.follow_text || "FOLLOW KAIZER NEWS"}</div>
        </foreignObject>
      </svg>
    );
  }

  if (layout === "split_frame") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded border border-border bg-black">
        <rect x="0" y="0" width={W} height={H} fill="#1a0a2e" />
        {/* Thumbnail top */}
        <rect x="15" y="15" width={W - 30} height="135" fill="#333" />
        {imgUrl && <image href={imgUrl} x="15" y="15" width={W - 30} height="135" preserveAspectRatio="xMidYMid slice" />}
        {/* Video bottom */}
        <rect x="15" y="160" width={W - 30} height={H - 175} fill="#222" />
        <text x={W / 2} y={H / 2 + 80} fill="rgba(255,255,255,.3)" fontSize="11" textAnchor="middle" fontFamily={fontFamily}>video here</text>
      </svg>
    );
  }

  if (layout === "clean_card") {
    const bandTop = Math.round(H * 0.5);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded border border-border bg-black">
        <rect x="0" y="0" width={W} height={H} fill="#000" />
        {/* Video top half */}
        <rect x="0" y="0" width={W} height={bandTop} fill="#222" />
        <text x={W / 2} y={bandTop / 2} fill="rgba(255,255,255,.3)" fontSize="11" textAnchor="middle" fontFamily={fontFamily}>video</text>
        {/* Red band bottom half */}
        <rect x="0" y={bandTop} width={W} height={H - bandTop} fill="#C10000" />
        <foreignObject x="10" y={bandTop + 10} width={W - 20} height="60">
          <div style={{
            color: fg, fontFamily, fontWeight: 800, fontSize: 17,
            lineHeight: 1.15, textAlign: "center",
          }}>{text || "Headline"}</div>
        </foreignObject>
        {/* Framed image inside band */}
        <rect x="35" y={bandTop + 75} width={W - 70} height={H - bandTop - 95} fill="#fff" />
        <rect x="40" y={bandTop + 80} width={W - 80} height={H - bandTop - 105} fill="#333" />
        {imgUrl && <image href={imgUrl} x="40" y={bandTop + 80} width={W - 80} height={H - bandTop - 105} preserveAspectRatio="xMidYMid slice" />}
      </svg>
    );
  }

  // Default: torn_card (V1 default). Three vertical sections.
  const vH = Math.round(H * (sectionPct?.video ?? 0.4619));
  const iH = Math.round(H * (sectionPct?.image ?? 0.3690));
  const tH = Math.max(40, H - vH - iH);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[9/16] rounded border border-border bg-black">
      <rect x="0" y="0" width={W} height={H} fill="#000" />
      {/* Video top */}
      <rect x="0" y="0" width={W} height={vH} fill="#222" />
      <text x={W / 2} y={vH / 2} fill="rgba(255,255,255,.3)" fontSize="11" textAnchor="middle" fontFamily={fontFamily}>video</text>
      {/* Image bottom */}
      <rect x="0" y={vH + tH} width={W} height={iH} fill="#333" />
      {imgUrl && <image href={imgUrl} x="0" y={vH + tH} width={W} height={iH} preserveAspectRatio="xMidYMid slice" />}
      {/* Red torn card centre — overlaps slightly into video + image */}
      <rect x="0" y={vH - 6} width={W} height={tH + 12} fill="#C10000" />
      {/* Jagged top edge mock */}
      <polygon
        points={`0,${vH - 6} ${W * 0.15},${vH - 12} ${W * 0.32},${vH - 4} ${W * 0.5},${vH - 10} ${W * 0.7},${vH - 4} ${W * 0.85},${vH - 12} ${W},${vH - 6} ${W},${vH - 6} 0,${vH - 6}`}
        fill="#C10000"
      />
      <foreignObject x="10" y={vH} width={W - 20} height={tH}>
        <div style={{
          color: fg, fontFamily, fontWeight: 800,
          fontSize: Math.min(20, Math.max(13, Math.round(tH / 4))),
          lineHeight: 1.15, textAlign: "center",
          display: "flex", alignItems: "center", justifyContent: "center",
          height: "100%",
          textShadow: "0 1px 2px rgba(0,0,0,.5)",
        }}>{text || "Telugu headline"}</div>
      </foreignObject>
    </svg>
  );
}


// ─── Publish modal — channel picker + privacy + submit ─────────────
// Re-uses the existing /api/clips/{id}/publish endpoint with `use_seo=true`
// so the channel-overlay composer (` | <YouTube channel name>`, mandatory
// hashtags, etc.) runs server-side from whatever the user wrote in the
// SEO panel above.
function PublishModal({ target, channels, onClose, onPublished, setErr }) {
  const [selected, setSelected] = useState(new Set());
  const [privacy, setPrivacy]   = useState("public");
  const [busy, setBusy]         = useState(false);
  const list = channels || [];

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      setErr("Pick at least one channel.");
      return;
    }
    setBusy(true);
    try {
      await api.publishClip(target.clipId, {
        channel_ids:  [...selected],
        privacy_status: privacy,
        publish_kind: target.kind,
        use_seo: true,
      });
      onPublished();
    } catch (e) {
      setErr(e?.message || "publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-white font-semibold">Publish to YouTube</div>
            <div className="text-[11px] text-gray-500 truncate max-w-[300px]">
              {target.kind === "short" ? "Short" : "Video"} · {target.title}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs">close</button>
        </div>

        <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Channels</div>
        {list.length === 0 ? (
          <div className="p-3 text-[11px] text-gray-500 italic border border-dashed border-border rounded mb-3">
            No connected channels. Open <Link to="/channels" className="text-accent2">Channels</Link> to connect one.
          </div>
        ) : (
          <div className="max-h-48 overflow-auto border border-border rounded mb-3">
            {list.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-black/40 cursor-pointer text-[12px] text-gray-200 border-b border-border last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="flex-1 truncate">{c.name || `Channel #${c.id}`}</span>
                {c.google_channel_title && (
                  <span className="text-gray-500 text-[10px] truncate max-w-[140px]">
                    {c.google_channel_title}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-gray-300 mb-4">
          <span className="text-gray-500">Privacy</span>
          {["public", "unlisted", "private"].map((v) => (
            <label key={v} className="flex items-center gap-1 capitalize cursor-pointer">
              <input
                type="radio"
                name="privacy"
                value={v}
                checked={privacy === v}
                onChange={() => setPrivacy(v)}
              />
              {v}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn btn-secondary text-xs px-3 py-1.5"
            disabled={busy}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="btn btn-primary text-xs px-3 py-1.5 disabled:opacity-40 flex items-center gap-1"
          >
            {busy ? (<><Loader2 size={12} className="animate-spin" /> publishing…</>) : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
