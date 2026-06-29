import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import TemplateBuilder from "../pages/TemplateBuilder";

/**
 * CustomTemplateEditor — the editor panel for a CUSTOM-TEMPLATE job. Replaces the built-in
 * bulletin canvas editor (which doesn't apply to custom renders). Lets the operator:
 *   - edit the per-slot TEXT (headline / ticker / subtitle / ...) — overrides the AI text,
 *   - swap the per-slot MEDIA (images),
 *   - SWITCH to a different template (same kind),
 * then Save & re-render. State is persisted on the Job; both render paths honour it.
 *
 * Props: jobId, target ("bulletin"|"short"), index, onClose, onRendered (refresh callback).
 */
export default function CustomTemplateEditor({ jobId, target = "bulletin", index = 0, onClose, onRendered, onBuilderToggle }) {
  const [ctx, setCtx] = useState(null);
  const [err, setErr] = useState("");
  const [overrides, setOverrides] = useState({});   // {slot: text} the user set
  const [media, setMedia] = useState({});            // {slot: asset_id}
  const [layout, setLayout] = useState("");          // chosen template key (custom:<id>)
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState("");        // slotKey currently AI-generating
  const [status, setStatus] = useState("");
  const fileRefs = useRef({});
  // Inline visual builder (per-job design override)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderHtml, setBuilderHtml] = useState(null);
  const [builderCanvas, setBuilderCanvas] = useState([1080, 1920]);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);
  const designDirtyRef = useRef(false);   // a design was saved this session -> re-render on close

  const load = () =>
    api.v4GetCustomTemplate(jobId, target, index)
      .then((r) => {
        setCtx(r);
        if (!r || !r.is_custom) return;
        const ov = {};
        (r.text_slots || []).forEach((s) => { if (s.is_override) ov[s.key] = s.value || ""; });
        setOverrides(ov);
        setMedia({ ...(r.template_media || {}) });
        setLayout(r.layout || "");
        setHasOverride(!!r.has_html_override);
      })
      .catch((e) => setErr(e.message || "Failed to load template editor"));

  useEffect(() => { load(); }, [jobId, target, index]);

  if (err) return <Shell onClose={onClose}><div className="text-red-400 text-sm">⚠ {err}</div></Shell>;
  if (!ctx) return <Shell onClose={onClose}><div className="text-gray-400 text-sm">Loading template editor…</div></Shell>;
  if (!ctx.is_custom) {
    return <Shell onClose={onClose}><div className="text-gray-400 text-sm">This job doesn’t use a custom template.</div></Shell>;
  }

  const valueOf = (s) => (s.key in overrides ? overrides[s.key] : (s.value || ""));
  const setText = (key, v) => setOverrides((o) => ({ ...o, [key]: v }));
  const resetText = (key) => setOverrides((o) => { const n = { ...o }; delete n[key]; return n; });

  async function replaceMedia(slotKey, file) {
    if (!file) return;
    setStatus(`Uploading media for "${slotKey}"…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const asset = await api.uploadAsset(fd);
      if (asset && asset.id) setMedia((m) => ({ ...m, [slotKey]: asset.id }));
      setStatus("Media set — Save & re-render to apply.");
    } catch (e) { setStatus(`Upload failed: ${e.message || e}`); }
  }

  // ── image carousel (slideshow) per image slot ──
  const isCarousel = (v) => !!(v && typeof v === "object" && Array.isArray(v.carousel));
  function toggleCarousel(slotKey) {
    setMedia((m) => {
      const v = m[slotKey];
      if (isCarousel(v)) {                       // carousel -> single (keep first frame's asset)
        const first = (v.carousel[0] || {}).id;
        const n = { ...m }; if (first) n[slotKey] = first; else delete n[slotKey]; return n;
      }
      const frames = typeof v === "number"       // single -> carousel (seed with the current image)
        ? [{ id: v, duration_s: 3, effect: "fade", effect_duration: 0.4 }] : [];
      return { ...m, [slotKey]: { carousel: frames, fit: "cover" } };
    });
  }
  async function addCarouselFrame(slotKey, file) {
    if (!file) return;
    setStatus(`Uploading image for "${slotKey}"…`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const asset = await api.uploadAsset(fd);
      if (asset && asset.id) {
        setMedia((m) => {
          const v = m[slotKey];
          const frames = isCarousel(v) ? [...v.carousel] : [];
          frames.push({ id: asset.id, duration_s: 3, effect: "fade", effect_duration: 0.4 });
          return { ...m, [slotKey]: { carousel: frames, fit: (isCarousel(v) && v.fit) || "cover" } };
        });
        setStatus("Image added to the slideshow — Save & re-render to apply.");
      }
    } catch (e) { setStatus(`Upload failed: ${e.message || e}`); }
  }
  function updateFrame(slotKey, idx, patch) {
    setMedia((m) => {
      const v = m[slotKey]; if (!isCarousel(v)) return m;
      return { ...m, [slotKey]: { ...v, carousel: v.carousel.map((fr, i) => i === idx ? { ...fr, ...patch } : fr) } };
    });
  }
  function removeFrame(slotKey, idx) {
    setMedia((m) => {
      const v = m[slotKey]; if (!isCarousel(v)) return m;
      return { ...m, [slotKey]: { ...v, carousel: v.carousel.filter((_, i) => i !== idx) } };
    });
  }

  // Derive the story from THIS job's own text slots (headline + subtitle/body) so AI imagery
  // generated in the editor is relevant to the job — no pasting needed (the video is already
  // transcribed by this point, so its real story is available).
  function jobStory() {
    const slots = ctx.text_slots || [];
    const pick = (...names) => slots.find((s) => names.some((n) => (s.key || "").toLowerCase().includes(n)));
    const parts = [];
    const h = pick("headline", "title", "hook"); if (h) parts.push(valueOf(h));
    const sub = pick("subtitle", "summary", "body", "caption", "desc"); if (sub) parts.push(valueOf(sub));
    if (!parts.length) parts.push(slots.map((s) => valueOf(s)).filter(Boolean).join(". "));
    return parts.filter(Boolean).join(". ").trim();
  }

  // Generate story-relevant image(s) for a slot. asCarousel=true → a story-driven sequence
  // appended to the slideshow; else a single image.
  async function genStoryImage(slotKey, asCarousel, count) {
    const story = jobStory();
    if (!story) {
      setStatus("No story text on this job yet — edit a headline first, then generate.");
      return { ok: false, error: "No story text on this job yet — set a headline first." };
    }
    setGenBusy(slotKey);
    setStatus(asCarousel ? "Generating story images…" : "Generating story image…");
    try {
      let next = { ...media };
      let added = 0;
      if (asCarousel) {
        const res = await api.aiGenerateBatch({ story, count: count || null });
        const fresh = (res.assets || []).map((a) => ({ id: a.id, duration_s: 3, effect: "fade", effect_duration: 0.4 }));
        if (!fresh.length) { setStatus("No images generated — try again."); return { ok: false, error: "No images generated — try again." }; }
        const v = next[slotKey];
        const frames = isCarousel(v) ? [...v.carousel, ...fresh] : fresh;
        next = { ...next, [slotKey]: { carousel: frames, fit: (isCarousel(v) && v.fit) || "cover" } };
        added = fresh.length;
      } else {
        const a = await api.aiGenerateAsset({ story });
        if (!a || !a.id) { setStatus("No image generated — try again."); return { ok: false, error: "No image generated — try again." }; }
        next = { ...next, [slotKey]: a.id };
        added = 1;
      }
      setMedia(next);
      designDirtyRef.current = true;
      // Persist NOW so closing/navigating can't lose it (mirrors handleSlotMedia); the
      // close → saveAndRender still applies it visually. Non-fatal if this one call fails.
      try { await api.v4SaveCustomTemplate(jobId, { target, template_media: next }); } catch { /* retried on save */ }
      setStatus(asCarousel ? `Added ${added} story images — Save & re-render to apply.`
                           : "Story image set — Save & re-render to apply.");
      return { ok: true, count: added };
    } catch (e) {
      setStatus(`Generation failed: ${e.message || e}`);
      return { ok: false, error: e.message || String(e) };
    } finally { setGenBusy(""); }
  }

  async function saveAndRender() {
    setBusy(true); setStatus("Saving…");
    try {
      const body = { target, overrides, template_media: media };
      if (layout !== (ctx.layout || "")) body.layout = layout;     // template switch
      await api.v4SaveCustomTemplate(jobId, body);
      setStatus("Re-rendering…");
      await api.v4TriggerRender(jobId, { target, index });
      // poll render state
      let done = false;
      for (let i = 0; i < 120 && !done; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          const st = await api.v4RenderState(jobId);
          const s = (st && (st.state || st.status)) || "";
          setStatus(`Re-rendering… (${s || "working"})`);
          if (s === "done") { done = true; }
          else if (s === "failed") { setStatus("Render failed — see logs."); break; }
        } catch { /* keep polling */ }
      }
      if (done) {
        setStatus("Done ✓ updated.");
        await load();
        if (onRendered) onRendered();
      }
    } catch (e) { setStatus(`Failed: ${e.message || e}`); }
    finally { setBusy(false); }
  }

  // ── inline visual builder (per-job design override) ──
  async function openBuilder() {
    setBuilderBusy(true); setStatus("Opening the design editor…");
    try {
      const r = await api.v4GetJobCustomHtml(jobId, target, index);
      if (!r || !r.is_custom || !r.html) { setStatus("Couldn’t open the design editor."); return; }
      setBuilderHtml(r.html);
      setBuilderCanvas(Array.isArray(r.canvas) && r.canvas.length === 2 ? r.canvas : [1080, 1920]);
      setHasOverride(!!r.is_override);
      setBuilderOpen(true); setStatus("");
      if (onBuilderToggle) onBuilderToggle(true);   // let the canvas editor grow the panel
    } catch (e) { setStatus(`Failed to open: ${e.message || e}`); }
    finally { setBuilderBusy(false); }
  }
  // Called by the embedded builder's Save — persists this job's design (parent untouched).
  async function saveDesign(html) {
    await api.v4SaveJobCustomHtml(jobId, { target, index, html });
    setHasOverride(true);
    designDirtyRef.current = true;   // mark so closing applies it via a re-render
  }
  // Called when the operator uploads a VIDEO into a slot in the builder — record it on the
  // job's per-slot media (template_media) so the renderer composites it. assetId null = clear.
  async function handleSlotMedia(slotKey, assetId) {
    if (!slotKey) return;
    const next = { ...media };
    if (assetId) next[slotKey] = assetId; else delete next[slotKey];
    setMedia(next);
    designDirtyRef.current = true;
    try { await api.v4SaveCustomTemplate(jobId, { target, template_media: next }); }
    catch (e) { setStatus(`Couldn't save slot media: ${e.message || e}`); }
  }
  function closeBuilder() {
    setBuilderOpen(false); setBuilderHtml(null);
    if (onBuilderToggle) onBuilderToggle(false);
    // If a design was saved, APPLY it now (re-render) so the preview reflects the edit —
    // a saved design otherwise only shows after the next render, which reads as "not applying".
    if (designDirtyRef.current) {
      designDirtyRef.current = false;
      setStatus("Applying your design — re-rendering…");
      saveAndRender();
    }
  }
  async function resetDesign() {
    setBusy(true); setStatus("Reverting to the original template…");
    try {
      await api.v4SaveJobCustomHtml(jobId, { target, index, html: "" });
      setHasOverride(false);
      setStatus("Reverted to the template design — Save & re-render to apply.");
    } catch (e) { setStatus(`Failed: ${e.message || e}`); }
    finally { setBusy(false); }
  }

  return (
   <>
    <Shell onClose={onClose} title={`Custom template: ${ctx.template?.name || ""}`}>
      <div className="flex gap-4">
        {/* left: preview thumbnail */}
        <div className="w-40 shrink-0">
          {ctx.template?.preview_url && (
            <img src={ctx.template.preview_url} alt="" className="w-full rounded-lg border border-gray-700 object-cover" />
          )}
          <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">
            {ctx.kind === "full" ? "Full-form 16:9" : "Short 9:16"}
          </div>
          {String(layout || ctx.layout || "").startsWith("custom:") && (
            <>
              <button type="button" onClick={openBuilder} disabled={builderBusy}
                className="mt-3 w-full text-[11px] px-2 py-2 rounded-lg border border-teal-600/60 text-teal-300
                           hover:border-teal-400 hover:bg-teal-500/10 font-medium disabled:opacity-50">
                {builderBusy ? "Opening…" : "✎ Edit design for this job"}
              </button>
              {hasOverride && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-emerald-300">
                  <span>✓ Custom design active</span>
                  <button type="button" onClick={resetDesign} disabled={busy}
                    className="text-gray-400 hover:text-white underline disabled:opacity-40">reset to template</button>
                </div>
              )}
              <p className="text-[9.5px] text-gray-600 mt-1 leading-snug">
                Move · resize · recolor · add elements · layers — opens the visual builder right here,
                loaded with THIS job’s text. Edits apply to <b className="text-gray-400">this job only</b>;
                the template stays unchanged. Save &amp; re-render to apply.
              </p>
            </>
          )}
        </div>

        {/* right: controls */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* switch template */}
          {Array.isArray(ctx.options) && ctx.options.length > 1 && (
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Template</label>
              <select value={layout} onChange={(e) => setLayout(e.target.value)}
                className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                {ctx.options.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
              </select>
              {layout !== (ctx.layout || "") && (
                <div className="text-[11px] text-amber-300 mt-1">Switches template on Save &amp; re-render.</div>
              )}
            </div>
          )}

          {/* per-slot text */}
          {(ctx.text_slots || []).length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">On-screen text</div>
              <div className="space-y-2">
                {ctx.text_slots.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-gray-400 capitalize">{s.key}</label>
                      {s.key in overrides && (
                        <button type="button" onClick={() => resetText(s.key)}
                          className="text-[10px] text-teal-400 hover:underline">reset to auto</button>
                      )}
                    </div>
                    <textarea rows={s.key === "body" || s.key === "ticker" ? 2 : 1}
                      value={valueOf(s)} onChange={(e) => setText(s.key, e.target.value)}
                      className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm resize-y" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* per-slot media */}
          {(ctx.image_slots || []).length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Images</div>
              <div className="space-y-2">
                {ctx.image_slots.map((s) => {
                  const val = media[s.key];
                  const car = isCarousel(val);
                  return (
                    <div key={s.key} className="rounded border border-gray-800 p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 capitalize flex-1">{s.key}</span>
                        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={car} onChange={() => toggleCarousel(s.key)} /> slideshow
                        </label>
                      </div>
                      {!car ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 flex-1 truncate">
                            {val ? `asset #${val}` : "auto (story image)"}
                          </span>
                          <input type="file" accept="image/*" className="hidden"
                            ref={(el) => (fileRefs.current[s.key] = el)}
                            onChange={(e) => replaceMedia(s.key, e.target.files?.[0])} />
                          <button type="button" disabled={genBusy === s.key} onClick={() => genStoryImage(s.key, false)}
                            title="Generate an image relevant to this job's story"
                            className="text-[11px] px-2 py-1 rounded border border-fuchsia-500/50 text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-40">
                            {genBusy === s.key ? "…" : "✦ Generate"}
                          </button>
                          <button type="button" onClick={() => fileRefs.current[s.key]?.click()}
                            className="text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-gray-500">
                            Replace
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {(val.carousel || []).map((fr, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-gray-500 w-8 shrink-0">#{i + 1}</span>
                              <span className="text-gray-500 flex-1 truncate">asset {fr.id}</span>
                              <input type="number" step="0.5" min="0.5" value={fr.duration_s}
                                onChange={(e) => updateFrame(s.key, i, { duration_s: parseFloat(e.target.value) || 3 })}
                                title="seconds on screen"
                                className="w-11 bg-[#0d1119] border border-gray-700 rounded px-1 py-0.5 text-white" />
                              <span className="text-gray-600">s</span>
                              <select value={fr.effect || "fade"}
                                onChange={(e) => updateFrame(s.key, i, { effect: e.target.value })}
                                className="bg-[#0d1119] border border-gray-700 rounded px-1 py-0.5 text-white">
                                <option value="fade">Fade</option>
                                <option value="cut">Cut</option>
                                <option value="slide_left">Slide ◀</option>
                                <option value="slide_right">Slide ▶</option>
                                <option value="zoom_in">Zoom</option>
                              </select>
                              <button type="button" onClick={() => removeFrame(s.key, i)}
                                className="text-red-400 hover:text-red-300 px-1">✕</button>
                            </div>
                          ))}
                          <input type="file" accept="image/*" className="hidden"
                            ref={(el) => (fileRefs.current["car_" + s.key] = el)}
                            onChange={(e) => { addCarouselFrame(s.key, e.target.files?.[0]); e.target.value = ""; }} />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button type="button" disabled={genBusy === s.key} onClick={() => genStoryImage(s.key, true)}
                              title="Generate as many story-relevant images as this story needs"
                              className="text-[11px] px-2 py-1 rounded border border-fuchsia-500/50 text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-40">
                              {genBusy === s.key ? "Generating…" : "✦ Auto-fill from story"}
                            </button>
                            <button type="button" onClick={() => fileRefs.current["car_" + s.key]?.click()}
                              className="text-[11px] px-2 py-1 rounded border border-teal-600/60 text-teal-300 hover:bg-teal-500/10">
                              + Add image
                            </button>
                          </div>
                          {(val.carousel || []).length === 0 && (
                            <p className="text-[9.5px] text-gray-600">Add 2+ images (or ✦ Auto-fill from story) — they play in order while the video runs.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-400">{status}</span>
            <button type="button" disabled={busy} onClick={saveAndRender}
              className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm disabled:opacity-50">
              {busy ? "Working…" : "Save & re-render"}
            </button>
          </div>
        </div>
      </div>
    </Shell>

    {/* Inline visual builder — full-screen overlay, loaded with THIS job's HTML. Saving
        stores a per-job design override (parent template untouched); render applies it. */}
    {builderOpen && builderHtml != null && (
      <div className="absolute inset-0 z-[70] bg-[#0b0e14] rounded overflow-hidden">
        <TemplateBuilder
          embedHtml={builderHtml}
          embedCanvas={builderCanvas}
          embedTitle={`Edit design · ${ctx.template?.name || "template"} — this job only`}
          embedSaveLabel="Save design for this job"
          onEmbedSave={saveDesign}
          onEmbedClose={closeBuilder}
          onSlotMedia={handleSlotMedia}
          slotMedia={media}
          onSlotGenerate={async (slotKey, opts) => {
            const r = await genStoryImage(slotKey, opts.asCarousel, opts.count);
            if (!r || !r.ok) throw new Error((r && r.error) || "generation failed");
            return r;
          }}
        />
      </div>
    )}
   </>
  );
}

function Shell({ children, onClose, title }) {
  return (
    <div className="absolute inset-0 z-20 bg-[#0b0e14]/95 backdrop-blur-sm overflow-y-auto p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-sm">{title || "Custom template editor"}</h3>
        {onClose && (
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-2">✕ Close</button>
        )}
      </div>
      {children}
    </div>
  );
}
