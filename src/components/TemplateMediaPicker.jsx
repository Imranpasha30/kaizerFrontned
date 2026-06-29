import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";

/**
 * TemplateMediaPicker — per-slot media selection for a custom template.
 *
 * Shows one labelled picker per slot the template declares, grouped into Videos and
 * Images. Video/background/intro slots take a video; image slots take an image. A radio
 * marks ONE video as the "main" — that file becomes the job's source video (AI-trimmed);
 * every other media is uploaded as an asset and reported via `template_media`.
 *
 * AI images are STORY-DRIVEN and template-aware: paste the story once, and Kaizer fills
 * every image slot with RELEVANT imagery — a single slot gets one image; a slideshow slot
 * gets as many distinct images as the story needs (the operator can cap the count). The
 * `template_media` value for a slideshow slot is a carousel struct
 * `{carousel:[{id,duration_s,effect,effect_duration}], fit}`; a single slot stays a scalar id.
 *
 * Props:
 *   slots         : [{ kind, key, carousel }]  (from the chosen template)
 *   mainFile      : File | null      (the main video; lifted to the wizard's `file`)
 *   onMainFile    : (File|null) => void
 *   onChange      : ({ templateMedia, mainSlot, ready }) => void
 */
const LABELS = { headshot: "Headshot", main: "Main", left: "Left", right: "Right",
                 top: "Top", bottom: "Bottom", bg: "Background", b: "Secondary" };

function clipLabel(kind, key) {
  const k = (key && key !== kind) ? (LABELS[key] || key.replace(/[_-]/g, " ")) : "";
  const noun = kind === "background" ? "background video"
             : kind === "intro" ? "intro clip" : "video";
  return (k ? `${k.charAt(0).toUpperCase() + k.slice(1)} ${noun}`
            : noun.charAt(0).toUpperCase() + noun.slice(1));
}
// Images get a clear position number plus their slot name if it's meaningful.
function imageLabel(key, i) {
  const named = key && key !== "image" && !/^\d+$/.test(key) ? key.replace(/[_-]/g, " ") : "";
  return named ? `Image ${i + 1} — ${named}` : `Image ${i + 1}`;
}

export default function TemplateMediaPicker({ slots = [], mainFile, onMainFile, onChange }) {
  const mediaSlots = useMemo(
    () => slots.filter(s => ["video", "background", "intro", "image"].includes(s.kind)),
    [slots]
  );
  const clipSlots = useMemo(() => mediaSlots.filter(s => s.kind !== "image"), [mediaSlots]);
  const imageSlots = useMemo(() => mediaSlots.filter(s => s.kind === "image"), [mediaSlots]);
  const slotByKey = useMemo(() => Object.fromEntries(imageSlots.map(s => [s.key, s])), [imageSlots]);

  // per-slot state: { [slotKey]: { kind, file, assetId } | { kind, file, carousel:[…], fit } }
  const [media, setMedia] = useState({});
  const [mainSlot, setMainSlot] = useState(clipSlots[0]?.key || "");
  const inputs = useRef({});

  // ── AI story-image generation ──
  const [story, setStory] = useState("");           // the shared story/topic — drives EVERY image
  const [autoBusy, setAutoBusy] = useState(false);   // master "generate all" in flight
  const [autoErr, setAutoErr] = useState("");
  const [busyKey, setBusyKey] = useState("");        // which single slot is generating
  // per-slot: slideshow on/off (default = the template author's data-kaizer-carousel hint) + count
  const [slide, setSlide] = useState({});
  const [slideCount, setSlideCount] = useState({});  // {key: "" (=Auto) | "N"}

  const isSlide = (key) =>
    (key in slide) ? slide[key] : !!(slotByKey[key] && slotByKey[key].carousel);

  useEffect(() => {
    if (!clipSlots.find(s => s.key === mainSlot) && clipSlots[0]) setMainSlot(clipSlots[0].key);
  }, [slots]); // eslint-disable-line

  useEffect(() => {
    const templateMedia = {};
    for (const [k, v] of Object.entries(media)) {
      if (k === mainSlot) continue;
      if (Array.isArray(v.carousel) && v.carousel.length) {
        templateMedia[k] = { carousel: v.carousel, fit: v.fit || "cover" };  // slideshow slot
      } else if (v.assetId) {
        templateMedia[k] = v.assetId;                                        // single image/video
      }
    }
    const mainPicked = !!mainFile;
    const othersReady = mediaSlots.every(s => {
      if (s.key === mainSlot) return true;
      const m = media[s.key];
      if (!m) return true;                              // empty → uses the template default
      if (Array.isArray(m.carousel)) return true;       // slideshow (empty → default; non-empty → composited)
      return !m.file || !!m.assetId;                    // single: not still uploading
    });
    onChange?.({ templateMedia, mainSlot, ready: mainPicked && othersReady });
  }, [media, mainSlot, mainFile]); // eslint-disable-line

  async function pick(slot, file) {
    if (!file) return;
    if (slot.key === mainSlot && slot.kind !== "image") {
      onMainFile?.(file);
      setMedia(m => ({ ...m, [slot.key]: { kind: slot.kind, file, assetId: 0, uploading: false } }));
      return;
    }
    setMedia(m => ({ ...m, [slot.key]: { kind: slot.kind, file, assetId: 0, uploading: true, err: "" } }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", slot.kind === "image" ? "image" : "video");
      fd.append("folder_path", "custom_template_media");
      const asset = await api.uploadAsset(fd);
      setMedia(m => ({ ...m, [slot.key]: { kind: slot.kind, file, assetId: asset.id, uploading: false } }));
    } catch (e) {
      setMedia(m => ({ ...m, [slot.key]: { kind: slot.kind, file, assetId: 0, uploading: false, err: e.message || "upload failed" } }));
    }
  }

  function chooseMain(key) {
    setMainSlot(key);
    const m = media[key];
    onMainFile?.(m?.file || null);
  }

  function setMode(key, slideOn) {
    setSlide(s => ({ ...s, [key]: slideOn }));
    setMedia(m => { const n = { ...m }; delete n[key]; return n; });  // reset so the value matches the mode
  }

  // Generate story-relevant media for ONE image slot, per its single/slideshow mode.
  async function genForSlot(s, theStory) {
    if (isSlide(s.key)) {
      const raw = slideCount[s.key];
      const cnt = raw ? Math.max(1, Math.min(parseInt(raw, 10) || 0, 12)) : null;  // null = Auto
      const res = await api.aiGenerateBatch({ story: theStory, count: cnt });
      const frames = (res.assets || []).map(a => ({
        id: a.id, duration_s: 3, effect: "fade", effect_duration: 0.4 }));
      if (!frames.length) throw new Error("no images generated");
      setMedia(m => ({ ...m, [s.key]: {
        kind: "image", file: { name: `AI slideshow · ${frames.length} images` },
        carousel: frames, fit: "cover" } }));
    } else {
      const a = await api.aiGenerateAsset({ story: theStory });
      setMedia(m => ({ ...m, [s.key]: {
        kind: "image", file: { name: "AI · " + theStory.slice(0, 40) }, assetId: a.id } }));
    }
  }

  // Per-slot "Generate" button.
  async function genOne(s) {
    const t = story.trim();
    if (!t) return;
    setBusyKey(s.key); setAutoErr("");
    try { await genForSlot(s, t); }
    catch (e) { setAutoErr(`${imageLabel(s.key, imageSlots.indexOf(s))}: ${e.message || "generation failed"}`); }
    finally { setBusyKey(""); }
  }

  // Master: understand the template + fill EVERY image slot from the story in one go.
  // Single slots share one batch call (so each gets a DISTINCT beat); slideshow slots
  // each get their own story-driven sequence.
  async function genAll() {
    const t = story.trim();
    if (!t || imageSlots.length === 0) return;
    setAutoBusy(true); setAutoErr("");
    try {
      const singles = imageSlots.filter(s => !isSlide(s.key));
      const slides  = imageSlots.filter(s => isSlide(s.key));
      if (singles.length === 1) {
        await genForSlot(singles[0], t);
      } else if (singles.length > 1) {
        const res = await api.aiGenerateBatch({ story: t, count: singles.length });
        const got = res.assets || [];
        singles.forEach((s, i) => {
          const a = got[i];                       // distinct image per slot — never reuse (no dupes)
          if (a) setMedia(m => ({ ...m, [s.key]: {
            kind: "image", file: { name: "AI · " + t.slice(0, 40) }, assetId: a.id } }));
        });
        if (got.length < singles.length) {        // some image gens failed — say so, don't duplicate
          const miss = singles.length - got.length;
          setAutoErr(`Generated ${got.length} of ${singles.length} images — ${miss} slot${miss > 1 ? "s" : ""} kept the template default. Click Generate again to fill ${miss > 1 ? "them" : "it"}.`);
        }
      }
      for (const s of slides) { await genForSlot(s, t); }  // sequential — avoids rate-limit bursts
    } catch (e) {
      setAutoErr(e.message || "generation failed");
    } finally { setAutoBusy(false); }
  }

  if (mediaSlots.length === 0) {
    return <p className="text-gray-500 text-sm">This template has no media slots.</p>;
  }

  const stateLine = (m) =>
    m?.uploading ? "uploading…"
      : m?.err ? <span className="text-red-400">{m.err}</span>
      : Array.isArray(m?.carousel) && m.carousel.length ? <span className="text-fuchsia-300">slideshow · {m.carousel.length} images</span>
      : m?.file ? <span className="text-teal-300">{m.file.name}</span>
      : "no file — uses the template default";

  const row = (s, label, { isImage = false } = {}) => {
    const m = media[s.key] || {};
    const isMain = s.key === mainSlot && !isImage;
    const accept = isImage ? "image/*" : "video/*";
    const slideOn = isImage && isSlide(s.key);
    return (
      <div key={s.key} className="space-y-1.5">
        <div className={`rounded-xl border p-3 flex items-center gap-3
            ${isMain ? "border-orange-500/60 bg-orange-500/5" : "border-gray-700"}`}>
          {!isImage && (
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer shrink-0">
              <input type="radio" name="mainslot" checked={s.key === mainSlot}
                onChange={() => chooseMain(s.key)} />
              main
            </label>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium">{label}</div>
            <div className="text-[11px] text-gray-500">{stateLine(m)}</div>
          </div>
          {isImage && (
            <>
              {/* single ⇄ slideshow toggle — any image slot can become a story slideshow */}
              <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0 text-[11px]">
                <button type="button" onClick={() => setMode(s.key, false)}
                  className={`px-2.5 py-1.5 ${!slideOn ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}>
                  Single
                </button>
                <button type="button" onClick={() => setMode(s.key, true)}
                  className={`px-2.5 py-1.5 ${slideOn ? "bg-fuchsia-600 text-white" : "text-gray-400 hover:text-white"}`}>
                  Slideshow
                </button>
              </div>
              {slideOn && (
                <input type="number" min="1" max="12" value={slideCount[s.key] || ""}
                  onChange={(e) => setSlideCount(c => ({ ...c, [s.key]: e.target.value }))}
                  placeholder="Auto" title="How many images (blank = auto from the story)"
                  className="w-16 bg-black border border-gray-700 rounded px-2 py-1.5 text-white text-xs shrink-0" />
              )}
              <button type="button" disabled={!story.trim() || busyKey === s.key || autoBusy}
                onClick={() => genOne(s)}
                className="px-3 py-1.5 rounded-lg border border-fuchsia-500/50 text-fuchsia-300 text-xs hover:bg-fuchsia-500/10 disabled:opacity-40 shrink-0">
                {busyKey === s.key ? "…" : "✦ Generate"}
              </button>
            </>
          )}
          <button type="button" onClick={() => inputs.current[s.key]?.click()}
            className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 text-xs hover:border-teal-400 shrink-0">
            {m.file || (isMain && mainFile) ? "Change" : "Choose"}
          </button>
          <input ref={el => (inputs.current[s.key] = el)} type="file" className="hidden"
            accept={accept} onChange={(e) => pick(s, e.target.files?.[0] || null)} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {clipSlots.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            Video{clipSlots.length > 1 ? "s" : ""}
          </div>
          <p className="text-[11px] text-gray-500">
            Pick which clip is the <b className="text-gray-300">main</b> one — Kaizer AI-trims it; the rest are used as given.
          </p>
          {clipSlots.map((s) => row(s, clipLabel(s.kind, s.key)))}
        </div>
      )}

      {imageSlots.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            Image{imageSlots.length > 1 ? "s" : ""} <span className="text-gray-500">({imageSlots.length})</span>
          </div>

          {/* Story-driven AI fill — understands the template (single slot = 1 image,
              slideshow slot = as many as the story needs) and fills them all at once. */}
          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
            <div className="text-[12px] text-fuchsia-200/90 font-medium">
              ✦ Generate images from your story
            </div>
            <div className="text-[11px] text-fuchsia-200/70">
              Kaizer makes imagery <b>relevant to your story</b> — not literal drawings of these words.
              A <b>Single</b> slot gets one image; a <b>Slideshow</b> slot gets as many distinct images
              as the story needs (set a number, or leave Auto).
            </div>
            <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={2}
              placeholder="e.g. 'Heavy rains flood Hyderabad; IMD red alert for Telangana, schools shut, traffic snarled' — paste your headline / topic"
              className="w-full bg-black border border-gray-700 rounded px-2 py-1.5 text-white text-xs" />
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" disabled={!story.trim() || autoBusy || !!busyKey} onClick={genAll}
                className="px-3 py-1.5 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs disabled:opacity-50">
                {autoBusy ? "Generating…" : `✦ Generate images for ${imageSlots.length} slot${imageSlots.length > 1 ? "s" : ""}`}
              </button>
              <span className="text-[10px] text-gray-500">Saved to your Assets + placed in each slot. Or use ✦ Generate / Choose per slot below.</span>
            </div>
            {autoErr && <div className="text-[11px] text-red-400">{autoErr}</div>}
          </div>

          <p className="text-[11px] text-gray-500">
            <b className="text-gray-300">{imageSlots.length}</b> image slot{imageSlots.length > 1 ? "s" : ""} —
            generate from your story, upload your own, or leave blank to use the template&apos;s default.
          </p>
          {imageSlots.map((s, i) => row(s, imageLabel(s.key, i), { isImage: true }))}
        </div>
      )}
    </div>
  );
}
