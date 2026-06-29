import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Play, Sun, Moon, Menu, X, Plus,
  Clapperboard, Smartphone, Share2, Library as LibraryIcon,
  UploadCloud, Search, RefreshCw,
  BarChart3, Compass,
  Upload, Zap,
  Lock, ShieldCheck, Database, ShieldAlert,
  Youtube, Instagram, Facebook, Linkedin,
} from "lucide-react";
import "./kaizerx.css";

/* ════════════════════════════════════════════════════════════════════════
   Kaizer X — public landing page.
   A product of Sharkify Private Limited.

   Self-contained dark/light theme (default dark) — see kaizerx.css. The
   copy is fixed marketing text supplied verbatim; do not paraphrase. SEO
   metadata (title/description/OG/Twitter/JSON-LD) lives statically in
   index.html so crawlers read it without executing this bundle.
   ════════════════════════════════════════════════════════════════════════ */

const THEME_KEY = "kaizerx_landing_theme";

/* ── Hanging-sign logo ──────────────────────────────────────────────────── */
function HangingLogo({ animate = true }) {
  return (
    <span className="kx2-logo" aria-label="Kaizer X">
      <span
        className="kx2-logo__sign"
        style={animate ? undefined : { animation: "none" }}
      >
        <span className="kx2-logo__hanger" />
        <span className="kx2-logo__strings"><i /><i /></span>
        <span className="kx2-logo__plaque">KAIZER</span>
      </span>
      <span className="kx2-logo__x">X</span>
    </span>
  );
}

/* ── Circular KPI gauge (SVG ring) ──────────────────────────────────────── */
function RingGauge({ pct, label, stroke }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  return (
    <div className="kx2-gauge">
      <div className="kx2-gauge__ring">
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none"
            stroke="var(--kx-border)" strokeWidth="8" />
          <circle cx="50" cy="50" r={r} fill="none"
            stroke={stroke} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform="rotate(-90 50 50)" />
        </svg>
        <span className="kx2-gauge__val" aria-hidden="true">{pct}</span>
      </div>
      <span className="kx2-gauge__label">{label}</span>
    </div>
  );
}

/* ── FAQ accordion item ─────────────────────────────────────────────────── */
function FaqItem({ q, a, open, onToggle, id }) {
  return (
    <div className="kx2-faq__item kx2-themed" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="kx2-faq__q"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        id={`${id}-btn`}
        onClick={onToggle}
      >
        <span>{q}</span>
        <Plus size={20} className="kx2-faq__icon" aria-hidden="true" />
      </button>
      <div
        className="kx2-faq__a"
        role="region"
        aria-labelledby={`${id}-btn`}
        id={`${id}-panel`}
      >
        <div className="kx2-faq__a-inner"><p>{a}</p></div>
      </div>
    </div>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────── */
const TICKER = [
  "AUTO-TRIM", "STORY DETECTION", "AI IMAGES", "LIVE CANVAS EDITOR",
  "NATIVE-SCRIPT CAPTIONS", "4+ SHORTS PER JOB", "PER-CHANNEL BRANDING",
  "SEO IN 30+ KEYWORDS", "SHARED TEAM LIBRARY", "AI INSIGHTS",
];

const BUILT_FOR = [
  "News & Bulletin Creators", "Short-form Studios", "Multi-channel Content Teams",
];

const STEPS = [
  { n: "01", t: "Import", b: "Drop in one source video of any length or shape — widescreen, vertical, or square. Kaizer X auto-detects the aspect and picks the right layout, so nothing gets awkwardly cropped." },
  { n: "02", t: "Edit in V4", b: "AI transcribes your audio, splits it into separate stories, trims and stitches a clean feature cut, and gathers relevant images. Everything lands in a live visual editor." },
  { n: "03", t: "Brand & SEO", b: "Get a hook-first title, full description, ~28–30 keywords, and 10–12 hashtags written in your editorial voice — then fine-tune anything." },
  { n: "04", t: "Publish / Schedule", b: "Send one master to all your connected channels at once, each with its own logo, watermark, links, and metadata. Post now or schedule with quiet hours and spacing." },
  { n: "05", t: "Insights", b: "See what's working with median-view analytics, channel comparisons, and an AI coach report that grades your channel and suggests fixes." },
];

const PILLARS = [
  { icon: Clapperboard, title: "The V4 Editor", tag: "A live canvas, not a render-and-pray timeline.", body: "One source-of-truth file powers every output. Adjust image timing, overlays, layout, and text and watch the preview update instantly — then re-render a fresh video in about 10–15 seconds. No hidden state, no guesswork." },
  { icon: Smartphone, title: "Shorts Engine", tag: "At least four Shorts from every job.", body: "Kaizer X carves vertical Shorts from your stories automatically, choosing from four templates — torn card, clean card, split frame, and follow bar — each with native-script captions, your chosen hero image, and full styling control." },
  { icon: Share2, title: "Multi-Destination Publishing", tag: "One master video. Every channel. One click.", body: "Publish the same polished video across all your connected channels, each automatically getting its own branding and tailored metadata. Safe by design: all-or-nothing per publish, with automatic retries and rollback if anything fails." },
  { icon: LibraryIcon, title: "Shared Team Library", tag: "A company-wide creative pool.", body: "Upload great footage once and your whole team can browse, rate, and reuse it to start new jobs — no copying, no duplication. Cloud-backed, searchable, and rated, so the best source clips rise to the top." },
];

const LIBRARY_COLS = [
  { icon: UploadCloud, step: "POST & SHARE", body: "Creatives upload source videos through a secure two-step handshake; files are validated, thumbnailed, and stored in the cloud." },
  { icon: Search, step: "DISCOVER", body: "A responsive grid with real-time search, category filters, and sorting by Newest, Trending, Most Used, and Top Rated — with hover previews and rich badges." },
  { icon: RefreshCw, step: "REUSE", body: "Click \"Use this video\" on any clip to start a brand-new job. It runs the exact same pipeline as a fresh upload — no copies, no duplication in storage." },
];

const LIBRARY_CHIPS = [
  "1–5★ video ratings", "Separate creator reputation", "Trending cache",
  "Soft-delete with 30-day audit", "Watermarked previews for free tier",
];

const PUBLISH = [
  { icon: Upload, title: "Direct", beta: false, body: "Standard high-quality upload with your logo, watermark, and custom thumbnail. Resumable, so an interrupted upload picks up where it left off." },
  { icon: Zap, title: "RTMP", beta: false, body: "A faster lightweight push, ideal for Shorts and lighter workflows." },
  { icon: Share2, title: "Postiz", beta: true, body: "Connect a multi-platform gateway to fan out to other platforms you've linked there." },
];

const SECURITY = [
  { icon: Lock, t: "Encrypted credentials", b: "connected accounts stored with encrypted tokens." },
  { icon: ShieldCheck, t: "All-or-nothing publishing", b: "credits and quota reserved up front, rolled back on failure." },
  { icon: Database, t: "Crash-durable queue", b: "jobs survive restarts and resume automatically." },
  { icon: ShieldAlert, t: "Hardened against prompt injection", b: "AI analytics treat all data as untrusted and validate every output." },
];

const FAQS = [
  { q: "What does Kaizer X actually do?", a: "It turns one source video into a polished feature cut plus several vertical Shorts, with images, captions, branding, and SEO-ready metadata, then lets you publish to your connected channels." },
  { q: "How fast is a re-render?", a: "Edits in the canvas re-render in roughly 10–15 seconds because only the editing stage re-runs." },
  { q: "What video shapes are supported?", a: "Any — widescreen, vertical, or square. Kaizer X measures your source and picks a layout automatically." },
  { q: "How many Shorts will I get?", a: "At least four per job, often more, carved from your stories." },
  { q: "What languages are supported?", a: "Multiple, including auto-detect and specific scripts like Telugu, with native-script captions." },
  { q: "Is my content safe?", a: "Yes — encrypted credentials, an append-only credit ledger, durable job queue, and a quality-control gate on every render." },
  { q: "Can my whole team share footage?", a: "Yes — the shared Library lets anyone browse, rate, and reuse source videos to start new jobs." },
];

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Library", href: "#library" },
  { label: "FAQ", href: "#faq" },
];

const FOOTER_COLS = [
  { title: "Product", links: [["Features", "#features"], ["Editor", "#editor"], ["Library", "#library"]] },
  { title: "Resources", links: [["How it works", "#how"], ["FAQ", "#faq"], ["Docs", "#"]] },
  { title: "Company", links: [["About", "#"], ["Contact", "#"]] },
  { title: "Legal", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Content & copyright responsibility", "/terms"]] },
];

/* ════════════════════════════════════════════════════════════════════════ */
export default function KaizerXLanding() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  });
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = "Kaizer X — AI Video Editor & Shorts Generator Studio";
  }, []);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  const isLight = theme === "light";

  const ThemeBtn = ({ className = "" }) => (
    <button
      type="button"
      onClick={toggleTheme}
      className={`kx2-iconbtn ${className}`}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
    >
      {isLight ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
    </button>
  );

  return (
    <div className="kx2 kx2-themed" data-kx-theme={theme} ref={rootRef}>
      {/* ── 1. NAVBAR ──────────────────────────────────────────────────── */}
      <header className={`kx2-nav kx2-themed ${scrolled ? "kx2-nav--scrolled" : ""}`}>
        <div className="kx2-container kx2-nav__inner">
          <a href="#top" aria-label="Kaizer X home"><HangingLogo /></a>

          <nav className="kx2-nav__links" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="kx2-nav__link">{l.label}</a>
            ))}
          </nav>

          <div className="kx2-nav__right">
            <ThemeBtn />
            <Link to="/login" className="kx2-btn kx2-btn--ghost">Sign in</Link>
            <Link to="/register" className="kx2-btn kx2-btn--primary">Start free</Link>
            <button
              type="button"
              className="kx2-iconbtn kx2-hamburger"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="kx2-mobilemenu">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
            ))}
            <Link to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
            <Link to="/register" onClick={() => setMenuOpen(false)}>Start free</Link>
          </div>
        )}
      </header>

      <main id="top">
        {/* ── 2. HERO ──────────────────────────────────────────────────── */}
        <section className="kx2-hero">
          <div className="kx2-hero__glow" aria-hidden="true" />
          <div className="kx2-container kx2-hero__grid">
            <div>
              <span className="kx2-strap">AI VIDEO PRODUCTION STUDIO</span>
              <h1 className="kx2-hero__h1">
                One source video in. A full content package out.
              </h1>
              <p className="kx2-hero__sub">
                Kaizer X turns a single raw clip into a polished feature cut
                and a set of ready-to-post vertical Shorts — with images, captions,
                on-screen text, branding, and SEO-ready titles written for you. Edit
                everything in a live visual canvas, then publish to all your connected
                channels in one click.
              </p>
              <div className="kx2-hero__cta">
                <Link to="/register" className="kx2-btn kx2-btn--primary kx2-btn--lg">
                  Start creating free
                </Link>
                <a href="#editor" className="kx2-btn kx2-btn--ghost kx2-btn--lg">
                  <Play size={17} aria-hidden="true" /> Watch 60-sec demo
                </a>
              </div>
              <p className="kx2-hero__trust">
                No credit card · Free tier included · Render in ~10–15 seconds
              </p>
            </div>

            {/* Hero product mock: split-frame feature cut + peeking Shorts phones */}
            <div className="kx2-mock">
              <div
                className="kx2-bulletin kx2-themed"
                role="img"
                aria-label="Kaizer X editor preview: a split-frame feature cut with a video panel on the left, a three-image sidebar carousel on the right, a red lower-third headline strap, and a yellow ticker bar."
              >
                <div className="kx2-bulletin__stage">
                  <div className="kx2-bulletin__video">
                    <span className="kx2-bulletin__tc">0:42 / 9:18</span>
                    <span className="kx2-bulletin__play"><Play size={20} /></span>
                  </div>
                  <div className="kx2-bulletin__sidebar">
                    <span className="kx2-bulletin__tile kx2-bulletin__tile--1" />
                    <span className="kx2-bulletin__tile kx2-bulletin__tile--2" />
                    <span className="kx2-bulletin__tile kx2-bulletin__tile--3" />
                  </div>
                </div>
                <div className="kx2-bulletin__lower">
                  <span className="kx2-bulletin__strap">Top story of the hour</span>
                  <span className="kx2-bulletin__ticker">
                    LIVE COVERAGE · MARKETS UP 4% · CITY UNVEILS TRANSIT PLAN · MORE AT TEN
                  </span>
                </div>
              </div>
              <div className="kx2-hero__phones" aria-hidden="true">
                <div className="kx2-miniphone">
                  <div className="kx2-miniphone__screen kx2-miniphone__screen--a">
                    <span className="kx2-miniphone__cap">Markets up 4%</span>
                  </div>
                </div>
                <div className="kx2-miniphone">
                  <div className="kx2-miniphone__screen kx2-miniphone__screen--b">
                    <span className="kx2-miniphone__cap">Transit plan</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. TICKER STRIP ──────────────────────────────────────────── */}
        <div className="kx2-ticker kx2-themed" aria-hidden="true">
          <div className="kx2-ticker__track">
            {[0, 1].map((dup) => (
              <React.Fragment key={dup}>
                {TICKER.map((t, i) => (
                  <span className="kx2-ticker__item" key={`${dup}-${i}`}>
                    <span className="kx2-ticker__dot" />{t}
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── 4. BUILT FOR ─────────────────────────────────────────────── */}
        <section className="kx2-section">
          <div className="kx2-container">
            <span className="kx2-strap">BUILT FOR</span>
            <div className="kx2-builtfor" style={{ marginTop: 22 }}>
              {BUILT_FOR.map((b) => (
                <span className="kx2-pill kx2-themed" key={b}>
                  <span className="kx2-pill__dot" />{b}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. HOW IT WORKS ──────────────────────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center" id="how">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">HOW IT WORKS</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              From raw footage to published in five steps
            </h2>
            <p className="kx2-sub">
              The V4 pipeline does the heavy lifting. You stay in control the whole way.
            </p>
            <div className="kx2-grid kx2-grid--5" style={{ marginTop: 40, textAlign: "left" }}>
              {STEPS.map((s) => (
                <div className="kx2-card kx2-themed" key={s.n}>
                  <span className="kx2-step__num">{s.n}</span>
                  <h3 className="kx2-step__title">{s.t}</h3>
                  <p className="kx2-card__body">{s.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. FEATURE PILLARS ───────────────────────────────────────── */}
        <section className="kx2-section kx2-section--center" id="features">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">FEATURES</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Everything you need in one studio
            </h2>
            <div className="kx2-grid kx2-grid--2" style={{ marginTop: 40, textAlign: "left" }}>
              {PILLARS.map(({ icon: Icon, title, tag, body }) => (
                <div className="kx2-card kx2-themed" key={title}>
                  <span className="kx2-card__icon"><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="kx2-card__title">{title}</h3>
                  <p className="kx2-card__tagline">{tag}</p>
                  <p className="kx2-card__body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 7. CANVAS EDITOR DEEP-DIVE ───────────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center" id="editor">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">CANVAS EDITOR</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Refine every frame in a three-pane workspace
            </h2>
            <div
              className="kx2-editor kx2-themed"
              style={{ marginTop: 36, textAlign: "left" }}
              role="img"
              aria-label="Three-pane Kaizer X canvas editor: a left navigation pane, a center live preview, and a right inspector with SEO and image-carousel controls."
            >
              <div className="kx2-editor__bar" aria-hidden="true">
                <span className="kx2-editor__dot" style={{ background: "#FF6B66" }} />
                <span className="kx2-editor__dot" style={{ background: "#F5C518" }} />
                <span className="kx2-editor__dot" style={{ background: "#22C55E" }} />
              </div>
              <div className="kx2-editor__panes">
                <div className="kx2-pane">
                  <p className="kx2-pane__label">Left — Navigate</p>
                  <div className="kx2-pane__row kx2-pane__row--active" />
                  <div className="kx2-pane__row" />
                  <div className="kx2-pane__row" />
                  <div className="kx2-pane__row" />
                  <p className="kx2-pane__body" style={{ marginTop: 12 }}>
                    Switch between your feature cut and every Short, and browse your image
                    pool and Library in one place.
                  </p>
                </div>
                <div className="kx2-pane">
                  <p className="kx2-pane__label">Center — Preview</p>
                  <div className="kx2-pane__preview"><Play size={28} color="#fff" aria-hidden="true" /></div>
                  <p className="kx2-pane__body">
                    A live canvas that moves in real time as you edit, plus a player for
                    the actual rendered output.
                  </p>
                </div>
                <div className="kx2-pane">
                  <p className="kx2-pane__label">Right — Inspector</p>
                  <p className="kx2-pane__body">
                    Deep control over SEO, thumbnails, story titles, the image carousel
                    (duration, effect, fit, and a 9-point focal grid), text overlays,
                    and layout.
                  </p>
                  <div className="kx2-pane__grid9" aria-hidden="true">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span key={i} className={i === 4 ? "on" : ""} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="kx2-chips">
              {["Save (no render)", "Re-render in seconds", "Publish"].map((c) => (
                <span className="kx2-chip kx2-themed" key={c}>
                  <span className="kx2-chip__dot" />{c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. SHORTS SHOWCASE ───────────────────────────────────────── */}
        <section className="kx2-section kx2-section--center">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">SHORTS ENGINE</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Four Shorts templates, fully yours
            </h2>
            <div className="kx2-phones" style={{ marginTop: 40 }}>
              <div className="kx2-phone">
                <div className="kx2-phone__frame kx2-themed">
                  <div className="kx2-phone__screen kx2-phone__screen--torn">
                    <span className="kx2-phone__head">Markets hit a record high</span>
                  </div>
                </div>
                <span className="kx2-phone__label">Torn Card</span>
              </div>
              <div className="kx2-phone">
                <div className="kx2-phone__frame kx2-themed">
                  <div className="kx2-phone__screen kx2-phone__screen--clean">
                    <span className="kx2-phone__head">New policy announced today</span>
                  </div>
                </div>
                <span className="kx2-phone__label">Clean Card</span>
              </div>
              <div className="kx2-phone">
                <div className="kx2-phone__frame kx2-themed">
                  <div className="kx2-phone__screen kx2-phone__screen--split">
                    <span className="kx2-phone__head">City unveils transit plan</span>
                  </div>
                </div>
                <span className="kx2-phone__label">Split Frame</span>
              </div>
              <div className="kx2-phone">
                <div className="kx2-phone__frame kx2-themed">
                  <div className="kx2-phone__screen kx2-phone__screen--follow">
                    <span className="kx2-phone__head">The season finale recap</span>
                    <span className="kx2-phone__follow">▶ Follow</span>
                  </div>
                </div>
                <span className="kx2-phone__label">Follow Bar</span>
              </div>
            </div>
            <p className="kx2-sub" style={{ marginTop: 30 }}>
              Native-script fonts, custom colors and sizing, your chosen hero image.
            </p>
          </div>
        </section>

        {/* ── 9. LIBRARY ───────────────────────────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center" id="library">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">SHARED TEAM LIBRARY</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              One shared library. Endless reuse.
            </h2>
            <p className="kx2-sub">
              Cloud storage is the single source of truth — upload once, and it's
              instantly available to your whole team, everywhere.
            </p>
            <div className="kx2-grid kx2-grid--3" style={{ marginTop: 40 }}>
              {LIBRARY_COLS.map(({ icon: Icon, step, body }) => (
                <div className="kx2-card kx2-colcard kx2-themed" key={step}>
                  <span className="kx2-card__icon"><Icon size={22} aria-hidden="true" /></span>
                  <p className="kx2-colcard__step">{step}</p>
                  <p className="kx2-card__body">{body}</p>
                </div>
              ))}
            </div>
            <div className="kx2-chips" style={{ marginTop: 30 }}>
              {LIBRARY_CHIPS.map((c) => (
                <span className="kx2-chip kx2-themed" key={c}>
                  <span className="kx2-chip__dot" />{c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── 10. INSIGHTS & TREND FINDER ──────────────────────────────── */}
        <section className="kx2-section kx2-section--center">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">INSIGHTS</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Know what to make next
            </h2>
            <div className="kx2-grid kx2-grid--2" style={{ marginTop: 40, textAlign: "left" }}>
              <div className="kx2-card kx2-themed">
                <span className="kx2-card__icon"><BarChart3 size={22} aria-hidden="true" /></span>
                <h3 className="kx2-card__title">AI Insights</h3>
                <p className="kx2-card__body">
                  Median-view analytics (robust against viral outliers), channel
                  comparisons, and an AI Coach report that grades a channel A–F and
                  lists what's working, what's broken, and what to do next.
                </p>
              </div>
              <div className="kx2-card kx2-themed">
                <span className="kx2-card__icon"><Compass size={22} aria-hidden="true" /></span>
                <h3 className="kx2-card__title">Trend Finder</h3>
                <p className="kx2-card__body">
                  Track public channels, let the topic radar surface trending stories
                  with keywords and urgency, and start a job from a trend in one click.
                </p>
              </div>
            </div>

            <div
              className="kx2-card kx2-themed"
              style={{ marginTop: 22 }}
              role="img"
              aria-label="Radial KPI dashboard with circular gauges for typical vs. best views, interaction rate, upload frequency, and subscriber growth."
            >
              <div className="kx2-gauges">
                <RingGauge pct={72} label="typical vs. best views" stroke="var(--kx-red)" />
                <RingGauge pct={58} label="interaction rate" stroke="var(--kx-yellow)" />
                <RingGauge pct={64} label="upload frequency" stroke="var(--kx-link)" />
                <RingGauge pct={81} label="subscriber growth" stroke="var(--kx-success)" />
              </div>
            </div>
          </div>
        </section>

        {/* ── 11. MULTI-DESTINATION PUBLISHING ─────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">PUBLISHING</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>Publish your way</h2>
            <p className="kx2-sub">
              Three delivery paths, so you choose speed, control, or reach.
            </p>
            <div className="kx2-grid kx2-grid--3" style={{ marginTop: 40, textAlign: "left" }}>
              {PUBLISH.map(({ icon: Icon, title, beta, body }) => (
                <div className="kx2-card kx2-themed" key={title}>
                  <span className="kx2-card__icon"><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="kx2-card__title">
                    {title}
                    {beta && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        padding: "2px 7px", borderRadius: 999,
                        background: "var(--kx-yellow)", color: "#15181D",
                        verticalAlign: "middle",
                      }}>Beta</span>
                    )}
                  </h3>
                  <p className="kx2-card__body">{body}</p>
                </div>
              ))}
            </div>
            <p className="kx2-sub" style={{ marginTop: 28 }}>
              Per-channel branding is resolved automatically and verified before every
              upload, so no channel ever gets another's logo or metadata.
            </p>
          </div>
        </section>

        {/* ── 12. SECURITY & RELIABILITY ───────────────────────────────── */}
        <section className="kx2-section kx2-section--center">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">SECURITY</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Built to be safe and durable
            </h2>
            <div className="kx2-grid kx2-grid--4" style={{ marginTop: 40, textAlign: "left" }}>
              {SECURITY.map(({ icon: Icon, t, b }) => (
                <div className="kx2-secitem" key={t}>
                  <span className="kx2-secitem__icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="kx2-secitem__title">{t}</span>
                  <span className="kx2-secitem__body">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 13. FAQ ──────────────────────────────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center" id="faq">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">FAQ</span>
            <h2 className="kx2-heading" style={{ marginTop: 18, marginBottom: 36 }}>
              Frequently asked questions
            </h2>
            <div className="kx2-faq">
              {FAQS.map((f, i) => (
                <FaqItem
                  key={i}
                  id={`kx2-faq-${i}`}
                  q={f.q}
                  a={f.a}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── 14. FINAL CTA ────────────────────────────────────────────── */}
        <section className="kx2-finalcta">
          <div className="kx2-container">
            <h2>Your next feature cut is one upload away.</h2>
            <p>Bring a single video. Walk away with a finished package ready to publish.</p>
            <Link to="/register" className="kx2-btn kx2-btn--onred kx2-btn--lg">
              Start creating free
            </Link>
          </div>
        </section>
      </main>

      {/* ── 15. FOOTER ───────────────────────────────────────────────────── */}
      <footer className="kx2-footer kx2-themed">
        <div className="kx2-container">
          <div className="kx2-footer__grid">
            <div>
              <HangingLogo animate={false} />
              <p className="kx2-footer__blurb">
                Kaizer X — an AI video production studio. A product of Sharkify Private Limited.
              </p>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p className="kx2-footer__col-title">{col.title}</p>
                {col.links.map(([label, href]) =>
                  href.startsWith("/") ? (
                    <Link key={label} to={href} className="kx2-footer__link">{label}</Link>
                  ) : (
                    <a key={label} href={href} className="kx2-footer__link">{label}</a>
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="kx2-footer__bottom">
            <span className="kx2-footer__copy">© Kaizer X</span>
            <div className="kx2-footer__socials">
              <a href="#" className="kx2-iconbtn" aria-label="YouTube"><Youtube size={17} /></a>
              <a href="#" className="kx2-iconbtn" aria-label="Instagram"><Instagram size={17} /></a>
              <a href="#" className="kx2-iconbtn" aria-label="Facebook"><Facebook size={17} /></a>
              <a href="#" className="kx2-iconbtn" aria-label="LinkedIn"><Linkedin size={17} /></a>
              <ThemeBtn />
            </div>
          </div>

          <p className="kx2-footer__compliance">
            You are responsible for the rights to content you upload and publish.
          </p>
          <p className="kx2-footer__compliance">
            Kaizer X is not affiliated with or endorsed by YouTube or Google. Use of any
            connected platform is subject to that platform's terms — including the{" "}
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">
              YouTube Terms of Service
            </a>.
          </p>
        </div>
      </footer>
    </div>
  );
}
