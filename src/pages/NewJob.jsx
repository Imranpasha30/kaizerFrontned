import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ChevronRight, ChevronLeft, Loader2, Film } from "lucide-react";
import { api } from "../api/client";

const STEPS = ["Upload Video", "Choose Platform", "Choose Frame", "Confirm"];

export default function NewJob() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0);
  const [file, setFile]       = useState(null);
  const [platform, setPlatform]   = useState("");
  const [frame, setFrame]     = useState("");
  const [platforms, setPlatforms] = useState({});
  const [frames, setFrames]   = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct]  = useState(0);
  const [error, setError]     = useState("");
  const dropRef = useRef(null);

  useEffect(() => {
    api.platforms().then(setPlatforms);
    api.frameLayouts().then(setFrames);
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
      const { id } = await api.createJob(form, pct => setUploadPct(pct));
      navigate(`/jobs/${id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  const canNext = [!!file, !!platform, !!frame, true][step];

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

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div>
            <h2 className="font-semibold text-white mb-4">Confirm & Start</h2>
            <div className="bg-black/40 rounded-lg p-4 flex flex-col gap-3 mb-4 text-sm">
              <ConfirmRow label="Video"    value={file?.name} />
              <ConfirmRow label="Platform" value={platforms[platform]?.label} />
              <ConfirmRow label="Frame"    value={frame?.replace("_", " ")} />
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
        {step < 3 && (
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
