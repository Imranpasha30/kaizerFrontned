/**
 * TemplateBuilder — a visual, drag-and-drop editor for custom video templates.
 *
 * You edit the template's HTML through a UI (and a raw-code view): click any element to
 * select it, drag to move it (with snapping + alignment guides), drag its corner/edge
 * handles to resize, reorder/hide via the Layers panel, tweak text/color/font/size/
 * position/rotation/shadow/border + its slot binding in the inspector, drop new elements
 * from the palette, and undo/redo. The iframe DOM is the single source of truth; on Save we
 * serialize clean HTML (handles/guides/editor ids stripped) and PUT it back (sanitized +
 * re-discovered + preview-regenerated server-side). Render to MP4 happens later, on export —
 * here we only ever touch HTML, so editing is instant and re-editable.
 *
 * Routes: /builder (new — pick a ratio) and /builder/:tid (edit an existing template).
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";

const RATIOS = [
  ["9:16 Short", 1080, 1920],
  ["16:9 Full", 1920, 1080],
  ["1:1 Square", 1080, 1080],
  ["4:5 Portrait", 1080, 1350],
];

// What you can drop onto the canvas. Each produces a data-kaizer-marked element.
const PALETTE = [
  { t: "headline", label: "Headline", bind: "headline", kind: "text", html: "Headline" },
  { t: "subtitle", label: "Subtitle", bind: "subtitle", kind: "text", html: "Subtitle text" },
  { t: "kicker", label: "Kicker", bind: "kicker", kind: "text", html: "KICKER" },
  { t: "ticker", label: "Ticker", bind: "ticker", kind: "text", html: "Ticker text" },
  { t: "cta", label: "CTA", bind: "cta", kind: "text", html: "Tap to watch" },
  { t: "image", label: "Image", bind: "image", kind: "media" },
  { t: "video", label: "Video", bind: "video", kind: "media" },
  { t: "background", label: "Background", bind: "background", kind: "media" },
  { t: "logo", label: "Logo", bind: "logo", kind: "brand" },
  { t: "watermark", label: "Watermark", bind: "watermark", kind: "brand", html: "watermark" },
  { t: "shape", label: "Shape", bind: "", kind: "shape" },
];

const BIND_OPTIONS = ["", "video", "video:main", "background", "image", "image:2", "image:3",
                      "headline", "subtitle", "ticker", "kicker", "cta", "logo", "watermark"];

// Editor-only stylesheet injected into the iframe so empty media slots are visible while
// designing. STRIPPED on serialize so it never reaches the saved/rendered HTML.
const EDITOR_CSS = `
  #kx-ed-sel{ outline:2px solid #3ad1c8 !important; outline-offset:-2px !important; }
  [data-kaizer^="video"],[data-kaizer="background"]{
    background-image:repeating-linear-gradient(45deg,#1c2230 0 14px,#222a3a 14px 28px) !important;
    background-color:#161b27 !important; }
  [data-kaizer^="video"]::after,[data-kaizer="background"]::after{
    content:"▶ video"; position:absolute; inset:0; display:flex; align-items:center;
    justify-content:center; color:#7aa; font:600 22px sans-serif; letter-spacing:.1em; }
  [data-kaizer^="image"]:empty::after{ content:"🖼 image"; position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center; color:#789; font:600 18px sans-serif;
    background:#141c2b; }
  [data-kaizer="logo"]:empty::after,[data-kaizer="watermark"]:empty::after{ content:"logo";
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    color:#789; font:600 14px sans-serif; outline:1px dashed #456; }
  /* a slot with operator-uploaded media ("use as-is"): drop the "▶ video"/"🖼 image"
     placeholder label so the real image (set inline with !important) shows in the builder. */
  [data-kaizer-fixed="1"]::after{ content:none !important; display:none !important; }
  /* a slot showing a live uploaded-video preview: hide its placeholder + stripes behind it. */
  [data-kaizer]:has(> video.kx-vid-preview)::after{ content:none !important; display:none !important; }
  [data-kaizer]:has(> video.kx-vid-preview){ background-image:none !important; }
`;

// 8 resize handles at the corners + edge midpoints, positioned as % of the element box.
const HANDLE_DIRS = [
  ["nw", 0, 0], ["n", 50, 0], ["ne", 100, 0], ["e", 100, 50],
  ["se", 100, 100], ["s", 50, 100], ["sw", 0, 100], ["w", 0, 50],
];

function px(v) { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : 0; }
function rotOf(el) { const m = /rotate\(\s*(-?[\d.]+)deg/.exec(el.style.transform || ""); return m ? parseFloat(m[1]) : 0; }

// Normalize any CSS color token (#rgb / #rrggbb[aa] / rgb()/rgba()) to a #rrggbb for the
// native <input type=color> swatch; falls back to #000000 for transparent/named/unknown.
function toHexColor(v) {
  if (!v) return "#000000";
  const s = String(v).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return "#" + m[1].split("").map((c) => c + c).join("");
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);
  if (m) return "#" + m[1].toLowerCase();
  m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return "#" + [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, +n)).toString(16).padStart(2, "0")).join("");
  return "#000000";
}
// Distinct color tokens used across the template's <style> blocks + element inline styles —
// powers the "Template colors" palette (recolor each one everywhere).
const _COLOR_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;
function collectColors(doc) {
  if (!doc) return [];
  const counts = new Map();
  const add = (tok) => { const k = (tok || "").trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); };
  doc.querySelectorAll("style:not(#kx-ed-style)").forEach((s) => (String(s.textContent).match(_COLOR_RE) || []).forEach(add));
  doc.querySelectorAll("[style]").forEach((el) => {
    if (el.classList && (el.classList.contains("kx-handle") || el.classList.contains("kx-guide"))) return;
    (String(el.getAttribute("style")).match(_COLOR_RE) || []).forEach(add);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token, count]) => ({ token, count, hex: toHexColor(token) }));
}

// Editor overlay nodes (handles + snap guides) live INSIDE the iframe but are stripped on
// serialize and excluded from the text-edit child check via realChildren().
function realChildren(el) {
  return [...el.children].filter((c) => !(c.classList && c.classList.contains("kx-handle")));
}
function clearGuides(doc) { doc.querySelectorAll(".kx-guide").forEach((n) => n.remove()); }
function clearOverlays(doc) { doc.querySelectorAll(".kx-handle,.kx-guide").forEach((n) => n.remove()); }

// Make an element freely movable: if it's laid out by flow (static) or by
// relative offsets, promote it to absolute IN PLACE — capture its current box
// first so it doesn't jump, and lock w/h so it doesn't collapse out of flow.
// This is what lets you drag the whole video placement, not just resize it.
function stageOf(doc) { return doc.getElementById("kx-stage") || doc.body; }

// Give the stage a positioning context so reparented absolute children anchor to IT.
// Marked data-kx-rel so serialize() reverts it (body/stage at 0,0 → positions resolve the
// same at render whether static or relative).
function ensureStageContext(doc) {
  const st = stageOf(doc);
  const cs = doc.defaultView.getComputedStyle(st);
  if (cs.position === "static") { st.style.position = "relative"; st.setAttribute("data-kx-rel", "1"); }
  return st;
}

// Make an element a FREE, absolutely-positioned layer on the stage AT ITS CURRENT VISUAL SPOT,
// reparenting it out of any nested (incl. positioned / overflow-clipped) container so it can be
// dragged anywhere on the canvas. This is what makes "move the video / a container / text /
// photo" work regardless of how the template nested it. Idempotent once an element is already a
// free stage layer. (Pick the whole container via the inspector's "▲ parent" to move a section.)
function ensureMovable(doc, el) {
  const stage = ensureStageContext(doc);
  const cs = doc.defaultView.getComputedStyle(el);
  if (!((cs.position === "absolute" || cs.position === "fixed") && el.parentElement === stage)) {
    const er = el.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.round(er.left - sr.left + (stage.scrollLeft || 0));
    const y = Math.round(er.top - sr.top + (stage.scrollTop || 0));
    el.style.position = "absolute";
    el.style.margin = "0";
    if (!el.style.width) el.style.width = w + "px";
    if (!el.style.height) el.style.height = h + "px";
    if (el.parentElement !== stage) stage.appendChild(el);   // lift out of its container
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  el.removeAttribute("data-kx-rel");   // genuinely positioned now, not a temp relative
  // A BACKGROUND layer always stays at the BOTTOM (behind all content); grabbing/moving it
  // must NOT lift it to the front. Everything else comes to the front on grab (pro behavior).
  if ((el.getAttribute("data-kaizer") || "").trim() === "background") {
    bringToBack(doc, el);
  } else {
    bringToFront(doc, el);   // fixes it slipping behind elements that have an explicit z-index
  }
}

// Raise an element above every other content layer (templates set explicit z-index on the
// ticker/strap/etc., so plain DOM order isn't enough). Stays below the editor handles/guides.
function bringToFront(doc, el) {
  const stage = stageOf(doc);
  let max = 0;
  stage.querySelectorAll("*").forEach((n) => {
    if (n === el || (n.classList && (n.classList.contains("kx-handle") || n.classList.contains("kx-guide")))) return;
    const z = parseInt(doc.defaultView.getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(z)) max = Math.max(max, z);
  });
  el.style.zIndex = String(Math.min(max + 1, 2147483000));
}

// Send an element to the BOTTOM of the visual stack (used for the background layer): z-index 0
// AND first in DOM order so it paints behind content that has auto/equal z-index.
function bringToBack(doc, el) {
  const stage = stageOf(doc);
  el.style.zIndex = "0";
  try { if (stage.firstChild && stage.firstChild !== el) stage.insertBefore(el, stage.firstChild); } catch { /* */ }
}

function attachHandles(doc, el) {
  doc.querySelectorAll(".kx-handle").forEach((n) => n.remove());
  const cs = doc.defaultView.getComputedStyle(el);
  // A static element can't anchor the % handles correctly — give it a
  // positioning context (relative = no visual move) so they line up. Marked so
  // serialize() can revert it if the element is never actually moved.
  if (cs.position === "static") { el.style.position = "relative"; el.setAttribute("data-kx-rel", "1"); }
  for (const [dir, x, y] of HANDLE_DIRS) {
    const h = doc.createElement("div");
    h.className = "kx-handle";
    h.setAttribute("data-kx-dir", dir);
    // 28px transparent HIT area (easy to grab) with a crisp ~16px visible dot painted in
    // the centre via a radial gradient + a faint halo — so the grab target is generous but
    // the dot stays small and unobtrusive over the design.
    h.style.cssText =
      "position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;" +
      "background:radial-gradient(circle, #3ad1c8 0 8px, #04201e 8px 9.5px," +
      "rgba(58,209,200,0.22) 9.5px 13px, transparent 13px);" +
      "z-index:2147483646;pointer-events:auto;" +
      `left:${x}%;top:${y}%;cursor:${dir}-resize;`;
    el.appendChild(h);
  }
}

function showGuides(doc, lines) {
  clearGuides(doc);
  const stage = doc.getElementById("kx-stage") || doc.body;
  for (const ln of lines) {
    const g = doc.createElement("div");
    g.className = "kx-guide";
    g.style.cssText =
      "position:absolute;background:#ff3df0;z-index:2147483645;pointer-events:none;" +
      (ln.v ? `left:${ln.p}px;top:0;width:1px;height:100%;`
            : `top:${ln.p}px;left:0;height:1px;width:100%;`);
    stage.appendChild(g);
  }
}

// Snap a moving element's left/top against other elements' edges/centers + the canvas
// thirds, returning the snapped position + the guide lines to draw.
function computeSnap(doc, el, nl, nt) {
  const stage = doc.getElementById("kx-stage") || doc.body;
  const cw = stage.clientWidth || stage.offsetWidth || 1080;
  const ch = stage.clientHeight || stage.offsetHeight || 1920;
  const thresh = Math.max(8, cw * 0.01);
  const w = el.offsetWidth, h = el.offsetHeight;
  const others = [...stage.querySelectorAll(".kx-el,[data-kaizer]")]
    .filter((o) => o !== el && !el.contains(o) && !o.contains(el));
  const xs = [0, cw / 2, cw], ys = [0, ch / 2, ch];
  for (const o of others) {
    xs.push(o.offsetLeft, o.offsetLeft + o.offsetWidth, o.offsetLeft + o.offsetWidth / 2);
    ys.push(o.offsetTop, o.offsetTop + o.offsetHeight, o.offsetTop + o.offsetHeight / 2);
  }
  const near = (val, cands) => { for (const c of cands) if (Math.abs(val - c) <= thresh) return c; return null; };
  const guides = [];
  let left = nl, top = nt;
  for (const [anchor, adj] of [[nl, 0], [nl + w / 2, w / 2], [nl + w, w]]) {
    const s = near(anchor, xs);
    if (s != null) { left = s - adj; guides.push({ v: true, p: Math.round(s) }); break; }
  }
  for (const [anchor, adj] of [[nt, 0], [nt + h / 2, h / 2], [nt + h, h]]) {
    const s = near(anchor, ys);
    if (s != null) { top = s - adj; guides.push({ v: false, p: Math.round(s) }); break; }
  }
  return { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)), guides };
}

export default function TemplateBuilder({
  // EMBED MODE (inline builder for a single job): when embedHtml is provided the builder
  // edits that HTML in place — no template load, no template save. onEmbedSave(html) persists
  // the result (a per-job override); onEmbedClose dismisses. The route usage passes nothing.
  embedHtml = null, embedCanvas = null, onEmbedSave = null, onEmbedClose = null,
  embedTitle = "", embedSaveLabel = "Save design",
  // assign an uploaded VIDEO asset to a slot for this job: onSlotMedia(slotKey, assetId|null, isVideo, fileName)
  onSlotMedia = null,
  // AI-generate STORY-relevant image(s) for a slot: onSlotGenerate(slotKey, {asCarousel, count})
  // -> resolves on success / throws on failure. slotMedia = the job's current per-slot media map
  // (so an image slot can show "slideshow · N images").
  onSlotGenerate = null, slotMedia = null,
} = {}) {
  const { tid } = useParams();
  const nav = useNavigate();
  const embedded = embedHtml != null;
  const iframeRef = useRef(null);
  const selRef = useRef(null);          // selected element inside the iframe
  const dragRef = useRef(null);         // {mode, ...} during a drag / resize
  const histRef = useRef({ stack: [], idx: -1 });
  const commitTimer = useRef(null);
  const selectElRef = useRef(null);     // exposes the iframe's selectEl to layer clicks
  const layerIdRef = useRef(0);
  const mediaInputRef = useRef(null);   // hidden file input for per-slot media upload

  const [tpl, setTpl] = useState(null);
  const [srcDoc, setSrcDoc] = useState("");
  const [canvas, setCanvas] = useState([1080, 1920]);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [editable, setEditable] = useState(false);
  const [builtOn, setBuiltOn] = useState(null);
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("design");
  const [codeText, setCodeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const [layers, setLayers] = useState([]);
  const [showLayers, setShowLayers] = useState(true);
  const [themeColors, setThemeColors] = useState([]);
  const [showColors, setShowColors] = useState(false);
  const [genBusy, setGenBusy] = useState(false);   // AI story-image generation for the selected slot
  const [slideN, setSlideN] = useState("");         // slideshow count ("" = auto from the story)

  const [cw, ch] = canvas;
  const scale = Math.min(540 / cw, 660 / ch);

  // serialize the iframe DOM → clean HTML (strip editor-only artifacts)
  const serialize = useCallback(() => {
    const doc = iframeRef.current && iframeRef.current.contentDocument;
    if (!doc) return "";
    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll("#kx-ed-style").forEach((e) => e.remove());
    clone.querySelectorAll("[id='kx-ed-sel']").forEach((e) => e.removeAttribute("id"));
    clone.querySelectorAll("script,[data-kx-sample],.kx-handle,.kx-guide,video.kx-vid-preview,#kx-anim-preview-css").forEach((e) => e.remove());
    clone.querySelectorAll("[data-kx-id]").forEach((e) => e.removeAttribute("data-kx-id"));
    // revert the editor-only positioning context added for handle alignment
    clone.querySelectorAll("[data-kx-rel]").forEach((e) => { e.style.position = ""; e.removeAttribute("data-kx-rel"); });
    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }, []);

  const pushHistory = useCallback(() => {
    const h = serialize(); if (!h) return;
    const H = histRef.current;
    if (h === H.stack[H.idx]) return;
    H.stack = H.stack.slice(0, H.idx + 1);
    H.stack.push(h);
    if (H.stack.length > 80) H.stack.shift();
    H.idx = H.stack.length - 1;
    setHist({ canUndo: H.idx > 0, canRedo: false });
  }, [serialize]);
  const commitSoon = useCallback(() => {
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(pushHistory, 450);
  }, [pushHistory]);

  // Rebuild the Layers list from the iframe (top-of-stack first). Assigns a stable
  // data-kx-id (stripped on serialize) so clicks/reorders/visibility map back to the node.
  const refreshLayers = useCallback(() => {
    const doc = iframeRef.current && iframeRef.current.contentDocument;
    if (!doc) { setLayers([]); return; }
    const stage = doc.getElementById("kx-stage") || doc.body;
    const els = [...stage.querySelectorAll(".kx-el,[data-kaizer]")];
    const list = els.map((el) => {
      let id = el.getAttribute("data-kx-id");
      if (!id) { id = "kx" + (++layerIdRef.current); el.setAttribute("data-kx-id", id); }
      return {
        id,
        label: el.getAttribute("data-kaizer") || el.tagName.toLowerCase(),
        hidden: el.style.visibility === "hidden",
        selected: el.id === "kx-ed-sel",
      };
    });
    setLayers(list.reverse());
  }, []);

  // Rescan the template's palette (style blocks + inline styles).
  const refreshColors = useCallback(() => {
    const doc = iframeRef.current && iframeRef.current.contentDocument;
    setThemeColors(collectColors(doc));
  }, []);

  // Recolor EVERY use of a color across the whole template (style blocks + inline styles).
  // Plain string replace (no regex escaping); editor-only style is left alone.
  const recolorTemplate = (oldToken, newHex) => {
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    doc.querySelectorAll("style:not(#kx-ed-style)").forEach((s) => {
      if (s.textContent && s.textContent.includes(oldToken)) s.textContent = s.textContent.split(oldToken).join(newHex);
    });
    doc.querySelectorAll("[style]").forEach((el) => {
      if (el.classList && (el.classList.contains("kx-handle") || el.classList.contains("kx-guide"))) return;
      const st = el.getAttribute("style");
      if (st && st.includes(oldToken)) el.setAttribute("style", st.split(oldToken).join(newHex));
    });
    pushHistory(); refreshColors();
  };

  const undo = () => {
    const H = histRef.current; if (H.idx <= 0) return;
    H.idx -= 1; setSrcDoc(H.stack[H.idx]); selRef.current = null; setSel(null);
    setHist({ canUndo: H.idx > 0, canRedo: H.idx < H.stack.length - 1 });
  };
  const redo = () => {
    const H = histRef.current; if (H.idx >= H.stack.length - 1) return;
    H.idx += 1; setSrcDoc(H.stack[H.idx]); selRef.current = null; setSel(null);
    setHist({ canUndo: H.idx > 0, canRedo: H.idx < H.stack.length - 1 });
  };

  // ── load ──
  useEffect(() => {
    if (embedded) {
      histRef.current = { stack: [], idx: -1 };
      setTpl(null); setName(embedTitle || ""); setVisibility("private");
      setEditable(true); setBuiltOn(null);
      setCanvas(Array.isArray(embedCanvas) && embedCanvas.length === 2 ? embedCanvas : [1080, 1920]);
      setSrcDoc(embedHtml || ""); setErr(""); setMsg(""); setMode("design");
      return;
    }
    if (!tid) return;
    setBusy(true); setErr("");
    histRef.current = { stack: [], idx: -1 };
    api.getTemplate(tid).then((t) => {
      setTpl(t); setName(t.name || ""); setVisibility(t.visibility || "private");
      setEditable(!!t.editable); setBuiltOn(t.built_on || null);
      setCanvas(Array.isArray(t.canvas) ? t.canvas : [1080, 1920]);
      setSrcDoc(t.html || "");
    }).catch((e) => setErr(e.message || "Failed to load template")).finally(() => setBusy(false));
  }, [tid, embedded, embedHtml]);

  // ── iframe wiring: attach selection + drag/resize handlers after each (re)load ──
  const onIframeLoad = useCallback(() => {
    const ifr = iframeRef.current;
    const doc = ifr && ifr.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("script").forEach((s) => s.remove());   // defensive
    let ed = doc.getElementById("kx-ed-style");
    if (!ed) { ed = doc.createElement("style"); ed.id = "kx-ed-style"; ed.textContent = EDITOR_CSS; doc.head && doc.head.appendChild(ed); }
    // seed undo history with the loaded design (first load only)
    if (histRef.current.idx < 0) {
      const h = serialize();
      if (h) { histRef.current = { stack: [h], idx: 0 }; setHist({ canUndo: false, canRedo: false }); }
    }

    const selectEl = (el) => {
      doc.querySelectorAll("[id='kx-ed-sel']").forEach((e) => { if (e !== el) e.removeAttribute("id"); });
      if (!el || el === doc.body || el === doc.documentElement || el.id === "kx-stage") {
        clearOverlays(doc); selRef.current = null; setSel(null); refreshLayers(); return;
      }
      selRef.current = el;
      try { el.id = "kx-ed-sel"; } catch { /* */ }
      const cs = doc.defaultView.getComputedStyle(el);
      const textable = realChildren(el).length === 0;
      setSel({
        tag: el.tagName.toLowerCase(),
        text: textable ? (el.textContent || "") : "",
        canText: textable,
        color: cs.color, bg: cs.backgroundColor,
        fontSize: px(cs.fontSize), fontWeight: cs.fontWeight, textAlign: cs.textAlign,
        radius: px(cs.borderTopLeftRadius), opacity: cs.opacity,
        rot: rotOf(el),
        shadow: !!(el.style.boxShadow && el.style.boxShadow !== "none") || (cs.boxShadow && cs.boxShadow !== "none"),
        borderW: px(cs.borderTopWidth), borderColor: cs.borderTopColor,
        left: px(el.style.left || cs.left), top: px(el.style.top || cs.top),
        width: px(el.style.width || cs.width), height: px(el.style.height || cs.height),
        positioned: true,   // builder treats every selected element as freely placeable
        bind: el.getAttribute("data-kaizer") || "",
        fixed: el.getAttribute("data-kaizer-fixed") === "1",
        hasMedia: el.tagName === "IMG"
          ? !!el.getAttribute("src")
          : !!(el.style.backgroundImage && el.style.backgroundImage !== "none"
               && el.style.backgroundImage.indexOf("url(") !== -1),
        kxAnim: (el.getAttribute("data-kx-anim") || "none"),
        kxAnimDur: (parseFloat(el.getAttribute("data-kx-anim-dur")) || 0.5),
      });
      attachHandles(doc, el);
      refreshLayers();
    };
    selectElRef.current = selectEl;

    doc.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.target && e.target.classList && e.target.classList.contains("kx-handle")) return;
      selectEl(e.target);
    }, true);

    doc.addEventListener("pointerdown", (e) => {
      const el = selRef.current;
      if (!el) return;
      const t = e.target;
      // resize when grabbing a handle of the selected element
      if (t && t.classList && t.classList.contains("kx-handle")) {
        ensureMovable(doc, el);
        dragRef.current = { mode: "resize", dir: t.getAttribute("data-kx-dir") || "se",
          sx: e.clientX, sy: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
        // Capture on the SELECTED element (el), not the tiny 11px handle (t) — otherwise
        // pointermove events get delivered to the handle and resize never updates. Mirrors
        // the move-drag path below, which captures on el and works.
        try { el.setPointerCapture(e.pointerId); } catch { /* */ }
        e.preventDefault();
        return;
      }
      // otherwise drag the element itself — promote it to absolute so the
      // whole placement (incl. a flow-laid-out video region) is movable.
      if (el !== t && !el.contains(t)) return;
      ensureMovable(doc, el);
      dragRef.current = { mode: "drag", sx: e.clientX, sy: e.clientY, l: el.offsetLeft, t: el.offsetTop };
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    });

    doc.addEventListener("pointermove", (e) => {
      const d = dragRef.current, el = selRef.current;
      if (!d || !el) return;
      if (d.mode === "resize") {
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        let l = d.l, t = d.t, w = d.w, h = d.h;
        if (d.dir.includes("e")) w = d.w + dx;
        if (d.dir.includes("s")) h = d.h + dy;
        if (d.dir.includes("w")) { w = d.w - dx; l = d.l + dx; }
        if (d.dir.includes("n")) { h = d.h - dy; t = d.t + dy; }
        el.style.width = Math.max(12, Math.round(w)) + "px";
        el.style.height = Math.max(12, Math.round(h)) + "px";
        if (d.dir.includes("w")) el.style.left = Math.max(0, Math.round(l)) + "px";
        if (d.dir.includes("n")) el.style.top = Math.max(0, Math.round(t)) + "px";
      } else {
        const nl = Math.max(0, d.l + (e.clientX - d.sx));
        const nt = Math.max(0, d.t + (e.clientY - d.sy));
        const snapd = computeSnap(doc, el, nl, nt);
        el.style.left = snapd.left + "px";
        el.style.top = snapd.top + "px";
        showGuides(doc, snapd.guides);
      }
    });

    const endDrag = () => {
      const el = selRef.current;
      if (dragRef.current && el) {
        setSel((s) => s ? { ...s,
          left: px(el.style.left || el.offsetLeft), top: px(el.style.top || el.offsetTop),
          width: px(el.style.width || el.offsetWidth), height: px(el.style.height || el.offsetHeight) } : s);
        pushHistory();
      }
      dragRef.current = null;
      clearGuides(doc);
    };
    doc.addEventListener("pointerup", endDrag);
    doc.addEventListener("pointercancel", endDrag);
    refreshLayers();
    refreshColors();
  }, [serialize, pushHistory, refreshLayers, refreshColors]);

  // apply an inspector change to the selected element + mirror in state
  const apply = (patch) => {
    const el = selRef.current; if (!el) return;
    // Typing a position/size promotes the element to absolute too, so X/Y/W/H
    // work even before the first drag (matches the drag/resize behavior).
    if ("left" in patch || "top" in patch || "width" in patch || "height" in patch) {
      ensureMovable(el.ownerDocument, el);
    }
    setSel((s) => ({ ...s, ...patch }));
    for (const [k, v] of Object.entries(patch)) {
      try {
        if (k === "text") {
          if (realChildren(el).length === 0) {
            // replace text nodes but keep the resize-handle children
            [...el.childNodes].forEach((n) => {
              if (!(n.nodeType === 1 && n.classList && n.classList.contains("kx-handle"))) n.remove();
            });
            el.insertBefore(el.ownerDocument.createTextNode(v), el.firstChild);
          }
        }
        else if (k === "color") el.style.color = v;
        else if (k === "bg") el.style.background = v;
        else if (k === "fontSize") el.style.fontSize = v + "px";
        else if (k === "fontWeight") el.style.fontWeight = v;
        else if (k === "textAlign") el.style.textAlign = v;
        else if (k === "radius") el.style.borderRadius = v + "px";
        else if (k === "opacity") el.style.opacity = v;
        else if (k === "rot") el.style.transform = `rotate(${v}deg)`;
        else if (k === "shadow") el.style.boxShadow = v ? "0 10px 30px rgba(0,0,0,.45)" : "none";
        else if (k === "borderW") { el.style.borderStyle = "solid"; el.style.borderWidth = v + "px"; }
        else if (k === "borderColor") { el.style.borderStyle = "solid"; el.style.borderColor = v; }
        else if (k === "left") el.style.left = v + "px";
        else if (k === "top") el.style.top = v + "px";
        else if (k === "width") el.style.width = v + "px";
        else if (k === "height") el.style.height = v + "px";
        else if (k === "bind") { if (v) el.setAttribute("data-kaizer", v); else el.removeAttribute("data-kaizer"); refreshLayers(); }
        else if (k === "fixed") { if (v) el.setAttribute("data-kaizer-fixed", "1"); else el.removeAttribute("data-kaizer-fixed"); }
        else if (k === "mediaUri") {
          if (el.tagName === "IMG") {
            if (v) el.setAttribute("src", v); else el.removeAttribute("src");
          } else if (v) {
            // inline !important so the uploaded image beats the editor's striped placeholder
            el.style.setProperty("background-image", `url('${v}')`, "important");
            el.style.setProperty("background-size", "cover");
            el.style.setProperty("background-position", "center");
            el.style.setProperty("background-repeat", "no-repeat");
          } else {
            el.style.removeProperty("background-image");
            try { el.querySelectorAll("video.kx-vid-preview").forEach((n) => n.remove()); } catch { /* */ }
          }
        }
        else if (k === "kxAnim") {
          if (v && v !== "none") el.setAttribute("data-kx-anim", v); else el.removeAttribute("data-kx-anim");
        }
        else if (k === "kxAnimDur") {
          if (v) el.setAttribute("data-kx-anim-dur", String(v)); else el.removeAttribute("data-kx-anim-dur");
        }
      } catch { /* */ }
    }
    commitSoon();
  };

  const deleteSel = () => {
    const el = selRef.current; if (!el) return;
    const doc = el.ownerDocument;
    el.remove(); selRef.current = null; setSel(null);
    clearOverlays(doc); pushHistory(); refreshLayers();
  };

  // LIVE preview of the entrance animations (CSS, in the builder iframe) so the operator sees
  // the fade/slide/zoom motion instantly — separate from the ffmpeg render. Plays every element
  // with a data-kx-anim once; the keyframes mirror what the renderer composites.
  const previewAnimations = () => {
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    let st = doc.getElementById("kx-anim-preview-css");
    if (!st) {
      st = doc.createElement("style"); st.id = "kx-anim-preview-css";
      st.textContent =
        "@keyframes kxpvFade{from{opacity:0}to{opacity:1}}" +
        "@keyframes kxpvSlideL{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}" +
        "@keyframes kxpvSlideR{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}" +
        "@keyframes kxpvZoom{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}";
      (doc.head || doc.documentElement).appendChild(st);
    }
    let n = 0;
    doc.querySelectorAll("[data-kx-anim]").forEach((el) => {
      const a = (el.getAttribute("data-kx-anim") || "").trim().toLowerCase();
      const d = Math.max(0.1, Math.min(parseFloat(el.getAttribute("data-kx-anim-dur")) || 0.5, 3));
      const name = a === "slide_left" ? "kxpvSlideL" : a === "slide_right" ? "kxpvSlideR"
                 : a === "zoom_in" ? "kxpvZoom" : (a === "fade" ? "kxpvFade" : null);
      if (!name) return;
      n++;
      el.style.animation = "none"; void el.offsetWidth;      // restart the animation
      el.style.animation = `${name} ${d}s ease-out both`;
      setTimeout(() => { try { el.style.animation = ""; } catch { /* */ } }, d * 1000 + 250);
    });
    setMsg(n ? `Previewing ${n} entrance animation${n === 1 ? "" : "s"}…` : "No entrance animations set yet — pick one under ✨ Entrance.");
  };

  // Upload media into the selected slot. IMAGE -> downscaled to a data-URI and baked into the
  // slot ("use as-is") so it renders verbatim. VIDEO -> uploaded as an asset and assigned to
  // the slot (onSlotMedia -> the job's per-slot media); the renderer composites it at render.
  const uploadSlotMedia = async (file) => {
    if (!file || !selRef.current) return;
    const slotKey = (selRef.current.getAttribute("data-kaizer") || "").trim();
    const isVideo = (file.type || "").toLowerCase().startsWith("video");

    if (isVideo) {
      if (!onSlotMedia) { setMsg("Video upload isn't available in this context."); return; }
      const el = selRef.current;
      setMsg("Uploading video…");
      try {
        const fd = new FormData(); fd.append("file", file); fd.append("kind", "video");
        const asset = await api.uploadAsset(fd);
        if (!asset || !asset.id) throw new Error("upload failed");
        // clear any baked image; the renderer composites the uploaded video into this slot
        apply({ mediaUri: "", fixed: false, hasMedia: true });
        await onSlotMedia(slotKey, asset.id, true, file.name);
        // LIVE preview: drop a muted, looping <video> into the slot so the operator sees it
        // playing right here. Editor-only (class kx-vid-preview) — stripped on save; the render
        // composites the uploaded asset from template_media.
        try {
          const doc = el && el.ownerDocument;
          if (el && doc) {
            el.querySelectorAll("video.kx-vid-preview").forEach((v) => v.remove());
            const v = doc.createElement("video");
            v.className = "kx-vid-preview";
            v.src = URL.createObjectURL(file);
            v.muted = true; v.loop = true; v.autoplay = true; v.setAttribute("playsinline", "");
            v.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;"
              + "object-fit:cover;z-index:0;border:0;pointer-events:none;");
            el.appendChild(v);
            const _p = v.play(); if (_p && _p.catch) _p.catch(() => {});
          }
        } catch { /* preview is best-effort */ }
        setMsg("Video added — playing a live preview here; it composites into the video on re-render.");
      } catch (e) { setMsg("Video upload failed: " + (e.message || e)); }
      return;
    }

    setMsg("Loading image…");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        let uri = dataUrl;
        try {
          const MAX = 1920;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const cw = Math.max(1, Math.round(img.width * scale));
          const ch = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement("canvas");
          cv.width = cw; cv.height = ch;
          cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
          uri = cv.toDataURL("image/jpeg", 0.82);
        } catch { /* keep original data URL */ }
        apply({ mediaUri: uri, fixed: true, hasMedia: true });
        if (onSlotMedia) onSlotMedia(slotKey, null, false);   // clear any prior video on this slot
        setMsg("Image placed — it'll render here for this job.");
      };
      img.onerror = () => { apply({ mediaUri: dataUrl, fixed: true, hasMedia: true }); setMsg("Image placed."); };
      img.src = dataUrl;
    };
    reader.onerror = () => setMsg("Couldn't read that image.");
    reader.readAsDataURL(file);
  };

  // AI-generate STORY-relevant image(s) for the selected image slot, right from the builder.
  // asCarousel=false → one image; true → a story-driven slideshow (count or auto). The work runs
  // in the parent editor (which has the job's story + saves to template_media); we just trigger it.
  const genSlotImages = async (asCarousel, count) => {
    const el = selRef.current;
    const slotKey = (el && el.getAttribute("data-kaizer") || "").trim();
    if (!slotKey) { setMsg("Select an image slot first."); return; }
    if (!onSlotGenerate) { setMsg("Image generation isn't available in this context."); return; }
    setGenBusy(true);
    setMsg(asCarousel ? "Generating story images…" : "Generating story image…");
    try {
      const r = await onSlotGenerate(slotKey, { asCarousel, count: count || null });
      setMsg(asCarousel
        ? `Slideshow updated${r && r.count ? ` · +${r.count} images` : ""} — Save & re-render to apply.`
        : "Story image set for this slot — Save & re-render to apply.");
    } catch (e) {
      setMsg("Generation failed: " + (e && e.message ? e.message : e));
    } finally { setGenBusy(false); }
  };

  // Walk UP the tree — lets you grab the whole container / section (not just the deepest
  // child) so you can move a video's frame, a card, or a section as one unit.
  const selectParent = () => {
    const el = selRef.current; if (!el) return;
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    const p = el.parentElement;
    if (!p || p === doc.body || p === doc.documentElement || p.id === "kx-stage") return;
    if (selectElRef.current) selectElRef.current(p);
  };

  // ── layers panel actions ──
  const selectLayer = (id) => {
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    const el = doc.querySelector(`[data-kx-id="${id}"]`);
    if (el && selectElRef.current) selectElRef.current(el);
  };
  const toggleLayer = (id) => {
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    const el = doc.querySelector(`[data-kx-id="${id}"]`); if (!el) return;
    el.style.visibility = el.style.visibility === "hidden" ? "" : "hidden";
    pushHistory(); refreshLayers();
  };
  const moveLayer = (id, dir) => {
    const doc = iframeRef.current && iframeRef.current.contentDocument; if (!doc) return;
    const el = doc.querySelector(`[data-kx-id="${id}"]`); if (!el || !el.parentElement) return;
    const parent = el.parentElement;
    if (dir > 0) { const nxt = el.nextElementSibling; if (nxt) parent.insertBefore(nxt, el); }   // bring forward
    else { const prv = el.previousElementSibling; if (prv) parent.insertBefore(el, prv); }        // send back
    pushHistory(); refreshLayers();
  };

  const addElement = (item) => {
    const ifr = iframeRef.current, doc = ifr && ifr.contentDocument; if (!doc) return;
    const stage = doc.getElementById("kx-stage") || doc.body;
    const el = doc.createElement("div");
    el.className = "kx-el";
    if (item.bind) el.setAttribute("data-kaizer", item.bind);
    const base = "position:absolute;box-sizing:border-box;";
    if (item.kind === "text") {
      const fs = item.t === "headline" ? 72 : item.t === "ticker" ? 40
               : item.t === "kicker" ? 30 : item.t === "cta" ? 34 : 44;
      const extra = item.t === "kicker" ? "letter-spacing:.12em;text-transform:uppercase;color:var(--kaizer-accent,#3ad1c8);" : "";
      el.setAttribute("style", base + `left:8%;top:20%;width:80%;color:#fff;font-size:${fs}px;font-weight:${item.t === "headline" ? 800 : 700};${extra}`);
      el.textContent = item.html || "Text";
    } else if (item.t === "watermark") {
      el.setAttribute("style", base + "right:4%;bottom:4%;left:auto;top:auto;color:#fff;opacity:.55;font-size:26px;font-weight:700;");
      el.textContent = item.html || "watermark";
    } else if (item.t === "background") {
      el.setAttribute("style", base + "left:0;top:0;width:100%;height:100%;z-index:0;");
    } else if (item.t === "video") {
      el.setAttribute("style", base + "left:10%;top:24%;width:80%;height:45%;border-radius:18px;overflow:hidden;");
    } else if (item.t === "image") {
      el.setAttribute("style", base + "left:12%;top:30%;width:40%;height:30%;border-radius:12px;background:#141c2b;");
    } else if (item.t === "logo") {
      el.setAttribute("style", base + "right:5%;top:4%;left:auto;width:9%;height:auto;aspect-ratio:1;");
    } else {
      el.setAttribute("style", base + "left:15%;top:15%;width:30%;height:14%;background:var(--kaizer-brand,#ff5a3c);border-radius:10px;");
    }
    // Background drops at the BOTTOM (first in DOM + z-index:0); everything else on top.
    if (item.t === "background" && stage.firstChild) stage.insertBefore(el, stage.firstChild);
    else stage.appendChild(el);
    doc.querySelectorAll("[id='kx-ed-sel']").forEach((e) => e.removeAttribute("id"));
    selRef.current = el; try { el.id = "kx-ed-sel"; } catch { /* */ }
    const isText = item.kind === "text" || item.t === "watermark";
    setSel({ tag: "div", text: isText ? (item.html || "Text") : "", canText: isText,
      color: "rgb(255,255,255)", bg: "", fontSize: 44, fontWeight: "700", textAlign: "left", radius: 0, opacity: "1",
      rot: 0, shadow: false, borderW: 0, borderColor: "rgb(255,255,255)",
      left: 0, top: 0, width: 0, height: 0, positioned: true, bind: item.bind || "", fixed: false });
    attachHandles(doc, el);
    pushHistory(); refreshLayers();
  };

  const toggleCode = () => {
    if (mode === "design") { setCodeText(serialize()); setMode("code"); }
    else { setSrcDoc(codeText); setSel(null); selRef.current = null; setMode("design"); histRef.current = { stack: [], idx: -1 }; }
  };

  async function save({ fork = false } = {}) {
    setBusy(true); setErr(""); setMsg(""); setWarnings([]);
    try {
      const html = mode === "code" ? codeText : serialize();
      if (embedded) {
        if (onEmbedSave) await onEmbedSave(html);
        setMsg("Saved ✓ — click ← Close to apply it (re-renders the video for this job).");
        return;
      }
      if (fork) {
        const f = await api.forkTemplate(tpl.id, { html });
        nav(`/builder/${f.id}`); setMsg("Forked — now editing your copy."); return;
      }
      const res = await api.saveTemplateHtml(tpl.id, { html, name, visibility });
      setTpl(res); setWarnings(res.warnings || []);
      setMsg(`Saved — ${res.status === "ready" ? "ready to use" : "no video slot yet"}.`);
    } catch (e) { setErr(e.message || "Save failed"); }
    finally { setBusy(false); }
  }

  if (!tid && !embedded) return <NewTemplate nav={nav} />;

  return (
    <div className={`${embedded ? "h-full" : "min-h-screen"} bg-[#0b0e14] text-gray-200 flex flex-col`}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 bg-[#0d1119]">
        <button onClick={() => (embedded ? (onEmbedClose && onEmbedClose()) : nav(-1))}
          className="text-gray-400 hover:text-white text-sm">← {embedded ? "Close" : "Back"}</button>
        {embedded ? (
          <span className="text-sm text-white font-medium truncate max-w-[24rem]">
            {embedTitle || "Edit design for this job"}</span>
        ) : (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable}
              className="bg-[#151922] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-56"
              placeholder="Template name" />
            {builtOn && <span className="text-[11px] text-gray-500">Built on <b className="text-gray-300">{builtOn}</b></span>}
          </>
        )}
        {/* undo / redo */}
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!hist.canUndo} title="Undo"
            className="px-2 py-1 rounded border border-gray-700 text-xs hover:border-gray-500 disabled:opacity-30">↶</button>
          <button onClick={redo} disabled={!hist.canRedo} title="Redo"
            className="px-2 py-1 rounded border border-gray-700 text-xs hover:border-gray-500 disabled:opacity-30">↷</button>
        </div>
        <div className="flex-1" />
        <button onClick={previewAnimations} title="Play all entrance animations live"
          className="px-3 py-1.5 rounded-lg border border-teal-600/60 text-teal-300 text-xs hover:bg-teal-500/10 font-medium">
          ▶ Preview animations</button>
        {tpl && <span className={`text-[11px] px-2 py-1 rounded ${tpl.status === "ready" ? "bg-emerald-600/20 text-emerald-300" : "bg-amber-600/20 text-amber-300"}`}>
          {tpl.status} · {cw}×{ch}</span>}
        <button onClick={toggleCode} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs hover:border-gray-500">
          {mode === "design" ? "</> Code" : "▦ Design"}</button>
        {embedded ? (
          <button onClick={() => save()} disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : (embedSaveLabel || "Save design")}</button>
        ) : editable ? (
          <button onClick={() => save()} disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save"}</button>
        ) : (
          <button onClick={() => save({ fork: true })} disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Forking…" : "Fork to edit"}</button>
        )}
        {!embedded && editable && tpl && (
          <button onClick={() => save({ fork: true })} disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs hover:border-gray-500">Save as copy</button>
        )}
      </div>

      {(err || msg) && (
        <div className={`px-4 py-2 text-xs ${err ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>
          {err || msg}{warnings.length > 0 && <> · {warnings.length} note(s): {warnings.slice(0, 2).join(" · ")}</>}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <div className="w-40 border-r border-gray-800 p-3 space-y-2 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Add element</div>
          {PALETTE.map((it) => (
            <button key={it.t} onClick={() => addElement(it)} disabled={!editable && !!tid}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-700 text-sm hover:border-teal-400 hover:bg-teal-500/5 disabled:opacity-40">
              + {it.label}
            </button>
          ))}
          <p className="text-[10.5px] text-gray-600 pt-2 leading-snug">
            Click to select (▲ parent in the panel grabs its container/section) · drag to move ANY element
            (it lifts onto the canvas) · drag the cyan handles to resize · ↶↷ undo/redo.
            Grey ▶ boxes are video regions — the real clip fills them at render.
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center overflow-auto p-6 bg-[#0b0e14]">
          {mode === "design" ? (
            <div style={{ width: Math.round(cw * scale), height: Math.round(ch * scale) }}
              className="shadow-2xl ring-1 ring-gray-700 overflow-hidden bg-black shrink-0">
              <iframe ref={iframeRef} title="canvas" srcDoc={srcDoc} onLoad={onIframeLoad}
                sandbox="allow-same-origin"
                style={{ width: cw, height: ch, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }} />
            </div>
          ) : (
            <textarea value={codeText} onChange={(e) => setCodeText(e.target.value)} spellCheck={false}
              className="w-full h-[70vh] bg-[#0d1119] border border-gray-800 rounded-lg p-3 text-[12px] font-mono text-gray-200" />
          )}
        </div>

        <div className="w-64 border-l border-gray-800 p-3 overflow-y-auto">
          {/* Template colors — recolor each color used in the template, everywhere at once */}
          <div className="mb-3 border border-gray-800 rounded-lg overflow-hidden">
            <button onClick={() => { const n = !showColors; setShowColors(n); if (n) refreshColors(); }}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-[#10151f] text-[11px] uppercase tracking-wide text-gray-400">
              <span>Template colors ({themeColors.length})</span><span>{showColors ? "▾" : "▸"}</span>
            </button>
            {showColors && (
              <div className="p-2 max-h-44 overflow-y-auto space-y-1.5">
                {themeColors.length === 0 && <p className="text-[11px] text-gray-600">No colors detected.</p>}
                {themeColors.map((c) => (
                  <div key={c.token} className="flex items-center gap-2">
                    <input type="color" value={c.hex} title={`Recolor ${c.token} everywhere`}
                      onChange={(e) => recolorTemplate(c.token, e.target.value)}
                      className="w-7 h-6 rounded border border-gray-700 bg-transparent p-0 cursor-pointer shrink-0" />
                    <span className="text-[11px] text-gray-400 font-mono truncate flex-1">{c.token}</span>
                    <span className="text-[10px] text-gray-600 shrink-0">×{c.count}</span>
                  </div>
                ))}
                <p className="text-[10px] text-gray-600 pt-1 leading-snug">Changing a swatch recolors every use of that color in the template.</p>
              </div>
            )}
          </div>

          {/* Layers / z-order */}
          <div className="mb-3 border border-gray-800 rounded-lg overflow-hidden">
            <button onClick={() => setShowLayers((v) => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-[#10151f] text-[11px] uppercase tracking-wide text-gray-400">
              <span>Layers ({layers.length})</span><span>{showLayers ? "▾" : "▸"}</span>
            </button>
            {showLayers && (
              <div className="max-h-44 overflow-y-auto">
                {layers.length === 0 && <p className="px-2 py-2 text-[11px] text-gray-600">No elements yet.</p>}
                {layers.map((L) => (
                  <div key={L.id}
                    className={`flex items-center gap-1 px-2 py-1 text-[11px] border-t border-gray-800 ${L.selected ? "bg-teal-500/10 text-teal-200" : "text-gray-300"}`}>
                    <button onClick={() => selectLayer(L.id)} className="flex-1 text-left truncate">{L.label}</button>
                    <button onClick={() => toggleLayer(L.id)} title="Show / hide"
                      className="px-1 text-gray-500 hover:text-white">{L.hidden ? "◌" : "●"}</button>
                    <button onClick={() => moveLayer(L.id, 1)} title="Bring forward"
                      className="px-1 text-gray-500 hover:text-white">↑</button>
                    <button onClick={() => moveLayer(L.id, -1)} title="Send back"
                      className="px-1 text-gray-500 hover:text-white">↓</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!sel ? (
            <p className="text-xs text-gray-500">
              Click an element on the canvas to edit it — colours, size, and an <b className="text-teal-300">✨ Entrance
              animation</b> (fade / slide / zoom in). Select an <b>image</b> slot to generate story images or a
              <b className="text-fuchsia-300"> ✦ slideshow</b>.
            </p>
          ) : (
            <div className="space-y-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 uppercase tracking-wide text-[11px]">{sel.tag}</span>
                <div className="flex items-center gap-2">
                  <button onClick={selectParent} title="Select the parent container / section"
                    className="text-gray-400 hover:text-white text-xs">▲ parent</button>
                  <button onClick={deleteSel} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                </div>
              </div>

              <Field label="Slot (data-kaizer)">
                <select value={sel.bind} onChange={(e) => apply({ bind: e.target.value })}
                  className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white">
                  {BIND_OPTIONS.map((b) => <option key={b} value={b}>{b || "— none (decoration) —"}</option>)}
                </select>
              </Field>

              {/* ENTRANCE animation (works on ANY element). Up top so it's easy to find. It plays
                  in the RENDERED VIDEO — this builder preview is a still, so it won't move here. */}
              <div className="rounded border border-teal-700/40 bg-teal-500/5 p-2">
                <div className="text-[10px] uppercase tracking-wide text-teal-300 mb-1">✨ Entrance animation</div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={sel.kxAnim || "none"} onChange={(e) => apply({ kxAnim: e.target.value })}
                    className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white text-[12px]">
                    <option value="none">No animation</option>
                    <option value="fade">Fade in</option>
                    <option value="slide_left">Slide in ◀</option>
                    <option value="slide_right">Slide in ▶</option>
                    <option value="zoom_in">Zoom in</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <Num value={sel.kxAnimDur} step="0.1" onChange={(v) => apply({ kxAnimDur: v })} />
                    <span className="text-[10px] text-gray-500">sec</span>
                  </div>
                </div>
                <button type="button" onClick={previewAnimations}
                  className="mt-1.5 w-full text-[11px] px-2 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium">
                  ▶ Preview animation
                </button>
                <p className="text-[9px] text-gray-500 mt-1">Live preview here; the final motion is baked into the rendered video.</p>
              </div>

              {(sel.bind === "background" || sel.bind.startsWith("video") || sel.bind.startsWith("image") || sel.bind === "logo" || sel.bind === "watermark") && (
                <div className="space-y-1.5 rounded border border-gray-800 bg-[#0d1119] p-2">
                  <div className="flex items-center gap-2">
                    <input type="file" accept="image/*,video/*" className="hidden" ref={mediaInputRef}
                      onChange={(e) => { uploadSlotMedia(e.target.files?.[0]); e.target.value = ""; }} />
                    <button onClick={() => mediaInputRef.current?.click()}
                      className="flex-1 px-2 py-1.5 rounded border border-teal-600/60 text-teal-300 hover:bg-teal-500/10 text-[11px] font-medium">
                      ⬆ Upload image / video for this slot
                    </button>
                    {sel.hasMedia && (
                      <button onClick={() => apply({ mediaUri: "", fixed: false, hasMedia: false })}
                        className="px-2 py-1.5 rounded border border-gray-700 text-gray-400 hover:text-white text-[11px]">Remove</button>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-gray-300 text-[11px]">
                    <input type="checkbox" checked={sel.fixed} onChange={(e) => apply({ fixed: e.target.checked })} />
                    Use this media as-is (don't auto-replace at render)
                  </label>
                  <p className="text-[9.5px] text-gray-600 leading-snug">
                    Upload bakes your image into this slot for this job. The <b>video</b> slot still gets the
                    clip unless "use as-is" is on; image slots auto-fill from story photos when left empty.
                  </p>
                </div>
              )}

              {/* SLIDESHOW / story images — for image slots. One image, or a story-driven slideshow
                  of as many images as the story needs. Runs in the parent editor (it has the job's
                  story + saves to template_media); the motion shows in the rendered video. */}
              {sel.bind.startsWith("image") && (
                <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/5 p-2 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-fuchsia-300">✦ Story images / slideshow</div>
                  <p className="text-[9.5px] text-fuchsia-200/70 leading-snug">
                    Generate imagery relevant to THIS job&apos;s story — one image, or a <b>slideshow</b> of as many
                    as the story needs. (The slideshow plays in the rendered video, not this still preview.)
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button type="button" disabled={genBusy} onClick={() => genSlotImages(false)}
                      className="flex-1 px-2 py-1.5 rounded border border-fuchsia-500/50 text-fuchsia-300 hover:bg-fuchsia-500/10 text-[11px] disabled:opacity-40">
                      {genBusy ? "…" : "✦ One image"}
                    </button>
                    <input type="number" min="1" max="12" value={slideN} onChange={(e) => setSlideN(e.target.value)}
                      placeholder="Auto" title="How many slideshow images (blank = auto from the story)"
                      className="w-14 bg-[#0d1119] border border-gray-700 rounded px-1 py-1.5 text-white text-[11px]" />
                    <button type="button" disabled={genBusy}
                      onClick={() => genSlotImages(true, slideN ? parseInt(slideN, 10) : null)}
                      className="flex-1 px-2 py-1.5 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[11px] disabled:opacity-50">
                      {genBusy ? "Generating…" : "✦ Slideshow"}
                    </button>
                  </div>
                  {(() => {
                    const v = slotMedia && slotMedia[(sel.bind || "").trim()];
                    const n = (v && typeof v === "object" && Array.isArray(v.carousel)) ? v.carousel.length : 0;
                    return n > 0
                      ? <p className="text-[9.5px] text-fuchsia-300">slideshow · {n} image{n > 1 ? "s" : ""} set</p>
                      : null;
                  })()}
                </div>
              )}

              {sel.canText && (
                <Field label="Text">
                  <textarea value={sel.text} onChange={(e) => apply({ text: e.target.value })} rows={2}
                    className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white" />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label="Color"><ColorInput value={sel.color} onChange={(v) => apply({ color: v })} /></Field>
                <Field label="Background"><ColorInput value={sel.bg} onChange={(v) => apply({ bg: v })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Font px"><Num value={sel.fontSize} onChange={(v) => apply({ fontSize: v })} /></Field>
                <Field label="Weight">
                  <select value={sel.fontWeight} onChange={(e) => apply({ fontWeight: e.target.value })}
                    className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white">
                    {["400", "500", "600", "700", "800", "900"].map((w) => <option key={w}>{w}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Align">
                <div className="flex gap-1">
                  {["left", "center", "right"].map((a) => (
                    <button key={a} onClick={() => apply({ textAlign: a })}
                      className={`flex-1 py-1 rounded border text-xs ${sel.textAlign === a ? "border-teal-400 text-teal-200" : "border-gray-700 text-gray-400"}`}>{a}</button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Radius px"><Num value={sel.radius} onChange={(v) => apply({ radius: v })} /></Field>
                <Field label="Opacity"><Num value={sel.opacity} step="0.1" onChange={(v) => apply({ opacity: v })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Rotation °"><Num value={sel.rot} onChange={(v) => apply({ rot: v })} /></Field>
                <Field label="Shadow">
                  <label className="flex items-center gap-2 text-gray-300 h-[26px]">
                    <input type="checkbox" checked={!!sel.shadow} onChange={(e) => apply({ shadow: e.target.checked })} /> drop shadow
                  </label>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Border px"><Num value={sel.borderW} onChange={(v) => apply({ borderW: v })} /></Field>
                <Field label="Border color"><ColorInput value={sel.borderColor} onChange={(v) => apply({ borderColor: v })} /></Field>
              </div>
              {sel.positioned && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="X px"><Num value={sel.left} onChange={(v) => apply({ left: v })} /></Field>
                  <Field label="Y px"><Num value={sel.top} onChange={(v) => apply({ top: v })} /></Field>
                  <Field label="W px"><Num value={sel.width} onChange={(v) => apply({ width: v })} /></Field>
                  <Field label="H px"><Num value={sel.height} onChange={(v) => apply({ height: v })} /></Field>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10.5px] text-gray-500 mb-0.5">{label}</span>
    {children}
  </label>
);
const Num = ({ value, onChange, step }) => (
  <input type="number" step={step || 1} value={value} onChange={(e) => onChange(e.target.value)}
    className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white" />
);
const ColorInput = ({ value, onChange }) => (
  <div className="flex items-center gap-1.5">
    <input type="color" value={toHexColor(value)} onChange={(e) => onChange(e.target.value)}
      className="w-7 h-7 rounded border border-gray-700 bg-transparent p-0 cursor-pointer shrink-0" />
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#fff / transparent"
      className="w-full bg-[#0d1119] border border-gray-700 rounded px-2 py-1 text-white text-[11px] min-w-0" />
  </div>
);

function NewTemplate({ nav }) {
  const [name, setName] = useState("My template");
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, w, h] = RATIOS[idx];
  const create = async () => {
    setBusy(true); setErr("");
    try {
      const t = await api.createBlankTemplate({ name: name.trim() || "My template", width: w, height: h });
      nav(`/builder/${t.id}`, { replace: true });
    } catch (e) { setErr(e.message || "Could not create template"); setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-[#0b0e14] text-gray-200 flex items-center justify-center p-6">
      <div className="bg-[#151922] border border-gray-700 rounded-2xl w-full max-w-md p-6">
        <h1 className="text-white font-bold text-lg">New template</h1>
        <p className="text-gray-400 text-xs mt-1">Pick a size, then design it on a blank canvas.</p>
        <label className="block text-xs text-gray-400 mt-4 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-[#0d1119] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
        <label className="block text-xs text-gray-400 mt-4 mb-1">Aspect ratio</label>
        <div className="grid grid-cols-2 gap-2">
          {RATIOS.map(([label, rw, rh], i) => (
            <button key={label} onClick={() => setIdx(i)}
              className={`px-3 py-2 rounded-lg text-sm border text-left ${idx === i ? "border-orange-400 bg-orange-500/15 text-orange-200" : "border-gray-700 text-gray-300"}`}>
              {label}<span className="block text-[10px] text-gray-500">{rw}×{rh}</span>
            </button>
          ))}
        </div>
        {err && <div className="mt-3 text-sm text-red-400">⚠ {err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => nav(-1)} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-white/5 text-sm">Cancel</button>
          <button onClick={create} disabled={busy}
            className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm disabled:opacity-50">
            {busy ? "Creating…" : "Create & design"}</button>
        </div>
      </div>
    </div>
  );
}
