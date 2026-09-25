/* GENERATED -- do not edit by hand.
 *
 * Source: kaizer-desktop/renderer/landing.html  (markup + inline script)
 * Rebuild: python scratchpad/port_landing.py
 *
 * The desktop landing is the design. Rather than keep a second copy of it in
 * sync by hand -- which is how the last two landings drifted apart -- this
 * file is produced from that one. Edit landing.html and rebuild.
 *
 * Differences from the source, all of them forced by the move into a router:
 *   - asset paths are absolute, since a route can mount at any depth
 *   - index.html#signin (the Electron shell) becomes /register
 *   - styles are scoped, and the script is cancellable -- see landing-v2.css
 *     and the effect below
 */
import React, { useEffect, useRef } from "react";
import "./landing-v2.css";

export default function LandingV2() {
  const rootRef = useRef(null);

  /* The desktop page's inline <script>, with the three changes an SPA needs.
   *
   * Every lookup is scoped to `root` instead of `document`: an id like
   * #stories is not ours alone once this is one page among many.
   *
   * Everything here is undone on unmount. The original ends in an infinite
   * loop -- correct for a document that a navigation unloads, a leak in a
   * router that just swaps the subtree out. `alive` stops it. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const hdr = root.querySelector('#hdr');
    const onScroll = () => hdr && hdr.classList.toggle('on', window.scrollY > 10);
    addEventListener('scroll', onScroll);

    const glow = root.querySelector('#glow');
    const onMove = (e) => {
      if (!glow) return;
      glow.style.opacity = '1';
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    };
    const onLeave = () => { if (glow) glow.style.opacity = '0'; };
    addEventListener('pointermove', onMove);
    addEventListener('pointerleave', onLeave);

    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold: 0.16 });
    root.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el));

    /* Bars are appended, so a re-run would double them. Clearing first keeps
     * the effect idempotent whatever the mount count. */
    const bars = (host, n, delay, dur) => {
      if (!host) return;
      host.replaceChildren();
      for (let i = 0; i < n; i++) {
        const b = document.createElement('i');
        b.style.animationDelay = (i * delay) + 's';
        if (dur) b.style.animationDuration = dur();
        host.appendChild(b);
      }
    };
    bars(root.querySelector('#awave'), 26, 0.06, () => (0.85 + Math.random() * 0.7) + 's');

    const stories = [...root.querySelectorAll('#stories .story')];
    stories.forEach((s) => bars(s.querySelector('.wf'), 26, 0.05, null));
    const outs = [...root.querySelectorAll('#outrow .out')];

    let alive = true;
    let started = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function loop() {
      while (alive) {
        stories.forEach((s) => s.classList.remove('in', 'play'));
        outs.forEach((o) => o.classList.remove('in'));
        await wait(300);
        for (const s of stories) {
          if (!alive) return;
          s.classList.add('in', 'play');
          await wait(650);
        }
        await wait(500);
        for (const o of outs) {
          if (!alive) return;
          o.classList.add('in');
          await wait(180);
        }
        await wait(2600);
      }
    }
    const consoleObs = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting && !started) { started = true; loop(); }
      }), { threshold: 0.4 });
    const consoleEl = root.querySelector('.console');
    if (consoleEl) consoleObs.observe(consoleEl);

    /* Smooth anchor scrolling belongs to the scrolling element, which is the
     * document -- it cannot be scoped to our wrapper. Set it, then hand it
     * back exactly as it was. */
    const prevScroll = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      alive = false;
      removeEventListener('scroll', onScroll);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerleave', onLeave);
      io.disconnect();
      consoleObs.disconnect();
      document.documentElement.style.scrollBehavior = prevScroll;
    };
  }, []);

  return (
    <div className="kxland" ref={rootRef}>
      <div id="glow"></div>

      <div className="ticker">
        <div className="run">
          <span>Telugu-first AI video studio</span><span><b>●</b> One clip in, a broadcast out</span><span>Runs on your own GPU</span><span>Made in Hyderabad</span><span>9 Indian languages</span>
          <span>Telugu-first AI video studio</span><span><b>●</b> One clip in, a broadcast out</span><span>Runs on your own GPU</span><span>Made in Hyderabad</span><span>9 Indian languages</span>
        </div>
      </div>

      <header id="hdr">
        <div className="wrap">
          <nav>
            <div className="brand">
              <span className="sh"><img src="/landing-assets/kaizerx-mark.png" alt="Kaizer X" width="30" height="30" /></span>
              <span className="txt"><b>Kaizer X<span className="dot">.</span></b><small>Video · for India</small></span>
            </div>
            <div className="nav-links">
              <a href="#how">How it works</a>
              <a href="#capabilities">What it does</a>
              <a href="#anchor">AI anchor</a>
              <a href="#desktop" className="spark">Desktop app</a>
            </div>
            <a href="/login" className="signin">Start free <span className="ar">→</span></a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg">
          <video autoPlay muted loop playsInline poster="/landing-assets/hero-poster.jpg">
            <source src="/landing-assets/hero-loop.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow rv in">AI + editors · built for India</span>
            <h1 className="rv in d1">The shortest path<span className="l2">from footage to <span className="flame">broadcast</span><span className="dot">.</span></span></h1>
            <p className="lede rv in d2">A raw clip on your desk. A bulletin due in an hour. Kaizer X transcribes it, splits it into stories, cuts the filler and returns a finished full-length video plus ready shorts — directed like a TV editor, in your language.</p>
            <div className="hero-cta rv in d3">
              <a href="/login" className="btn-solid">Upload a clip <span className="ar">→</span></a>
              <a href="#how" className="btn-text">See how it works <span className="ar">→</span></a>
            </div>
            <div className="hero-stats rv in d3">
              <div className="hs"><div className="n">105<span className="u">+</span></div><div className="l">Broadcast layouts</div></div>
              <div className="hs"><div className="n">9</div><div className="l">Indian languages</div></div>
              <div className="hs"><div className="n">1<span className="u"> upload</span></div><div className="l">Every format out</div></div>
            </div>
          </div>

          {/* signature console */}
          <div className="console rv in d2">
            <div className="bar">
              <i></i><i></i><i></i>
              <span className="fn">auto-edit · job_0472.mp4</span>
              <span className="live"><span className="bl"></span>RENDERING</span>
            </div>
            <div className="stage">
              <div className="src">
                <div className="thumb"></div>
                <div className="meta"><b>bulletin_raw.mp4</b><span>28:14 · single take</span></div>
                <span className="pill">1 upload</span>
              </div>
              <div className="flowline"></div>
              <div className="stories" id="stories">
                <div className="story" data-d="0"><span className="idx">01</span><div className="wf"></div><span className="tt">Hyderabad floods</span><span className="cut">−filler</span></div>
                <div className="story" data-d="1"><span className="idx">02</span><div className="wf"></div><span className="tt">Assembly session</span><span className="cut">−filler</span></div>
                <div className="story" data-d="2"><span className="idx">03</span><div className="wf"></div><span className="tt">Cricket wrap</span><span className="cut">−filler</span></div>
              </div>
              <div className="outrow" id="outrow">
                <div className="out"><div className="fr f169"></div><b>Full</b><span>16:9</span></div>
                <div className="out"><div className="fr f916"></div><b>Shorts</b><span>9:16</span></div>
                <div className="out"><div className="fr f916"></div><b>Reels</b><span>9:16</span></div>
                <div className="out"><div className="fr f11"></div><b>Square</b><span>1:1</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="band line" id="how">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="eyebrow">How it works</span>
            <h2>From one raw take<span className="l2">to a finished cut<span className="dot">.</span></span></h2>
            <p>Upload once. Kaizer X watches and listens to the footage, then chooses the layout, effects, graphics and captions per story — with two director engines, or full expert controls.</p>
          </div>
          <div className="steps rv d1">
            <div className="step">
              <div className="mk"><span className="num">01</span><span>— transcribe</span></div>
              <h3>It reads <em>every word</em></h3>
              <p>Speech becomes accurate Indic-language text, timed to the frame, so visuals land exactly when the words are spoken.</p>
            </div>
            <div className="step">
              <div className="mk"><span className="num">02</span><span>— direct</span></div>
              <h3>The AI <em>directs</em></h3>
              <p>Footage splits into stories, filler is cut, and each story gets its own screen, B-roll, name straps and sound design.</p>
            </div>
            <div className="step">
              <div className="mk"><span className="num">03</span><span>— render</span></div>
              <h3>Out in <em>one pass</em></h3>
              <p>A full-length video and ready short clips, audio perfectly synced — plus per-channel SEO and thumbnails, if you want them.</p>
            </div>
          </div>
          <div className="demo-wrap rv d2">
            <video autoPlay muted loop playsInline poster="/landing-assets/howto-poster.jpg">
              <source src="/landing-assets/howto-demo.mp4" type="video/mp4" />
            </video>
            <span className="cap-note"><span className="bl"></span>Live · one timeline splitting into stories and formats</span>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="band" id="capabilities">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="eyebrow">What it handles</span>
            <h2>A newsroom’s worth<span className="l2">of tools, in one job<span className="dot">.</span></span></h2>
            <p>If it belongs in a broadcast cut, Kaizer X can direct it — from the everyday bulletin to the dramatic teaser.</p>
          </div>
          <div className="caps rv d1">
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18M8 4v5" /></svg></div>
              <h4>105 broadcast layouts</h4><p>Bulletins, split screens, over-the-shoulder looks and push transitions — directed per story.</p>
            </div>
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H4z" /><path d="M9 20h6M12 16v4" /><circle cx="12" cy="10.5" r="2.3" /></svg></div>
              <h4>Reference-clip B-roll</h4><p>Tag extra footage like “flood in Hyderabad” and it cuts to it exactly when the subject is spoken.</p>
            </div>
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M12 3v18M5 8v8M19 8v8M9 6v12M15 6v12" /></svg></div>
              <h4>Transcript-synced images</h4><p>Visuals appear on the word, never on a blind timer — every language, its own on-screen font.</p>
            </div>
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M5 4h14v16l-7-4-7 4z" /></svg></div>
              <h4>Movie-trailer mode</h4><p>Turns any video into a dramatic teaser — fast cuts, title cards and sound design.</p>
            </div>
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M3 18V6l7 4 4-6 7 8v6z" /></svg></div>
              <h4>Studio backgrounds</h4><p>None, a looping studio plate, or an intro reel that drops in behind the bulletin.</p>
            </div>
            <div className="cap">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg></div>
              <h4>Per-channel SEO</h4><p>Distinct titles, descriptions and tags per channel, learned from that channel’s own catalogue.</p>
            </div>
          </div>
        </div>
      </section>

      {/* LANGUAGE BAND */}
      <div className="langband">
        <div className="langrun">
          <span>తెలుగు <span className="sep">/</span> <em>Telugu</em> <span className="sep">·</span> हिन्दी <span className="sep">·</span> தமிழ் <span className="sep">·</span> ಕನ್ನಡ <span className="sep">·</span> മലയാളം <span className="sep">·</span> বাংলা <span className="sep">·</span> मराठी <span className="sep">·</span> ગુજરાતી <span className="sep">·</span> English <span className="sep">·</span></span>
          <span>తెలుగు <span className="sep">/</span> <em>Telugu</em> <span className="sep">·</span> हिन्दी <span className="sep">·</span> தமிழ் <span className="sep">·</span> ಕನ್ನಡ <span className="sep">·</span> മലയാളം <span className="sep">·</span> বাংলা <span className="sep">·</span> मराठी <span className="sep">·</span> ગુજરાતી <span className="sep">·</span> English <span className="sep">·</span></span>
        </div>
      </div>

      {/* AI ANCHOR */}
      <section className="band" id="anchor">
        <div className="wrap">
          <div className="split">
            <div className="rv">
              <span className="eyebrow">AI news anchor</span>
              <h2 style={{fontFamily: 'var(--disp)', fontWeight: '700', fontSize: 'clamp(28px,3.8vw,44px)', lineHeight: '1.04', letterSpacing: '-.02em', marginTop: '20px'}}>A presenter that reads<br /><span className="serif-i flame">your script on camera.</span></h2>
              <p style={{color: 'var(--ink-2)', fontSize: '16.5px', marginTop: '18px'}}>Pick an avatar and a voice, paste the script, and get a finished clip that lands as a normal job — ready for editing, SEO and publishing.</p>
              <ul>
                <li><span className="k">01</span><div><b>Natural Indic speech</b><span>Multiple engines — local studio, EchoMimic and HeyGen.</span></div></li>
                <li><span className="k">02</span><div><b>Podcast editor</b><span>One camera in, virtual multi-cam out, with a cut-list you can review.</span></div></li>
                <li><span className="k">03</span><div><b>Publish everywhere</b><span>Many channels in a click — each in its own voice, its own branding.</span></div></li>
              </ul>
            </div>
            <div className="anchor-card rv d1">
              <video className="studio-plate" autoPlay muted loop playsInline><source src="/landing-assets/studio-plate.mp4" type="video/mp4" /></video>
              <img className="presenter-img" src="/landing-assets/anchor.jpg" alt="AI news anchor reading a script on camera" />
              <span className="a-onair"><span className="rd"></span>ON AIR</span>
              <div className="a-wave" id="awave"></div>
              <div className="a-lower"><div className="k">KAIZER X · AI ANCHOR</div><div className="t">తెలుగు వార్తలు</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* DESKTOP */}
      <section className="band line" id="desktop">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="eyebrow">Kaizer X desktop · Windows 10 / 11</span>
            <h2>The whole studio<span className="l2">on your own machine<span className="dot">.</span></span></h2>
          </div>
          <div className="desk rv d1">
            <div className="l">
              <span className="eyebrow">Private by design</span>
              <h3>Every render runs on <em>your GPU</em></h3>
              <p>Your videos never leave your computer. One installer packs the engine, ffmpeg and browser renderer — download and use, no technical setup.</p>
              <div className="chips">
                <span className="chip">Bring your own keys · <b>Gemini</b></span>
                <span className="chip"><b>OpenAI</b></span>
                <span className="chip"><b>Anthropic</b></span>
                <span className="chip"><b>Deepgram</b></span>
                <span className="chip"><b>YouTube Data</b></span>
                <span className="chip">Up to <b>3 devices</b></span>
                <span className="chip">Offline <b>72 hrs</b></span>
              </div>
            </div>
            <div className="r">
              <img className="deskshot" src="/landing-assets/desktop-app.jpg" alt="Kaizer X desktop editor with source monitor, timeline and properties panel" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="wrap">
          <h2 className="rv">Stop editing.<span className="l2 flame">Start directing<span style={{color: 'var(--ink)'}}>.</span></span></h2>
          <p className="rv d1">Upload one raw video and let Kaizer X return a finished broadcast plus ready shorts — in your language, in your channel’s voice.</p>
          <div className="row rv d2">
            <a href="/login" className="btn-solid">Start free <span className="ar">→</span></a>
            <a href="/login" className="btn-text">Get the Windows app <span className="ar">→</span></a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="about">
              <div className="brand">
                <span className="sh"><img src="/landing-assets/kaizerx-mark.png" alt="Kaizer X" width="30" height="30" /></span>
                <span className="txt"><b style={{fontFamily: 'var(--disp)', fontWeight: '700', fontSize: '19px'}}>Kaizer X<span className="dot">.</span></b></span>
              </div>
              <p>AI-native video production for every Indian newsroom and creator. Telugu-first, running on your own machine. Made in Hyderabad.</p>
            </div>
            <div><h5>Product</h5><a href="#how">How it works</a><a href="#capabilities">What it does</a><a href="#anchor">AI anchor</a><a href="#desktop">Desktop app</a></div>
            <div><h5>Company</h5><a href="#">About</a><a href="#">For newsrooms</a><a href="#">Careers</a></div>
            <div><h5>Legal</h5><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="#">Security</a></div>
          </div>
          <div className="foot-bot">
            <span>© 2026 Sharkify Technology Pvt Ltd</span>
            <span>test.kaizerx.com · video production software</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
