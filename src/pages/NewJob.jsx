import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, ChevronRight, ChevronLeft, Loader2, Film, Languages, Image as ImageIcon, Star } from "lucide-react";
import { api } from "../api/client";

const STEPS = ["Upload Video", "Choose Platform", "Choose Frame", "Choose Language", "Confirm"];

export default function NewJob() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0);
  const [file, setFile]       = useState(null);
  const [platform, setPlatform]   = useState("");
  const [frame, setFrame]     = useState("");
  const [language, setLanguage] = useState("te");
  const [platforms, setPlatforms] = useState({});
  const [frames, setFrames]   = useState({});
  const [languages, setLanguages] = useState([]);
  const [useDefaultImage, setUseDefaultImage] = useState(false);
  const [defaultAsset, setDefaultAsset] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct]  = useState(0);
  const [error, setError]     = useState("");
  const dropRef = useRef(null);

  useEffect(() => {
    api.platforms().then(setPlatforms);
    api.frameLayouts().then(setFrames);
    api.listLanguages().then((list) => setLanguages(list || []));
    api.getDefaultAsset().then(setDefaultAsset).catch(() => setDefaultAsset(null));
  }, []);

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e) => { e.preventDefault(); el.classList.add("border-accent2"); };
    const leave = () => el.classList.remove("border-accent2");
    const drop = (e) => {
      e.preventDefault();
      el.classList.remove("border-accent2");
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("video/")) { setFile(f); setStep(1); }
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragover", over); el.removeEventListener("dragleave", leave); el.removeEventListener("drop", drop); };
  }, []);

  async function submit() {
    setSubmitting(true);
    setUploadPct(0);
    setError("");
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("platform", platform);
      form.append("frame_layout", frame);
      form.append("language", language);
      if (useDefaultImage && defaultAsset) {
        form.append("use_default_image", "true");
      }
      const { id } = await api.createJob(form, pct => setUploadPct(pct));
      navigate(`/jobs/${id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const canNext = [!!file, !!platform, !!frame, !!language, true][step];

  return (
    <div className="max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-white mb-6">New Job</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              className={`flex items-center gap-1.5 text-xs font-medium
                ${i === step ? "text-accent2" : i < step ? "text-green-400 cursor-pointer" : "text-gray-600"}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${i === step ? "bg-accent text-white" : i < step ? "bg-green-800 text-green-300" : "bg-surface text-gray-600"}`}>
                {i < step ? "\u2713" : i + 1}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </React.Fragment>
        ))}
      </div>

      <div className="card p-5 sm:p-6">
        {/* Step 0: Upload */}
        {step === 0 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Upload Video</h2>
            <label
              ref={dropRef}
              className="border-2 border-dashed border-border rounded-lg p-8 sm:p-10
                         flex flex-col items-center gap-3 cursor-pointer
                         hover:border-gray-500 transition-colors"
            >
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setStep(1); } }}
              />
              {file ? (
                <>
                  <Film size={36} className="text-accent" />
                  <span className="text-white font-medium text-center break-all">{file.name}</span>
                  <span className="text-gray-500 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </>
              ) : (
                <>
                  <Upload size={36} className="text-gray-600" />
                  <span className="text-gray-400 text-center">Drag & drop or click to select video</span>
                  <span className="text-gray-600 text-xs">MP4, MKV, AVI supported</span>
                </>
              )}
            </label>
          </div>
        )}

        {/* Step 1: Platform */}
        {step === 1 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Choose Platform</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(platforms).map(([key, info]) => (
                <button
                  key={key}
                  onClick={() => { setPlatform(key); setStep(2); }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${platform === key
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  <div className="font-medium">{info.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{info.width} x {info.height}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Frame */}
        {step === 2 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Choose Frame Layout</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(frames).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setFrame(key); setStep(3); }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${frame === key
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  <div className="font-medium capitalize">{key.replace("_", " ")}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label.split("\u2014")[1]?.trim()}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Language */}
        {step === 3 && (
          <div>
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Languages size={18} className="text-accent2" /> Choose Language
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Drives Gemini analysis, title generation, on-screen card font, and follow-bar text.
              Pick the language the video is in so the output is authentic.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {languages.length === 0 && (
                <span className="text-gray-500 text-sm">Loading languages…</span>
              )}
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLanguage(l.code); setStep(4); }}
                  className={`p-4 rounded-lg border text-left transition-all
                    ${language === l.code
                      ? "border-accent bg-accent/10 text-white ring-1 ring-accent/30"
                      : "border-border hover:border-gray-500 hover:bg-white/[0.02] text-gray-300"}`}
                >
                  <div className="text-xl font-semibold mb-1">{l.native}</div>
                  <div className="text-xs text-gray-500">{l.english}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">{l.script} · {l.code}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Confirm & Start</h2>
            <div className="bg-black/40 rounded-lg p-4 flex flex-col gap-3 mb-4 text-sm">
              <ConfirmRow label="Video"    value={file?.name} />
              <ConfirmRow label="Platform" value={platforms[platform]?.label} />
              <ConfirmRow label="Frame"    value={frame?.replace("_", " ")} />
              <ConfirmRow label="Language" value={(() => {
                const l = languages.find((x) => x.code === language);
                return l ? `${l.native} (${l.english})` : language;
              })()} />
            </div>

            {/* Default image toggle */}
            <div className="bg-surface border border-border rounded p-3 mb-4">
              {defaultAsset ? (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDefaultImage}
                    onChange={(e) => setUseDefaultImage(e.target.checked)}
                    className="mt-0.5 accent-accent2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
                      <Star size={12} className="text-yellow-400" fill="currentColor" /> Use my default image
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Every clip will use your default ad image instead of a generated / stock photo. Saves Pexels+Gemini quota and keeps branding consistent.
                    </div>
                  </div>
                  <img
                    src={api.mediaUrl(defaultAsset.thumb_url)}
                    alt=""
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                </label>
              ) : (
                <div className="flex items-start gap-2.5 text-xs">
                  <ImageIcon size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-gray-300">No default image set</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Upload one on the <Link to="/assets" className="text-accent2 hover:text-white underline">Assets</Link> page and mark it as default to have the pipeline reuse it automatically.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            {submitting && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{uploadPct < 100 ? "Uploading video\u2026" : "Starting pipeline\u2026"}</span>
                  <span>{uploadPct}%</span>
                </div>
                <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={submit}
              disabled={submitting}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={16} className="animate-spin" /> {uploadPct < 100 ? `Uploading ${uploadPct}%` : "Starting pipeline\u2026"}</>
                : "\u25B6 Start Pipeline"}
            </button>
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn btn-secondary flex items-center gap-1.5 disabled:opacity-30"
        >
          <ChevronLeft size={16} /> Back
        </button>
        {step < 4 && (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext}
            className="btn btn-primary flex items-center gap-1.5 disabled:opacity-40"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white capitalize">{value || "\u2014"}</span>
    </div>
  );
}
