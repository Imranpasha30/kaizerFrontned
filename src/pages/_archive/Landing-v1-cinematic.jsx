import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight, Play, Check, Sparkles, Youtube, ShieldCheck,
  Wand2, Languages, Image as ImageIcon, Twitter, Linkedin, Mail,
  Github, ChevronDown, Eye, Scissors, Send, Lock,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

/* ──────────────────────────────────────────────────────────────────── */
/*  Kaizer News — cinematic, story-driven landing page                  */
/*                                                                       */
/*  Each section is a SCENE. The user reads it like a film, not a       */
/*  feature list. Voice is second-person and narrative ("you record,    */
/*  we cut..."). Every section earns the next scroll.                   */
/* ──────────────────────────────────────────────────────────────────── */

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const loc = useLocation();

  function scrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (loc.hash) {
      const id = loc.hash.replace("#", "");
      setTimeout(() => scrollTo(id), 100);
    }
  }, [loc.hash]);

  return (
    <div className="bg-white text-slate-900 overflow-x-hidden">
      <FloatingNav isAuthenticated={isAuthenticated} scrollTo={scrollTo} />

      {/* ── Act 0: The opening shot ──────────────────────────────── */}
      <SceneOpening scrollTo={scrollTo} />

      {/* ── Act 1: The pain ──────────────────────────────────────── */}
      <ScenePain />

      {/* ── Act 2: The pivot ─────────────────────────────────────── */}
      <ScenePivot />

      {/* ── Act 3: The three actions Kaizer takes (story body) ─── */}
      <SceneAction
        chapter="Chapter I"
        eyebrow="We watch"
        question="What if the best moments were obvious?"
        title="We see the moments that matter."
        body="The pipeline reads transcripts and watches the footage. It surfaces the lines the audience leans in for — the laugh, the gasp, the line that earns a share. You don't scrub. We mark them."
        icon={Eye}
        accent="from-red-500 to-rose-500"
        n="01"
      />
      <SceneAction
        chapter="Chapter II"
        eyebrow="We cut"
        question="What if the work happened while you sleep?"
        title="We cut, caption, and brand."
        body="Every moment becomes a 9:16 clip. Captions in your language, fonts you chose, broadcast cards that match your show. Per-channel logos burn in just before upload — Auto Wala gets Auto Wala's brand, every time."
        icon={Scissors}
        accent="from-orange-500 to-amber-500"
        n="02"
      />
      <SceneAction
        chapter="Chapter III"
        eyebrow="We publish"
        question="What if the upload was already done?"
        title="We deliver. You decide."
        body="Connect your channel once via Google's standard OAuth. Pick a clip, pick destinations, pick a time — or let it ship now. Titles, descriptions, tags, thumbnails — Gemini wrote them. We just press send."
        icon={Send}
        accent="from-rose-500 to-pink-500"
        n="03"
      />

      {/* ── Act 4: Trust + transparency (compliance, but in story voice) */}
      <SceneTrust />

      {/* ── Act 5: The numbers ───────────────────────────────────── */}
      <SceneNumbers />

      {/* ── Act 6: Pricing ───────────────────────────────────────── */}
      <ScenePricing />

      {/* ── Act 7: Closing CTA ───────────────────────────────────── */}
      <SceneClose />

      <Footer />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Hooks
   ════════════════════════════════════════════════════════════════════ */

function useReveal(threshold = 0.2) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("in-view");
            io.unobserve(el);
          }
        });
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

function useCounter(target, { duration = 1600 } = {}) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!started.current && e.isIntersecting) {
            started.current = true;
            const t0 = performance.now();
            const step = (now) => {
              const t = Math.min(1, (now - t0) / duration);
              const eased = 1 - Math.pow(1 - t, 3);
              setVal(Math.round(eased * target));
              if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, duration]);
  return [val, ref];
}

/* Word-by-word reveal */
function Words({ text, className = "", baseDelay = 0, perWord = 70 }) {
  const ref = useReveal(0.3);
  const words = text.split(" ");
  return (
    <span ref={ref} className={`kx-words ${className}`}>
      {words.map((w, i) => (
        <span
          key={i}
          style={{ "--w-delay": `${baseDelay + i * perWord}ms` }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

function Reveal({ children, delay = 0, className = "" }) {
  const ref = useReveal(0.2);
  return (
    <div
      ref={ref}
      className={`kx-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Floating nav (minimal — story-mode wants quiet chrome)
   ════════════════════════════════════════════════════════════════════ */

function FloatingNav({ isAuthenticated, scrollTo }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-white/85 backdrop-blur-lg border-b border-slate-200/60 shadow-sm"
          : ""
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" aria-label="Kaizer News — home">
          <span className="bg-red-600 text-white font-black text-sm tracking-widest rounded px-2 py-1 transition-transform group-hover:scale-105">
            KAIZER
          </span>
          {/* "NEWS" is now visible at every breakpoint so the homepage app
              name always reads "Kaizer News" — required by Google's OAuth
              verification so it matches the consent-screen app name. */}
          <span className="text-slate-700 text-xs font-bold tracking-[0.2em] inline">
            NEWS
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="kx-glow-btn inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Open app <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-block text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-md transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="kx-glow-btn inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition"
              >
                Begin <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 0 — The opening shot
   ════════════════════════════════════════════════════════════════════ */

function SceneOpening({ scrollTo }) {
  return (
    <section className="kx-scene kx-letterbox kx-vignette relative">
      <div className="kx-camera-pan kx-slow-zoom" />
      <div className="kx-grid-bg" />

      <div className="relative max-w-4xl mx-auto text-center flex flex-col items-center gap-8">
        {/*
          Product-identity banner — required by Google OAuth verification.
          Reviewers must see (1) the exact app name that matches the OAuth
          consent screen ("Kaizer News") and (2) a plain-English purpose
          statement above the fold without scrolling. The cinematic hero
          tagline below is preserved for the user experience.
        */}
        <Reveal>
          <div className="flex flex-col items-center gap-3">
            <p className="text-[11px] font-bold tracking-[0.4em] text-red-600 uppercase">
              About this app
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Kaizer News
            </h2>
            <p className="text-base sm:text-lg text-slate-700 max-w-2xl leading-relaxed">
              Kaizer News is an AI video automation platform that turns long-form
              recordings into multiple short-form clips and publishes them to
              creators' YouTube channels on their behalf using the YouTube Data
              API with the creator's explicit consent.
            </p>
          </div>
        </Reveal>

        <Reveal delay={300}>
          <span className="kx-chapter">A short film by Kaizer News</span>
        </Reveal>

        <h1 className="kx-display max-w-4xl">
          <Words text="Every video has more inside it." baseDelay={400} />
          <br />
          <span className="kx-display-grad">
            <Words text="Most of it never sees daylight." baseDelay={900} />
          </span>
        </h1>

        <Reveal delay={1700}>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl leading-relaxed">
            What if the best moments cut themselves? Wrote their own captions?
            Found their own audience?
          </p>
        </Reveal>

        <Reveal delay={2100}>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <Link
              to="/register"
              className="kx-glow-btn inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-base font-semibold px-7 py-3.5 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              Watch it happen <ArrowRight size={16} />
            </Link>
            <button
              onClick={() => scrollTo("act-pain")}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium px-4 py-3 transition-colors"
            >
              <span>Continue reading</span>
              <ChevronDown size={14} className="animate-bounce" />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 1 — The pain
   ════════════════════════════════════════════════════════════════════ */

function ScenePain() {
  const tasks = [
    "Re-watch the recording.",
    "Mark the moments that matter.",
    "Cut to vertical, twice.",
    "Write captions, line by line.",
    "Generate thumbnails.",
    "Write SEO. Test. Rewrite.",
    "Burn the channel logo.",
    "Upload. Repeat for the next channel.",
  ];

  return (
    <section id="act-pain" className="kx-scene relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50/50 to-white pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center">
        <Reveal>
          <span className="kx-chapter">Act One — The work</span>
        </Reveal>

        <Reveal delay={150}>
          <h2 className="kx-display mt-8 max-w-3xl mx-auto">
            <Words text="An hour of footage." />
            <br />
            <span className="text-slate-400">
              <Words text="A day of editing." baseDelay={400} />
            </span>
          </h2>
        </Reveal>

        <Reveal delay={900}>
          <p className="kx-question max-w-2xl mx-auto mt-10">
            You know what comes next. You've done it a hundred times.
          </p>
        </Reveal>

        <Reveal delay={1100}>
          <ol className="mt-12 max-w-md mx-auto text-left flex flex-col gap-3">
            {tasks.map((t, i) => (
              <li
                key={t}
                className="flex items-start gap-3 text-slate-700 text-[15px] kx-reveal"
                style={{ transitionDelay: `${1200 + i * 80}ms` }}
                ref={useReveal(0.1)}
              >
                <span className="font-mono text-xs text-slate-400 mt-1.5 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}.
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={2000}>
          <div className="kx-line-draw mt-16" />
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 2 — The pivot
   ════════════════════════════════════════════════════════════════════ */

function ScenePivot() {
  return (
    <section className="kx-scene kx-scene--tight relative">
      <div className="kx-camera-pan opacity-60" />

      <div className="relative max-w-3xl mx-auto text-center">
        <Reveal>
          <span className="kx-chapter">A pause</span>
        </Reveal>

        <h2 className="kx-display mt-10">
          <span className="kx-display-grad">
            <Words text="There's a faster way." />
          </span>
        </h2>

        <Reveal delay={1200}>
          <p className="text-lg text-slate-500 mt-8 max-w-xl mx-auto leading-relaxed">
            One you don't have to drive. One that watches your footage, makes
            the cuts, writes the words, and ships the result while your
            kettle's still warm.
          </p>
        </Reveal>

        <Reveal delay={1500}>
          <p className="text-sm text-red-700 mt-12 font-mono tracking-widest uppercase">
            Meet Kaizer News.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scenes 3-5 — The three acts of what Kaizer does
   ════════════════════════════════════════════════════════════════════ */

function SceneAction({ chapter, eyebrow, question, title, body, icon: Icon, accent, n }) {
  const isEven = parseInt(n) % 2 === 0;
  return (
    <section className="kx-scene relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50/40 to-white" />

      <div className="relative max-w-6xl mx-auto px-5 grid md:grid-cols-2 gap-12 items-center">
        {/* Visual side */}
        <div className={`flex items-center justify-center ${isEven ? "md:order-last" : ""}`}>
          <Reveal delay={200}>
            <div className="relative">
              {/* Big gradient orb behind the icon */}
              <div className={`absolute inset-0 bg-gradient-to-br ${accent} rounded-full blur-3xl opacity-30 scale-125`} />
              {/* Icon disk */}
              <div
                className={`relative w-48 h-48 sm:w-64 sm:h-64 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center shadow-2xl kx-slow-zoom`}
              >
                <Icon size={80} className="text-white drop-shadow-lg" strokeWidth={1.5} />
              </div>
              {/* Chapter number floating beside */}
              <span className="absolute -bottom-4 -right-4 bg-white border border-slate-200 rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold font-mono shadow-lg">
                {n}
              </span>
            </div>
          </Reveal>
        </div>

        {/* Copy side */}
        <div className="flex flex-col gap-6">
          <Reveal>
            <span className="kx-chapter">{chapter}</span>
          </Reveal>
          <Reveal delay={150}>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">
              {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={250}>
            <p className="kx-question italic">{question}</p>
          </Reveal>
          <Reveal delay={400}>
            <h2 className="kx-display text-4xl sm:text-5xl">
              <Words text={title} />
            </h2>
          </Reveal>
          <Reveal delay={1200}>
            <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
              {body}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 6 — Trust (compliance section, in story voice)
   ════════════════════════════════════════════════════════════════════ */

function SceneTrust() {
  const dontDo = [
    "We don't sell or share your YouTube data with anyone.",
    "We don't train AI models on your videos.",
    "We don't read viewers, comments, or analytics.",
    "We don't upload to channels you haven't authorised.",
  ];

  return (
    <section id="data-usage" className="kx-scene relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-emerald-50/20 to-white" />

      <div className="relative max-w-4xl mx-auto text-center px-5">
        <Reveal>
          <span className="kx-chapter">An aside on trust</span>
        </Reveal>

        <Reveal delay={150}>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-green-700 bg-green-50 border border-green-100 rounded-full px-4 py-1.5 mt-8">
            <ShieldCheck size={12} /> Transparency
          </span>
        </Reveal>

        <Reveal delay={250}>
          <h2 className="kx-display text-3xl sm:text-5xl mt-6 max-w-3xl mx-auto">
            <Words text="We only ask for what we need." />
          </h2>
        </Reveal>

        <Reveal delay={1200}>
          <p className="text-lg text-slate-600 mt-8 max-w-2xl mx-auto leading-relaxed">
            When you connect your channel, Google asks us what we want. We
            ask for three things — only three — and tell you exactly what
            each one unlocks.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-4 mt-16 max-w-4xl mx-auto">
          {[
            { name: "youtube.upload",   role: "To upload your clips." },
            { name: "youtube.readonly", role: "To read your channel name." },
            { name: "youtube",          role: "To set thumbnails and edit titles." },
          ].map((s, i) => (
            <Reveal key={s.name} delay={i * 150}>
              <div className="kx-card p-6 text-left h-full">
                <code className="text-[11px] text-red-600 bg-red-50 px-2 py-1 rounded-md font-mono inline-block break-all">
                  {s.name}
                </code>
                <p className="text-slate-700 text-sm leading-relaxed mt-3">{s.role}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={600}>
          <div className="max-w-2xl mx-auto mt-16 bg-gradient-to-br from-emerald-50/70 to-green-50/70 border border-green-100 rounded-2xl p-7 text-left">
            <h3 className="font-bold text-base flex items-center gap-2 mb-4">
              <Lock size={16} className="text-green-600" /> What we don't do.
            </h3>
            <ul className="space-y-2.5">
              {dontDo.map((d, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-700 text-[15px] leading-relaxed">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-green-600 mt-0.5 border border-green-200">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <p className="text-sm text-slate-500 mt-10">
          Revoke at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
            className="text-red-600 hover:text-red-700 underline"
          >
            myaccount.google.com/permissions
          </a>
          . Read our full{" "}
          <Link to="/privacy" className="text-red-600 hover:text-red-700 underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/terms" className="text-red-600 hover:text-red-700 underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 7 — The numbers (animated counters)
   ════════════════════════════════════════════════════════════════════ */

function SceneNumbers() {
  const stats = [
    { target: 10, suffix: "×", label: "Faster than manual" },
    { target: 6,  suffix: "+", label: "Platforms supported" },
    { target: 3,  suffix: " min", label: "Average per clip" },
    { target: 99, suffix: "%", label: "Render success" },
  ];

  return (
    <section className="kx-scene kx-scene--tight relative bg-gradient-to-b from-white via-slate-50/60 to-white border-y border-slate-200/60">
      <div className="relative max-w-6xl mx-auto px-5 text-center">
        <Reveal>
          <span className="kx-chapter">In numbers</span>
        </Reveal>
        <Reveal delay={100}>
          <h2 className="kx-display text-3xl sm:text-5xl mt-6 max-w-3xl mx-auto">
            <Words text="The hours come back to you." />
          </h2>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-10">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <Stat {...s} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ target, suffix, label }) {
  const [val, ref] = useCounter(target);
  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl sm:text-6xl font-bold leading-none tracking-tight">
        <span className="kx-stat-num">{val}</span>
        <span className="text-slate-700">{suffix}</span>
      </div>
      <div className="text-xs text-slate-500 mt-3 uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 8 — Pricing
   ════════════════════════════════════════════════════════════════════ */

function ScenePricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      desc: "Try it for a few videos.",
      features: [
        "5 minutes source video / month",
        "Up to 10 clips / month",
        "1 connected YouTube channel",
        "Community support",
      ],
      cta: "Begin",
      highlight: false,
    },
    {
      name: "Pro",
      price: "$29",
      period: "/ month",
      desc: "For creators publishing weekly.",
      features: [
        "Unlimited source video",
        "Unlimited clips",
        "Up to 5 connected channels",
        "Priority rendering queue",
        "Per-channel branding & SEO variants",
        "Email support",
      ],
      cta: "Upgrade",
      highlight: true,
    },
    {
      name: "Studio",
      price: "Custom",
      desc: "For newsrooms running multiple brands.",
      features: [
        "Everything in Pro",
        "Unlimited connected channels",
        "Dedicated GPU pipeline",
        "Custom layouts",
        "Priority support",
      ],
      cta: "Contact us",
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="kx-scene relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50/40 to-white" />

      <div className="relative max-w-6xl mx-auto px-5 w-full">
        <div className="text-center mb-16">
          <Reveal>
            <span className="kx-chapter">The deal</span>
          </Reveal>
          <Reveal delay={100}>
            <h2 className="kx-display text-3xl sm:text-5xl mt-6 max-w-3xl mx-auto">
              <Words text="Simple plans. Honest pricing." />
            </h2>
          </Reveal>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 120}>
              <div
                className={`flex flex-col h-full bg-white rounded-2xl p-7 transition-all hover:-translate-y-1 ${
                  t.highlight
                    ? "kx-popular-glow shadow-xl ring-1 ring-red-200 relative"
                    : "border border-slate-200 shadow-sm hover:shadow-lg"
                }`}
              >
                {t.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 to-orange-500 text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full shadow-md">
                    Most popular
                  </span>
                )}
                <h3 className="font-bold text-xl">{t.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tight">{t.price}</span>
                  {t.period && <span className="text-sm text-slate-500">{t.period}</span>}
                </div>
                <p className="text-sm text-slate-600 mt-2 mb-6">{t.desc}</p>
                <ul className="flex flex-col gap-3 mb-7">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-50 text-green-600 mt-0.5">
                        <Check size={11} />
                      </span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={t.name === "Studio" ? "/contact" : "/register"}
                  className={`kx-glow-btn inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-5 py-3 transition mt-auto ${
                    t.highlight
                      ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md hover:shadow-lg"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-900"
                  }`}
                >
                  {t.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Scene 9 — Closing CTA
   ════════════════════════════════════════════════════════════════════ */

function SceneClose() {
  return (
    <section className="kx-scene relative">
      <div className="kx-camera-pan kx-slow-zoom" />
      <div className="kx-grid-bg" />

      <div className="relative max-w-3xl mx-auto text-center px-5">
        <Reveal>
          <span className="kx-chapter">The end of the editor</span>
        </Reveal>

        <h2 className="kx-display mt-10">
          <Words text="Your turn." />
        </h2>

        <Reveal delay={1000}>
          <p className="text-lg sm:text-xl text-slate-600 mt-8 max-w-xl mx-auto leading-relaxed">
            Connect a channel. Upload a video. Watch it become a week of
            Shorts.
          </p>
        </Reveal>

        <Reveal delay={1300}>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-12">
            <Link
              to="/register"
              className="kx-glow-btn inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-base font-semibold px-7 py-3.5 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              Begin <ArrowRight size={16} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 text-base font-semibold px-6 py-3.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-white transition-all"
            >
              Sign in
            </Link>
          </div>
        </Reveal>

        <Reveal delay={1600}>
          <p className="text-sm text-slate-400 mt-12 italic">
            Fade to black.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Footer
   ════════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white relative">
      <div className="max-w-6xl mx-auto px-5 py-14 grid md:grid-cols-4 gap-10">
        <div className="flex flex-col gap-4 md:col-span-1">
          <Link to="/" className="flex items-center gap-2">
            <span className="bg-red-600 text-white font-black text-sm tracking-widest rounded px-2 py-1">
              KAIZER
            </span>
            <span className="text-slate-500 text-xs font-semibold tracking-[0.2em]">
              NEWS
            </span>
          </Link>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
            Long videos in. Shorts that publish themselves out.
          </p>
          <div className="flex items-center gap-3 text-slate-400">
            <a href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter" className="hover:text-red-600 transition-colors"><Twitter size={16} /></a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="hover:text-red-600 transition-colors"><Linkedin size={16} /></a>
            <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub" className="hover:text-red-600 transition-colors"><Github size={16} /></a>
            <a href="mailto:devsharkify@gmail.com" aria-label="Email" className="hover:text-red-600 transition-colors"><Mail size={16} /></a>
          </div>
        </div>

        <FooterCol title="Product">
          <FooterLink to="/register">Get started</FooterLink>
          <FooterLink to="/login">Sign in</FooterLink>
          <FooterLink href="#pricing">Pricing</FooterLink>
        </FooterCol>

        <FooterCol title="Company">
          <FooterLink href="mailto:devsharkify@gmail.com">Contact</FooterLink>
        </FooterCol>

        <FooterCol title="Legal">
          <FooterLink to="/privacy">Privacy Policy</FooterLink>
          <FooterLink to="/terms">Terms of Service</FooterLink>
          <FooterLink href="https://www.youtube.com/t/terms" external>YouTube Terms</FooterLink>
          <FooterLink href="https://policies.google.com/privacy" external>Google Privacy</FooterLink>
        </FooterCol>
      </div>

      <div className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Kaizer News. All rights reserved.
          </p>
          <p className="text-xs text-slate-400 italic">
            Built for storytellers.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
        {title}
      </h4>
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  );
}

function FooterLink({ href, to, external, children }) {
  if (to) {
    return (
      <li>
        <Link to={to} className="text-sm text-slate-600 hover:text-red-600 transition-colors">
          {children}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="text-sm text-slate-600 hover:text-red-600 transition-colors"
      >
        {children}
      </a>
    </li>
  );
}
