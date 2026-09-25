import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Podcast, Upload, Loader2, AlertCircle, CheckCircle2, Sparkles, Square,
  RefreshCcw, ExternalLink, ChevronDown, ChevronRight, Scissors, ZoomIn,
  Clapperboard, FileJson,
} from "lucide-react";
import { api } from "../api/client";

/** Podcast Editor (AI multi-cam) — one camera in, virtual multi-cam out.
 *
 *  Frontend for routers/podcast.py (ported from kaizer-platform@d5fd482).
 *  Flow: upload a source recording (multipart with progress) + options →
 *  POST /api/podcast/jobs → poll /api/podcast/jobs/{key} every 3s through
 *  the pipeline states (queued → transcribing → planning → rendering) →
 *  on done GET /jobs/{key}/results and show the main edit + both promos
 *  (16:9 + 9:16) with the transparency telemetry from results.json.
 *  Terminal handling mirrors AnchorStudio: a lost render (backend restart)
 *  stops the poll with an honest message; 10 consecutive failed polls stop.
 */

// Upload extension whitelist — mirrors podcast.py's _ALLOWED_UPLOAD_EXTS
// (anything else is rejected server-side with HTTP 422).
const ALLOWED_EXTS = [".mp4", ".mov", ".mkv", ".m4a", ".wav", ".webm"];

// Fallback language options if /api/languages/ is unreachable.
const FALLBACK_LANGS = [
  { code: "te", english: "Telugu" }, { code: "hi", english: "Hindi" },
  { code: "en", english: "English" }, { code: "ta", english: "Tamil" },
  { code: "kn", english: "Kannada" }, { code: "ml", english: "Malayalam" },
  { code: "bn", english: "Bengali" }, { code: "mr", english: "Marathi" },
  { code: "gu", english: "Gujarati" },
];

// In-process states the backend reports while a job is running
// (podcast.py _RUNNING_STATES).
const RUNNING_STATES = new Set(["queued", "transcribing", "planning", "rendering"]);

// Pipeline stage strip — derived from the state + message strings podcast.py
// actually emits (transcribing 10% → editorial 30% → cut-list 40% → quality
// 45% → camera 55% → rendering 65%). Matching on the backend's own words
// keeps this honest: a stage lights up only when the backend says it's there.
const STAGES = [
  { key: "stt",       label: "Transcribe",
    match: (s) => s.state === "transcribing" || /transcript/i.test(s.message || "") },
  { key: "editorial", label: "AI editorial", match: (s) => /editorial/i.test(s.message || "") },
  { key: "cutlist",   label: "Cut-list",     match: (s) => /cut-list/i.test(s.message || "") },
  { key: "quality",   label: "Quality gate", match: (s) => /quality/i.test(s.message || "") },
  { key: "camera",    label: "Camera plan",  match: (s) => /camera|framing/i.test(s.message || "") },
  { key: "render",    label: "Render",       match: (s) => s.state === "rendering" },
];

const inputCls =
  "bg-black/40 border border-border rounded-lg px-3 py-2 text-sm text-white " +
  "focus:outline-none focus:border-accent2/60";

function fmtSeconds(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const s = Math.max(0, Number(v));
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A rendered output: playable when the backend gave a /media URL, otherwise
 *  the honest "not servable" fallback with the on-disk path. */
function ResultPlayer({ title, url, fsPath, vertical }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{title}</div>
      {url ? (
        <video src={api.mediaUrl(url)} controls preload="metadata"
          className={`rounded-lg border border-border bg-black w-full ${vertical ? "max-h-[420px] object-contain" : ""}`} />
      ) : (
        <div className="rounded-lg border border-border bg-black/40 p-3 text-[12px] text-gray-500">
          Not streamable from here (file is outside the media root).
          {fsPath && <div className="mt-1 break-all text-gray-600">{fsPath}</div>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-border bg-black/30 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-white mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5 break-words">{hint}</div>}
    </div>
  );
}

export default function PodcastStudio() {
  // ── Source + options ──
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState("");
  const [languages, setLanguages] = useState(FALLBACK_LANGS);
  const [language, setLanguage] = useState("te");
  const [renderer, setRenderer] = useState("ffmpeg");
  const [silenceMs, setSilenceMs] = useState(450);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [transcriptJson, setTranscriptJson] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── Job state ──
  const [phase, setPhase] = useState("idle");     // idle | uploading | running | done | error
  const [uploadPct, setUploadPct] = useState(0);
  const [jobKey, setJobKey] = useState("");
  const [status, setStatus] = useState(null);     // {state, progress, message, error, job_id, renderer}
  const [results, setResults] = useState(null);   // results.json payload on done
  const [submitErr, setSubmitErr] = useState("");
  const pollRef = useRef(null);
  const pollFailsRef = useRef(0);                 // consecutive failed status polls

  // Languages on mount.
  useEffect(() => {
    let alive = true;
    api.listLanguages()
      .then((list) => alive && Array.isArray(list) && list.length && setLanguages(list))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── 3s status poll (cleared on unmount) ──
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPoll, []);   // clear on unmount

  const pickFile = (f) => {
    setFileErr("");
    if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (!ALLOWED_EXTS.some((ext) => name.endsWith(ext))) {
      setFileErr(`Unsupported file type — allowed: ${ALLOWED_EXTS.join(", ")}`);
      return;
    }
    setFile(f);
  };

  const create = async () => {
    setSubmitErr("");
    setStatus(null);
    setResults(null);
    // Validate the optional transcript paste BEFORE the (possibly multi-GB)
    // upload starts — a malformed paste should fail here, not server-side.
    const tj = transcriptJson.trim();
    if (tj) {
      try {
        const data = JSON.parse(tj);
        const words = Array.isArray(data) ? data : data?.words;
        if (!Array.isArray(words) || !words.length) {
          throw new Error('expected {"words": [...]} or a bare word list');
        }
      } catch (e) {
        setSubmitErr(`Transcript JSON is invalid: ${e?.message || e}`);
        setPhase("error");
        return;
      }
    }
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("language", language);
      fd.append("silence_threshold_ms", String(silenceMs));
      fd.append("renderer", renderer);
      if (tj) fd.append("transcript_json", tj);
      setPhase("uploading");
      setUploadPct(0);
      const r = await api.podcastCreate(fd, setUploadPct);
      if (!r?.key) throw new Error("Backend did not return a job key");
      setJobKey(r.key);
      setPhase("running");
      setStatus({ state: "queued", progress: 0, message: "Queued", renderer: r.renderer });
      stopPoll();
      pollFailsRef.current = 0;
      const tick = async () => {
        try {
          const s = await api.podcastStatus(r.key);
          pollFailsRef.current = 0;
          if (s?.state === "idle") {
            // The backend's status map is process-local: "idle" for a key we
            // created means the process restarted and our job is gone.
            stopPoll();
            setPhase("error");
            setSubmitErr("The render was lost — the backend restarted. Check the Jobs list, or create the job again.");
            return;
          }
          setStatus(s);
          if (s.state === "done") {
            stopPoll();
            try {
              const res = await api.podcastResults(r.key);
              setResults(res?.results || null);
              setPhase("done");
            } catch (e) {
              setPhase("error");
              setSubmitErr(`The edit finished but the results payload could not be fetched: ${e?.message || e}`);
            }
          } else if (s.state === "error") {
            stopPoll();
            setPhase("error");
          }
        } catch (e) {
          if (e?.status === 404) {
            // Unknown key server-side — the backend restarted AND the Job
            // row fallback found nothing. The render is gone.
            stopPoll();
            setPhase("error");
            setSubmitErr("The render was lost — the backend no longer knows this job key. Check the Jobs list, or create the job again.");
            return;
          }
          // Transient poll failure — tolerate a few, but don't spin forever.
          pollFailsRef.current += 1;
          if (pollFailsRef.current >= 10) {
            stopPoll();
            setPhase("error");
            setSubmitErr(
              "Lost contact with the backend — 10 status checks in a row failed. " +
              "The edit may still be running; check the Jobs list."
            );
          }
        }
      };
      tick();
      pollRef.current = setInterval(tick, 3000);
    } catch (e) {
      setSubmitErr(e?.message || "Create request failed");
      setPhase("error");
    }
  };

  const reset = () => {
    stopPoll();
    setPhase("idle"); setJobKey(""); setStatus(null); setResults(null);
    setSubmitErr(""); setUploadPct(0);
  };

  const uploading = phase === "uploading";
  const running = phase === "running";
  const busy = uploading || running;
  const canCreate = !busy && !!file;

  // Stage strip index — the LAST stage whose matcher fires (stages are
  // ordered by pipeline position; earlier ones are then complete).
  let stageIdx = -1;
  if (running && status) {
    STAGES.forEach((st, i) => { if (st.match(status)) stageIdx = i; });
  }

  const cutlist = results?.cutlist;
  const promo = results?.promo;
  const jobId = status?.job_id;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Podcast className="text-accent2" size={22} />
          <h1 className="text-xl font-bold">Podcast Editor <span className="text-gray-400 font-semibold">(AI multi-cam)</span></h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          One camera in, virtual multi-cam out — AI removes filler, punches in on emphasis, and cuts promos.
          Upload the raw recording; you get a tightened main edit plus a 16:9 and a 9:16 promo.
        </p>

        {/* ── Upload ── */}
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Source recording</div>
          <div
            onClick={() => !busy && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              if (!busy) pickFile(e.dataTransfer?.files?.[0]);
            }}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition
              ${busy ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
              ${dragOver ? "border-accent2/70 bg-accent2/10" : "border-border bg-white/[0.03] hover:border-gray-500"}`}
          >
            <Upload size={26} className="mx-auto text-gray-500 mb-2" />
            {file ? (
              <>
                <div className="text-sm font-semibold">{file.name}</div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  {fmtBytes(file.size)} · click or drop to replace
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">Drop the recording here, or click to browse</div>
                <div className="text-[12px] text-gray-500 mt-0.5">{ALLOWED_EXTS.join(" · ")}</div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept={ALLOWED_EXTS.join(",")} className="hidden"
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {fileErr && (
            <div className="mt-2 text-[12px] text-red-300 flex items-center gap-1.5">
              <AlertCircle size={13} /> {fileErr}
            </div>
          )}
        </div>

        {/* ── Options ── */}
        <div className="mb-6 flex flex-wrap gap-6 items-start">
          <label className="block">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Language</div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              disabled={busy} className={inputCls}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.english}{l.native && l.native !== l.english ? ` (${l.native})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Renderer</div>
            <select value={renderer} onChange={(e) => setRenderer(e.target.value)}
              disabled={busy} className={inputCls}>
              <option value="ffmpeg">ffmpeg (default)</option>
              <option value="remotion">Remotion (if installed)</option>
            </select>
          </label>
          <label className="block min-w-[240px]">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Silence cut threshold · <span className="text-gray-300 tabular-nums">{silenceMs} ms</span>
            </div>
            <input type="range" min={200} max={1000} step={10} value={silenceMs}
              disabled={busy}
              onChange={(e) => setSilenceMs(Number(e.target.value))}
              className="w-full accent-orange-500" />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>200 ms · tighter</span><span>1000 ms · looser</span>
            </div>
          </label>
        </div>

        {/* ── Advanced: pre-supplied transcript ── */}
        <div className="mb-6">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-white">
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Advanced — supply a transcript (skip STT)
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <div className="text-[12px] text-gray-500 mb-2 flex items-start gap-1.5">
                <FileJson size={14} className="shrink-0 mt-0.5" />
                <span>
                  Paste word-level transcript JSON — <code className="text-gray-400">{'{"words": [{"w", "s", "e", "speaker"?}]}'}</code> or
                  a bare word list. With a transcript the job skips speech-to-text entirely (required when
                  the server has no Deepgram key).
                </span>
              </div>
              <textarea value={transcriptJson} onChange={(e) => setTranscriptJson(e.target.value)}
                rows={6} disabled={busy}
                placeholder='{"words": [{"w": "hello", "s": 0.0, "e": 0.4, "speaker": 0}, ...]}'
                className={`${inputCls} w-full resize-y font-mono text-[12px] leading-relaxed`} />
            </div>
          )}
        </div>

        {/* ── Create ── */}
        {(phase === "idle" || phase === "error") && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={create} disabled={!canCreate}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600
                         text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Sparkles size={16} /> Create the edit
            </button>
            {phase === "error" && (
              <button type="button" onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
                <RefreshCcw size={14} /> Start over
              </button>
            )}
          </div>
        )}

        {/* error — surface the backend's reason string verbatim */}
        {phase === "error" && (status?.error || submitErr) && (
          <div className="mt-4 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Edit failed</div>
              <div className="break-words">{status?.error || submitErr}</div>
            </div>
          </div>
        )}

        {/* upload progress */}
        {uploading && (
          <div className="rounded-2xl border border-border bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold flex items-center gap-2">
                <Loader2 size={16} className="text-accent2 animate-spin" />
                {uploadPct >= 100 ? "Upload sent — waiting for the backend to accept it…" : "Uploading recording…"}
              </div>
              <div className="text-sm text-gray-400 tabular-nums">{uploadPct}%</div>
            </div>
            <div className="h-3 rounded-full bg-black/50 overflow-hidden border border-border">
              <div className="h-full bg-gradient-to-r from-accent2 to-emerald-400 transition-all duration-300"
                   style={{ width: `${Math.min(100, Math.max(0, uploadPct))}%` }} />
            </div>
          </div>
        )}

        {/* pipeline progress */}
        {running && status && (
          <div className="rounded-2xl border border-border bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold flex items-center gap-2">
                <Loader2 size={16} className="text-accent2 animate-spin" />
                {RUNNING_STATES.has(status.state) ? (status.message || status.state) : (status.state || "Working…")}
              </div>
              <div className="text-sm text-gray-400 tabular-nums">{Math.round(status.progress || 0)}%</div>
            </div>
            <div className="h-3 rounded-full bg-black/50 overflow-hidden border border-border">
              <div className="h-full bg-gradient-to-r from-accent2 to-emerald-400 transition-all duration-300"
                   style={{ width: `${Math.min(100, Math.max(0, status.progress || 0))}%` }} />
            </div>
            {/* stage strip — lights from what the backend actually reported */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGES.map((st, i) => (
                <span key={st.key}
                  className={`px-2 py-1 rounded-md text-[11px] border
                    ${i < stageIdx ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : i === stageIdx ? "border-accent2/60 bg-accent2/10 text-white"
                      : "border-border bg-black/30 text-gray-500"}`}>
                  {st.label}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
              <span className="capitalize">{status.state}{status.renderer ? ` · ${status.renderer}` : ""}</span>
              <span>{jobKey}</span>
            </div>
            <button type="button" onClick={reset}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
              <Square size={13} /> Stop watching
            </button>
          </div>
        )}

        {/* ── Results ── */}
        {phase === "done" && results && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <div className="text-lg font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 size={18} /> Edit ready
                </div>
                <div className="text-sm text-gray-300 mt-0.5">
                  Main edit + two promos rendered
                  {results.renderer_used ? ` with ${results.renderer_used}` : ""}
                  {results.theme ? ` · ${results.theme} theme` : ""}.
                </div>
              </div>
              <div className="flex items-center gap-2">
                {jobId && (
                  <Link to={`/jobs/${jobId}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
                               text-black font-bold text-sm">
                    <ExternalLink size={15} /> Open Job #{jobId}
                  </Link>
                )}
                <button type="button" onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
                  <RefreshCcw size={14} /> Another
                </button>
              </div>
            </div>

            {/* players */}
            <ResultPlayer title="Main edit" url={results.edit_url} fsPath={results.edit} />
            <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
              <ResultPlayer title="Promo · 16:9" url={results.promo_169_url} fsPath={results.promo_169} />
              <ResultPlayer title="Promo · 9:16" url={results.promo_916_url} fsPath={results.promo_916} vertical />
            </div>

            {/* telemetry */}
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">What the AI did</div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                <Stat label="Kept" value={fmtSeconds(cutlist?.kept_seconds)}
                  hint={`of ${fmtSeconds(cutlist?.source_duration_s)} source`} />
                <Stat label="Removed" value={fmtSeconds(cutlist?.removed_seconds)}
                  hint={`${cutlist?.dropped?.length ?? 0} silence/filler cuts`} />
                <Stat label="Punch-ins" value={String(results.punch_ins?.length ?? 0)}
                  hint="emphasis zoom moments" />
                <Stat label="Promo segments" value={String(promo?.segments?.length ?? 0)}
                  hint={`${fmtSeconds(promo?.total_duration_s)} · ${promo?.source === "editorial" ? "AI director's picks" : "heuristic picks"}`} />
                <Stat label="Camera plan"
                  value={results.camera?.engaged ? `Engaged · ${results.camera?.windows ?? 0} windows` : "Not engaged"}
                  hint={results.camera?.reason} />
                <Stat label="AI editorial"
                  value={results.editorial?.engine || "Skipped (no LLM key)"}
                  hint={results.editorial?.error
                    ? `failed: ${results.editorial.error}`
                    : results.editorial?.engine
                    ? `${results.editorial?.drops?.length ?? 0} semantic drops`
                    : "mechanical cut-list only"} />
                {(results.vision_quality?.spans?.length || results.vision_quality?.error) ? (
                  <Stat label="Vision quality gate"
                    value={`${results.vision_quality?.spans?.length ?? 0} bad spans removed`}
                    hint={results.vision_quality?.error ? `gate error: ${results.vision_quality.error}` : ""} />
                ) : null}
              </div>
              {results.editorial?.audit && (
                <div className="mt-3 text-[12px] text-gray-400 border border-border rounded-xl bg-black/30 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Director's audit</div>
                  <div className="whitespace-pre-wrap break-words">{results.editorial.audit}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* how it works — static explainer */}
        {phase === "idle" && (
          <div className="mt-8 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            <div className="rounded-xl border border-border bg-white/[0.03] p-4">
              <Scissors size={16} className="text-accent2 mb-2" />
              <div className="text-sm font-semibold">Tightened edit</div>
              <div className="text-[12px] text-gray-500 mt-1">Silences, fillers and rambles are cut from the transcript, not guessed.</div>
            </div>
            <div className="rounded-xl border border-border bg-white/[0.03] p-4">
              <ZoomIn size={16} className="text-accent2 mb-2" />
              <div className="text-sm font-semibold">Virtual multi-cam</div>
              <div className="text-[12px] text-gray-500 mt-1">Punch-ins on emphasis and per-speaker reframes make one camera feel like three.</div>
            </div>
            <div className="rounded-xl border border-border bg-white/[0.03] p-4">
              <Clapperboard size={16} className="text-accent2 mb-2" />
              <div className="text-sm font-semibold">Promos included</div>
              <div className="text-[12px] text-gray-500 mt-1">A 16:9 and a 9:16 promo are cut from the strongest moments automatically.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
