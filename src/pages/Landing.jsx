import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Scissors,
  Radio,
  Music4,
  SplitSquareHorizontal,
  Image as ImageIcon,
  RadioTower,
  Sparkles,
  Check,
  Star,
  ArrowRight,
  Twitter,
  Youtube,
  Linkedin,
  Mail,
  Film,
} from "lucide-react";
import {
  Button,
  SectionHeader,
  LayoutPreview,
  DEFAULT_LAYOUT_OPTIONS,
  ClipEnginePreview,
  ParticleField,
  Reveal,
  Counter,
  GlowButton,
  MagneticButton,
  Tilt3D,
  TypewriterRotator,
  AIStatusBar,
  useActiveSection,
} from "../components/ui";
import { useAuth } from "../auth/AuthProvider";

/* ------------------------------------------------------------------ */
/*  Landing — public marketing page                                    */
/* ------------------------------------------------------------------ */
const LANDING_SECTIONS = [
  { id: "hero",          label: "hero" },
  { id: "product",       label: "two products" },
  { id: "features",      label: "features" },
  { id: "watch",         label: "the 90-second demo" },
  { id: "live-director", label: "live director" },
  { id: "pricing",       label: "pricing" },
  { id: "social",        label: "testimonials" },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { activeSectionLabel } = useActiveSection(LANDING_SECTIONS);

  // Smooth scroll for hash links (used by in-page nav). The CSS also sets
  // `html { scroll-behavior: smooth }` under motion-safe, so this just
  // bridges the button click → element id lookup.
  function scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-dark text-ink-100 relative overflow-x-hidden">
      <TopNav isAuthenticated={isAuthenticated} scrollTo={scrollTo} />

      <section id="hero">
        <Hero scrollTo={scrollTo} />
      </section>

      <section id="product">
        <ProductSplit />
      </section>

      <section id="features">
        <FeaturesGrid />
      </section>

      <section id="watch">
        <WatchSection />
      </section>

      <LiveDirectorDeepDive />

      <section id="pricing">
        <Pricing />
      </section>

      <section id="social">
        <SocialProof />
      </section>

      <FinalCTA />

      <Footer />

      <AIStatusBar label={activeSectionLabel} />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  1. Top Nav                                                          */
/* ──────────────────────────────────────────────────────────────────── */
function TopNav({ isAuthenticated, scrollTo }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 6);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const anchors = [
    { id: "product",       label: "Product" },
    { id: "features",      label: "Features" },
    { id: "live-director", label: "Live Director" },
    { id: "pricing",       label: "Pricing" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all ${
        scrolled ? "py-2" : "py-3"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-5">
        <div className="glass-panel flex items-center justify-between px-4 py-3 rounded-2xl">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
              KAIZER
            </div>
            <span className="text-ink-300 text-xs font-medium tracking-[0.2em] font-mono hidden sm:inline">
              NEWS
            </span>
          </Link>

          {/* Anchors */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-300">
            {anchors.map((a) => (
              <button
                key={a.id}
                onClick={() => scrollTo(a.id)}
                className="hover:text-white transition-colors"
              >
                {a.label}
              </button>
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button as={Link} to="/app" size="sm" rightIcon={<ArrowRight size={14} />}>
                Go to app
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline text-sm text-ink-300 hover:text-white px-3 py-2 rounded-md transition-colors"
                >
                  Sign in
                </Link>
                <Button as={Link} to="/register" size="sm">
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  2. Hero                                                             */
/* ──────────────────────────────────────────────────────────────────── */
function Hero({ scrollTo }) {
  return (
    <section
      className="ui-section relative flex items-center"
      style={{ minHeight: "90vh" }}
    >
      {/* decorative layers — grid-bg (bottom), particles (middle), sheen (top) */}
      <div className="hero-grid-bg" aria-hidden="true" />
      <ParticleField density={40} className="hero-particles" />
      <div
        className="absolute inset-0 bg-hero-sheen pointer-events-none"
        aria-hidden="true"
      />

      <div className="ui-section-inner relative grid lg:grid-cols-[1.05fr,1fr] gap-14 items-center w-full">
        {/* Copy column */}
        <div className="flex flex-col gap-7">
          <Reveal>
            <span className="eyebrow">AUTONOMOUS MEDIA ENGINE</span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="heading-hero heading-hero--flow text-4xl sm:text-5xl lg:text-[64px]">
              Go live with zero operators.
              <br />
              Clip your archive while you sleep.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lede max-w-xl">
              One engine films your concerts live and turns recorded shows into
              platform-ready clips. No editor, no switcher operator, no operator
              period.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="flex flex-wrap gap-3">
              <MagneticButton strength={0.25} range={120}>
                <GlowButton
                  as={Link}
                  to="/register"
                  size="lg"
                  rightIcon={<ArrowRight size={16} />}
                >
                  Start free — 14 days
                </GlowButton>
              </MagneticButton>
              <MagneticButton strength={0.2} range={100}>
                <Button
                  variant="ghost"
                  size="lg"
                  leftIcon={<Play size={16} />}
                  onClick={() => scrollTo("product")}
                >
                  Watch 90-second demo
                </Button>
              </MagneticButton>
            </div>
          </Reveal>

          {/* Typewriter rotator — the site feels alive */}
          <Reveal delay={300}>
            <p className="text-sm text-ink-300 flex items-center gap-2 flex-wrap">
              <span className="text-ink-400">Right now Kaizer is</span>
              <TypewriterRotator
                phrases={[
                  "cutting on the beat.",
                  "watching the crowd react.",
                  "splitting stage + audience.",
                  "bridging dead air.",
                  "pushing to YouTube + Twitch.",
                ]}
                typeSpeed={45}
                deleteSpeed={25}
                holdDuration={1800}
                className="text-accent2 font-semibold"
              />
            </p>
          </Reveal>

          {/* Stat row */}
          <Reveal delay={320}>
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-ink-800 max-w-lg">
              <Stat target={10} suffix="+" label="Hours saved / event" />
              <Stat target={6}             label="Social formats / clip" />
              <Stat target="<1s"           label="Auto-cut latency" />
            </div>
          </Reveal>
        </div>

        {/* Video column */}
        <Reveal delay={200} className="relative">
          <Tilt3D max={5} glare scale={1.01}>
          <div className="glass-panel p-3 rounded-3xl shadow-elevated">
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-black">
              <video
                src="/demo/kaizer-demo.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Live badge */}
              <div className="absolute top-3 left-3 flex items-center gap-2 glass-panel px-3 py-1.5 text-xs font-semibold text-white">
                <span className="ui-live-dot" />
                LIVE · Program feed — auto-directed
              </div>

              {/* Floating chips — bob gently, stagger so they don't sync */}
              <FloatingChip
                className="absolute top-4 right-4"
                delay="0s"
                dot
              >
                AUTO CUT · 00:04
              </FloatingChip>
              <FloatingChip
                className="absolute top-1/2 -translate-y-1/2 right-2 hidden sm:inline-flex"
                delay="1.2s"
              >
                SPLIT · joke_laugh
              </FloatingChip>
              <FloatingChip
                className="absolute bottom-4 right-4"
                delay="2.2s"
                arrow
              >
                RELAY → 3 destinations
              </FloatingChip>
            </div>
          </div>
          </Tilt3D>

          {/* Decorative glow blob */}
          <div
            className="absolute -bottom-12 -right-10 w-64 h-64 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(231,76,60,0.6) 0%, transparent 70%)",
            }}
            aria-hidden="true"
          />
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ target, suffix, label }) {
  return (
    <div className="ui-stat">
      <div className="ui-stat-value">
        <Counter target={target} suffix={suffix} />
      </div>
      <div className="ui-stat-label">{label}</div>
    </div>
  );
}

function FloatingChip({ children, className = "", delay = "0s", dot, arrow }) {
  return (
    <span
      className={`float-chip ${className}`.trim()}
      style={{ animationDelay: delay }}
    >
      {dot ? <span className="float-chip__dot" /> : null}
      {arrow ? <span className="float-chip__arrow">→</span> : null}
      <span>{children}</span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  3. Two autonomous products                                          */
/* ──────────────────────────────────────────────────────────────────── */
function ProductSplit() {
  return (
    <section id="product" className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="TWO ENGINES · ONE PLATFORM"
              title="Recorded or live — Kaizer runs the show."
              lede="Drop in a recorded long-form show and it walks out as eight captioned clips. Plug in cameras and a mic and it directs your event in real time."
            />
          </Reveal>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-4">
          {/* Card 1: Clip Engine */}
          <Reveal delay={80}>
            <div className="feature-card p-8 flex flex-col gap-6 h-full">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg,#e74c3c 0%,#c0392b 100%)",
                  }}
                >
                  <Scissors size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white leading-tight">
                    AI Clip Engine
                  </h3>
                  <p className="text-ink-300 text-sm mt-1">
                    Long-form recording → platform-ready clips.
                  </p>
                </div>
              </div>

              <p className="text-ink-200 text-[15px] leading-relaxed">
                Drop a 90-minute show and Kaizer detects the hooks, trims the
                dead air and exports a set of captioned, styled clips sized for
                every feed you publish to.
              </p>

              <div className="rounded-xl overflow-hidden mt-2 bg-ink-950 border border-ink-800 p-3">
                <ClipEnginePreview size="full" />
              </div>
              <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/30 text-[11px] font-bold tracking-wide uppercase text-accent2 self-start">
                Long-form → 5× clips
              </div>

              <a
                href="#features"
                className="text-accent2 text-sm font-semibold inline-flex items-center gap-1 hover:text-white transition-colors mt-auto"
              >
                Learn more
                <ArrowRight size={14} />
              </a>
            </div>
          </Reveal>

          {/* Card 2: Live Director */}
          <Reveal delay={200}>
            <div className="feature-card p-8 flex flex-col gap-6 h-full">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg,#e74c3c 0%,#c0392b 100%)",
                  }}
                >
                  <Radio size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white leading-tight">
                    Autonomous Live Director
                  </h3>
                  <p className="text-ink-300 text-sm mt-1">
                    Cameras in. Broadcast out. Nobody behind the desk.
                  </p>
                </div>
              </div>

              <p className="text-ink-200 text-[15px] leading-relaxed">
                Kaizer listens to every camera, cuts on beats, splits on crowd
                reactions and bridges dead air — then pushes the program feed to
                YouTube, Twitch and Facebook at once.
              </p>

              <div className="rounded-xl p-5 bg-ink-950 border border-ink-800">
                <LayoutPreview layout="split2_hstack" size="full" primary={0} />
                <p className="text-center text-xs text-ink-400 mt-3">
                  Real split decision — joke → crowd laugh.
                </p>
              </div>

              <a
                href="#live-director"
                className="text-accent2 text-sm font-semibold inline-flex items-center gap-1 hover:text-white transition-colors mt-auto"
              >
                Learn more
                <ArrowRight size={14} />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  4. Features grid                                                    */
/* ──────────────────────────────────────────────────────────────────── */
function FeaturesGrid() {
  const features = [
    {
      icon: Music4,
      title: "Beat-synced cuts",
      body: "The director cuts on beats when music is playing and holds on the speaker when someone is talking. It reads the room.",
    },
    {
      icon: SplitSquareHorizontal,
      title: "Auto split-screen",
      body: "Joke → laugh, Q&A and interaction moments become split-screens without a human pressing a button.",
      preview: <LayoutPreview layout="split2_hstack" size="full" primary={0} />,
    },
    {
      icon: Sparkles,
      title: "Dead-air bridge",
      body: "Every camera silent? Kaizer auto-cuts to your title card and back the moment the room comes alive.",
    },
    {
      icon: ImageIcon,
      title: "Green-screen backgrounds",
      body: "Per-camera chroma key with image or looping video backgrounds — broadcast-grade without a studio.",
    },
    {
      icon: RadioTower,
      title: "Relay to anywhere",
      body: "Broadcast the program feed to YouTube, Twitch and Facebook simultaneously from one click.",
    },
    {
      icon: Film,
      title: "Clip your archive",
      body: "A 90-minute recorded show becomes eight platform-ready clips — captioned, trimmed and styled.",
      preview: <ClipEnginePreview size="full" />,
    },
  ];

  return (
    <section id="features" className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="WHAT KAIZER DOES"
              title="One engine. Every format. Zero button-pressing."
              lede="Every feature is designed around the same idea — remove the operator from the loop."
            />
          </Reveal>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <Reveal key={i} delay={(i % 3) * 100}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, body, preview }) {
  return (
    <article className="feature-card p-7 flex flex-col gap-4 h-full">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(231,76,60,0.25) 0%, rgba(192,57,43,0.10) 100%)",
          border: "1px solid rgba(231,76,60,0.25)",
        }}
      >
        <Icon size={20} className="text-accent2" />
      </div>
      <h3 className="text-base font-bold text-white">{title}</h3>
      <p className="text-ink-300 text-sm leading-relaxed">{body}</p>
      {preview ? (
        <div className="mt-2 rounded-lg overflow-hidden border border-ink-800 p-2 bg-ink-950">
          {preview}
        </div>
      ) : null}
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  5. Watch — video deep-dive                                          */
/* ──────────────────────────────────────────────────────────────────── */
function WatchSection() {
  const highlights = [
    { t: "03s", label: "VAD detects the speaker" },
    { t: "11s", label: "Crowd reacts — director splits" },
    { t: "24s", label: "Dead air → title card bridge" },
    { t: "41s", label: "Program feed pushes to YouTube + Twitch" },
  ];

  return (
    <section className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="WATCH"
              title="90 seconds inside a live show."
              lede="Watch the director read the room and switch cameras, layouts and destinations in real time."
            />
          </Reveal>
        </div>

        <div className="grid lg:grid-cols-[2fr,1fr] gap-8 items-start">
          <Reveal>
            <div className="glass-panel p-3 rounded-3xl shadow-elevated">
              <video
                controls
                poster="/demo/showcase-2.jpeg"
                src="/demo/kaizer-demo.mp4"
                className="w-full rounded-2xl aspect-video bg-black"
              />
            </div>
          </Reveal>

          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold tracking-[0.18em] uppercase text-ink-400">
              What you're seeing
            </h4>
            <ul className="flex flex-col gap-3">
              {highlights.map((h, i) => (
                <Reveal key={i} delay={i * 90} as="li">
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-ink-800 bg-ink-900/60">
                    <span className="text-accent2 text-xs font-bold font-mono mt-0.5 min-w-[34px]">
                      {h.t}
                    </span>
                    <span className="text-ink-200 text-sm">{h.label}</span>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  6. Live Director deep-dive                                          */
/* ──────────────────────────────────────────────────────────────────── */
function LiveDirectorDeepDive() {
  return (
    <section id="live-director" className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="LIVE"
              title="Every layout the director can pick — visualised."
              lede="Kaizer switches both camera and layout in real time, picking the composition that best tells the moment."
            />
          </Reveal>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {DEFAULT_LAYOUT_OPTIONS.map((opt, i) => (
            <Reveal key={opt.id} delay={(i % 3) * 90}>
              <Tilt3D max={7} glare>
              <div className="layout-tile" data-cursor="interactive">
                <LayoutPreview layout={opt.id} size="full" />
                <div className="layout-tile-label">
                  <span className="layout-tile-name">{opt.name}</span>
                  {opt.badge ? (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent/15 text-accent2 border border-accent/30">
                      {opt.badge}
                    </span>
                  ) : null}
                </div>
                <p className="layout-tile-desc">{opt.desc}</p>
              </div>
              </Tilt3D>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  7. Pricing                                                          */
/* ──────────────────────────────────────────────────────────────────── */
function Pricing() {
  const plans = [
    {
      name: "Starter",
      price: "29",
      tagline: "For solo creators running one room.",
      features: [
        "Up to 2 live cameras",
        "Unlimited recorded clips",
        "Beat-synced auto-cuts",
        "One simultaneous destination",
        "Email support",
      ],
      cta: "Start with Starter",
      variant: "ghost",
      popular: false,
    },
    {
      name: "Pro",
      price: "99",
      tagline: "The full autonomous stack.",
      features: [
        "Up to 6 live cameras",
        "Multi-destination relay",
        "Chroma-key backgrounds",
        "Dead-air bridge automation",
        "Priority support",
      ],
      cta: "Get Pro",
      variant: "primary",
      popular: true,
    },
    {
      name: "Studio",
      price: "249",
      tagline: "For venues and touring crews.",
      features: [
        "Unlimited cameras",
        "Priority GPU encoding",
        "Dedicated Slack channel",
        "Custom title-card packs",
        "SLA-backed uptime",
      ],
      cta: "Choose Studio",
      variant: "ghost",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="PRICING"
              title="Simple, fair, no per-seat nonsense."
              lede="Everything you need to go live and clip. Cancel any time."
            />
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 100}>
              <PricingCard plan={p} />
            </Reveal>
          ))}
        </div>

        <p className="text-center text-ink-400 text-sm mt-10">
          All plans include a 14-day free trial — no card required.
        </p>
      </div>
    </section>
  );
}

function PricingCard({ plan }) {
  const { name, price, tagline, features, cta, variant, popular } = plan;
  return (
    <div
      className={`ui-card p-8 flex flex-col gap-6 relative h-full ${
        popular ? "ui-card--selected" : ""
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-white text-[10px] font-bold tracking-widest uppercase">
          Most popular
        </span>
      )}

      <div>
        <h3 className="text-lg font-bold text-white">{name}</h3>
        <p className="text-ink-400 text-sm mt-1">{tagline}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-black text-white tracking-tight">
          ${price}
        </span>
        <span className="text-ink-400 text-sm">/mo</span>
      </div>

      <ul className="flex flex-col gap-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
            <Check size={16} className="text-green-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        as={Link}
        to="/register"
        variant={variant}
        size="md"
        className="justify-center w-full mt-auto"
      >
        {cta}
      </Button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  8. Social proof                                                     */
/* ──────────────────────────────────────────────────────────────────── */
function SocialProof() {
  const quotes = [
    {
      text:
        "I used to watch two monitors and push buttons all night. Now I just watch the show.",
      name: "Marcus Lane",
      role: "Front-of-House Engineer",
      venue: "Echo Hall, Brooklyn",
      color: "#e74c3c",
    },
    {
      text:
        "We replaced a three-person broadcast crew with Kaizer on our Thursday comedy night. Zero complaints from the audience.",
      name: "Priya Shah",
      role: "Venue Operations",
      venue: "The Lantern Club",
      color: "#f39c12",
    },
    {
      text:
        "The clip engine turned our 90-minute recorded set into eight reels overnight. Growth on Shorts doubled in a month.",
      name: "Deniz Kaya",
      role: "Tour Content Manager",
      venue: "Aether Live",
      color: "#22c55e",
    },
  ];

  const photos = [
    "/demo/showcase-1.jpeg",
    "/demo/showcase-2.jpeg",
    "/demo/showcase-3.jpeg",
    "/demo/showcase-4.jpeg",
  ];

  return (
    <section className="ui-section">
      <div className="ui-section-inner">
        <div className="ui-section-head">
          <Reveal>
            <SectionHeader
              eyebrow="TRUSTED BY"
              title="The operators trust us because we replace them gracefully."
              lede="Front-of-house engineers, tour managers and venue owners — running shows autonomously from day one."
            />
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map((q, i) => (
            <Reveal key={i} delay={i * 100}>
              <TestimonialCard q={q} />
            </Reveal>
          ))}
        </div>

        {/* Photo strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
          {photos.map((src, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="relative aspect-video rounded-xl overflow-hidden opacity-70 hover:opacity-100 transition-opacity border border-ink-800">
                <img
                  src={src}
                  alt={`Kaizer customer show ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ q }) {
  const initials = q.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <div className="ui-card p-7 flex flex-col gap-5 h-full">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={14} className="text-accent3 fill-accent3" />
        ))}
      </div>
      <p className="text-ink-100 text-[15px] leading-relaxed">
        &ldquo;{q.text}&rdquo;
      </p>
      <div className="flex items-center gap-3 mt-auto pt-3 border-t border-ink-800">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: q.color }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{q.name}</div>
          <div className="text-xs text-ink-400 truncate">
            {q.role} · {q.venue}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  9. Final CTA                                                        */
/* ──────────────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="ui-section">
      <div className="ui-section-inner">
        <div
          className="relative rounded-3xl overflow-hidden p-14 md:p-20 text-center"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(231,76,60,0.22) 0%, rgba(10,10,10,1) 65%), #0a0a0a",
            border: "1px solid rgba(231,76,60,0.35)",
            boxShadow:
              "0 0 0 1px rgba(231,76,60,0.1), 0 40px 80px -30px rgba(231,76,60,0.45)",
          }}
        >
          <div className="hero-grid-bg" aria-hidden="true" />

          <Reveal>
            <div className="relative flex flex-col items-center gap-6">
              <h2 className="heading-hero heading-hero--flow text-4xl sm:text-5xl lg:text-6xl max-w-3xl">
                Your next show runs itself.
              </h2>
              <p className="lede max-w-xl">
                Fourteen days on us. No card, no setup calls — plug in a camera
                and a mic, and let Kaizer direct.
              </p>
              <div className="flex flex-wrap gap-3 justify-center pt-2">
                <MagneticButton strength={0.28} range={140}>
                  <GlowButton
                    as={Link}
                    to="/register"
                    size="lg"
                    rightIcon={<ArrowRight size={16} />}
                  >
                    Start your 14-day trial
                  </GlowButton>
                </MagneticButton>
                <MagneticButton strength={0.2} range={100}>
                  <Button
                    as="a"
                    href="mailto:hello@kaizer.news"
                    variant="ghost"
                    size="lg"
                    leftIcon={<Mail size={16} />}
                  >
                    Talk to us
                  </Button>
                </MagneticButton>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/*  10. Footer                                                          */
/* ──────────────────────────────────────────────────────────────────── */
function Footer() {
  const product = [
    { label: "Features",      href: "#features" },
    { label: "Live Director", href: "#live-director" },
    { label: "Pricing",       href: "#pricing" },
  ];
  const company = [
    { label: "About",     href: "#" },
    { label: "Blog",      href: "#" },
    { label: "Changelog", href: "#" },
    { label: "Careers",   href: "#" },
  ];
  // Real privacy / terms targets — Google's OAuth verifier crawls this
  // page and rejects if these links 404 or anchor to "#".
  const legal = [
    { label: "Privacy",  href: "/privacy" },
    { label: "Terms",    href: "/terms" },
    { label: "Security", href: "/privacy#6-how-we-store-and-protect-your-data" },
  ];

  return (
    <footer className="border-t border-ink-800 pt-16 pb-10 px-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid md:grid-cols-4 gap-10">
          <div className="flex flex-col gap-4 md:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <div className="bg-accent rounded px-2 py-0.5 text-white font-black text-sm tracking-widest">
                KAIZER
              </div>
              <span className="text-ink-300 text-xs font-medium tracking-[0.2em] font-mono">
                NEWS
              </span>
            </Link>
            <p className="text-ink-400 text-sm max-w-xs leading-relaxed">
              Autonomous live direction and long-form clipping — one engine for
              every room.
            </p>
          </div>

          <FooterCol title="Product" items={product} />
          <FooterCol title="Company" items={company} />
          <FooterCol title="Legal"   items={legal} />
        </div>

        <div className="mt-14 pt-6 border-t border-ink-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-ink-500 text-xs">
            © {new Date().getFullYear()} Kaizer News. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-ink-400">
            <a href="#" aria-label="Twitter" className="hover:text-white transition-colors">
              <Twitter size={16} />
            </a>
            <a href="#" aria-label="YouTube" className="hover:text-white transition-colors">
              <Youtube size={16} />
            </a>
            <a href="#" aria-label="LinkedIn" className="hover:text-white transition-colors">
              <Linkedin size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs uppercase tracking-[0.14em] font-bold text-ink-400">
        {title}
      </h4>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.label}>
            <a
              href={it.href}
              className="text-ink-300 text-sm hover:text-white transition-colors"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
