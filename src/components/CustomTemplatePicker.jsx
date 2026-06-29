import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import TemplateGuide from "./TemplateGuide";
import TemplatePreview from "./TemplatePreview";

/**
 * CustomTemplatePicker — developer-uploaded HTML/CSS templates.
 * Shows the user's private templates + everyone's public ones, an "Upload template"
 * tile, and per-template owner controls (public/private toggle, delete).
 *
 * Props:
 *   selectedKey : currently selected frame key (e.g. "custom:12" or a builtin key)
 *   onSelect    : (key) => void   — called with "custom:<id>" when a card is picked
 *   kind        : "short" | "full" | undefined — when set, only templates of that
 *                 output form are shown (the server filters by canvas aspect). Drives
 *                 the kind-first wizard: a Short job never even sees full-form templates.
 */
export default function CustomTemplatePicker({ selectedKey, onSelect, browseMode = false, kind }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [preview, setPreview] = useState(null);
  const isFull = kind === "full";

  const reload = () => {
    setLoading(true);
    return api.listTemplates(kind ? { kind } : undefined)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  // Refetch when the required kind changes (e.g. user switches Short ↔ Full video).
  useEffect(() => { reload(); }, [kind]);

  const mine = items.filter((t) => t.mine);
  const community = items.filter((t) => !t.mine);

  // Showcase (Library browse) = Pinterest-style MASONRY so mixed 16:9 / 9:16 / 1:1 / 4:5
  // template previews pack by height instead of leaving ragged gaps in a uniform grid.
  // (CSS multi-column: gap-3 = column gutter, mb-3 = row gutter, break-inside-avoid keeps
  // a card whole.) The New Job selection flow keeps the predictable uniform grid.
  const gridCls = browseMode
    ? "columns-2 sm:columns-3 md:columns-4 gap-3 [&>*]:mb-3 [&>*]:block [&>*]:w-full [&>*]:break-inside-avoid"
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3";

  async function toggleVisibility(t, e) {
    e.stopPropagation();
    const next = t.visibility === "public" ? "private" : "public";
    try { await api.patchTemplate(t.id, { visibility: next }); reload(); } catch {}
  }
  async function remove(t, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await api.deleteTemplate(t.id); reload(); } catch {}
  }

  const Card = ({ t }) => {
    const sel = selectedKey === t.key;
    const invalid = t.status === "invalid";
    return (
      <button
        type="button"
        onClick={() => browseMode ? setPreview(t) : (!invalid && onSelect(t.key, t))}
        className={`relative text-left rounded-xl overflow-hidden border transition group
          ${sel ? "border-orange-500 ring-2 ring-orange-500/50" : "border-gray-700 hover:border-gray-500"}
          ${invalid ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <div className={`${t.kind === "full" ? "aspect-video" : "aspect-[9/16]"} bg-black flex items-center justify-center overflow-hidden`}>
          {t.preview_url
            ? <img src={t.preview_url} alt={t.name} className="w-full h-full object-cover" />
            : <span className="text-gray-600 text-xs">no preview</span>}
          {/* expand → full preview + details */}
          <span onClick={(e) => { e.stopPropagation(); setPreview(t); }} title="Preview & details"
            className="absolute bottom-1.5 right-1.5 text-[11px] px-2 py-1 rounded-md bg-black/70
                       text-white opacity-0 group-hover:opacity-100 transition cursor-pointer">
            ⤢ Preview
          </span>
        </div>
        <div className="p-2 bg-[#151922]">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${t.kind === "full"
              ? "bg-indigo-600/80 text-white" : "bg-pink-600/80 text-white"}`}>
              {t.kind === "full" ? "FULL" : "SHORT"}
            </span>
            <div className="text-sm text-white font-medium truncate">{t.name}</div>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {t.video_slots} video{t.video_slots !== 1 ? "s" : ""}
            {t.image_slots ? ` · ${t.image_slots} img` : ""}
            {` · ${t.canvas[0]}×${t.canvas[1]}`}
          </div>
          {invalid && <div className="text-[11px] text-red-400 mt-0.5">⚠ no video slot</div>}
        </div>
        {/* visibility badge */}
        <span className={`absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold
          ${t.visibility === "public" ? "bg-emerald-600/90 text-white" : "bg-gray-900/80 text-gray-300"}`}>
          {t.visibility === "public" ? "Public" : "Private"}
        </span>
        {t.mine && (
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
            <span onClick={(e) => { e.stopPropagation(); window.open(`/builder/${t.id}`, "_blank"); }} title="Edit in the visual builder"
              className="text-[10px] px-1.5 py-0.5 rounded bg-teal-600/90 text-white cursor-pointer">✎ Edit</span>
            <span onClick={(e) => toggleVisibility(t, e)} title="Toggle public/private"
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/90 text-white cursor-pointer">
              {t.visibility === "public" ? "Make private" : "Publish"}
            </span>
            <span onClick={(e) => remove(t, e)} title="Delete"
              className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/90 text-white cursor-pointer">✕</span>
          </div>
        )}
      </button>
    );
  };

  const UploadTile = () => (
    <button type="button" onClick={() => setShowUpload(true)}
      className={`${isFull ? "aspect-video" : "aspect-[9/16]"} rounded-xl border-2 border-dashed border-gray-600 hover:border-teal-400
        flex flex-col items-center justify-center text-gray-400 hover:text-teal-300 transition`}>
      <span className="text-3xl">＋</span>
      <span className="text-xs mt-1 px-2 text-center">Upload your<br/>own template</span>
    </button>
  );

  const BuildTile = () => (
    <button type="button" onClick={() => window.open("/builder", "_blank")}
      title="Open the visual drag-and-drop builder"
      className={`${isFull ? "aspect-video" : "aspect-[9/16]"} rounded-xl border-2 border-dashed border-teal-600/50 hover:border-teal-400
        flex flex-col items-center justify-center text-teal-400 hover:text-teal-300 transition`}>
      <span className="text-3xl">✎</span>
      <span className="text-xs mt-1 px-2 text-center">Build a template<br/>(drag &amp; drop)</span>
    </button>
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-white font-semibold">
            {kind === "short" ? "Short templates (9:16)"
              : kind === "full" ? "Full-form templates (16:9)"
              : "Custom templates"}
          </h3>
          {kind && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              Only {isFull ? "full-form (landscape)" : "short (portrait)"} templates are shown — a template
              is categorised automatically from its canvas.
            </p>
          )}
        </div>
        <button type="button" onClick={() => setShowGuide(true)}
           className="text-xs text-teal-400 hover:underline">How to build one →</button>
      </div>
      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className={gridCls}>
            <BuildTile />
            <UploadTile />
            {mine.map((t) => <Card key={t.id} t={t} />)}
          </div>
          {community.length > 0 && (
            <>
              <div className="text-gray-400 text-xs mt-5 mb-2 uppercase tracking-wide">Community templates</div>
              <div className={gridCls}>
                {community.map((t) => <Card key={t.id} t={t} />)}
              </div>
            </>
          )}
        </>
      )}
      {showUpload && (
        <UploadModal
          expectKind={kind}
          onClose={() => setShowUpload(false)}
          onShowGuide={() => setShowGuide(true)}
          onUploaded={(t) => {
            setShowUpload(false);
            reload();
            if (!t?.key) return;
            // Library/browse: STAY in the Templates section and open the new template's
            // preview — never fire onSelect (which navigates to /new-job).
            if (browseMode) { setPreview(t); return; }
            // The template's kind is detected from its canvas. If it doesn't match the
            // slot we're picking for (e.g. uploaded a landscape template into the Short
            // picker), don't auto-select it — tell the user where it landed.
            if (kind && t.kind && t.kind !== kind) {
              window.alert(
                `"${t.name}" was categorised as a ${t.kind === "full" ? "FULL-FORM (16:9)" : "SHORT (9:16)"} template ` +
                `based on its canvas, so it can't be used as a ${isFull ? "full-form video" : "short"}. ` +
                `It's saved in your library under the ${t.kind === "full" ? "Full video" : "Short"} kind.`
              );
              return;
            }
            onSelect(t.key, t);
          }}
        />
      )}
      {showGuide && <TemplateGuide onClose={() => setShowGuide(false)} />}
      {preview && (
        <TemplatePreview
          template={preview}
          onClose={() => setPreview(null)}
          onUse={(t) => { setPreview(null); if (t.status !== "invalid") onSelect(t.key, t); }}
        />
      )}
    </div>
  );
}

// Read the canvas size out of pasted/loaded HTML so the live preview matches the real
// output aspect (falls back to a 9:16 short).
function parseCanvas(html) {
  const m = /kaizer:canvas[^>]*content=["']?\s*(\d{2,5})\s*[x×]\s*(\d{2,5})/i.exec(html || "");
  return m ? { w: +m[1], h: +m[2] } : { w: 1080, h: 1920 };
}

/** A safe, scaled-down live preview of the template HTML, rendered in a fully sandboxed
 *  iframe (sandbox="" → no scripts/forms run, matching the JS-stripped final render). */
function PreviewFrame({ code }) {
  const { w, h } = parseCanvas(code);
  const MAXW = 240, MAXH = 430;
  const scale = Math.min(MAXW / w, MAXH / h);
  return (
    <div className="rounded-lg border border-gray-700 bg-black overflow-hidden shrink-0"
         style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}>
      <iframe title="template preview" sandbox="" srcDoc={code}
        style={{ width: w, height: h, transform: `scale(${scale})`,
                 transformOrigin: "top left", border: 0, background: "#000" }} />
    </div>
  );
}

function UploadModal({ onClose, onUploaded, onShowGuide, expectKind }) {
  const [mode, setMode] = useState("file");      // "file" | "paste"
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");  // text of a chosen .html (for preview)
  const [code, setCode] = useState("");          // pasted template HTML
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [whenUse, setWhenUse] = useState("");
  const [howUse, setHowUse] = useState("");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [review, setReview] = useState(null);   // {res, warnings} held so the user sees the slot check
  const inputRef = useRef(null);

  // Choosing a file: if it's a single .html, read it so we can preview it before upload.
  function onPickFile(f) {
    setFile(f); setFilePreview(""); setErr("");
    if (f && /\.html?$/i.test(f.name)) {
      const r = new FileReader();
      r.onload = () => setFilePreview(String(r.result || ""));
      r.readAsText(f);
    }
  }

  const previewCode = mode === "paste" ? code : filePreview;
  const canPreview = !!(previewCode && previewCode.trim());

  async function submit() {
    const pasting = mode === "paste";
    if (pasting && !code.trim()) { setErr("Paste your template HTML."); return; }
    if (!pasting && !file) { setErr("Choose a .zip or .html file."); return; }
    setBusy(true); setErr(""); setPct(0);
    const fd = new FormData();
    if (pasting) {
      fd.append("code", code);
      fd.append("name", name || "Pasted template");
    } else {
      fd.append("file", file);
      fd.append("name", name || file.name.replace(/\.(zip|html?)$/i, ""));
    }
    fd.append("visibility", visibility);
    if (whenUse.trim()) fd.append("when_to_use", whenUse.trim());
    if (howUse.trim()) fd.append("how_to_use", howUse.trim());
    try {
      const res = await api.uploadTemplate(fd, setPct);
      if (res?.warnings?.length) {
        // Hold and show the upload-time slot check (what fills each slot / what stays blank)
        // so the developer sees how their placeholders will be handled before continuing.
        setReview({ res, warnings: res.warnings });
      } else {
        onUploaded(res);
      }
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally { setBusy(false); }
  }

  // Post-upload review screen: the system understood the template — here's the slot check.
  if (review) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-[#151922] border border-gray-700 rounded-2xl w-full max-w-md p-5"
             onClick={(e) => e.stopPropagation()}>
          <h3 className="text-white font-semibold text-lg">Template added ✓</h3>
          <p className="text-gray-400 text-xs mt-1">
            We checked your template and understood its slots. Here&apos;s how they&apos;ll be filled at render:
          </p>
          <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
            {review.warnings.map((w, i) => (
              <div key={i} className="text-[12px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25
                                      rounded-lg px-2.5 py-1.5">{w}</div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => onUploaded(review.res)}
              className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm">
              Got it — use template
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-[#151922] border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh]
                      overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-semibold text-lg">Add a template</h3>
            <p className="text-gray-400 text-xs mt-1">
              Upload a file or paste your HTML. Mark slots with <code>data-kaizer="video|headline|…"</code>.{" "}
              <button type="button" onClick={onShowGuide}
                 className="text-teal-400 hover:underline">See the rules</button>.
            </p>
          </div>
          {/* file ↔ paste tabs */}
          <div className="flex gap-1 bg-[#0d1119] border border-gray-700 rounded-lg p-1 shrink-0">
            {[["file", "📦 Upload file"], ["paste", "✎ Paste code"]].map(([m, lbl]) => (
              <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition
                  ${mode === m ? "bg-orange-500/20 text-orange-200" : "text-gray-400 hover:text-white"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {expectKind && (
          <p className="mt-3 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            For a <b>{expectKind === "full" ? "full-form video" : "short"}</b>, set
            <code className="mx-1">{`<meta name="kaizer:canvas" content="${expectKind === "full" ? "1920x1080" : "1080x1920"}">`}</code>
            — the kind is detected from the canvas, so a {expectKind === "full" ? "portrait" : "landscape"} template
            won't be usable here.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_260px] gap-5">
          {/* ── left: inputs ── */}
          <div className="min-w-0">
            {mode === "file" ? (
              <div onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 hover:border-teal-400 rounded-xl
                  p-6 text-center cursor-pointer">
                <div className="text-2xl">📦</div>
                <div className="text-sm text-gray-300 mt-1">
                  {file ? <span className="text-teal-300 font-medium">{file.name}</span> : "Click to choose a .zip / .html"}
                </div>
                <input ref={inputRef} type="file" accept=".zip,.html,.htm" className="hidden"
                       onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Paste your template HTML</label>
                <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={12} spellCheck={false}
                  placeholder={'<!DOCTYPE html>\n<html>\n  <head><meta name="kaizer:canvas" content="1080x1920"></head>\n  <body> … your design with data-kaizer slots … </body>\n</html>'}
                  className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white
                             text-[12px] font-mono resize-y leading-relaxed" />
                <p className="text-[11px] text-gray-500 mt-1">
                  HTML + CSS only (JS &amp; external links are stripped). For bundled gifs/fonts, upload a .zip instead.
                </p>
              </div>
            )}

            <label className="block text-xs text-gray-400 mt-4 mb-1">Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="My news layout"
              className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />

            <label className="block text-xs text-gray-400 mt-4 mb-1">When to use (optional)</label>
            <textarea value={whenUse} onChange={(e) => setWhenUse(e.target.value)} rows={2}
              placeholder="e.g. Breaking-news shorts with a single talking-head clip."
              className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-y" />

            <label className="block text-xs text-gray-400 mt-3 mb-1">How to use (optional)</label>
            <textarea value={howUse} onChange={(e) => setHowUse(e.target.value)} rows={3}
              placeholder="e.g. Pick this template, upload your main clip, set the headline. Two video slots: main + reaction."
              className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-y" />

            <div className="mt-4">
              <span className="block text-xs text-gray-400 mb-1">Visibility</span>
              <div className="flex gap-2">
                {["private", "public"].map((v) => (
                  <button key={v} type="button" onClick={() => setVisibility(v)}
                    className={`flex-1 py-2 rounded-lg text-sm border
                      ${visibility === v ? "border-orange-500 bg-orange-500/10 text-white"
                                          : "border-gray-700 text-gray-400"}`}>
                    {v === "private" ? "Private (only me)" : "Public (everyone)"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── right: live preview ── */}
          <div className="min-w-0">
            <div className="text-xs text-gray-400 mb-1.5">Live preview</div>
            {canPreview ? (
              <>
                <PreviewFrame code={previewCode} />
                <p className="text-[10.5px] text-gray-500 mt-1.5 leading-snug">
                  {(() => { const c = parseCanvas(previewCode);
                    return `${c.w}×${c.h} · ${c.w >= c.h ? "Full (16:9)" : "Short (9:16)"}`; })()}.
                  Shows your HTML+CSS; bundled assets &amp; external URLs don&apos;t load here — they&apos;re handled at render.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-[#0d1119]
                              h-[300px] flex items-center justify-center text-center px-3">
                <span className="text-gray-600 text-xs">
                  {mode === "paste"
                    ? "Paste HTML to see a live preview here."
                    : file ? "Zip preview is generated after upload (assets render server-side)."
                           : "Choose a .html file to preview it here."}
                </span>
              </div>
            )}
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-red-400">⚠ {err}</div>}
        {busy && (
          <div className="mt-3 h-2 bg-[#0d1119] rounded overflow-hidden">
            <div className="h-full bg-gradient-to-r from-orange-500 to-teal-400" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2 rounded-lg text-gray-300 hover:bg-white/5 text-sm">Cancel</button>
          <button type="button" onClick={submit}
            disabled={busy || (mode === "file" ? !file : !code.trim())}
            className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm disabled:opacity-50">
            {busy ? "Adding…" : "Add & validate"}
          </button>
        </div>
      </div>
    </div>
  );
}
