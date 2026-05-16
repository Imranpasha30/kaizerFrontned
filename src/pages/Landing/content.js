/**
 * LANDING_CONTENT — single source of truth for the public landing page.
 *
 * Both NewspaperView and ModernView render from this object, so the
 * two visual modes can never drift apart on facts.
 *
 * AI-policy guardrail
 * -------------------
 * Per our compliance audit (YouTube is restricting AI-tooling
 * discoverability), this file MUST NOT contain the strings:
 *
 *   "AI", "artificial intelligence", "AI-generated", "AI-powered",
 *   "Gemini", "Whisper", "Claude", "GPT", "OpenAI", "autopilot"
 *
 * Model names + automation framing live ONLY in /privacy under
 * sub-processors. The landing uses the wording-sweep table below.
 *
 *   Source phrase                        →  Landing phrase
 *   ────────────────────────────────────────────────────────────────
 *   "AI video automation"                →  "Automated clip workflow"
 *   "AI cuts your video"                 →  "Smart compositor finds the highlights"
 *   "AI-generated captions"              →  "Auto-captioned"
 *   "Gemini drafted them"                →  "Drafted by the engine — you approve"
 *   "autopilot"                          →  "Scheduled queue"
 *   "AI core"                            →  "Engine core"
 *   "AI-powered"                         →  (omit entirely)
 *
 * Run this on every PR that touches this file:
 *
 *   grep -ri -E "\\bAI\\b|artificial intel|autopilot|gemini|whisper|GPT" \\
 *      src/pages/Landing/
 *
 * It must return zero matches. If a future writer needs to talk about
 * model behavior, they edit /privacy — not the landing.
 */

export const LANDING_CONTENT = {
  meta: {
    title:       "Kaizer News — long videos in, vertical clips out",
    description:
      "Upload a recording. We handle trimming, captions, and "
    + "scheduled publishing. You approve every clip before it goes "
    + "live — no exceptions.",
  },

  // ─── Masthead / hero metadata ────────────────────────────────
  masthead: {
    publication: "The Daily Kaizer",
    edition:     "VOL. I · NO. 1 · LIVE EDITION",
    tagline:     "A clip-publishing workshop for creators with a long-form back catalogue.",
    metaBoxes: [
      { label: "Edition",  value: "Live" },
      { label: "Auth",     value: "OAuth 2.0" },
      { label: "API",      value: "YouTube Data v3" },
      { label: "Pricing",  value: "From $29/mo" },
    ],
  },

  // ─── Hero ────────────────────────────────────────────────────
  hero: {
    eyebrow: "TODAY'S EDITION",
    headlineLines: [
      "Long video in.",
      "Vertical clips that",
      "ship themselves.",
    ],
    standfirstLeft:
      "Drop in an hour of recording. Walk away. Come back to a queue "
    + "of vertical clips, each captioned and branded for the channels "
    + "you've connected.",
    standfirstRight:
      "Every clip waits in your approval queue before it goes live. "
    + "You stay in the driver's seat — your channel, your keys, your "
    + "final word.",
    primaryCta:   { label: "Start free",        to: "/register" },
    secondaryCta: { label: "See how it works",  href: "#pipeline" },
  },

  // ─── Pipeline (§II): 4 stages — no AI wording ─────────────────
  pipeline: {
    eyebrow: "THE WORKSHOP",
    title:   "Four stations, one queue.",
    subtitle:
      "Each upload moves through the same four stations. Status is "
    + "live; you watch (or not).",
    stages: [
      {
        n: "01",
        t: "T+9s",
        title:    "Ingest",
        body:
          "Drop your source recording. We hash, probe duration, "
        + "and prep audio for transcription. No compression — your "
        + "master file stays intact for later.",
      },
      {
        n: "02",
        t: "T+14s",
        title:    "Analyze",
        body:
          "The engine reads the recording and indexes the moments "
        + "worth clipping — punch lines, key beats, transitions. "
        + "You'll see the full transcript before any cuts happen.",
      },
      {
        n: "03",
        t: "T+24s",
        title:    "Cut",
        body:
          "Smart compositor pulls the highlights into vertical 9:16 "
        + "frames. Captions burn in. Your channel's logo, font, and "
        + "color sit exactly where you set them.",
      },
      {
        n: "04",
        t: "T+24s",
        title:    "Publish",
        body:
          "Clips wait in your approval queue. Approve one — it ships. "
        + "Approve all — they ship on a schedule you set. You can "
        + "back out at any time.",
      },
    ],
  },

  // ─── Stats (§IV) ──────────────────────────────────────────────
  stats: {
    eyebrow: "BY THE NUMBERS",
    title:   "Hours come back to you.",
    figures: [
      { value: 10,    suffix: "×",  label: "Faster than hand-editing the same hour"     },
      { value: 30,    suffix: "+",  label: "Languages with auto-captioning support"      },
      { value: 3,     suffix: " m", label: "Average wall-clock per clip ready for review" },
      { value: 99.97, suffix: "%",  label: "Uptime over the last 90 days"                },
    ],
  },

  // ─── Trust (§V): OAuth + "what we don't do" ───────────────────
  trust: {
    eyebrow: "YOUR CHANNEL · YOUR KEYS",
    title:   "OAuth-only. Three scopes. You revoke any time.",
    intro:
      "We connect to YouTube the same way every other YouTube tool "
    + "must: through Google's OAuth flow. You see the scopes before "
    + "you grant. You revoke from Google's security page in one click "
    + "and we lose access instantly.",
    scopes: [
      {
        code: "youtube.upload",
        title: "Upload videos on your behalf",
        body:
          "Required for clip publishing. Only fires when you approve a "
        + "clip in the queue. Nothing is auto-uploaded.",
      },
      {
        code: "youtube.readonly",
        title: "Read your channel metadata",
        body:
          "Lets us match clips to the right channel, fetch your "
        + "subscriber count for stats, and reuse your existing tags "
        + "as starting points.",
      },
      {
        code: "youtube",
        title: "Manage broadcasts + live streams",
        body:
          "Lets us mint a live-broadcast target when you opt into "
        + "scheduled-live publishing (separate flow). Off by default.",
      },
    ],
    wontDo: {
      title: "What we don't do",
      items: [
        "We don't post anything until you approve it.",
        "We don't sell your data. We don't have any to sell.",
        "We don't read other channels you don't own.",
        "We don't store your refresh tokens in plain text.",
        "We don't keep finished clips longer than 48 hours.",
        "We don't lock you in — your work exports as one ZIP.",
      ],
    },
  },

  // ─── Pricing (§VI): 4 tiers, Postiz-anchored ──────────────────
  pricing: {
    eyebrow: "RATES",
    title:   "Pick the size of your operation.",
    subtitle:
      "Every plan ships the full toolchain. Higher tiers add capacity "
    + "and team seats. Cancel anytime.",
    tiers: [
      {
        name:  "Creator",
        price: "$29",
        cycle: "/mo",
        blurb: "Best for solo creators",
        features: [
          "5 channels",
          "100 clips / month",
          "Per-channel branding presets",
          "Scheduled queue",
          "Email support",
        ],
        cta:      { label: "Start free", to: "/register" },
        featured: false,
      },
      {
        name:  "Team",
        price: "$39",
        cycle: "/mo",
        blurb: "Best for small brands",
        features: [
          "15 channels",
          "500 clips / month",
          "Up to 3 team members",
          "Priority render queue",
          "Slack + email support",
        ],
        cta:      { label: "Start free", to: "/register" },
        featured: false,
      },
      {
        name:  "Pro",
        price: "$49",
        cycle: "/mo",
        blurb: "Best for large publishers",
        features: [
          "30 channels",
          "Unlimited clips",
          "Up to 10 team members",
          "Dedicated render queue",
          "Custom workflow templates",
          "24-hour support SLA",
        ],
        cta:      { label: "Start free", to: "/register" },
        featured: true,
      },
      {
        name:  "Studio",
        price: "$99",
        cycle: "/mo",
        blurb: "Best for agencies + networks",
        features: [
          "Unlimited channels",
          "Unlimited clips + storage",
          "Unlimited team members",
          "Dedicated GPU pool",
          "SAML SSO",
          "Custom integrations",
          "4-hour support SLA",
        ],
        cta:      { label: "Talk to us", href: "mailto:sales@kaizerx.com" },
        featured: false,
      },
    ],
    note:
      "All plans share the same engine. Higher tiers add capacity and "
    + "team features. Cancel anytime — your data exports as one ZIP.",
  },

  // ─── FAQ (§VII) ────────────────────────────────────────────────
  faq: {
    eyebrow: "QUESTIONS, ANSWERED",
    items: [
      {
        q: "Does Kaizer post anything without my approval?",
        a:
          "No. Every clip lands in your approval queue. You click "
        + "publish — or set a recurring rule, which you can pause or "
        + "cancel any time. We never auto-upload behind your back.",
      },
      {
        q: "What data do you keep, and for how long?",
        a:
          "Source uploads live on our servers only during the "
        + "broadcast or processing window. Finished clips you don't "
        + "publish are purged after 48 hours. Your account metadata "
        + "stays until you delete the account.",
      },
      {
        q: "Which YouTube scopes do you ask for?",
        a:
          "Three: youtube.upload (to publish clips you approve), "
        + "youtube.readonly (to match clips to your channels), and "
        + "youtube (only for the optional scheduled-live broadcast "
        + "flow). You see every scope at the OAuth consent screen.",
      },
      {
        q: "Can I cancel any time?",
        a:
          "Yes. Cancel in one click from your account page. Your last "
        + "billing period stays active until it expires. We don't "
        + "lock anything behind a cancellation form.",
      },
      {
        q: "What happens to my videos if I stop using Kaizer?",
        a:
          "Your channel keeps the published clips — they're on "
        + "YouTube, not us. Source files we still hold get purged on "
        + "schedule. You can also export your library as a single ZIP "
        + "from your account page.",
      },
      {
        q: "Do you offer custom branding / on-prem options?",
        a:
          "Yes — Studio tier includes custom integrations + SAML SSO. "
        + "Agencies running 20+ channels typically pick that. For "
        + "on-prem, talk to us at sales@kaizerx.com.",
      },
    ],
  },

  // ─── Closing CTA ──────────────────────────────────────────────
  closing: {
    eyebrow: "READY?",
    title:   "Start with a single recording.",
    body:
      "No card up front. No commitment. Drop a file, walk away, come "
    + "back to clips ready to ship to the channels you pick.",
    primaryCta:   { label: "Start free",   to: "/register" },
    secondaryCta: { label: "Sign in",      to: "/login"    },
  },

  // ─── Footer ───────────────────────────────────────────────────
  footer: {
    columns: [
      {
        title: "Product",
        links: [
          { label: "Pricing",      href: "#pricing" },
          { label: "How it works", href: "#pipeline" },
          { label: "Trust",        href: "#trust"   },
          { label: "FAQ",          href: "#faq"     },
        ],
      },
      {
        title: "Company",
        links: [
          { label: "Contact",  href: "mailto:hello@kaizerx.com" },
          { label: "Careers",  href: "mailto:careers@kaizerx.com" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Privacy",          to: "/privacy" },
          { label: "Terms of Service", to: "/terms" },
        ],
      },
    ],
    smallprint:
      "Kaizer News uses YouTube API Services. By using Kaizer News, "
    + "you agree to the YouTube Terms of Service "
    + "(https://www.youtube.com/t/terms) and the Google Privacy Policy "
    + "(https://policies.google.com/privacy). Limited Use disclosures "
    + "are documented on our Privacy page.",
    copyright: "© Kaizer News. All rights reserved.",
  },

  // ─── Section navigation map (TOC) ─────────────────────────────
  // Used by the newspaper subnav AND the modern HUD scene labels.
  // Keep this in sync with the order of sections rendered.
  sections: [
    { id: "hero",     numeral: "§I",   label: "Today's edition" },
    { id: "pipeline", numeral: "§II",  label: "The workshop"    },
    { id: "stats",    numeral: "§III", label: "Figures"         },
    { id: "trust",    numeral: "§IV",  label: "Trust"           },
    { id: "pricing",  numeral: "§V",   label: "Rates"           },
    { id: "faq",      numeral: "§VI",  label: "Q&A"             },
    { id: "closing",  numeral: "§VII", label: "Sign-on"         },
  ],
};

export default LANDING_CONTENT;
