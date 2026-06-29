/**
 * TemplateGuide — a styled, in-app "how to build a custom template" modal.
 * Mirrors services/custom_templates/TEMPLATE_CONTRACT.md but rendered as proper UI.
 * Opened from the CustomTemplatePicker links. Includes a per-AI-model "Copy rules"
 * generator: the prompt carries ONLY the constraints + the chosen canvas size — the
 * DESIGN is left entirely to the creator, so every generated template is distinct
 * (no baked-in example layout). The same prompt behaves differently across
 * ChatGPT / Claude / Gemini, so each gets a tailored output instruction.
 */
import { useState } from "react";

// Aspect ratios the creator can target. The chosen W×H is baked into the rules so the
// canvas size is "defined in the rules itself" (no placeholder to forget).
const RATIOS = [
  ["9:16 Short", 1080, 1920],
  ["16:9 Full", 1920, 1080],
  ["1:1 Square", 1080, 1080],
  ["4:5 Portrait", 1080, 1350],
];

// The shared contract — constraints + the chosen size ONLY. No example design: the
// creator's brief drives the look, and we explicitly tell the AI to be original.
const baseRules = (w, h, ratioLabel) => `You are building a reusable video TEMPLATE for "Kaizer X". It is uploaded and rendered by a sandbox that fills in the real videos, images and text per channel.

OUTPUT FORMAT: ONE self-contained index.html. Put ALL CSS inline in a <style> tag; make graphics with inline SVG or CSS. No separate files.

HARD RULES (the uploader STRIPS anything that breaks these, so your work is wasted if you ignore them):
- NO JavaScript: no <script>, no on* handlers (onclick, onload, ...).
- NO external resources: no http/https/CDN links, no Google Fonts, no remote images. Everything inline or a RELATIVE asset path. The renderer has no internet.
- NO <iframe>, <object>, <embed>, <base>, or <meta http-equiv="refresh">.

CANVAS — FIXED for this template, use exactly this size:
  <meta name="kaizer:canvas" content="${w}x${h}">
Make <body> exactly ${w}×${h} px (${ratioLabel}). Do not change the dimensions.

DESIGN FOR A STILL FRAME: Kaizer captures the template as ONE still frame composited over the moving video. CSS animations / a scrolling ticker will NOT move by default — make the design look complete and correct when frozen.

SLOTS YOU MAY USE — this is a MENU, not a checklist. Use ONLY the ones your design needs (you do NOT have to use all of them). Mark each region with a data-kaizer attribute and Kaizer fills it:
- data-kaizer="video" (or "video:NAME"): where a clip goes. Leave it EMPTY/transparent — the real clip composites BEHIND your design through that box. Multiple allowed (video:main, video:guest). Draw text/frames OUTSIDE the box so they stay on top.
- data-kaizer="background": a full-frame video/image behind everything.
- data-kaizer="intro": a clip played before the content (cold-open); usually a hidden element.
- data-kaizer="image" (or "image:NAME"): an <img> whose src Kaizer sets.
- data-kaizer="headline" / "hook" / "subtitle" / "kicker" / "caption" / "cta" / "ticker": text Kaizer injects. Put the marker on the TEXT-LEAF element (the <h1>/<span> that holds the words), not a wrapper.
- data-kaizer="logo" / "watermark": the channel's own brand is placed AT this spot (omit it for a default corner stamp).
- data-kaizer-default="assets/file.mp4": an optional bundled default for a video/background/intro/image slot.

TEXT FITS AUTOMATICALLY: don't micro-size text. Kaizer auto-shrinks each text slot's font to fit its box and writes a concise version for small boxes. Just give each text region a sensible box + font.

BRAND CSS VARIABLES (set on :root at render): var(--kaizer-brand), var(--kaizer-accent), var(--kaizer-text), var(--kaizer-bg), var(--kaizer-font). Use them so the template matches each creator.

THE DESIGN IS YOURS — BE ORIGINAL: build the design described in the brief below, exactly. Do NOT default to a generic breaking-news / lower-third layout. Invent the colors, composition, shapes, type and mood from the brief so this template looks distinct from every other one.

DESIGN BRIEF (the creator's design — follow it precisely):
[DESCRIBE YOUR DESIGN HERE — the vibe/colors, where the video sits, where the headline & any other text go, shapes/badges/frames, light or dark, etc. If you leave this blank, invent a fresh, modern, NON-generic layout of your own.]`;

// Per-model output instruction — the part that differs by AI (the cross-model "issue":
// each one mishandles code fences / extra prose / external fonts differently).
const MODEL_TAIL = {
  ChatGPT: `OUTPUT INSTRUCTION (ChatGPT): Reply with ONLY the raw contents of index.html. Do NOT wrap it in a \`\`\`html code fence. Do NOT write any explanation before or after. Even if it would look nicer, do NOT add any external <link>, <script>, or web-font URL — inline everything.`,
  Claude: `OUTPUT INSTRUCTION (Claude): Output ONLY the complete index.html — no preamble, no closing commentary, no code-fence wrapper. Follow every HARD RULE exactly; prefer correctness over decoration.`,
  Gemini: `OUTPUT INSTRUCTION (Gemini): Respond with ONLY the index.html content — no markdown fences, no notes. Do NOT add Google Fonts or any external link/script (you tend to — don't); inline all styles and fonts.`,
  "Other / MCP": `OUTPUT INSTRUCTION: Return ONLY the raw index.html file content — no markdown fences, no commentary, no external resources. If your runtime can write files, write a single index.html and nothing else.`,
};
const MODELS = ["ChatGPT", "Claude", "Gemini", "Other / MCP"];
const promptFor = (model, w, h, label) =>
  `${baseRules(w, h, label)}\n\n${MODEL_TAIL[model] || MODEL_TAIL["Other / MCP"]}`;

const Mono = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded bg-black/40 text-teal-300 text-[12.5px] font-mono">{children}</code>
);
const Pre = ({ children }) => (
  <pre className="bg-[#0d1119] border border-gray-800 rounded-lg p-3 overflow-x-auto
                  text-[12.5px] leading-relaxed text-gray-200 font-mono whitespace-pre">{children}</pre>
);
const H = ({ n, children }) => (
  <h3 className="text-white font-semibold text-[15px] mt-7 mb-2 flex items-center gap-2">
    <span className="text-orange-400">{n}</span>{children}
  </h3>
);

const SLOTS = [
  ["video / video:NAME", "A clip in this box (cover-cropped). Leave it empty/transparent — the clip composites behind your design. Multiple OK."],
  ["background", "Full-frame video or image behind everything. Can ship a bundled default."],
  ["intro", "A clip played before the content (cold-open). Can ship a bundled default."],
  ["image / image:NAME", "Sets this <img>'s source (or a box's background image)."],
  ["headline / hook / subtitle / kicker / ticker / cta", "Real story text is injected. Mark the text-leaf element (the <h1>/<span>)."],
  ["logo / watermark", "The channel's own logo/watermark is placed at this spot — omit it for a default corner."],
];

const BRAND = [
  ["--kaizer-brand", "primary brand color"],
  ["--kaizer-accent", "secondary accent"],
  ["--kaizer-text", "text color"],
  ["--kaizer-bg", "background color"],
  ["--kaizer-font", "injected brand font"],
];

export default function TemplateGuide({ onClose }) {
  const [model, setModel] = useState("ChatGPT");
  const [ratioIdx, setRatioIdx] = useState(0);
  const [copied, setCopied] = useState("");
  const [, rw, rh] = RATIOS[ratioIdx];
  const ratioLabel = RATIOS[ratioIdx][0];

  const copyForAI = async () => {
    try {
      await navigator.clipboard.writeText(promptFor(model, rw, rh, ratioLabel));
      setCopied(model);
      setTimeout(() => setCopied(""), 2200);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#151922] border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[88vh]
                      overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-[#151922]/95 backdrop-blur border-b border-gray-800 px-6 py-4
                        flex items-center justify-between gap-3 z-10">
          <div>
            <h2 className="text-white font-bold text-lg">Build a custom template</h2>
            <p className="text-gray-400 text-xs mt-0.5">Plain HTML + CSS. You design it; Kaizer fills in the video, text &amp; images.</p>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1 shrink-0">✕</button>
        </div>

        <div className="px-6 pb-8 text-[13.5px] text-gray-300 leading-relaxed">
          {/* Generate-with-AI card (per-model prompt + chosen ratio) */}
          <div className="mt-5 rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
            <div className="text-teal-300 font-semibold text-[14px]">✨ Generate with AI</div>
            <p className="text-gray-300 text-[12.5px] mt-1">
              This copies the <b>rules + your chosen size only</b> — the <b>design is yours</b>. Pick a ratio
              and your AI, paste the prompt, then write your own look in the <Mono>[DESCRIBE YOUR DESIGN]</Mono>
              line. Different briefs → different templates (no built-in example to copy).
            </p>

            {/* aspect ratio */}
            <div className="mt-3">
              <div className="text-gray-400 text-[11.5px] uppercase tracking-wide mb-1.5">Aspect ratio</div>
              <div className="flex flex-wrap items-center gap-2">
                {RATIOS.map(([label, w, h], i) => (
                  <button key={label} type="button" onClick={() => setRatioIdx(i)}
                    className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition
                      ${ratioIdx === i ? "border-orange-400 bg-orange-500/15 text-orange-200"
                                       : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                    {label} <span className="text-gray-500">· {w}×{h}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* model + copy */}
            <div className="mt-3">
              <div className="text-gray-400 text-[11.5px] uppercase tracking-wide mb-1.5">Your AI</div>
              <div className="flex flex-wrap items-center gap-2">
                {MODELS.map((m) => (
                  <button key={m} type="button" onClick={() => setModel(m)}
                    className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition
                      ${model === m ? "border-teal-400 bg-teal-500/15 text-teal-200"
                                    : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                    {m}
                  </button>
                ))}
                <button type="button" onClick={copyForAI}
                  className={`ml-auto px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition
                    ${copied ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                             : "border-teal-500/60 text-teal-200 hover:bg-teal-500/10"}`}>
                  {copied ? `✓ Copied for ${copied}` : `⧉ Copy rules for ${model}`}
                </button>
              </div>
            </div>
          </div>

          <H n="1.">What you upload</H>
          <p>A single <Mono>.zip</Mono> (a lone <Mono>index.html</Mono> also works for simple templates):</p>
          <div className="mt-2"><Pre>{`my-template.zip
├── index.html      ← required: the entry point
├── style.css       ← optional (or inline <style>)
└── assets/         ← optional: gifs, images, fonts
    ├── frame.png
    └── MyFont.woff2`}</Pre></div>
          <p className="mt-3">
            <b className="text-gray-200">Everything must be local.</b> Reference assets with relative
            paths (<Mono>assets/frame.png</Mono>). External URLs (<Mono>https://…</Mono>, <Mono>//cdn…</Mono>)
            and any <b>JavaScript</b> are <b>removed on upload</b> — the renderer is sandboxed with
            <b> no internet</b>, so bundle every asset and style with CSS only.
          </p>

          <H n="2.">The canvas (you choose the ratio)</H>
          <p>Declare the output size with one meta tag (defaults to <Mono>1080×1920</Mono>; max 4096/side).
             The ratio picker above writes this line for you:</p>
          <div className="mt-2"><Pre>{`<meta name="kaizer:canvas" content="1080x1920">   <!-- 9:16 Short -->
<meta name="kaizer:canvas" content="1920x1080">   <!-- 16:9 Full video -->
<meta name="kaizer:canvas" content="1080x1080">   <!-- 1:1 Square -->`}</Pre></div>
          <p className="mt-2 text-gray-400">The aspect decides the kind automatically — landscape = Full
            video, portrait/square = Short. Make <Mono>body</Mono> exactly that size.</p>

          <H n="3.">Slots — how Kaizer fills your design</H>
          <p>Mark a region with a <Mono>data-kaizer</Mono> attribute. This is a <b>menu</b> — use only the
             slots your design needs, including <b className="text-gray-200">multiple videos</b>.</p>
          <div className="mt-3 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="bg-[#0d1119] text-gray-400 text-left">
                <th className="px-3 py-2 font-medium">data-kaizer</th>
                <th className="px-3 py-2 font-medium">What Kaizer does</th>
              </tr></thead>
              <tbody>
                {SLOTS.map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-800 align-top">
                    <td className="px-3 py-2"><span className="text-teal-300 font-mono">{k}</span></td>
                    <td className="px-3 py-2 text-gray-300">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <div className="text-sky-300 font-semibold text-[13px] mb-1">You don't strictly need markers</div>
            <p className="text-gray-300">
              Kaizer's AI also reads plain layouts — semantic tags (<Mono>{`<video>`}</Mono>, <Mono>{`<h1>`}</Mono>,
              <Mono>{`<img>`}</Mono>), <Mono>id</Mono>/<Mono>class</Mono> names, even unlabelled boxes — and figures out
              each region. <b>But explicit <Mono>data-kaizer</Mono> markers are the most reliable</b>, and a region
              you mark is never overridden. (Opaque exports with only random class names need markers.)
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="text-orange-300 font-semibold text-[13px] mb-1">Video placement + text fit</div>
            <p className="text-gray-300">
              Leave the <Mono>data-kaizer="video"</Mono> box <b>empty/transparent</b> — the clip composites
              underneath, so anything drawn <i>outside</i> it stays on top. And don't fuss over text size:
              Kaizer <b>auto-shrinks</b> each text slot to fit its box (and writes a concise line for small
              boxes), so the full text always fits.
            </p>
          </div>

          <H n="4.">Brand variables</H>
          <p>Set on <Mono>:root</Mono> from each channel's branding — use them so your template matches the creator:</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {BRAND.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2">
                <span className="text-teal-300 font-mono text-[12.5px]">{k}</span>
                <span className="text-gray-500 text-xs">— {v}</span>
              </div>
            ))}
          </div>

          <H n="5.">Motion (design for a still frame)</H>
          <p>JavaScript is <b className="text-gray-200">not allowed</b> (it's stripped for safety) — style with
             CSS. Kaizer captures your template as a <b className="text-gray-200">single still frame</b> over the
             moving video by default, so a scrolling ticker or CSS animation <b>won't move</b> unless the
             operator turns on motion rendering. Make the design look complete frozen.</p>

          <H n="6.">Sharing</H>
          <p>When you save, choose visibility: <b className="text-gray-200">Private</b> (only you) or
             <b className="text-gray-200"> Public</b> (everyone's template library). Change it anytime.</p>
        </div>

        <div className="sticky bottom-0 bg-[#151922]/95 backdrop-blur border-t border-gray-800 px-6 py-3 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
