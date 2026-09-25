import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download, Cpu, Mic2, Brain, LayoutTemplate, AudioLines, KeyRound,
  MonitorSmartphone, ShieldCheck, Cloud, FileText, Info,
} from "lucide-react";
import "./Landing/kaizerx.css";

/* ════════════════════════════════════════════════════════════════════════
   Kaizer X Desktop — public product / download page (route /desktop).
   A product of Sharkify Private Limited.

   Reuses the landing page's scoped kx2 design system (kaizerx.css) so it
   matches the main marketing site. Dark theme fixed (no toggle — the
   installer links straight here and dark is the brand default).
   ════════════════════════════════════════════════════════════════════════ */

const FEATURES = [
  {
    icon: Cpu,
    title: "Local GPU rendering",
    body: "Renders on your own graphics card. No queues, no upload wait — your footage stays on your disk from import to final master.",
  },
  {
    icon: Mic2,
    title: "AI news anchor",
    body: "Generate a presenter-led segment from a script — pick a presenter and a voice, and get a broadcast-style anchor read.",
  },
  {
    icon: Brain,
    title: "Dual AI Director",
    body: "Two AI engines (Gemini and Claude) plan your edit — story splits, moods, effects, and transitions — and you stay in control.",
  },
  {
    icon: LayoutTemplate,
    title: "SVG + HTML templates",
    body: "Broadcast-grade lower thirds, tickers, and full layouts built from open web tech. Use the library or design your own.",
  },
  {
    icon: AudioLines,
    title: "Podcast editor",
    body: "AI multi-cam cuts for long conversations: it follows the speaker, removes dead air, and carves promo clips automatically.",
  },
  {
    icon: KeyRound,
    title: "Bring your own AI keys",
    body: "AI features run on your own provider accounts (Gemini, OpenAI, Anthropic, Deepgram). Your keys are stored only on your machine.",
  },
  {
    icon: MonitorSmartphone,
    title: "3-device license",
    body: "One license covers up to three of your own computers. Manage and swap devices yourself, right inside the app.",
  },
];

const REQUIREMENTS = [
  "Windows 10 or 11 (64-bit)",
  "16 GB RAM",
  "NVIDIA GPU recommended for fast rendering",
  "About 25 GB of free disk space",
];

// The one canonical installer URL. The backend serves /releases from
// KAIZER_RELEASES_DIR. NOTE for release engineering: the published artifact
// MUST be renamed to exactly "KaizerX-Setup.exe" when it is dropped into
// KAIZER_RELEASES_DIR (electron-builder names it differently) — otherwise
// this link 404s and the page falls back to the "coming soon" notice.
const INSTALLER_URL = "/releases/KaizerX-Setup.exe";

/**
 * Download button that never lies: on mount the page HEAD-checks the
 * installer; while checking (ready === null) or when present we render the
 * real link, and when the file is confirmed absent we show an honest
 * "coming very soon" notice instead of a dead link that downloads garbage.
 */
function DownloadCta({ ready, large, label, unreadyLabel }) {
  const size = large ? " kx2-btn--lg" : "";
  if (ready === false) {
    return (
      <span
        role="status"
        className={`kx2-btn kx2-btn--ghost${size}`}
        style={{ cursor: "default", opacity: 0.85 }}
      >
        {unreadyLabel || "Coming very soon — the installer is being finalized"}
      </span>
    );
  }
  return (
    <a href={INSTALLER_URL} className={`kx2-btn kx2-btn--primary${size}`}>
      <Download size={large ? 18 : 16} aria-hidden="true" /> {label}
    </a>
  );
}

export default function DesktopDownload() {
  // Hero image: try the real JPG first, fall back to the bundled SVG
  // placeholder, and finally to a pure-CSS gradient block — the page must
  // look complete even before the generated hero.jpg is dropped in.
  const [heroSrc, setHeroSrc] = useState("/desktop/hero.jpg");
  const [heroFailed, setHeroFailed] = useState(false);

  // Graceful pre-click check: is the installer actually published?
  // null = still checking (link shown optimistically), true = present,
  // false = confirmed missing → every CTA swaps to "coming very soon".
  const [installerReady, setInstallerReady] = useState(null);

  useEffect(() => {
    document.title = "Kaizer X Desktop — the AI video studio on your machine";
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(INSTALLER_URL, { method: "HEAD" })
      .then((r) => { if (!cancelled) setInstallerReady(r.ok); })
      .catch(() => { if (!cancelled) setInstallerReady(false); });
    return () => { cancelled = true; };
  }, []);

  const heroFrameStyle = {
    borderRadius: 16,
    border: "1px solid var(--kx-border)",
    overflow: "hidden",
    boxShadow: "var(--kx-shadow)",
    background: "var(--kx-surface)",
  };

  return (
    <div className="kx2 kx2-themed" data-kx-theme="dark">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="kx2-nav kx2-themed">
        <div className="kx2-container kx2-nav__inner">
          <Link to="/" aria-label="Kaizer X home" style={{ textDecoration: "none" }}>
            <span className="kx2-logo">
              <span className="kx2-logo__sign" style={{ animation: "none" }}>
                <span className="kx2-logo__hanger" />
                <span className="kx2-logo__strings"><i /><i /></span>
                <span className="kx2-logo__plaque">KAIZER</span>
              </span>
              <span className="kx2-logo__x">X</span>
            </span>
          </Link>
          <div className="kx2-nav__right">
            <Link to="/" className="kx2-btn kx2-btn--ghost">Cloud app</Link>
            <DownloadCta ready={installerReady} label="Download" unreadyLabel="Coming very soon" />
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="kx2-hero">
          <div className="kx2-hero__glow" aria-hidden="true" />
          <div className="kx2-container kx2-hero__grid">
            <div>
              <span className="kx2-strap">KAIZER X DESKTOP</span>
              <h1 className="kx2-hero__h1">
                Kaizer X Desktop — the AI video studio on YOUR machine
              </h1>
              <p className="kx2-hero__sub">
                The full Kaizer X production pipeline, installed on your own
                computer. Your videos never leave your computer — import, edit,
                and render everything locally, with AI features running on your
                own provider keys.
              </p>
              <div className="kx2-hero__cta">
                <DownloadCta ready={installerReady} large label="Download for Windows" />
                <a href="#requirements" className="kx2-btn kx2-btn--ghost kx2-btn--lg">
                  System requirements
                </a>
              </div>
              <p className="kx2-hero__trust">
                Windows 10/11 · Free to try · One license, 3 devices
              </p>
            </div>

            {/* Hero visual: jpg → svg → CSS gradient fallback chain. */}
            <div className="kx2-mock">
              {heroFailed ? (
                <div
                  role="img"
                  aria-label="Kaizer X Desktop studio preview"
                  style={{
                    ...heroFrameStyle,
                    aspectRatio: "16 / 9",
                    background:
                      "linear-gradient(135deg, #15181D 0%, #1E222A 45%, #3a1210 75%, #E0312B 130%)",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 20,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--kx-font-mono)",
                      fontSize: 12,
                      letterSpacing: "0.18em",
                      color: "var(--kx-muted)",
                    }}
                  >
                    KAIZER X DESKTOP · LOCAL RENDER
                  </span>
                </div>
              ) : (
                <div style={heroFrameStyle}>
                  <img
                    src={heroSrc}
                    alt="Kaizer X Desktop studio preview"
                    style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }}
                    onError={() => {
                      if (heroSrc.endsWith(".jpg")) setHeroSrc("/desktop/hero.svg");
                      else setHeroFailed(true);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Private-by-design strip ───────────────────────────────── */}
        <section className="kx2-section kx2-section--alt" style={{ padding: "40px 0" }}>
          <div className="kx2-container" style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
            <span className="kx2-secitem__icon"><ShieldCheck size={18} aria-hidden="true" /></span>
            <p style={{ margin: 0, maxWidth: 760 }}>
              <strong style={{ color: "var(--kx-heading)" }}>Private by design.</strong>{" "}
              Editing and rendering happen entirely on your computer. The only
              thing Kaizer X Desktop sends to our servers is a license check —
              never your footage, projects, or AI keys.
            </p>
          </div>
        </section>

        {/* ── Feature grid ──────────────────────────────────────────── */}
        <section className="kx2-section kx2-section--center" id="features">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">WHAT'S INSIDE</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              A complete studio, no cloud required
            </h2>
            <div className="kx2-grid kx2-grid--3" style={{ marginTop: 40, textAlign: "left" }}>
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div className="kx2-card kx2-themed" key={title}>
                  <span className="kx2-card__icon"><Icon size={22} aria-hidden="true" /></span>
                  <h3 className="kx2-card__title">{title}</h3>
                  <p className="kx2-card__body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── System requirements ───────────────────────────────────── */}
        <section className="kx2-section kx2-section--alt kx2-section--center" id="requirements">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">SYSTEM REQUIREMENTS</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Will it run on my PC?
            </h2>
            <div
              className="kx2-card kx2-themed"
              style={{ maxWidth: 560, margin: "36px auto 0", textAlign: "left" }}
            >
              <ul style={{ margin: 0, padding: "0 0 0 4px", listStyle: "none" }}>
                {REQUIREMENTS.map((r) => (
                  <li
                    key={r}
                    style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0" }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: "var(--kx-red)", marginTop: 8, flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "var(--kx-body)" }}>{r}</span>
                  </li>
                ))}
              </ul>
              <p className="kx2-card__body" style={{ marginTop: 14, marginBottom: 0 }}>
                No NVIDIA card? It still works — rendering just takes longer on
                the CPU.
              </p>
            </div>
          </div>
        </section>

        {/* ── Download CTA ──────────────────────────────────────────── */}
        <section className="kx2-section kx2-section--center" id="download">
          <div className="kx2-container">
            <span className="kx2-strap kx2-strap--center">GET STARTED</span>
            <h2 className="kx2-heading" style={{ marginTop: 18 }}>
              Download Kaizer X Desktop
            </h2>
            <div className="kx2-hero__cta" style={{ justifyContent: "center", marginTop: 30 }}>
              <DownloadCta ready={installerReady} large label="Download for Windows" />
            </div>
            <p
              className="kx2-hero__trust"
              style={{ maxWidth: 620, margin: "18px auto 0", display: "flex", gap: 8, justifyContent: "center" }}
            >
              <Info size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
              <span>
                Honest note: the installer is not code-signed yet, so Windows
                SmartScreen may warn you the first time. Click "More info" →
                "Run anyway". Code signing is on the way.
              </span>
            </p>
            <p style={{ marginTop: 22, fontSize: 14 }}>
              <FileText size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
              By installing you agree to the{" "}
              <Link to="/desktop/eula" style={{ color: "var(--kx-link)" }}>
                End-User License Agreement
              </Link>
              .
            </p>
            <p style={{ marginTop: 10, fontSize: 14, color: "var(--kx-muted)" }}>
              <Cloud size={13} aria-hidden="true" style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />
              Prefer not to install anything?{" "}
              <Link to="/" style={{ color: "var(--kx-link)" }}>
                Use the Kaizer X cloud app
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--kx-border)",
          padding: "28px 0",
          background: "var(--kx-footer-bg)",
        }}
      >
        <div
          className="kx2-container"
          style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center" }}
        >
          <span style={{ color: "var(--kx-footer-text)", fontSize: 13 }}>
            © {new Date().getFullYear()} Sharkify Private Limited · Kaizer X
          </span>
          <span style={{ display: "flex", gap: 18, fontSize: 13 }}>
            <Link to="/privacy" style={{ color: "var(--kx-footer-link)" }}>Privacy</Link>
            <Link to="/terms" style={{ color: "var(--kx-footer-link)" }}>Terms</Link>
            <Link to="/desktop/eula" style={{ color: "var(--kx-footer-link)" }}>Desktop EULA</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
