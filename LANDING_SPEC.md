# Kaizer X — Landing Page Spec (design brief)

Hand this to a designer / design tool. Bring back a mockup (full page or per
section, desktop + mobile) and it gets built exactly. Current implementation:
`src/pages/Landing/SimpleLanding.jsx` (route `/`).

---

## 0. Context

- **Product:** Kaizer X — an intelligent video **editing + SEO studio** (software).
  NOT a news site. Long recordings in → branded vertical clips + SEO out → scheduled
  to the user's own social channels. User approves every clip.
- **Company:** Sharkify Private Limited (credited in footer).
- **Audience:** creators / small media teams with long-form footage.
- **Tone:** premium, precise, confident "pro creative tool" — like a video editor app,
  not a generic SaaS template.
- **Goal of page:** get a visitor to **Start free** (create account → `/register`).

### Hard constraints (must survive any redesign)
- Stack: React 18 + Vite + Tailwind + lucide-react icons. **Dark theme.**
- Links must stay: `/register` (primary CTA), `/login`, `/privacy`, `/terms`.
- Footer must keep the line: *"Kaizer X is not affiliated with or endorsed by YouTube
  or Google… subject to the YouTube Terms of Service."*
- Brand name is **Kaizer X** everywhere (never "Kaizer News").
- Avoid heavy "AI" buzzwords in visible copy (YouTube discoverability) — say
  "smart/intelligent editing", "engine", "SEO writer".
- No emoji as icons (lucide only). Respect `prefers-reduced-motion`. Body text ≥ 4.5:1.
- Fonts already loaded (free to use, no new deps): **Clash Display**, **Satoshi**,
  **JetBrains Mono**, Inter, Manrope, Newsreader, Instrument Serif.

---

## 1. Current visual system (keep or propose changes)

| Token | Value | Use |
|-------|-------|-----|
| Canvas | `#0a0b10` (near-black, slight blue) | page bg — never pure black |
| Surface | `#0c0e14` / `white 1.8%` | cards/panels |
| Border | `white 6–12%` | hairlines |
| **Primary** | cyan `#34e0e0` | CTAs, highlights, playhead, focus |
| **Accent** | amber `#f7b955` | "cut/highlight" markers (sparingly) |
| Text | white / gray-300 / gray-400 / gray-600 | hierarchy |
| Display font | **Clash Display** | headings, wordmark, prices |
| Body font | **Satoshi** | paragraphs |
| Mono font | **JetBrains Mono** | tags, timecodes, version chips |

Motion: ambient cyan/amber glow blobs (slow float), a sweeping cyan playhead in the
hero timeline, 150–200ms hover lifts. All decorative motion is behind reduced-motion.
**No purple gradient. No Inter for headings.**

Container: `max-w-6xl` centered, generous whitespace, 4/8px spacing rhythm.

---

## 2. Page structure (top → bottom)

### A. Sticky nav  (h-64px, glass blur, bottom hairline)
- Left: wordmark **"Kaizer X"** ("X" in cyan).
- Right: **Sign in** (ghost) · **Get started** (solid cyan, dark text) → `/register`.

### B. Hero  (centered, ~max-w-3xl, faint dotted grid mask behind)
- Eyebrow chip (mono): `▶ THE VIDEO EDITING STUDIO`.
- **H1** (Clash Display, fluid `clamp(2.4rem→4.25rem)`), two lines:
  - Line 1: **"Long videos in."** (white)
  - Line 2: **"Scroll-stopping clips out."** (cyan→amber gradient text)
- Subhead (gray-400, max-w-xl): *"Kaizer X edits your footage into branded vertical
  clips, writes the SEO, and schedules them to your own channels. You approve every
  clip before it goes live."*
- CTAs: **Start free** (solid cyan + arrow) · **Sign in** (outline).
- Microcopy (mono, gray-600): `no card required · free forever`.

### C. Hero "editor" mock  (~max-w-4xl, glassmorphic, the signature visual)
A faux video-editor window that says "this is an editing tool":
- **Title bar:** 3 traffic-light dots · `kaizer-x · editor` (mono) · right: green
  `SEO 96` chip.
- **Preview pane (2/3 width):** 16:9, soft cyan radial glow, centered glass **play
  button** (cyan), bottom-left `⌶ auto-captioned` (amber icon), top-right timecode
  `0:42 / 9:18`.
- **Clip queue (1/3 width):** label "CLIPS"; rows **Clip 01 / 02** (cyan chip + ✓ done),
  **Clip 03** (amber chip + pending dot); a cyan chip `🌐 SEO · 9 languages`.
- **Timeline (full width, bottom):** "timeline" label (amber waveform icon); a
  **waveform** of ~72 bars (cyan, every 9th amber); a **sweeping cyan playhead** line
  with glow. Static frame for the mockup is fine; motion is optional.

### D. Features — bento grid  (max-w-6xl, 3 cols; 2 cards span 2, 2 span 1)
Section head: tag `WHAT IT DOES` + h2 **"A studio that does the heavy lifting"**.
Each card = icon tile (cyan) + mono tag + Clash title + Satoshi body:
1. **EDIT — Smart editor** (wide): *finds highlights, cuts vertical clips, lays your
   branded frame, captions & logo over every one — frame-accurate, no timeline wrangling.*
2. **SEO — SEO writer** (narrow): *titles, descriptions, hashtags & tags in 9 languages
   — edit in a click before you publish.*
3. **PUBLISH — Publish anywhere** (narrow): *connect Meta, Instagram, Facebook or
   YouTube and schedule to your own channels. Free on every plan.*
4. **INSIGHTS — Know what's working** (wide): *track public views, likes & comments for
   the channels you've connected, and let the coach tell you in plain words what to fix.*

### E. How it works — 3-step rail  (max-w-4xl, centered, connecting line)
Tag `THE FLOW` + h2 **"Three steps, start to publish"**. Three cards, circular glowing
icon, `STEP n` (mono):
1. **Import** — upload a recording or paste a link.
2. **Edit & brand** — get clips, captions, SEO & your logo; tweak anything.
3. **Schedule** — publish to your accounts now or on a queue.

### F. Pricing — 4 tiles  (max-w-5xl)
Tag `PRICING` + h2 **"Priced on what you edit"** + sub *"Plans are based on clips you
edit per month. Publishing is always free."* Tiles (Pro = "Popular" cyan badge + ring):
| Starter | Creator | Pro ★ | Agency |
|---|---|---|---|
| **Free** | **$19**/mo | **$49**/mo | **$199**/mo |
| 5 clips edited / mo · 1 integration | 50 clips edited / mo · 3 integrations | 200 clips edited / mo · 10 integrations | Unlimited editing · team seats |
Below: centered **Create your free account** CTA → `/register`.

### G. Footer  (top hairline)
- Left: wordmark **Kaizer X** + mono `a product of Sharkify Private Limited`.
- Right: **Privacy · Terms · Sign in** links.
- Full-width compliance line (gray-600): the YouTube-not-affiliated text with a linked
  *YouTube Terms of Service*.

---

## 3. Responsive
- **Desktop (≥1024):** as above; bento 3-col; pricing 4-col; features/steps in a row.
- **Tablet (768):** bento → 2-col; pricing → 2-col.
- **Mobile (375):** everything single-column; H1 scales down (clamp); editor mock stacks
  preview over queue; CTAs full-width-ish; nav stays (no hamburger needed — only 2 items).

---

## 4. What to give back (so I can build it)
Any ONE of these works:
1. A **full-page mockup** (Figma frame / PNG) at **1440px desktop** + **375px mobile**, or
2. **Per-section** mockups (hero is the priority — it sets the whole tone), or
3. Just a **reference site/screenshot** whose vibe you like + notes on what to borrow.

Tell me what's **fixed vs free**: by default the routes, the copy intent, the compliance
line, and the brand name are fixed — **palette, fonts, layout, illustration style, and
the hero visual are all open to redesign.** Drop the image in and I'll match spacing,
type scale, color, and motion to it.
