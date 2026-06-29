# Kaizer X — Design System

Source of truth for the Kaizer X frontend (React 18 + Vite + Tailwind + lucide-react).
A product of **Sharkify Private Limited**. Generated with the `ui-ux-pro-max` design
skill, then tuned to break the generic-AI-template look.

## Direction

**Cinematic dark "editing studio."** Kaizer X is an intelligent video-**editing + SEO**
tool — the UI should feel like a precise, premium creative app (think a pro editor),
not a news site and not a generic SaaS template. Deep near-black canvas, glassmorphic
panels, restrained glow, an editor/timeline motif.

## Typography (NO Inter / Roboto)

All three are already loaded in `index.html` — do not add font deps.

| Role | Font | Use |
|------|------|-----|
| Display / headings | **Clash Display** | h1/h2/h3, wordmark, numbers/prices |
| Body | **Satoshi** | paragraphs, default `font-family` |
| Mono / labels | **JetBrains Mono** | eyebrows, tags, timecodes, version chips, captions |

Apply via inline `style={{fontFamily: …}}` (the JS consts `DISPLAY`/`BODY`/`MONO` in
`SimpleLanding.jsx`) since the Tailwind default sans is not these. Headlines use
`clamp()` for fluid sizing; tracking-tight on display.

## Color

| Token | Hex | Use |
|-------|-----|-----|
| Canvas | `#0a0b10` | page background (near-black, slight blue — never pure `#000`) |
| Surface | `#0c0e14` / `white/[0.018]` | cards, panels |
| Border | `rgba(255,255,255,0.06–0.12)` | hairlines, card edges |
| **Primary — cyan** | `#34e0e0` (brand `accent2`) | CTAs, highlights, playhead, focus glow |
| **Accent — amber** | `#f7b955` | "cut/highlight" markers, secondary emphasis (use sparingly) |
| Text | `#fff` / `gray-300` / `gray-400` / `gray-500-600` (muted/mono) | ≥4.5:1 on canvas |

No purple gradient. CTA buttons are solid cyan with dark text (`#06121a`) for contrast.

## Layout & motion

- Pattern: **Video-First Hero** → bento feature grid (varied col-spans) → 3-step rail →
  pricing → footer. `max-w-6xl` container, generous whitespace, 4/8px spacing rhythm.
- Signature visual: a **faux editor mock** (preview + clip queue + waveform timeline)
  reinforces "this is a video tool."
- Hover: 150–200ms, `-translate-y-0.5` lifts + border/bg lighten. No layout shift.
- Ambient glow blobs + playhead sweep are decorative and **must** stay behind
  `@media (prefers-reduced-motion: reduce)` (already wired in `SimpleLanding.jsx`).

## Non-negotiables (a11y + brand)

- `focus-visible` ring on every interactive element; aria-labels on icon-only controls.
- Body text ≥ 4.5:1 contrast; icons from **lucide-react** only (no emoji as icons).
- Brand name is **Kaizer X** everywhere — never "Kaizer News".
- Avoid heavy "AI" buzzwords in visible marketing copy (YouTube discoverability); say
  "smart / intelligent editing", "engine", "SEO writer" instead.
- Keep the "not affiliated with YouTube/Google" compliance line in the landing footer.

Reference implementation: `src/pages/Landing/SimpleLanding.jsx`.
