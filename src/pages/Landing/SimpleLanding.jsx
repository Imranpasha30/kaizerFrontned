import React from "react";
import { Link } from "react-router-dom";
import {
  Scissors, Sparkles, Send, BarChart3, ArrowRight, Check, Play,
  Wand2, Languages, CalendarClock, Layers, AudioLines, Captions,
} from "lucide-react";

/**
 * Kaizer X — public landing. A product of Sharkify Private Limited.
 *
 * Design direction (ui-ux-pro-max): cinematic dark "editing studio".
 *   · Type   — Clash Display (display) + Satoshi (body) + JetBrains Mono
 *              (labels). All already loaded in index.html; no new deps.
 *   · Color  — near-black canvas, glass surfaces, cyan primary +
 *              amber "cut" accent. No Inter, no purple gradient.
 *   · Hero   — a faux editor/timeline reinforces "this is a video tool".
 *   · A11y   — focus-visible rings, aria-labels, 4.5:1 text, the
 *              ambient motion respects prefers-reduced-motion.
 */

const DISPLAY = "'Clash Display','Satoshi',system-ui,sans-serif";
const BODY    = "'Satoshi',system-ui,-apple-system,sans-serif";
const MONO    = "'JetBrains Mono',ui-monospace,monospace";

const CYAN  = "#34e0e0";
const AMBER = "#f7b955";

function Word({ className = "" }) {
  return (
    <span className={`font-bold tracking-tight ${className}`} style={{ fontFamily: DISPLAY }}>
      Kaizer<span style={{ color: CYAN }}> X</span>
    </span>
  );
}

function Eyebrow({ children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-gray-400"
      style={{ fontFamily: MONO }}
    >
      {children}
    </span>
  );
}

const FEATURES = [
  { icon: Scissors, span: "lg:col-span-2", tag: "EDIT", title: "Smart editor",
    body: "Drop in a long recording and the editor finds the highlights, cuts vertical clips, and lays your branded frame, captions and logo over every one — frame-accurate, no timeline wrangling." },
  { icon: Sparkles, span: "", tag: "SEO", title: "SEO writer",
    body: "Titles, descriptions, hashtags and tags written for you in 9 languages — edit in a click before you publish." },
  { icon: Send, span: "", tag: "PUBLISH", title: "Publish anywhere",
    body: "Connect Meta, Instagram, Facebook or YouTube and schedule to your own channels. Free on every plan." },
  { icon: BarChart3, span: "lg:col-span-2", tag: "INSIGHTS", title: "Know what's working",
    body: "Track public views, likes and comments across the channels you've connected, and let the coach tell you in plain words what to fix next — no spreadsheets, no jargon." },
];

const STEPS = [
  { icon: Layers, title: "Import", body: "Upload a recording or paste a link." },
  { icon: Wand2, title: "Edit & brand", body: "Get clips, captions, SEO and your logo — tweak anything." },
  { icon: CalendarClock, title: "Schedule", body: "Publish to your accounts now or on a queue." },
];

const PLANS = [
  { name: "Starter", price: "Free", note: "5 clips edited / mo · 1 integration" },
  { name: "Creator", price: "$19", note: "50 clips edited / mo · 3 integrations" },
  { name: "Pro", price: "$49", note: "200 clips edited / mo · 10 integrations", popular: true },
  { name: "Agency", price: "$199", note: "Unlimited editing · team seats" },
];

const CTA_PRIMARY =
  "group inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-[#06121a] " +
  "transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0b10]";

export default function SimpleLanding() {
  return (
    <div className="min-h-dvh bg-[#0a0b10] text-gray-300 antialiased selection:bg-cyan-400/20"
         style={{ fontFamily: BODY }}>
      <style>{`
        @keyframes kx-float { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(28px,-24px,0)} }
        @keyframes kx-float2{ 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(-32px,20px,0)} }
        @keyframes kx-play  { 0%{transform:scaleX(0)} 100%{transform:scaleX(1)} }
        .kx-blob{animation:kx-float 14s ease-in-out infinite}
        .kx-blob2{animation:kx-float2 18s ease-in-out infinite}
        .kx-grid{background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:44px 44px}
        .kx-play{transform-origin:left center;animation:kx-play 7s linear infinite}
        @media (prefers-reduced-motion: reduce){.kx-blob,.kx-blob2,.kx-play{animation:none}}
      `}</style>

      {/* ambient cinematic glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="kx-blob absolute -top-48 -left-24 h-[520px] w-[520px] rounded-full blur-[150px]"
             style={{ background: `${CYAN}1f` }} />
        <div className="kx-blob2 absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full blur-[150px]"
             style={{ background: `${AMBER}14` }} />
      </div>

      <div className="relative">
        {/* ── Nav ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0a0b10]/70 border-b border-white/[0.06]">
          <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
            <Word className="text-lg text-white" />
            <nav className="flex items-center gap-2 text-sm">
              <Link to="/login"
                    className="rounded-lg px-3 py-2 text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                Sign in
              </Link>
              <Link to="/register" className={CTA_PRIMARY + " py-2"} style={{ background: CYAN, boxShadow: `0 0 0 0 ${CYAN}` }}>
                Get started
              </Link>
            </nav>
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────── */}
        <section className="relative">
          <div aria-hidden className="kx-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000,transparent)]" />
          <div className="relative max-w-3xl mx-auto px-5 pt-20 pb-10 text-center">
            <Eyebrow><Play size={11} style={{ color: CYAN }} /> The video editing studio</Eyebrow>
            <h1 className="mt-6 text-[clamp(2.4rem,7vw,4.25rem)] font-semibold leading-[1.02] tracking-tight text-white"
                style={{ fontFamily: DISPLAY }}>
              Long videos in.
              <br />
              <span className="bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(100deg,${CYAN},#9bf6ff 60%,${AMBER})` }}>
                Scroll-stopping clips out.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-gray-400">
              <Word className="text-gray-200" /> edits your footage into branded vertical clips, writes the SEO,
              and schedules them to your own channels. You approve every clip before it goes live.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className={CTA_PRIMARY} style={{ background: CYAN }}>
                Start free <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/login"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-6 py-3 font-medium text-gray-200 hover:border-white/30 hover:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-gray-600" style={{ fontFamily: MONO }}>
              no card required · free forever
            </p>
          </div>

          {/* hero editor mock — the signature visual */}
          <div className="relative max-w-4xl mx-auto px-5 pb-20">
            <EditorMock />
          </div>
        </section>

        {/* ── Features (bento) ────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 py-12">
          <SectionHead tag="WHAT IT DOES" title="A studio that does the heavy lifting" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <article key={f.title}
                       className={`group rounded-2xl border border-white/[0.07] bg-white/[0.018] p-6 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.03] ${f.span}`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10"
                        style={{ background: `${CYAN}14` }}>
                    <f.icon size={19} style={{ color: CYAN }} />
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500" style={{ fontFamily: MONO }}>{f.tag}</span>
                </div>
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: DISPLAY }}>{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-400">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-5 py-14">
          <SectionHead tag="THE FLOW" title="Three steps, start to publish" center />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div aria-hidden className="hidden sm:block absolute top-[34px] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-white/[0.07] bg-[#0d0f15] p-5 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-[#0a0b10]"
                     style={{ boxShadow: `0 0 28px -10px ${CYAN}` }}>
                  <s.icon size={20} style={{ color: CYAN }} />
                </div>
                <div className="text-[10px] text-gray-600" style={{ fontFamily: MONO }}>STEP {i + 1}</div>
                <h3 className="mt-0.5 text-sm font-semibold text-white" style={{ fontFamily: DISPLAY }}>{s.title}</h3>
                <p className="mt-1 text-[13px] text-gray-400">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-5 py-14">
          <SectionHead tag="PRICING" title="Priced on what you edit" center
                       sub="Plans are based on clips you edit per month. Publishing is always free." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((p) => (
              <div key={p.name}
                   className={`relative rounded-2xl border p-5 transition-colors ${
                     p.popular ? "border-cyan-400/40 bg-cyan-400/[0.04]" : "border-white/[0.07] bg-white/[0.018] hover:border-white/15"}`}>
                {p.popular && (
                  <div className="absolute -top-2.5 left-5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#06121a]"
                       style={{ background: CYAN, fontFamily: MONO }}>Popular</div>
                )}
                <div className="text-sm font-semibold text-white" style={{ fontFamily: DISPLAY }}>{p.name}</div>
                <div className="mt-1 text-3xl font-semibold text-white" style={{ fontFamily: DISPLAY }}>
                  {p.price}{p.price !== "Free" && <span className="text-sm font-normal text-gray-500">/mo</span>}
                </div>
                <div className="mt-2 text-[12.5px] leading-snug text-gray-400">{p.note}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/register" className={CTA_PRIMARY} style={{ background: CYAN }}>
              Create your free account <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="border-t border-white/[0.06] mt-6">
          <div className="max-w-6xl mx-auto px-5 py-9 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <Word className="text-sm text-white" />
              <div className="mt-1 text-[11px] text-gray-600" style={{ fontFamily: MONO }}>
                a product of <span className="text-gray-400">Sharkify Private Limited</span>
              </div>
            </div>
            <nav className="flex items-center gap-5 text-[13px] text-gray-500">
              <Link to="/privacy" className="hover:text-gray-200 transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-gray-200 transition-colors">Terms</Link>
              <Link to="/login" className="hover:text-gray-200 transition-colors">Sign in</Link>
            </nav>
          </div>
          <div className="max-w-6xl mx-auto px-5 pb-9">
            <p className="text-[11px] leading-relaxed text-gray-600">
              Kaizer X is not affiliated with or endorsed by YouTube or Google. Publishing uses YouTube API
              Services and your own connected accounts, subject to the{" "}
              <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"
                 className="underline decoration-white/20 hover:text-gray-400">YouTube Terms of Service</a>.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SectionHead({ tag, title, sub, center }) {
  return (
    <div className={`mb-8 ${center ? "text-center" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-2" style={{ fontFamily: MONO }}>{tag}</div>
      <h2 className="text-2xl sm:text-[1.75rem] font-semibold text-white tracking-tight" style={{ fontFamily: DISPLAY }}>{title}</h2>
      {sub && <p className={`mt-2 text-sm text-gray-500 ${center ? "mx-auto max-w-md" : ""}`}>{sub}</p>}
    </div>
  );
}

/* Glassmorphic faux editor — preview + timeline + clip queue. */
function EditorMock() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e14]/90 backdrop-blur shadow-2xl overflow-hidden"
         style={{ boxShadow: `0 40px 120px -40px ${CYAN}33, 0 0 0 1px rgba(255,255,255,0.04)` }}>
      {/* title bar */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[0.06] bg-white/[0.015]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
        <span className="ml-3 text-[11px] text-gray-500" style={{ fontFamily: MONO }}>kaizer-x · editor</span>
        <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-[#06121a] font-bold" style={{ background: CYAN, fontFamily: MONO }}>SEO 96</span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-white/[0.05]">
        {/* preview */}
        <div className="col-span-2 bg-[#0c0e14] p-3">
          <div className="relative aspect-video rounded-lg border border-white/[0.06] overflow-hidden grid place-items-center"
               style={{ background: `radial-gradient(120% 90% at 30% 10%, ${CYAN}1c, transparent), #0a0b10` }}>
            <span className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-black/30 backdrop-blur">
              <Play size={22} className="ml-0.5" style={{ color: CYAN }} fill={CYAN} />
            </span>
            <span className="absolute left-3 bottom-3 flex items-center gap-1.5 rounded bg-black/45 px-2 py-1 text-[10px] text-gray-200" style={{ fontFamily: MONO }}>
              <Captions size={11} style={{ color: AMBER }} /> auto-captioned
            </span>
            <span className="absolute right-3 top-3 rounded bg-black/45 px-1.5 py-0.5 text-[10px] text-gray-300" style={{ fontFamily: MONO }}>0:42 / 9:18</span>
          </div>
        </div>
        {/* clip queue */}
        <div className="bg-[#0c0e14] p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-600" style={{ fontFamily: MONO }}>Clips</div>
          {[["Clip 01", "0:42", true], ["Clip 02", "0:31", true], ["Clip 03", "0:58", false]].map(([n, t, done], i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px]">
              <span className="flex items-center gap-2 text-gray-300">
                <span className="h-6 w-4 rounded-sm" style={{ background: i === 2 ? `${AMBER}55` : `${CYAN}40` }} />{n}
              </span>
              <span className="flex items-center gap-1.5 text-gray-500" style={{ fontFamily: MONO }}>
                {t}{done ? <Check size={11} className="text-emerald-400" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} />}
              </span>
            </div>
          ))}
          <div className="rounded-lg border px-2.5 py-2 text-[11px]" style={{ borderColor: `${CYAN}40`, background: `${CYAN}10`, color: CYAN, fontFamily: MONO }}>
            <Languages size={11} className="inline mr-1" /> SEO · 9 languages
          </div>
        </div>
      </div>

      {/* timeline */}
      <div className="border-t border-white/[0.06] bg-[#0a0b10] px-3 py-3">
        <div className="flex items-center gap-2 mb-2 text-[10px] text-gray-600" style={{ fontFamily: MONO }}>
          <AudioLines size={12} style={{ color: AMBER }} /> timeline
        </div>
        <div className="relative h-9 rounded-md border border-white/[0.06] overflow-hidden bg-white/[0.015]">
          {/* waveform-ish bars */}
          <div className="absolute inset-0 flex items-center gap-[2px] px-2 opacity-70">
            {Array.from({ length: 72 }).map((_, i) => (
              <span key={i} className="w-[3px] rounded-full"
                    style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 60}%`, background: i % 9 === 0 ? AMBER : `${CYAN}66` }} />
            ))}
          </div>
          {/* playhead sweep */}
          <div className="kx-play absolute inset-y-0 left-0 w-full" style={{ background: `linear-gradient(90deg, ${CYAN}14, transparent 60%)` }} />
          <div className="absolute inset-y-0 left-[42%] w-px" style={{ background: CYAN, boxShadow: `0 0 8px ${CYAN}` }} />
        </div>
      </div>
    </div>
  );
}
