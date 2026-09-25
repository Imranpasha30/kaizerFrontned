import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic, Play, Square, Loader2, AlertCircle, CheckCircle2, Sparkles,
  User, RefreshCcw, ExternalLink, Volume2,
} from "lucide-react";
import { api, getToken } from "../api/client";

/** Anchor Studio — an AI presenter reads your script on camera.
 *
 *  Frontend for the provider-agnostic avatar API ported from
 *  kaizer-platform@d5fd482 server/routers/avatar.py (new UI — the vendor
 *  tree has no equivalent page). Flow: pick provider → avatar → voice
 *  (with audio samples) → language + output platform → script →
 *  POST /api/avatar/generate → poll /api/avatar/status/{key} every 3s →
 *  on success link to the created Job (/jobs/<id>) + inline preview.
 */

// Output platforms — mirrors avatar.py's GenerateDirect contract
// (is_vertical = platform ends with "short" or "reel").
const PLATFORMS = [
  { key: "youtube_short",  label: "YouTube Short",  hint: "1080×1920 vertical" },
  { key: "youtube_full",   label: "YouTube Full",   hint: "1920×1080 widescreen" },
  { key: "instagram_reel", label: "Instagram Reel", hint: "1080×1920 vertical" },
];

// Fallback language options if /api/languages/ is unreachable.
const FALLBACK_LANGS = [
  { code: "te", english: "Telugu" }, { code: "hi", english: "Hindi" },
  { code: "en", english: "English" }, { code: "ta", english: "Tamil" },
  { code: "kn", english: "Kannada" }, { code: "ml", english: "Malayalam" },
  { code: "bn", english: "Bengali" }, { code: "mr", english: "Marathi" },
  { code: "gu", english: "Gujarati" },
];

// In-process states reported by the backend while a render is running.
const RUNNING_STATES = new Set(["queued", "transcribing", "scripting", "rendering", "downloading"]);

const GENDER_LABEL = { f: "Female", m: "Male" };

const inputCls =
  "bg-black/40 border border-border rounded-lg px-3 py-2 text-sm text-white " +
  "focus:outline-none focus:border-accent2/60";

/** preview_path is "local file or URL" per the provider contract — only
 *  URLs the browser can actually load are usable as <img> sources. */
function usablePreview(p) {
  return p && (/^https?:\/\//i.test(p) || p.startsWith("/")) ? api.mediaUrl(p) : "";
}

export default function AnchorStudio() {
  // ── Catalog state ──
  const [providers, setProviders] = useState([]);        // [{name, available, reason}]
  const [provider, setProvider] = useState("");          // "" until /providers answers
  const [avatars, setAvatars] = useState([]);
  const [avatarId, setAvatarId] = useState("");
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState("");
  const [languages, setLanguages] = useState(FALLBACK_LANGS);
  const [language, setLanguage] = useState("te");
  const [platform, setPlatform] = useState("youtube_short");
  const [script, setScript] = useState("");
  const [catalogErr, setCatalogErr] = useState("");      // avatar/voice load failure (provider reason)
  const [providersErr, setProvidersErr] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // ── Voice sample players ──
  const [samples, setSamples] = useState({});            // voiceId -> blob URL
  const [sampleErr, setSampleErr] = useState({});        // voiceId -> message
  const [sampleLoading, setSampleLoading] = useState("");
  const samplesRef = useRef({});                         // for unmount revoke

  // ── Generation state ──
  const [phase, setPhase] = useState("idle");            // idle | running | done | error
  const [genKey, setGenKey] = useState("");
  const [status, setStatus] = useState(null);            // {state, progress, message, error, job_id, clip_id}
  const [clip, setClip] = useState(null);                // fetched on done → video_url preview
  const [submitErr, setSubmitErr] = useState("");
  const pollRef = useRef(null);
  const pollFailsRef = useRef(0);                        // consecutive failed status polls

  // ── Providers on mount ──
  useEffect(() => {
    let alive = true;
    api.avatarProviders()
      .then((r) => {
        if (!alive) return;
        setProviders(r?.providers || []);
        setProvider(r?.default || r?.providers?.[0]?.name || "");
      })
      .catch((e) => alive && setProvidersErr(e?.message || "Could not reach the avatar API"));
    api.listLanguages()
      .then((list) => alive && Array.isArray(list) && list.length && setLanguages(list))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── Avatars + voices per provider ──
  useEffect(() => {
    if (!provider) return;
    let alive = true;
    setCatalogErr("");
    setAvatars([]); setVoices([]); setAvatarId(""); setVoiceId("");
    // Provider changed → old sample blobs are stale.
    Object.values(samplesRef.current).forEach((u) => URL.revokeObjectURL(u));
    samplesRef.current = {};
    setSamples({}); setSampleErr({}); setSampleLoading("");
    // /providers already told us whether this engine is up — don't hit
    // /avatars + /voices on a down provider (the raw HTTP 500/502 would
    // leak into the catalog error). The amber "not ready" banner below the
    // engine picker carries the provider's reason string instead.
    const row = providers.find((p) => p.name === provider);
    if (row && row.available === false) {
      setLoadingCatalog(false);
      return () => { alive = false; };
    }
    setLoadingCatalog(true);
    Promise.all([api.avatarAvatars(provider), api.avatarVoices(provider)])
      .then(([av, vo]) => {
        if (!alive) return;
        setAvatars(av?.avatars || []);
        setVoices(vo?.voices || []);
        if (av?.avatars?.length) setAvatarId(av.avatars[0].id);
      })
      .catch((e) => alive && setCatalogErr(e?.message || "Could not load the avatar catalog"))
      .finally(() => alive && setLoadingCatalog(false));
    return () => { alive = false; };
  }, [provider, providers]);

  // Voices for the picked language; when none match, fall back to all
  // (some packs are untagged) and say so instead of showing an empty list.
  // Providers tag voices differently — the local studio uses ISO codes
  // ("te") while HeyGen uses full names ("Telugu", "Telugu (India)") — so
  // resolve the selected code to its English name and match both,
  // case-insensitively.
  const langCode = (language || "").toLowerCase();
  const langName =
    (languages.find((l) => l.code === language)?.english || "").toLowerCase();
  const langVoices = voices.filter((v) => {
    const t = (v.language || "").toLowerCase();
    return t === langCode || (!!langName && (t === langName || t.startsWith(langName)));
  });
  const shownVoices = langVoices.length ? langVoices : voices;
  const voiceFallback = !langVoices.length && voices.length > 0;

  // Keep the voice selection valid as language/provider change.
  useEffect(() => {
    if (!shownVoices.length) { setVoiceId(""); return; }
    if (!shownVoices.some((v) => v.id === voiceId)) setVoiceId(shownVoices[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices, language, languages]);

  // Revoke sample blob URLs on unmount.
  useEffect(() => () => {
    Object.values(samplesRef.current).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const selProvider = providers.find((p) => p.name === provider);
  const providerDown = selProvider ? !selProvider.available : false;

  // ── Voice sample: authenticated fetch → blob → per-voice <audio> ──
  // The sample endpoint is header-authenticated, so a bare
  // <audio src=endpoint> can't send the JWT — fetch the bytes instead.
  const loadSample = useCallback(async (vid, previewUrl) => {
    if (samplesRef.current[vid] || sampleLoading) return;
    // Voices that ship a public preview_url play it directly — no
    // authenticated fetch, and no 404 from the sample endpoint.
    // (revokeObjectURL on a non-blob URL is a spec'd no-op, so parking it
    // in samplesRef alongside real blob URLs is safe.)
    if (previewUrl) {
      samplesRef.current[vid] = previewUrl;
      setSamples((s) => ({ ...s, [vid]: previewUrl }));
      return;
    }
    setSampleLoading(vid);
    try {
      const tok = getToken();
      const res = await fetch(api.avatarVoiceSampleUrl(vid, provider), {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) {
        let msg = res.status === 404 ? "No sample audio for this voice" : `Sample failed (HTTP ${res.status})`;
        try { msg = (await res.json())?.detail || msg; } catch {}
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await res.blob());
      samplesRef.current[vid] = url;
      setSamples((s) => ({ ...s, [vid]: url }));
    } catch (e) {
      setSampleErr((s) => ({ ...s, [vid]: e?.message || "Sample unavailable" }));
    } finally {
      setSampleLoading("");
    }
  }, [provider, sampleLoading]);

  // ── Presenter thumbnails: local studio previews are FILESYSTEM paths the
  // browser can't render — fetch the authed preview endpoint per avatar
  // into blob URLs (http previews render directly and are skipped here).
  const [thumbs, setThumbs] = useState({});
  const thumbsRef = useRef({});
  useEffect(() => {
    let alive = true;
    const revoke = () => {
      Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u));
      thumbsRef.current = {};
    };
    revoke();
    setThumbs({});
    const tok = getToken();
    avatars.forEach(async (a) => {
      if (usablePreview(a.preview_path)) return;
      try {
        const res = await fetch(api.avatarPreviewUrl(a.id, provider), {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        if (!alive || !res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        if (!alive) { URL.revokeObjectURL(url); return; }
        thumbsRef.current[a.id] = url;
        setThumbs((t) => ({ ...t, [a.id]: url }));
      } catch { /* placeholder icon stays */ }
    });
    return () => { alive = false; revoke(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatars]);

  // ── Generate + 3s status poll ──
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPoll, []);   // clear on unmount

  // Shared by generate() and the mount-time RESUME below — the render
  // survives navigation (the Job row exists from second one), and this
  // restores the live progress view for an in-flight key.
  const startPolling = (key) => {
    stopPoll();
    pollFailsRef.current = 0;
    const tick = async () => {
      try {
        const s = await api.avatarStatus(key);
        pollFailsRef.current = 0;
        if (s?.state === "idle") {
          stopPoll();
          setPhase("error");
          setSubmitErr("The render was lost — the backend restarted. Check the Jobs list, or generate again.");
          return;
        }
        setStatus(s);
        if (s.state === "done") {
          stopPoll();
          setPhase("done");
          if (s.clip_id) api.getClip(s.clip_id).then(setClip).catch(() => {});
        } else if (s.state === "error") {
          stopPoll();
          setPhase("error");
        }
      } catch {
        pollFailsRef.current += 1;
        if (pollFailsRef.current >= 10) {
          stopPoll();
          setPhase("error");
          setSubmitErr(
            "Lost contact with the backend — 10 status checks in a row failed. " +
            "The render may still be running; check the Jobs list."
          );
        }
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
  };

  // RESUME: if the user left mid-generation and came back, pick the live
  // view back up from the backend's in-flight registry.
  useEffect(() => {
    api.avatarActive?.().then((a) => {
      if (a?.active && a.key) {
        setGenKey(a.key);
        setPhase("running");
        setStatus({ state: a.state, progress: a.progress,
                    message: a.message, job_id: a.job_id });
        startPolling(a.key);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setSubmitErr("");
    setClip(null);
    setStatus(null);
    try {
      const r = await api.avatarGenerate({
        script: script.trim(),
        avatar_id: avatarId,
        voice_id: voiceId,
        language,
        platform,
        provider: provider || null,
      });
      if (!r?.key) throw new Error("Backend did not return a status key");
      setGenKey(r.key);
      setPhase("running");
      setStatus({ state: "queued", progress: 0, message: "Queued", job_id: r.job_id });
      startPolling(r.key);
    } catch (e) {
      setSubmitErr(e?.message || "Generation request failed");
      setPhase("error");
    }
  };

  const reset = () => {
    stopPoll();
    setPhase("idle"); setGenKey(""); setStatus(null); setClip(null); setSubmitErr("");
  };

  const running = phase === "running";
  const canGenerate =
    !running && !!script.trim() && !!avatarId && !!voiceId && !!provider && !providerDown;
  const videoUrl = clip?.video_url ? api.mediaUrl(clip.video_url) : "";
  const isVertical = platform.endsWith("short") || platform.endsWith("reel");

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-1">
          <Mic className="text-accent2" size={22} />
          <h1 className="text-xl font-bold">Anchor Studio</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          An AI presenter reads your script on camera. Pick an avatar and a voice, paste the
          script, and the finished clip lands as a normal Job — ready for the editor, SEO and publishing.
        </p>

        {providersErr && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>Avatar engine unreachable: {providersErr}</div>
          </div>
        )}

        {/* ── Provider ── */}
        {providers.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Engine</div>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button key={p.name} type="button" onClick={() => setProvider(p.name)}
                  className={`px-3.5 py-2 rounded-lg border text-sm font-semibold transition
                    ${provider === p.name
                      ? "border-accent2/70 bg-accent2/10 text-white"
                      : "border-border bg-white/[0.03] text-gray-300 hover:border-gray-500"}`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle
                    ${p.available ? "bg-emerald-400" : "bg-red-400"}`} />
                  {p.name}
                </button>
              ))}
            </div>
            {providerDown && (
              <div className="mt-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm flex gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <b>{provider}</b> is not ready: {selProvider?.reason || "unknown reason"}
                </div>
              </div>
            )}
          </div>
        )}

        {catalogErr && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>Could not load the catalog: {catalogErr}</div>
          </div>
        )}
        {loadingCatalog && (
          <div className="mb-6 text-sm text-gray-400 flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Loading avatars and voices…
          </div>
        )}

        {/* ── Avatar picker ── */}
        {avatars.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Presenter · {avatars.length}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {avatars.map((a) => {
                const img = usablePreview(a.preview_path) || thumbs[a.id];
                const sel = avatarId === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => setAvatarId(a.id)}
                    className={`rounded-xl border p-3 text-left transition
                      ${sel ? "border-accent2/70 bg-accent2/10" : "border-border bg-white/[0.03] hover:border-gray-500"}`}>
                    {img ? (
                      <img src={img} alt={a.name || a.id}
                        className="w-full aspect-square object-cover rounded-lg mb-2 bg-black" />
                    ) : (
                      <div className="w-full aspect-square rounded-lg mb-2 bg-black/50 border border-border flex items-center justify-center">
                        <User size={30} className="text-gray-600" />
                      </div>
                    )}
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {a.name || a.id}
                      {sel && <CheckCircle2 size={13} className="text-accent2 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {[a.engine, a.kind].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Language + output platform ── */}
        <div className="mb-6 flex flex-wrap gap-6">
          <label className="block">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Language</div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.english}{l.native && l.native !== l.english ? ` (${l.native})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Output</div>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.key} type="button" onClick={() => setPlatform(p.key)}
                  className={`px-3.5 py-2 rounded-lg border text-sm transition text-left
                    ${platform === p.key
                      ? "border-accent2/70 bg-accent2/10 text-white"
                      : "border-border bg-white/[0.03] text-gray-300 hover:border-gray-500"}`}>
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[10px] text-gray-500">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Voice picker ── */}
        {voices.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              Voice · {shownVoices.length}
            </div>
            {voiceFallback && (
              <div className="mb-2 text-[12px] text-amber-300/90">
                No voices tagged “{language}” on this engine — showing every voice.
              </div>
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {shownVoices.map((v) => {
                const sel = voiceId === v.id;
                const blob = samples[v.id];
                // Only offer "Play sample" when it can actually play: a
                // public preview_url (e.g. HeyGen) or the local studio's
                // per-voice ref.wav behind the sample endpoint. Anything
                // else would just 404.
                const preview = v.preview_url
                  ? (/^https?:\/\//i.test(v.preview_url) ? v.preview_url : api.mediaUrl(v.preview_url))
                  : "";
                const hasSample = !!preview || provider === "avatar_studio";
                return (
                  <div key={v.id}
                    className={`rounded-xl border p-3 transition cursor-pointer
                      ${sel ? "border-accent2/70 bg-accent2/10" : "border-border bg-white/[0.03] hover:border-gray-500"}`}
                    onClick={() => setVoiceId(v.id)}>
                    <div className="flex items-center gap-2">
                      <Volume2 size={15} className={sel ? "text-accent2" : "text-gray-500"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{v.name || v.id}</div>
                        <div className="text-[11px] text-gray-500">
                          {[v.language, GENDER_LABEL[v.gender]].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      {hasSample && !blob && !sampleErr[v.id] && (
                        <button type="button" title="Play sample"
                          onClick={(e) => { e.stopPropagation(); loadSample(v.id, preview); }}
                          className="shrink-0 w-8 h-8 rounded-full border border-border bg-black/40
                                     flex items-center justify-center hover:border-accent2/60">
                          {sampleLoading === v.id
                            ? <Loader2 size={13} className="animate-spin text-gray-400" />
                            : <Play size={13} className="text-gray-300" />}
                        </button>
                      )}
                    </div>
                    {blob && (
                      <audio controls autoPlay src={blob}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 w-full h-8" />
                    )}
                    {sampleErr[v.id] && (
                      <div className="mt-1.5 text-[11px] text-gray-500">{sampleErr[v.id]}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Script ── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Script</div>
            <div className="text-[11px] text-gray-500 tabular-nums">{script.length} characters</div>
          </div>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={7}
            placeholder="Type or paste the script the presenter should read — in the language you picked above."
            className={`${inputCls} w-full resize-y leading-relaxed`} />
        </div>

        {/* ── Generate ── */}
        {(phase === "idle" || phase === "error") && (
          <div className="flex items-center gap-3">
            <button type="button" onClick={generate} disabled={!canGenerate}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600
                         text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              <Sparkles size={16} /> Generate clip
            </button>
            {phase === "error" && (
              <button type="button" onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
                <RefreshCcw size={14} /> Start over
              </button>
            )}
          </div>
        )}

        {/* error — surface the provider's reason string verbatim */}
        {phase === "error" && (status?.error || submitErr) && (
          <div className="mt-4 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Generation failed</div>
              <div className="break-words">{status?.error || submitErr}</div>
            </div>
          </div>
        )}

        {/* progress */}
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
            <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
              <span className="capitalize">{status.state}</span>
              <span className="flex items-center gap-3">
                {status.job_id && (
                  <Link to={`/jobs/${status.job_id}`} className="text-accent2 hover:underline">
                    Job #{status.job_id} — safe to leave this page
                  </Link>
                )}
                <span>{genKey}</span>
              </span>
            </div>
            <button type="button" onClick={reset}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
              <Square size={13} /> Stop watching
            </button>
          </div>
        )}

        {/* result */}
        {phase === "done" && status && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 size={18} /> Clip ready
                </div>
                <div className="text-sm text-gray-300 mt-0.5">
                  {status.message || "The clip is in your Jobs — open it to edit, add SEO and publish."}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status.job_id && (
                  <Link to={`/jobs/${status.job_id}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400
                               text-black font-bold text-sm">
                    <ExternalLink size={15} /> Open Job #{status.job_id}
                  </Link>
                )}
                <button type="button" onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-600 hover:border-gray-400 text-sm">
                  <RefreshCcw size={14} /> Another
                </button>
              </div>
            </div>
            {videoUrl && (
              <video src={videoUrl} controls preload="metadata"
                className={`mt-5 rounded-lg border border-emerald-500/40 bg-black
                  ${isVertical ? "max-h-[480px] mx-auto" : "w-full"}`} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
