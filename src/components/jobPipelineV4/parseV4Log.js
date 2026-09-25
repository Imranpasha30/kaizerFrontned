/**
 * parseV4Log.js
 *
 * Turn the V4 pipeline's free-form log_lines[] (as polled from
 * GET /api/jobs/:id/status/) into a structured view that the
 * newsroom-style JobPipelineV4 panel can render:
 *
 *   {
 *     stageIdx:    0|1|2|3,        // index into V4_STAGES; 3 = done
 *     stageFrac:   0..1,           // estimated progress within stage
 *     overallFrac: 0..1,           // estimated overall pipeline progress
 *     done:        boolean,
 *     failed:      boolean,
 *     activity:    [{ id, t, tag, kind, msg }, ...]  // newest-first
 *     counters:    { shortsPlanned, shortsTrimmed, shortsRendered,
 *                    bulletinRendered, imagesPreselected }
 *   }
 *
 * Stage map (matches kaizer/KaizerBackend/pipeline_v4/orchestrator.py):
 *   0 — Atomic trim + ingest          (Stage 1/3)
 *   1 — Build canvas + shorts + SEO   (Stage 2/3)
 *   2 — Render bulletin + shorts      (Stage 3/3)
 *
 * The backend emits no structured stage events, only log lines, so
 * everything here is pattern-matched. Patterns kept generous so a
 * minor wording change in the orchestrator doesn't blank the UI.
 */

export const V4_STAGES = [
  {
    key: "trim",
    n: 1,
    label: "Atomic trim",
    sub: "Cleaning the source video and ingesting full video images.",
  },
  {
    key: "canvas",
    n: 2,
    label: "Building canvas & shorts",
    sub: "Laying out the full video canvas, planning shorts, generating SEO.",
  },
  {
    key: "render",
    n: 3,
    label: "Rendering",
    sub: "Encoding the 16:9 full video and 9:16 shorts via ffmpeg.",
  },
];

// Each stage's contribution to overall progress (must sum to 1.0).
// Stage 3 dominates because ffmpeg renders take the most wall time.
const STAGE_WEIGHTS = [0.18, 0.27, 0.55];

const TAG_KIND = {
  start:    "live",
  done:     "ok",
  trim:     "cut",
  bulletin: "ok",
  short:    "ok",
  seo:      "ok",
  pool:     "live",
  plan:     "live",
  img:      "live",
  asset:    "ok",
  fetch:    "ok",
  err:      "err",
  info:     null,
};

// Classify one log line. Returns null if we don't want to surface it.
function classifyLine(line) {
  if (!line) return null;
  const m = (re) => line.match(re);

  // ─── Failures first (so a failing line doesn't get misread as info) ───
  if (/\bfailed\b/i.test(line) && /^\s*\[v4\]/.test(line)) {
    return { tag: "ERR",     kind: TAG_KIND.err,      msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+FAILED\b/i)) {
    return { tag: "FAILED",  kind: TAG_KIND.err,      msg: stripV4(line) };
  }

  // ─── Stage boundaries ───
  if (m(/^\s*\[v4\]\s+Stage\s+(\d)\/3\s+START\b/i)) {
    return { tag: "START",   kind: TAG_KIND.start,    msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+Stage\s+(\d)\/3\s+DONE\b/i)) {
    return { tag: "DONE",    kind: TAG_KIND.done,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+job\s+\S+\s+starting\b/i)) {
    return { tag: "JOB",     kind: TAG_KIND.start,    msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+job\s+\S+\s+DONE\b/i)) {
    return { tag: "JOB",     kind: TAG_KIND.done,     msg: stripV4(line) };
  }

  // ─── Stage 1 markers ───
  if (m(/^\s*\[bulletin-images\]\s+Pre-selected/i)) {
    return { tag: "IMG",     kind: TAG_KIND.img,      msg: stripPrefix(line, /\[bulletin-images\]\s+/i) };
  }
  if (m(/^\s*\[bulletin-images\]\s+asset/i)) {
    return { tag: "ASSET",   kind: TAG_KIND.asset,    msg: stripPrefix(line, /\[bulletin-images\]\s+/i) };
  }
  if (m(/^\s*\[v4\]\s+source\s+aspect/i)) {
    return { tag: "ASPECT",  kind: TAG_KIND.info,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+output_dir=/i)) {
    return null; // path noise — skip
  }

  // ─── Stage 2 markers ───
  if (m(/^\s*\[v4\]\s+pool\s+ingested/i)) {
    return { tag: "POOL",    kind: TAG_KIND.pool,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+auto-fetched/i)) {
    return { tag: "FETCH",   kind: TAG_KIND.fetch,    msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+shorts\s+plan/i)) {
    return { tag: "PLAN",    kind: TAG_KIND.plan,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+short_\d+\S*:\s+trimmed/i)) {
    return { tag: "TRIM",    kind: TAG_KIND.trim,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+SEO\s+generated/i)) {
    return { tag: "SEO",     kind: TAG_KIND.seo,      msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+bulletin\s+SEO\s+description/i)) {
    return { tag: "SEO",     kind: TAG_KIND.seo,      msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+SOURCE-PRESERVED/i)) {
    return { tag: "MODE",    kind: TAG_KIND.info,     msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+materialised\s+\d+\s+Clip/i)) {
    return { tag: "DB",      kind: TAG_KIND.info,     msg: stripV4(line) };
  }

  // ─── Stage 3 markers ───
  if (m(/^\s*\[v4\]\s+bulletin\s+rendered/i)) {
    return { tag: "FULL VIDEO", kind: TAG_KIND.bulletin, msg: stripV4(line) };
  }
  if (m(/^\s*\[v4\]\s+short\s+\d+\s+rendered/i)) {
    return { tag: "SHORT",   kind: TAG_KIND.short,    msg: stripV4(line) };
  }

  // Generic [v4] line we don't have a specific tag for — keep as INFO
  if (m(/^\s*\[v4\]/i)) {
    return { tag: "v4",      kind: TAG_KIND.info,     msg: stripV4(line) };
  }
  // Generic bulletin-images line
  if (m(/^\s*\[bulletin-images\]/i)) {
    return { tag: "IMG",     kind: TAG_KIND.img,      msg: stripPrefix(line, /\[bulletin-images\]\s+/i) };
  }
  return null;
}

function stripV4(line) {
  return line.replace(/^\s*\[v4\]\s+/i, "");
}
function stripPrefix(line, re) {
  return line.replace(re, "");
}

// Display-only rename. Backend log markers still use "bulletin" but the
// user-facing UI calls the long-form output "Full Video" — rewrite the
// rendered message so the activity log reads consistently. Preserves
// case for the common forms we emit.
function humanizeMsg(s) {
  if (!s) return s;
  return s
    .replace(/\bBulletin\b/g, "Full Video")
    .replace(/\bbulletin\b/g, "full video")
    .replace(/\bbulletins\b/g, "full videos");
}

/**
 * Parse the full log_lines[] array.
 * Order matters: the array is processed in file order so the final
 * (stageIdx, counters) reflect the latest state. Activity list is
 * emitted oldest-first internally then reversed for display.
 */
// Real substeps per stage, derived from orchestrator log markers (in
// pipeline order). `start` flips the substep active; `finish` (optional)
// marks it done even if nothing later has started — so the checklist
// under each stage reflects what the engine is ACTUALLY doing and the
// user never stares at a silent 10-minute step.
const SUBSTEP_DEFS = {
  trim: [
    { key: "extract",    label: "Extracting audio",
      start: /\[v4\/step1\]\s+extracting audio/i },
    { key: "transcribe", label: "Transcribing speech (Deepgram)",
      start: /\[v4\/step1\]\s+Deepgram .*transcribing/i,
      finish: /\[v4\/step1\]\s+got \d+ words/i },
    { key: "cutplan",    label: "AI cut-plan (keep/cut decisions)",
      start: /\[v4\/step1\]\s+\S+.*planning KEEP\/CUT/i,
      finish: /\[v4\/step1\]\s+\d+ stories,/i },
    { key: "refclips",   label: "Placing your reference clips",
      start: /\[v4\/refclips\]/i,
      finish: /\[v4\/refclips\]\s+\d+\/\d+ crew moment/i },
    { key: "encode",     label: "Cutting + encoding the master",
      start: /\[v4\/step1\]\s+atomic ffmpeg trim\+concat/i,
      finish: /\[v4\/step1\]\s+done --/i },
  ],
  canvas: [
    { key: "pool",    label: "Ingesting images",
      start: /\[v4\]\s+pool ingested/i },
    { key: "aiimg",   label: "Generating story images (AI)",
      start: /\[v4\/image\]|\[v4\/image-ai\]|\[nano-banana\]/i,
      finish: /\[v4\]\s+auto-fetched \d+/i },
    { key: "asked",   label: "Noting what you can change",
      start: /\[v4\/imagery\]\s+\d+ picture question|\[v4\]\s+picture questions/i,
      finish: /picture question\(s\) written/i },
    { key: "timing",  label: "Syncing images to speech",
      start: /\[v4\/img-timing\]/i },
    { key: "plan",    label: "Planning shorts",
      start: /\[v4\]\s+shorts (cap|plan)/i },
    { key: "strim",   label: "Trimming shorts",
      start: /\[v4\]\s+short_\d+\S*:\s+trimmed/i },
    { key: "seo",     label: "Writing SEO",
      start: /\[v4\]\s+(SEO generated|bulletin SEO)/i },
  ],
  render: [
    { key: "director", label: "AI Director planning the show",
      start: /\[v4\/director\]|\[v4\/director-platform\]|director engine=platform/i,
      finish: /\[v4\/director\]\s+plan:|director engine=platform planned \d+/i },
    { key: "compose",  label: "Composing full video",
      start: /\[v4\/v1_bridge\]\s+story \d+\/\d+ (composed|cache hit)|\[ffmpeg\/compose_story/i,
      finish: /\[v4\/v1_bridge\]\s+stitched \d+ stories|\[v4\]\s+bulletin rendered/i },
    { key: "opener",   label: "Building the opener",
      start: /\[v4\/v1_bridge\]\s+OPENER:|\[v4\/opener\]/i,
      finish: /\[v4\/v1_bridge\]\s+OPENER:.*built in/i },
    { key: "stitch",   label: "Stitching + ticker",
      start: /\[v4\/v1_bridge\]\s+stitched \d+ stories/i,
      finish: /\[v4\]\s+bulletin rendered/i },
    { key: "shorts",   label: "Rendering shorts",
      start: /\[v4\]\s+short \d+ rendered/i },
  ],
};

export function parseV4Log(lines, { status } = {}) {
  const activity = [];
  let stageIdx = 0;
  let stage1Started = false;
  let stage3Started = false;
  let done = false;
  let failed = false;

  // Substep tracking: per stage, the highest substep whose start-marker
  // matched (-1 = none yet) + a set of finished substep keys + live counts.
  const subReached = { trim: -1, canvas: -1, render: -1 };
  const subFinished = { trim: new Set(), canvas: new Set(), render: new Set() };
  let storiesComposed = 0;
  let storiesTotal = 0;

  let imagesPreselected = 0;
  let shortsPlanned = 0;
  let shortsTrimmed = 0;
  let shortsRendered = 0;
  let bulletinRendered = false;
  let seoGenerated = false;
  // Output format the job is rendering: "both" (default) | "shorts-only" |
  // "full-only". The orchestrator logs `[v4] output_format=X` only when it
  // isn't "both", so absence = "both". Drives whether a full video / shorts
  // are even expected (so progress + the done card don't count phantom outputs).
  let outputFormat = "both";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;

    // Stage-1 entry: job starting OR bulletin-images Pre-selected.
    if (!stage1Started &&
        (/^\s*\[v4\]\s+job\s+\S+\s+starting/i.test(raw) ||
         /^\s*\[bulletin-images\]\s+Pre-selected/i.test(raw))) {
      stage1Started = true;
    }

    // Stage transitions.
    if (/^\s*\[v4\]\s+Stage\s+1\/3\s+DONE/i.test(raw) && stageIdx < 1) {
      stageIdx = 1;
    } else if (/^\s*\[v4\]\s+Stage\s+2\/3\s+DONE/i.test(raw) && stageIdx < 2) {
      stageIdx = 2;
    } else if (/^\s*\[v4\]\s+Stage\s+3\/3\s+START/i.test(raw)) {
      stage3Started = true;
      if (stageIdx < 2) stageIdx = 2;
    } else if (/^\s*\[v4\]\s+Stage\s+3\/3\s+DONE/i.test(raw)) {
      stageIdx = 3;
      done = true;
    } else if (/^\s*\[v4\]\s+job\s+\S+\s+DONE/i.test(raw)) {
      stageIdx = 3;
      done = true;
    } else if (
      /^\s*\[v4\]\s+FAILED/i.test(raw)
      || (/ failed /i.test(raw) && /^\s*\[v4\]/.test(raw)
          // Soft-skips are RECOVERED conditions ("image auto-fetch failed
          // (soft-skip)") — the pipeline continues. Treating them as fatal
          // showed a "Pipeline failed" card over a HEALTHY running job.
          && !/\(soft(?:-skip)?\)/i.test(raw))
    ) {
      failed = true;
    }

    // Counters.
    let m;
    if ((m = raw.match(/^\s*\[bulletin-images\]\s+Pre-selected\s+(\d+)/i))) {
      imagesPreselected = Math.max(imagesPreselected, parseInt(m[1], 10) || 0);
    }
    if ((m = raw.match(/^\s*\[v4\]\s+shorts\s+plan\s+--?\s*(\d+)\s+candidates/i))) {
      shortsPlanned = Math.max(shortsPlanned, parseInt(m[1], 10) || 0);
    }
    // NOTE \S* after the index: labels are now e.g. "short_01_s01p1:" —
    // the old `short_\d+:` never matched, so trims counted 0 forever.
    if (/^\s*\[v4\]\s+short_\d+\S*:\s+trimmed/i.test(raw))        shortsTrimmed++;
    if (/^\s*\[v4\]\s+short\s+\d+\s+rendered/i.test(raw))         shortsRendered++;
    if (/^\s*\[v4\]\s+bulletin\s+rendered/i.test(raw))            bulletinRendered = true;
    if (/^\s*\[v4\]\s+SEO\s+generated/i.test(raw))                seoGenerated = true;
    if ((m = raw.match(/^\s*\[v4\]\s+output_format=([a-z-]+)/i)))  outputFormat = m[1].toLowerCase();
    if ((m = raw.match(/\[v4\/v1_bridge\]\s+story\s+(\d+)\/(\d+)\s+(composed|cache hit)/i))) {
      storiesComposed += 1;
      storiesTotal = Math.max(storiesTotal, parseInt(m[2], 10) || 0);
    }

    // Substep start/finish markers (per stage, in pipeline order).
    for (const [sk, defs] of Object.entries(SUBSTEP_DEFS)) {
      for (let d = 0; d < defs.length; d++) {
        if (defs[d].start.test(raw)) subReached[sk] = Math.max(subReached[sk], d);
        if (defs[d].finish && defs[d].finish.test(raw)) subFinished[sk].add(defs[d].key);
      }
    }

    // Activity log entry.
    const c = classifyLine(raw);
    if (c) {
      activity.push({
        id: i,
        idx: i,
        tag: c.tag,
        kind: c.kind,
        msg: humanizeMsg(c.msg.trim()),
      });
    }
  }

  // Estimate intra-stage fraction from sub-markers (best-effort).
  let stageFrac = 0;
  if (stageIdx === 0) {
    // Stage 1: bulletin-images pre-select + ingest. We don't know
    // total count, so anchor on whether we've started.
    stageFrac = stage1Started ? 0.4 : 0.05;
  } else if (stageIdx === 1) {
    // Stage 2: pool → plan → trim each short → SEO → bulletin SEO
    // override. Each successful sub-marker pushes us forward.
    let f = 0.1; // entered stage
    if (shortsPlanned > 0) f = Math.max(f, 0.35);
    if (shortsPlanned > 0) {
      const trimRatio = shortsTrimmed / Math.max(1, shortsPlanned);
      f = Math.max(f, 0.35 + trimRatio * 0.3);
    }
    if (seoGenerated) f = Math.max(f, 0.85);
    stageFrac = Math.min(0.95, f);
  } else if (stageIdx === 2) {
    // Stage 3: bulletin + each short renders.
    let f = stage3Started ? 0.1 : 0.05;
    // Only count the outputs this job actually renders — a shorts-only job has
    // no full video, a full-only job has no shorts. Counting a phantom bulletin
    // capped progress at e.g. 50% even when the only short was already done.
    const bulletinExpected = outputFormat !== "shorts-only";
    const shortsExpected   = outputFormat !== "full-only";
    const totalOutputs = Math.max(1,
      (bulletinExpected ? 1 : 0) +
      (shortsExpected ? Math.max(shortsPlanned, shortsTrimmed) : 0));
    const rendered = (bulletinRendered ? 1 : 0) + shortsRendered;
    f = Math.max(f, rendered / totalOutputs);
    stageFrac = Math.min(0.97, f);
  } else {
    stageFrac = 1;
  }

  // Failed jobs cap their stage frac.
  if (failed && !done) {
    stageFrac = Math.min(stageFrac, 0.85);
  }

  // Overall progress = sum of completed stage weights + active * frac.
  let overallFrac = 0;
  for (let i = 0; i < V4_STAGES.length; i++) {
    if (i < stageIdx) overallFrac += STAGE_WEIGHTS[i];
    else if (i === stageIdx) overallFrac += STAGE_WEIGHTS[i] * stageFrac;
  }
  if (done) overallFrac = 1;

  // Trust backend status for terminal states.
  if (status === "done") {
    stageIdx = 3; stageFrac = 1; overallFrac = 1; done = true; failed = false;
  } else if (status === "failed") {
    failed = true;
  }

  // Materialize the substep checklists. A substep is done when its finish
  // marker fired, a LATER substep in the same stage started, or the whole
  // stage is behind us; the highest started substep is "active". Live
  // counts make the busy steps feel alive (stories 3/9, shorts 2/8).
  const STAGE_KEYS = ["trim", "canvas", "render"];
  // Which AI Director ENGINE ran (dual-director feature): the platform
  // engine logs under [v4/director-platform] / "director engine=platform";
  // label the substep with the ENGINE THE USER PICKED, not a generic name.
  const directorEngine = lines.some((l) =>
    /director engine=platform|\[v4\/director-platform\]/i.test(l)) ? "platform" : "v4";
  const substeps = {};
  STAGE_KEYS.forEach((sk, sIdx) => {
    const defs = SUBSTEP_DEFS[sk];
    const stageDone = done || stageIdx > sIdx;
    substeps[sk] = defs.map((d, i) => {
      let state = "pending";
      if (stageDone) state = "done";
      else if (i < subReached[sk]) state = "done";
      else if (i === subReached[sk])
        state = subFinished[sk].has(d.key) ? "done" : "active";
      let label = d.label;
      if (d.key === "director" && state !== "pending")
        label = directorEngine === "platform"
          ? "AI Director planning (Platform — classic 5-mood)"
          : "AI Director planning (Kaizer V4 — full arsenal)";
      if (d.key === "aiimg" && imagesPreselected === 0 && state !== "pending") {
        // count comes from auto-fetched later; keep the base label
      }
      if (d.key === "strim" && shortsPlanned > 0 && state !== "pending")
        label = `Trimming shorts (${Math.min(shortsTrimmed, shortsPlanned)}/${shortsPlanned})`;
      if (d.key === "compose" && storiesTotal > 0 && state !== "pending")
        label = `Composing full video (${Math.min(storiesComposed, storiesTotal)}/${storiesTotal} stories)`;
      if (d.key === "shorts" && state !== "pending") {
        const totalS = Math.max(shortsPlanned, shortsRendered);
        label = totalS > 0
          ? `Rendering shorts (${Math.min(shortsRendered, totalS)}/${totalS})`
          : label;
      }
      return { key: d.key, label, state };
    });
    // While a stage is active but nothing matched yet, pulse its first
    // substep so the rail never looks frozen at a stage boundary.
    if (!stageDone && sIdx === stageIdx && subReached[sk] < 0 && substeps[sk][0])
      substeps[sk][0].state = "active";
  });

  return {
    stageIdx,
    stageFrac,
    overallFrac,
    done,
    failed,
    outputFormat,
    substeps,
    activity: activity.slice().reverse(), // newest first for display
    counters: {
      imagesPreselected,
      shortsPlanned,
      shortsTrimmed,
      shortsRendered,
      bulletinRendered,
      seoGenerated,
    },
  };
}

export default parseV4Log;
